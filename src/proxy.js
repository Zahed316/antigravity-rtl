'use strict';

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const CLIENT_CSS_PATH = path.join(__dirname, 'client', 'rtl.css');
const CLIENT_JS_PATH = path.join(__dirname, 'client', 'rtl-inject.js');

function readClientAssets() {
  return {
    css: fs.readFileSync(CLIENT_CSS_PATH, 'utf8'),
    js: fs.readFileSync(CLIENT_JS_PATH, 'utf8')
  };
}

function safeTokenEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function rewriteCspDirectiveList(cspHeader, nonce) {
  if (!cspHeader || typeof cspHeader !== 'string') return cspHeader;
  const parts = cspHeader
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const map = new Map();
  const order = [];
  for (const part of parts) {
    const spaceIdx = part.search(/\s/);
    const name = (spaceIdx === -1 ? part : part.slice(0, spaceIdx)).toLowerCase();
    const val = spaceIdx === -1 ? '' : part.slice(spaceIdx + 1).trim();
    if (!map.has(name)) {
      order.push(name);
      map.set(name, val);
    }
  }

  const defaultVal = map.get('default-src') || '';

  const allowInlineOrNonce = (directive) => {
    const hasOwn = map.has(directive);
    const val = hasOwn ? map.get(directive) : defaultVal;
    if (!hasOwn && !defaultVal) return;

    const tokens = val.split(/\s+/).filter(Boolean);
    const hasUnsafeInline = tokens.includes("'unsafe-inline'");
    const hasNonceOrHash = tokens.some((t) => t.startsWith("'nonce-") || t.startsWith("'sha"));
    if (hasUnsafeInline && !hasNonceOrHash) {
      return;
    }

    const filtered = tokens.filter((t) => t !== "'none'");
    const nonceTok = `'nonce-${nonce}'`;
    if (!filtered.includes(nonceTok)) filtered.push(nonceTok);
    if (!hasOwn) order.push(directive);
    map.set(directive, filtered.join(' '));
  };

  allowInlineOrNonce('script-src');
  allowInlineOrNonce('style-src');

  if (map.has('connect-src') || defaultVal) {
    const hasOwn = map.has('connect-src');
    const val = hasOwn ? map.get('connect-src') : defaultVal;
    const tokens = val.split(/\s+/).filter((t) => t && t !== "'none'");
    if (!tokens.includes('*') && !tokens.includes("'self'")) {
      tokens.push("'self'");
      if (!hasOwn) order.push('connect-src');
      map.set('connect-src', tokens.join(' '));
    }
  }

  return order
    .map((name) => {
      const val = map.get(name);
      return val ? `${name} ${val}` : name;
    })
    .join('; ');
}

function decompressBody(buf, encoding) {
  const enc = (encoding || '').toLowerCase().trim();
  if (!enc || enc === 'identity') return buf;
  if (enc === 'gzip') return zlib.gunzipSync(buf);
  if (enc === 'deflate') return zlib.inflateSync(buf);
  if (enc === 'br') return zlib.brotliDecompressSync(buf);
  return buf;
}

function buildInjectedBlock({ nonce, state, css, js }) {
  const safeState = JSON.stringify(state).replace(/</g, '\\u003c');
  const safeCss = css.replace(/<\/style/gi, '<\\/style');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  return (
    `\n<style id="agy-rtl-style" nonce="${nonce}">${safeCss}</style>\n` +
    `<script id="agy-rtl-state" nonce="${nonce}">window.__AGY_RTL_INITIAL_STATE__=${safeState};</script>\n` +
    `<script id="agy-rtl-script" nonce="${nonce}">${safeJs}</script>\n`
  );
}

function injectHtml(html, block) {
  const bodyCloseIdx = html.lastIndexOf('</body>');
  if (bodyCloseIdx !== -1) {
    return html.slice(0, bodyCloseIdx) + block + html.slice(bodyCloseIdx);
  }
  const htmlCloseIdx = html.lastIndexOf('</html>');
  if (htmlCloseIdx !== -1) {
    return html.slice(0, htmlCloseIdx) + block + html.slice(htmlCloseIdx);
  }
  return html + block;
}

