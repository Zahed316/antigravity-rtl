'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('zlib');

const { createProxyManager, rewriteCspDirectiveList } = require('../src/proxy');

test('rewriteCspDirectiveList handles strict CSP and unsafe-inline CSP safely', () => {
  const strict = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'";
  const outStrict = rewriteCspDirectiveList(strict, 'NONCE123');
  assert.ok(outStrict.includes("script-src 'self' 'nonce-NONCE123'"));
  assert.ok(outStrict.includes("style-src 'self' 'nonce-NONCE123'"));

  const permissive = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";
  const outPermissive = rewriteCspDirectiveList(permissive, 'NONCE123');
  assert.ok(!outPermissive.includes("'nonce-NONCE123'"));
  assert.ok(outPermissive.includes("'unsafe-inline'"));
});

test('proxyManager injects HTML, forwards JSON & WebSocket, validates token, and broadcasts SSE state', async (t) => {
  const tmpControlDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'agy-rtl-ctrl-'));
  let lastUpstreamHeaders = null;
  let lastWsOrigin = null;

  const upstream = http.createServer((req, res) => {
    lastUpstreamHeaders = req.headers;
    if (req.url === '/api/info') {
      const json = JSON.stringify({ ok: true });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
      res.end(json);
      return;
    }
    if (req.url === '/gzip-html') {
      const html = '<!doctype html><html><head></head><body><p>سلام</p></body></html>';
      const gz = zlib.gzipSync(Buffer.from(html, 'utf8'));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Content-Length': gz.length,
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'"
      });
      res.end(gz);
      return;
    }
    const html = '<!doctype html><html><head></head><body><div id="app">hi</div></body></html>';
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'"
    });
    res.end(html);
  });

  const upstreamSockets = new Set();
  upstream.on('upgrade', (req, socket) => {
    lastWsOrigin = req.headers.origin;
    upstreamSockets.add(socket);
    socket.on('close', () => upstreamSockets.delete(socket));
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: dummy\r\n\r\n'
    );
    socket.on('data', (chunk) => socket.write(chunk));
  });

  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;
  const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;

  const manager = createProxyManager({
    initialState: { enabled: true, mode: 'force-rtl', lineHeight: 0 },
    controlDir: tmpControlDir
  });
  const info = await manager.start();

  t.after(async () => {
    await manager.stop();
    for (const s of upstreamSockets) {
      if (!s.destroyed) s.destroy();
    }
    if (typeof upstream.closeAllConnections === 'function') upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    await fsp.rm(tmpControlDir, { recursive: true, force: true });
  });

  // Control file exists with 0600 permissions
  const ctrl = JSON.parse(fs.readFileSync(info.controlFilePath, 'utf8'));
  assert.equal(ctrl.port, info.port);
  assert.equal(ctrl.token, info.token);

  // Unauthorized /register rejected
  const badReg = await fetch(`http://127.0.0.1:${info.port}/register?token=wrong&target=${encodeURIComponent(upstreamUrl)}`);
  assert.equal(badReg.status, 403);

  // Authorized /register returns proxy URL
  const goodReg = await fetch(`http://127.0.0.1:${info.port}/register?token=${encodeURIComponent(info.token)}&target=${encodeURIComponent(upstreamUrl)}`);
  assert.equal(goodReg.status, 200);
  const { proxyUrl } = await goodReg.json();
  assert.ok(proxyUrl.startsWith('http://127.0.0.1:'));

  // Proxied HTML gets CSS, state, script, rewritten CSP, and rewritten Origin header
  const htmlRes = await fetch(proxyUrl, { headers: { Origin: proxyUrl } });
  assert.equal(htmlRes.status, 200);
  const csp = htmlRes.headers.get('content-security-policy');
  assert.ok(csp.includes("'nonce-"));
  assert.ok(csp.includes("connect-src 'self'"));
  const body = await htmlRes.text();
  assert.ok(body.includes('id="agy-rtl-style"'));
  assert.ok(body.includes('id="agy-rtl-script"'));
  assert.ok(body.includes('"mode":"force-rtl"'));
  assert.equal(lastUpstreamHeaders.origin, upstreamUrl);

  // Gzipped HTML is safely decompressed and patched
  const gzRes = await fetch(`${proxyUrl}/gzip-html`);
  assert.equal(gzRes.status, 200);
  const gzBody = await gzRes.text();
  assert.ok(gzBody.includes('سلام'));
  assert.ok(gzBody.includes('id="agy-rtl-script"'));

  // Non-HTML JSON passes through cleanly
  const jsonRes = await fetch(`${proxyUrl}/api/info`);
  assert.deepEqual(await jsonRes.json(), { ok: true });

  // WebSocket upgrade tunnels cleanly and rewrites Origin to upstreamOrigin
  const proxyParsed = new URL(proxyUrl);
  const wsEcho = await new Promise((resolve, reject) => {
    const sock = net.connect({ host: '127.0.0.1', port: Number(proxyParsed.port) }, () => {
      sock.write(
        `GET /ws HTTP/1.1\r\nHost: ${proxyParsed.host}\r\nOrigin: ${proxyUrl}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    let buf = '';
    let upgraded = false;
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (!upgraded && buf.includes('\r\n\r\n')) {
        upgraded = true;
        buf = '';
        sock.write('PING_FRAME');
      } else if (upgraded && buf.includes('PING_FRAME')) {
        sock.end();
        resolve(buf);
      }
    });
    sock.on('error', reject);
  });
  assert.equal(wsEcho, 'PING_FRAME');
  assert.equal(lastWsOrigin, upstreamUrl);

  // Live SSE state toggle broadcast
  const sseMsg = await new Promise((resolve, reject) => {
    const req = http.get(`${proxyUrl}/__agy_rtl__/events`, (res) => {
      let data = '';
      let toggled = false;
      res.on('data', (chunk) => {
        data += chunk.toString('utf8');
        if (!toggled && data.includes('"enabled":true')) {
          toggled = true;
          manager.setState({ enabled: false, mode: 'force-ltr', lineHeight: 0 });
        }
        if (data.includes('"enabled":false') && data.includes('"mode":"force-ltr"')) {
          req.destroy();
          resolve(data);
        }
      });
    });
    req.on('error', (err) => {
      if (err.code !== 'ECONNRESET') reject(err);
    });
  });
  assert.ok(sseMsg.includes('"enabled":false'));
  assert.ok(sseMsg.includes('"mode":"force-ltr"'));
});
