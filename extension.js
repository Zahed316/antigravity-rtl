'use strict';

const os = require('os');
const path = require('path');
const vscode = require('vscode');
const { createProxyManager } = require('./src/proxy');
const patcher = require('./src/patcher');

const CONTROL_DIR = path.join(os.homedir(), '.antigravity-rtl');
const PREFERRED_MODE_KEY = 'preferredRtlMode';

let outputChannel;
let statusBarItem;
let proxyManager;

function log(msg) {
  if (outputChannel) {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
  }
}

function readConfigState() {
  const cfg = vscode.workspace.getConfiguration('antigravityRtl');
  return {
    enabled: cfg.get('enabled', true),
    mode: cfg.get('mode', 'force-rtl'),
    lineHeight: cfg.get('lineHeight', 0)
  };
}

function updateStatusBar(state) {
  if (!statusBarItem) return;
  if (!state.enabled) {
    statusBarItem.text = '$(arrow-right) RTL: OFF';
    statusBarItem.tooltip = 'Antigravity RTL خاموش است — کلیک برای فعال‌سازی';
    statusBarItem.backgroundColor = undefined;
  } else if (state.mode === 'force-ltr') {
    statusBarItem.text = '$(arrow-right) LTR';
    statusBarItem.tooltip = 'Antigravity روی چپ‌چین اجباری است — کلیک برای راست‌چین';
    statusBarItem.backgroundColor = undefined;
  } else if (state.mode === 'smart-rtl') {
    statusBarItem.text = '$(arrow-left) RTL: Smart';
    statusBarItem.tooltip = 'Antigravity RTL هوشمند فعال است — کلیک برای خاموش کردن';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
  } else if (state.mode === 'auto') {
    statusBarItem.text = '$(arrow-left) RTL: Auto';
    statusBarItem.tooltip = 'Antigravity RTL خودکار فعال است — کلیک برای خاموش کردن';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
  } else {
    statusBarItem.text = '$(arrow-left) RTL: ON';
    statusBarItem.tooltip = 'Antigravity RTL اجباری فعال است — کلیک برای خاموش کردن';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
  }
  statusBarItem.show();
}

async function promptReload(message) {
  const choice = await vscode.window.showInformationMessage(message, 'Reload Window');
  if (choice === 'Reload Window') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

async function applyHookIfNeeded({ notifyIfPatched = true, extensionId } = {}) {
  const installs = await patcher.discoverAntigravityInstalls();
  if (installs.length === 0) {
    log('No google.google-antigravity installation found under extensions folder.');
    return { patchedCount: 0, total: 0 };
  }

  let patchedCount = 0;
  for (const inst of installs) {
    try {
      const res = await patcher.applyToInstall(inst, { extensionId });
      log(`${res.status}: ${inst.dir}`);
      if (res.status === 'patched') patchedCount++;
    } catch (err) {
      log(`Hook apply failed (${inst.dir}): ${err.message}`);
      vscode.window.showErrorMessage(`Antigravity RTL: خطا در اتصال قلاب — ${err.message}`);
    }
  }

  if (patchedCount > 0 && notifyIfPatched) {
    await promptReload(
      'Antigravity RTL متصل شد. برای فعال شدن در پنل، یک‌بار پنجره را Reload کنید.'
    );
  }
  return { patchedCount, total: installs.length };
}

async function restoreHook() {
  const installs = await patcher.discoverAntigravityInstalls();
  let restoredCount = 0;
  for (const inst of installs) {
    try {
      const res = await patcher.restoreInstall(inst);
      log(`${res.status}: ${inst.dir}`);
      if (res.status === 'restored-from-backup' || res.status === 'stripped-inline') {
        restoredCount++;
      }
    } catch (err) {
      log(`Restore failed (${inst.dir}): ${err.message}`);
      vscode.window.showErrorMessage(`Antigravity RTL: خطا در بازگردانی — ${err.message}`);
    }
  }
  if (restoredCount > 0) {
    await promptReload('فایل اصلی Google Antigravity بازگردانی شد. پنجره را Reload کنید.');
  } else {
    vscode.window.showInformationMessage('Antigravity RTL: تغییری برای بازگردانی وجود نداشت.');
  }
}

async function toggleRtl(context) {
  const cfg = vscode.workspace.getConfiguration('antigravityRtl');
  const current = readConfigState();
  const isRtlOn = current.enabled && current.mode !== 'force-ltr';

  if (isRtlOn) {
    await cfg.update('enabled', false, vscode.ConfigurationTarget.Global);
  } else {
    const preferred = context.globalState.get(PREFERRED_MODE_KEY, 'force-rtl');
    const targetMode = current.mode === 'force-ltr' ? preferred : current.mode;
    if (targetMode !== current.mode) {
      await cfg.update('mode', targetMode, vscode.ConfigurationTarget.Global);
    }
    await cfg.update('enabled', true, vscode.ConfigurationTarget.Global);
  }
}

async function selectDirectionMode(context) {
  const current = readConfigState();
  const items = [
    {
      label: '$(arrow-left) اجبار راست‌چین (Forced RTL)',
      description: current.enabled && current.mode === 'force-rtl' ? 'فعال' : '',
      detail: 'کل متن‌ها و کادر پیام راست‌چین می‌شوند حتی اگر با کلمه انگلیسی شروع شوند (بلوک کد چپ‌چین می‌ماند).',
      action: { enabled: true, mode: 'force-rtl' }
    },
    {
      label: '$(arrow-right) اجبار چپ‌چین (Forced LTR)',
      description: current.enabled && current.mode === 'force-ltr' ? 'فعال' : '',
      detail: 'کل متن‌ها و کادر پیام چپ‌چین می‌شوند.',
      action: { enabled: true, mode: 'force-ltr' }
    },
    {
      label: '$(sparkle) هوشمند بر اساس وجود فارسی/عربی (Smart Content RTL)',
      description: current.enabled && current.mode === 'smart-rtl' ? 'فعال' : '',
      detail: 'هر پاراگرافی که در کل متنش حرف فارسی/عربی باشد راست‌چین و بقیه چپ‌چین می‌شوند.',
      action: { enabled: true, mode: 'smart-rtl' }
    },
    {
      label: '$(symbol-text) خودکار کلمه اول (Browser dir="auto")',
      description: current.enabled && current.mode === 'auto' ? 'فعال' : '',
      detail: 'تعیین جهت هر پاراگراف بر اساس اولین حرف غیرخنثی.',
      action: { enabled: true, mode: 'auto' }
    },
    {
      label: '$(circle-slash) خاموش (Off)',
      description: !current.enabled ? 'فعال' : '',
      detail: 'حذف کامل دخالت RTL بدون تغییر فایل‌های اصلی.',
      action: { enabled: false }
    }
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'حالت جهت‌دهی متن در پنل Antigravity را انتخاب کنید'
  });
  if (!picked) return;

  const cfg = vscode.workspace.getConfiguration('antigravityRtl');
  if (picked.action.mode) {
    if (picked.action.mode !== 'force-ltr') {
      await context.globalState.update(PREFERRED_MODE_KEY, picked.action.mode);
    }
    await cfg.update('mode', picked.action.mode, vscode.ConfigurationTarget.Global);
  }
  await cfg.update('enabled', picked.action.enabled, vscode.ConfigurationTarget.Global);
}