function createUpstreamProxy({ upstreamOrigin, getState, sseClients, log }) {
  const upstream = new URL(upstreamOrigin);
  const isHttps = upstream.protocol === 'https:';
  const transport = isHttps ? https : http;
  const upstreamPort = Number(upstream.port) || (isHttps ? 443 : 80);
  const agent = new transport.Agent({ keepAlive: true });
  const activeSockets = new Set();

  let proxyOrigin = '';

  const server = http.createServer((clientReq, clientRes) => {
    const reqUrl = clientReq.url || '/';

    if (reqUrl === '/__agy_rtl__/state') {
      const body = Buffer.from(JSON.stringify(getState()), 'utf8');
      clientRes.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store'
      });
      clientRes.end(body);
      return;
    }

    if (reqUrl === '/__agy_rtl__/events') {
      clientRes.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      });
      clientRes.write(`data: ${JSON.stringify(getState())}\n\n`);
      sseClients.add(clientRes);

      const keepAlive = setInterval(() => {
        if (!clientRes.writableEnded) {
          clientRes.write(': keepalive\n\n');
        }
      }, 25000);
      if (typeof keepAlive.unref === 'function') keepAlive.unref();

      clientReq.on('close', () => {
        clearInterval(keepAlive);
        sseClients.delete(clientRes);
      });
      return;
    }

    const fwdHeaders = { ...clientReq.headers, host: upstream.host };
    if (fwdHeaders.origin && proxyOrigin && fwdHeaders.origin === proxyOrigin) {
      fwdHeaders.origin = upstream.origin;
    }
    if (fwdHeaders.referer && proxyOrigin && fwdHeaders.referer.startsWith(proxyOrigin)) {
      fwdHeaders.referer = upstream.origin + fwdHeaders.referer.slice(proxyOrigin.length);
    }

    const accept = String(fwdHeaders.accept || '');
    if (accept.includes('text/html') || clientReq.method === 'GET') {
      fwdHeaders['accept-encoding'] = 'identity';
    }

    const proxyReq = transport.request(
      {
        hostname: upstream.hostname,
        port: upstreamPort,
        method: clientReq.method,
        path: reqUrl,
        headers: fwdHeaders,
        agent
      },
      (upstreamRes) => {
        const resHeaders = { ...upstreamRes.headers };
        if (typeof resHeaders.location === 'string' && resHeaders.location.startsWith(upstream.origin)) {
          resHeaders.location = proxyOrigin + resHeaders.location.slice(upstream.origin.length);
        }

        const contentType = String(resHeaders['content-type'] || '').toLowerCase();
        if (!contentType.includes('text/html')) {
          clientRes.writeHead(upstreamRes.statusCode || 200, resHeaders);
          upstreamRes.pipe(clientRes);
          return;
        }

        const chunks = [];
        upstreamRes.on('data', (chunk) => chunks.push(chunk));
        upstreamRes.on('end', () => {
          try {
            const rawBuf = Buffer.concat(chunks);
            const plainBuf = decompressBody(rawBuf, resHeaders['content-encoding']);
            const html = plainBuf.toString('utf8');
            const nonce = crypto.randomBytes(16).toString('base64');
            const assets = readClientAssets();
            const block = buildInjectedBlock({
              nonce,
              state: getState(),
              css: assets.css,
              js: assets.js
            });
            const patched = injectHtml(html, block);
            const outBuf = Buffer.from(patched, 'utf8');

            delete resHeaders['content-encoding'];
            delete resHeaders['transfer-encoding'];
            resHeaders['content-length'] = String(outBuf.length);
            if (typeof resHeaders['content-security-policy'] === 'string') {
              resHeaders['content-security-policy'] = rewriteCspDirectiveList(
                resHeaders['content-security-policy'],
                nonce
              );
            }
            if (typeof resHeaders['content-security-policy-report-only'] === 'string') {
              resHeaders['content-security-policy-report-only'] = rewriteCspDirectiveList(
                resHeaders['content-security-policy-report-only'],
                nonce
              );
            }

            clientRes.writeHead(upstreamRes.statusCode || 200, resHeaders);
            clientRes.end(outBuf);
          } catch (err) {
            if (log) log(`HTML injection failed: ${err.message}`);
            const fallback = Buffer.concat(chunks);
            clientRes.writeHead(upstreamRes.statusCode || 200, upstreamRes.headers);
            clientRes.end(fallback);
          }
        });
      }
    );

    proxyReq.on('error', (err) => {
      if (log) log(`Upstream HTTP error (${upstreamOrigin}): ${err.message}`);
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      clientRes.end('Antigravity RTL proxy upstream error');
    });

    clientReq.pipe(proxyReq);
  });

  server.on('upgrade', (req, clientSocket, head) => {
    const rawHeaders = [];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i];
      let v = req.rawHeaders[i + 1];
      const kl = k.toLowerCase();
      if (kl === 'host') {
        v = upstream.host;
      } else if (kl === 'origin' && proxyOrigin && v === proxyOrigin) {
        v = upstream.origin;
      }
      rawHeaders.push(`${k}: ${v}`);
    }

    const upstreamSocket = isHttps
      ? tls.connect({ host: upstream.hostname, port: upstreamPort, servername: upstream.hostname })
      : net.connect({ host: upstream.hostname, port: upstreamPort });

    activeSockets.add(clientSocket);
    activeSockets.add(upstreamSocket);

    const cleanup = () => {
      activeSockets.delete(clientSocket);
      activeSockets.delete(upstreamSocket);
      if (!clientSocket.destroyed) clientSocket.destroy();
      if (!upstreamSocket.destroyed) upstreamSocket.destroy();
    };

    upstreamSocket.on('error', (err) => {
      if (log) log(`Upstream WS error (${upstreamOrigin}): ${err.message}`);
      cleanup();
    });
    upstreamSocket.on('close', cleanup);
    clientSocket.on('error', cleanup);
    clientSocket.on('close', cleanup);

    upstreamSocket.once('connect', () => {
      const headerStr = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${rawHeaders.join('\r\n')}\r\n\r\n`;
      upstreamSocket.write(headerStr);
      if (head && head.length > 0) upstreamSocket.write(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      proxyOrigin = `http://127.0.0.1:${addr.port}`;
      resolve({
        server,
        proxyOrigin,
        upstreamOrigin,
        close: () =>
          new Promise((done) => {
            agent.destroy();
            for (const s of activeSockets) {
              try {
                s.destroy();
              } catch {}
            }
            activeSockets.clear();
            server.close(() => done());
            if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
          })
      });
    });
  });
}

