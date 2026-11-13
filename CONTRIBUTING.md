# Contributing & Publishing

## Running Tests

```bash
node --test test/*.test.js
```

## Packaging & Publishing to VS Code Marketplace

```bash
npx @vscode/vsce package --no-dependencies --allow-star-activation
npx @vscode/vsce login Zahed-r
npx @vscode/vsce publish --no-dependencies --allow-star-activation
```
