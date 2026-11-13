'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const EXT_PREFIX = 'google.google-antigravity-';
const BACKUP_SUFFIX = '.agy-rtl.bak';

const HOOK_START = '/* === ANTIGRAVITY-RTL-HOOK-START === */';
const HOOK_END = '/* === ANTIGRAVITY-RTL-HOOK-END === */';

const JU_RETURN_REGEX = /return\{effectiveUrl:([^{}]+\.replace\([^)]*\)),humanReadable:(\w+)\}/;
const JU_PATCHED_REGEX = /return\{effectiveUrl:await __agyRtlWrapUrl\(([\s\S]+?)\),humanReadable:(\w+)\}/;

const IIFE_ANCHOR = "Object.defineProperty(this, 'navigator', {value: undefined, configurable: true, enumerable: true, writable: true});";

const DEFAULT_EXTENSION_ID = 'local.antigravity-rtl';

function buildHookHelper({ controlDir, extensionId } = {}) {
  const extId = extensionId || DEFAULT_EXTENSION_ID;
  const controlJsonExpr = controlDir
    ? JSON.stringify(path.join(controlDir, 'control.json'))
    : "path.join(os.homedir(), '.antigravity-rtl', 'control.json')";

  return `${HOOK_START}
async function __agyRtlWrapUrl(targetUrl) {
  try {
    try {
      const vscode = require('vscode');
      const rtlExt = vscode.extensions && vscode.extensions.getExtension(${JSON.stringify(extId)});
      if (rtlExt && !rtlExt.isActive) {
        await Promise.race([rtlExt.activate(), new Promise((r) => setTimeout(r, 1500))]);
      }
    } catch {}
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const http = require('http');
    const ctrlPath = ${controlJsonExpr};
    if (!fs.existsSync(ctrlPath)) return targetUrl;
    const ctrl = JSON.parse(fs.readFileSync(ctrlPath, 'utf8'));
    if (!ctrl || !ctrl.port || !ctrl.token) return targetUrl;
    return await new Promise((resolve) => {
      const reqUrl = 'http://127.0.0.1:' + ctrl.port + '/register?token=' + encodeURIComponent(ctrl.token) + '&target=' + encodeURIComponent(targetUrl);
      const req = http.get(reqUrl, { timeout: 400 }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const parsed = JSON.parse(body);
              if (parsed && typeof parsed.proxyUrl === 'string' && parsed.proxyUrl) {
                resolve(parsed.proxyUrl);
                return;
              }
            }
          } catch {}
          resolve(targetUrl);
        });
      });
      req.on('timeout', () => { req.destroy(); resolve(targetUrl); });
      req.on('error', () => resolve(targetUrl));
    });
  } catch {
    return targetUrl;
  }
}
${HOOK_END}`;
}

function cmpVersion(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function discoverAntigravityInstalls(customRoots) {
  const home = process.platform === 'win32' && process.env.USERPROFILE
    ? process.env.USERPROFILE
    : os.homedir();

  const roots = customRoots || [
    path.join(home, '.vscode', 'extensions'),
    path.join(home, '.vscode-insiders', 'extensions'),
    path.join(home, '.vscode-server', 'extensions')
  ];

  const byRoot = [];
  for (const root of roots) {
    let entries;
    try {
      entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }

    let best = null;
    for (const ent of entries) {
      if (!ent.isDirectory() || !ent.name.startsWith(EXT_PREFIX)) continue;
      const version = ent.name.slice(EXT_PREFIX.length);
      const extDir = path.join(root, ent.name);
      const jsPath = path.join(extDir, 'extension.js');
      if (!fs.existsSync(jsPath)) continue;
      if (!best || cmpVersion(version, best.version) > 0) {
        best = {
          root,
          version,
          dir: extDir,
          jsPath,
          bakPath: jsPath + BACKUP_SUFFIX
        };
      }
    }
    if (best) byRoot.push(best);
  }
  return byRoot;
}

function isPatchedContent(content, extensionId) {
  const hasHook = content.includes(HOOK_START) && JU_PATCHED_REGEX.test(content);
  if (!hasHook) return false;
  if (extensionId && !content.includes(JSON.stringify(extensionId))) return false;
  return true;
}

function stripHookFromContent(content) {
  let out = content;
  const startIdx = out.indexOf(HOOK_START);
  const endIdx = out.indexOf(HOOK_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = out.slice(0, startIdx);
    const after = out.slice(endIdx + HOOK_END.length);
    out = before.replace(/\n$/, '') + after.replace(/^\n/, '');
  }
  out = out.replace(
    JU_PATCHED_REGEX,
    (_, inner, humanVar) => `return{effectiveUrl:${inner},humanReadable:${humanVar}}`
  );
  return out;
}

function patchExtensionContent(content, { controlDir, extensionId } = {}) {
  const clean = stripHookFromContent(content);
  const match = JU_RETURN_REGEX.exec(clean);
  if (!match) {
    throw new Error('Could not locate effectiveUrl hook point in Antigravity extension.js');
  }

  let patched = clean.replace(
    JU_RETURN_REGEX,
    (_, expr, humanVar) => `return{effectiveUrl:await __agyRtlWrapUrl(${expr}),humanReadable:${humanVar}}`
  );

  const helperBlock = `\n${buildHookHelper({ controlDir, extensionId })}\n`;
  const anchorIdx = patched.indexOf(IIFE_ANCHOR);
  if (anchorIdx !== -1) {
    const insertAt = anchorIdx + IIFE_ANCHOR.length;
    patched = patched.slice(0, insertAt) + helperBlock + patched.slice(insertAt);
  } else {
    const sigIdx = patched.indexOf('// SIG // Begin signature block');
    if (sigIdx !== -1) {
      patched = patched.slice(0, sigIdx) + helperBlock + patched.slice(sigIdx);
    } else {
      patched = patched + helperBlock;
    }
  }

  return patched;
}

async function applyToInstall(install, { controlDir, extensionId } = {}) {
  const current = await fsp.readFile(install.jsPath, 'utf8');
  if (isPatchedContent(current, extensionId)) {
    return { status: 'already-patched', install };
  }

  const baseContent = fs.existsSync(install.bakPath)
    ? await fsp.readFile(install.bakPath, 'utf8')
    : current;

  if (!fs.existsSync(install.bakPath)) {
    await fsp.writeFile(install.bakPath, baseContent, 'utf8');
  }

  const next = patchExtensionContent(baseContent, { controlDir, extensionId });
  await fsp.writeFile(install.jsPath, next, 'utf8');
  return { status: 'patched', install };
}

async function restoreInstall(install) {
  if (fs.existsSync(install.bakPath)) {
    const bak = await fsp.readFile(install.bakPath, 'utf8');
    await fsp.writeFile(install.jsPath, bak, 'utf8');
    await fsp.unlink(install.bakPath);
    return { status: 'restored-from-backup', install };
  }

  const current = await fsp.readFile(install.jsPath, 'utf8');
  if (current.includes(HOOK_START) || JU_PATCHED_REGEX.test(current)) {
    const clean = stripHookFromContent(current);
    await fsp.writeFile(install.jsPath, clean, 'utf8');
    return { status: 'stripped-inline', install };
  }
  return { status: 'already-clean', install };
}

module.exports = {
  HOOK_START,
  HOOK_END,
  BACKUP_SUFFIX,
  discoverAntigravityInstalls,
  isPatchedContent,
  patchExtensionContent,
  stripHookFromContent,
  applyToInstall,
  restoreInstall
};
