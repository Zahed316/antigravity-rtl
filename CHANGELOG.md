# Changelog

## 0.1.1

- Added cross-platform discovery for VS Code Portable and custom `--extensions-dir` installations via `vscode.extensions.getExtension('google.google-antigravity')?.extensionPath`.
- Added case-insensitive path deduplication on Windows and version fallback resolution from `package.json`.

## 0.1.0

- Initial release of Antigravity RTL for VS Code.
- Live status bar toggle (`RTL: ON` / `RTL: OFF`) with zero window reload via local SSE loopback proxy.
- Selectable direction modes: `force-rtl`, `force-ltr`, `smart-rtl`, and `auto`.
- Preserves default system/IDE fonts and keeps code blocks (`pre`, `code`, `kbd`, `samp`, `.monaco-editor`) strictly LTR.
- Reversible user-space hook with `.agy-rtl.bak` backup and `Restore Original Antigravity Files` command.
- Full Unicode RTL script detection across Persian, Arabic, Hebrew, Urdu, Pashto, Kurdish, Dari, Sindhi, Uyghur, Dhivehi, Syriac, N'Ko, Samaritan, and Mandaic.