function createProxyManager({ initialState, controlDir, log } = {}) {
  let state = {
    enabled: initialState && typeof initialState.enabled === 'boolean' ? initialState.enabled : true,
    mode: (initialState && initialState.mode) || 'force-rtl',
    lineHeight: (initialState && Number(initialState.lineHeight)) || 0
  };

  const token = crypto.randomBytes(24).toString('hex');
  const upstreams = new Map(); // upstreamOrigin -> Promise<{ server, proxyOrigin, upstreamOrigin }>
  const sseClients = new Set();

  let controlServer = null;
  let controlFilePath = null;

  function getState() {
    return { ...state };
  }

  function setState(next) {
    state = {
      enabled: next && typeof next.enabled === 'boolean' ? next.enabled : state.enabled,
      mode: (next && next.mode) || state.mode,
      lineHeight: next && next.lineHeight !== undefined ? Number(next.lineHeight) || 0 : state.lineHeight
    };
    const payload = `data: ${JSON.stringify(state)}\n\n`;
    for (const res of sseClients) {
      if (!res.writableEnded) {
        try {
          res.write(payload);
        } catch {
          sseClients.delete(res);
        }
      }
    }
    return getState();
  }

  async function ensureUpstreamProxy(targetUrlStr) {
    const parsed = new URL(targetUrlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported target protocol: ${parsed.protocol}`);
    }
    const origin = parsed.origin;
    if (!upstreams.has(origin)) {
      const p = createUpstreamProxy({
        upstreamOrigin: origin,
        getState,
        sseClients,
        log
      }).catch((err) => {
        upstreams.delete(origin);
        throw err;
      });
      upstreams.set(origin, p);
    }
    const proxy = await upstreams.get(origin);
    const suffix = parsed.pathname === '/' && !parsed.search ? '' : parsed.pathname + parsed.search;
    return `${proxy.proxyOrigin}${suffix}`;
  }

  async function start() {
    controlServer = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url || '/', 'http://127.0.0.1');
        if (u.pathname !== '/register') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const reqToken = u.searchParams.get('token') || '';
        if (!safeTokenEqual(reqToken, token)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        const target = u.searchParams.get('target') || '';
        const proxyUrl = await ensureUpstreamProxy(target);
        const body = Buffer.from(JSON.stringify({ proxyUrl }), 'utf8');
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': body.length
        });
        res.end(body);
      } catch (err) {
        if (log) log(`Control server error: ${err.message}`);
        res.writeHead(400);
        res.end('Bad request');
      }
    });

    await new Promise((resolve, reject) => {
      controlServer.once('error', reject);
      controlServer.listen(0, '127.0.0.1', resolve);
    });

    const addr = controlServer.address();
    if (controlDir) {
      fs.mkdirSync(controlDir, { recursive: true, mode: 0o700 });
      controlFilePath = path.join(controlDir, 'control.json');
      fs.writeFileSync(
        controlFilePath,
        JSON.stringify({ port: addr.port, pid: process.pid, token }, null, 2),
        { mode: 0o600 }
      );
    }

    return { port: addr.port, token, controlFilePath };
  }

  async function stop() {
    for (const res of sseClients) {
      if (!res.writableEnded) {
        try {
          res.end();
        } catch {}
      }
    }
    sseClients.clear();

    const closing = [];
    for (const p of upstreams.values()) {
      closing.push(p.then(({ close }) => close()).catch(() => {}));
    }
    upstreams.clear();

    if (controlServer) {
      const srv = controlServer;
      controlServer = null;
      closing.push(
        new Promise((resolve) => {
          srv.close(() => resolve());
          if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
        })
      );
    }

    await Promise.all(closing);

    if (controlFilePath && fs.existsSync(controlFilePath)) {
      try {
        const current = JSON.parse(fs.readFileSync(controlFilePath, 'utf8'));
        if (current && current.pid === process.pid) {
          fs.unlinkSync(controlFilePath);
        }
      } catch {}
    }
  }

  return {
    start,
    stop,
    getState,
    setState,
    ensureUpstreamProxy
  };
}

module.exports = {
  createProxyManager,
  rewriteCspDirectiveList,
  injectHtml
};
