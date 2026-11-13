# Antigravity RTL

Instant **RTL / LTR** direction toggle for the **Google Antigravity** chat panel in Visual Studio Code — no `sudo` or root access required, preserves your system font, and keeps code blocks strictly Left-to-Right.

---

## Multilingual Summary (All RTL Languages)

- **فارسی (Persian):** تغییر آنی و بدون Reload جهت متن (راست‌به‌چپ / چپ‌به‌چپ) در پنل چت Google Antigravity درون VS Code، با حفظ فونت سیستم و چپ‌چین ماندن بلوک‌های کد و دستورات، بدون نیاز به دسترسی `sudo`.
- **العربية (Arabic):** تبديل فوري لاتجاه النص (من اليمين إلى اليسار / من اليسار إلى اليمين) في لوحة دردشة Google Antigravity داخل VS Code دون إعادة تحميل النافذة، مع الحفاظ على خط النظام وإبقاء مقاطع الأكواد البرمجية من اليسار إلى اليمين ودون الحاجة إلى صلاحيات الجذر (`sudo`).
- **עברית (Hebrew):** החלפה מיידית של כיוון הטקסט (מימין לשמאל / משמאל לימין) בחלונית הצ'אט של Google Antigravity ב-VS Code ללא טעינה מחדש, תוך שמירה על גופן המערכת והשארת קטעי קוד מיושרים משמאל לימין וללא צורך בהרשאות `sudo`.
- **اردو (Urdu):** وی ایس کوڈ (VS Code) میں Google Antigravity چیٹ پینل کے لیے بغیر ری لوڈ کے فوری RTL/LTR تبدیلی، سسٹم فونٹ برقرار رکھتے ہوئے اور کوڈ بلاکس کو بائیں سے دائیں رکھتے ہوئے، بغیر `sudo` اجازت کے۔
- **پښتو (Pashto):** په VS Code کې د Google Antigravity چټ پینل لپاره پرته له بیا بارولو (Reload) څخه سمدستي RTL/LTR بدلون، د سیسټم فونټ ساتلو او د کوډ بلاکونو چپ-تر-ښي ساتلو سره، پرته له `sudo` لاسرسي څخه.
- **کوردی سۆرانی (Kurdish Sorani):** گۆڕینی خێرای ئاراستەی دەق (ڕاست بۆ چەپ / چەپ بۆ ڕاست) لە پانێڵی چاتی Google Antigravity لە VS Code بەبێ ڕیلۆدکردنەوە، لەگەڵ پاراستنی فۆنتی سیستەم و هێشتنەوەی بلۆکەکانی کۆد بە چەپ بۆ ڕاست بەبێ پێویستی بە `sudo`.
- **دری (Dari):** تغییر فوری جهت متن (راست‌به‌چپ / چپ‌به‌چپ) در پنل چت Google Antigravity داخل VS Code بدون نیاز به بارگذاری مجدد، با حفظ فونت سیستم و چپ‌به‌راست ماندن کدها بدون دسترسی `sudo`.
- **سنڌي (Sindhi):** VS Code ۾ Google Antigravity چيٽ پينل لاءِ بغير ريلوڊ جي فوري RTL/LTR تبديلي، سسٽم فانٽ برقرار رکندي ۽ ڪوڊ بلاڪس کي کاٻي کان ساڄي رکندي، بغير `sudo` اجازت جي.
- **ئۇيغۇرچە (Uyghur):** VS Code ئىچىدىكى Google Antigravity سۆھبەت تاختىسىدا قايتا يۈكلىمەي تۇرۇپ دەرھال RTL/LTR يۆنىلىشىنى ئالماشتۇرۇش؛ سىستېما خەت نۇسخىسىنى ساقلايدۇ، كود بۆلەكلىرىنى سولدىن ئوڭغا ساقلايدۇ، `sudo` تەلەپ قىلمايدۇ.
- **ދިވެހި (Dhivehi):** VS Code ގައި ހުންނަ Google Antigravity ޗެޓް ޕެނަލްގެ ލިޔުން ރީލޯޑް ކުރުމަކާ ނުލައި ވަގުތުން RTL/LTR އަށް ބަދަލުކޮށްދޭ، ސިސްޓަމް ފޮންޓާއި ކޯޑު ބްލޮކްތައް LTR ގައި ބަހައްޓައިގެން `sudo` ބޭނުންނުވާ އެކްސްޓެންޝަނެކެވެ.
- **ܣܘܪܝܝܐ (Syriac):** ܫܘܚܠܦܐ ܩܠܝܠܐ ܕܟܝܘܢܐ ܕܟܬܒܬܐ (ܡܢ ܝܡܝܢܐ ܠܣܡܠܐ / ܡܢ ܣܡܠܐ ܠܝܡܝܢܐ) ܒܦܢܠܐ ܕGoogle Antigravity ܓܘ VS Code ܕܠܐ ܛܥܢܬܐ ܡܢ ܕܪܝܫ، ܟܕ ܢܛܪ ܣܪܛܐ ܕܛܟܣܐ ܘܦܣܘܩ̈ܐ ܕܩܘܕܐ ܡܢ ܣܡܠܐ ܠܝܡܝܢܐ ܕܠܐ `sudo`.