async function checkLegacyConflict() {
  const legacyId = 'talco.antigravity-rtl';
  if (!vscode.extensions.getExtension(legacyId)) return;
  const pick = await vscode.window.showWarningMessage(
    'افزونه قدیمی «talco.antigravity-rtl» روی VS Code کار نمی‌کند و ممکن است خطای دسترسی بدهد. حذف شود؟',
    'حذف',
    'نادیده بگیر'
  );
  if (pick === 'حذف') {
    try {
      await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', legacyId);
    } catch (err) {
      log(`Failed to uninstall legacy extension: ${err.message}`);
    }
  }
}

async function activate(context) {
  outputChannel = vscode.window.createOutputChannel('Antigravity RTL');
  context.subscriptions.push(outputChannel);

  const extensionId = context.extension && context.extension.id;
  const initialState = readConfigState();
  if (initialState.mode !== 'force-ltr') {
    context.globalState.update(PREFERRED_MODE_KEY, initialState.mode);
  }

  proxyManager = createProxyManager({
    initialState,
    controlDir: CONTROL_DIR,
    log
  });

  const info = await proxyManager.start();
  log(`Proxy control server listening on 127.0.0.1:${info.port}`);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'antigravityRtl.toggle';
  updateStatusBar(initialState);
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityRtl.toggle', () => toggleRtl(context)),
    vscode.commands.registerCommand('antigravityRtl.selectMode', () => selectDirectionMode(context)),
    vscode.commands.registerCommand('antigravityRtl.reapply', () =>
      applyHookIfNeeded({ notifyIfPatched: true, extensionId })
    ),
    vscode.commands.registerCommand('antigravityRtl.restore', () => restoreHook()),
    vscode.commands.registerCommand('antigravityRtl.showLog', () => outputChannel.show(true)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('antigravityRtl')) return;
      const next = readConfigState();
      if (next.mode !== 'force-ltr') {
        context.globalState.update(PREFERRED_MODE_KEY, next.mode);
      }
      proxyManager.setState(next);
      updateStatusBar(next);
      log(`State updated -> enabled=${next.enabled}, mode=${next.mode}, lineHeight=${next.lineHeight}`);
    })
  );

  // Sync hook in background so activation completes immediately for incoming register requests.
  applyHookIfNeeded({ notifyIfPatched: true, extensionId }).catch((err) =>
    log(`Auto-sync error: ${err.message}`)
  );
  checkLegacyConflict().catch(() => {});
}

async function deactivate() {
  if (proxyManager) {
    await proxyManager.stop();
    proxyManager = null;
  }
}

module.exports = {
  activate,
  deactivate
};
