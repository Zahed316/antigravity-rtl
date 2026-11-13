'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const patcher = require('../src/patcher');

test('patchExtensionContent + stripHookFromContent round-trip cleanly on synthetic bundle', () => {
  const sample = [
    '!function ($$NODEJS_EXPORTS_OBJECT$$) {',
    "Object.defineProperty(this, 'navigator', {value: undefined, configurable: true, enumerable: true, writable: true});",
    'async function jU(a,b){var c=f.asyncContextStart(),d=c();c=c(1);try{return{effectiveUrl:c(await d(n.env.asExternalUri(n.Uri.parse(a)))).toString().replace(/\\/$/,""),humanReadable:b}}finally{d()}}',
    '}.call(globalThis, {});',
    '// SIG // Begin signature block'
  ].join('\n');

  const patched = patcher.patchExtensionContent(sample, { extensionId: 'pub1.antigravity-rtl' });
  assert.ok(patcher.isPatchedContent(patched, 'pub1.antigravity-rtl'));
  assert.equal(patcher.isPatchedContent(patched, 'pub2.antigravity-rtl'), false);
  assert.ok(patched.includes('await __agyRtlWrapUrl('));

  // Idempotent on second patch with same extensionId
  const patchedTwice = patcher.patchExtensionContent(patched, { extensionId: 'pub1.antigravity-rtl' });
  assert.equal(patchedTwice, patched);

  // Strip restores exact original
  const stripped = patcher.stripHookFromContent(patched);
  assert.equal(stripped, sample);
});

test('applyToInstall & restoreInstall preserve real Antigravity extension.js byte-for-byte', async (t) => {
  const installs = await patcher.discoverAntigravityInstalls();
  if (installs.length === 0) {
    t.skip('google.google-antigravity is not installed locally');
    return;
  }

  const realJsPath = installs[0].jsPath;
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'agy-rtl-test-'));
  t.after(async () => {
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  });

  const extDir = path.join(tmpRoot, `google.google-antigravity-${installs[0].version}`);
  await fsp.mkdir(extDir, { recursive: true });
  const tmpJs = path.join(extDir, 'extension.js');
  await fsp.copyFile(realJsPath, tmpJs);

  // Ensure we test against an unpatched baseline if the local copy was already patched
  const rawOriginal = patcher.stripHookFromContent(await fsp.readFile(tmpJs, 'utf8'));
  await fsp.writeFile(tmpJs, rawOriginal, 'utf8');

  const discovered = await patcher.discoverAntigravityInstalls([tmpRoot]);
  assert.equal(discovered.length, 1);

  const res1 = await patcher.applyToInstall(discovered[0]);
  assert.equal(res1.status, 'patched');
  assert.ok(fs.existsSync(discovered[0].bakPath));

  // Syntax check the patched 4.4MB extension.js with node --check
  execFileSync(process.execPath, ['--check', tmpJs]);

  const res2 = await patcher.applyToInstall(discovered[0]);
  assert.equal(res2.status, 'already-patched');

  const res3 = await patcher.restoreInstall(discovered[0]);
  assert.equal(res3.status, 'restored-from-backup');
  assert.equal(fs.existsSync(discovered[0].bakPath), false);

  const afterRestore = await fsp.readFile(tmpJs, 'utf8');
  assert.equal(afterRestore.length, rawOriginal.length);
  assert.ok(afterRestore === rawOriginal, 'restored file should match original byte-for-byte');
});

test('discoverAntigravityInstalls supports extraDirs (portable/custom extensions-dir) and deduplicates', async (t) => {
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'agy-rtl-extradir-'));
  t.after(async () => {
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  });

  const standardRoot = path.join(tmpRoot, 'standard-root');
  const standardExtDir = path.join(standardRoot, 'google.google-antigravity-1.12.0');
  await fsp.mkdir(standardExtDir, { recursive: true });
  await fsp.writeFile(path.join(standardExtDir, 'extension.js'), '// std', 'utf8');

  // Custom portable / dev extension path with version inside package.json
  const customPkgDir = path.join(tmpRoot, 'portable-data', 'custom-antigravity');
  await fsp.mkdir(customPkgDir, { recursive: true });
  await fsp.writeFile(path.join(customPkgDir, 'extension.js'), '// custom', 'utf8');
  await fsp.writeFile(
    path.join(customPkgDir, 'package.json'),
    JSON.stringify({ version: '2.4.1' }),
    'utf8'
  );

  // Extra dir without package.json or versioned folder name should fall back to 0.0.0
  const fallbackDir = path.join(tmpRoot, 'unversioned-ext');
  await fsp.mkdir(fallbackDir, { recursive: true });
  await fsp.writeFile(path.join(fallbackDir, 'extension.js'), '// fallback', 'utf8');

  const missingDir = path.join(tmpRoot, 'does-not-exist');

  const installs = await patcher.discoverAntigravityInstalls({
    customRoots: [standardRoot],
    extraDirs: [
      path.join(standardExtDir, '.'), // Duplicate of standardRoot discovery
      customPkgDir,
      fallbackDir,
      missingDir,
      ''
    ]
  });

  assert.equal(installs.length, 3);
  assert.equal(installs[0].dir, standardExtDir);
  assert.equal(installs[0].version, '1.12.0');
  assert.equal(installs[1].dir, customPkgDir);
  assert.equal(installs[1].version, '2.4.1');
  assert.equal(installs[2].dir, fallbackDir);
  assert.equal(installs[2].version, '0.0.0');
});