---

## Features

- **Live Status Bar Toggle (`RTL: ON` / `RTL: OFF`):** Switch direction immediately without reloading VS Code (powered by an internal loopback SSE channel).
- **Selectable Direction Modes (`Antigravity RTL: Select Direction Mode`):**
  - `force-rtl` *(default)*: Forces prose blocks and chat input boxes to RTL even when a paragraph starts with an English term.
  - `force-ltr`: Forces prose blocks and chat input boxes to LTR.
  - `smart-rtl`: Automatically sets RTL on blocks containing any RTL Unicode script character anywhere in the block (`\u0590-\u08FF`, presentation forms).
  - `auto`: Standard browser `dir="auto"` (first strong directional character).
- **Code & UI Safe:** Keeps `pre`, `code`, `kbd`, `samp`, `.monaco-editor`, and UI controls strictly LTR with `unicode-bidi: isolate`.
- **Preserves System Font:** Does not override your VS Code or OS font stack.
- **No Root / `sudo` Required:** Operates strictly in user space under `~/.vscode/extensions/`. Keeps an untouched `.agy-rtl.bak` backup and fails open if disabled or uninstalled.

## Usage

1. Install the extension and run **Developer: Reload Window** once so Google Antigravity initializes through the user-space hook.
2. Click **`RTL: ON` / `RTL: OFF`** in the bottom-right Status Bar to toggle instantly with zero reload.
3. Run **`Antigravity RTL: Select Direction Mode`** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to switch between **Forced RTL**, **Forced LTR**, **Smart Content RTL**, **Browser Auto**, and **Off**.

## Commands

| Command | Description |
| --- | --- |
| `Antigravity RTL: Toggle RTL / LTR` | Toggle direction override on or off live |
| `Antigravity RTL: Select Direction Mode` | Choose between `force-rtl`, `force-ltr`, `smart-rtl`, `auto`, or `off` |
| `Antigravity RTL: Re-apply Hook to Antigravity` | Re-apply hook after a Google Antigravity update |
| `Antigravity RTL: Restore Original Antigravity Files` | Restore `extension.js` cleanly from `.agy-rtl.bak` |
| `Antigravity RTL: Show Output Log` | Open the extension diagnostic output channel |

## Configuration

- `antigravityRtl.enabled`: Enable or disable direction override (`true` by default).
- `antigravityRtl.mode`: `"force-rtl"` | `"force-ltr"` | `"smart-rtl"` | `"auto"` (`"force-rtl"` by default).
- `antigravityRtl.lineHeight`: Optional line-height override for RTL blocks (`0` preserves default).

## Packaging & Publishing to VS Code Marketplace

1. Set your Marketplace `"publisher"` ID and `"repository"` URL in `package.json`.
2. Verify tests pass:
   ```bash
   node --test test/*.test.js
   ```
3. Package or publish using `@vscode/vsce`:
   ```bash
   npx @vscode/vsce package
   npx @vscode/vsce publish
   ```
   Or build locally without external dependencies via `python3 scripts/package-vsix.py`.
