# DeepSeek Exporter

Export DeepSeek chats to PDF — clean, open-source, zero telemetry.

## Browser support

| Browser | PDF method | Auto-download |
|---|---|---|
| Chrome | Debugger API (`Page.printToPDF`) | Yes |
| Edge | Debugger API (`Page.printToPDF`) | Yes |
| Brave | Debugger API (`Page.printToPDF`) | Yes |
| Opera | Debugger API (`Page.printToPDF`) | Yes |
| Firefox | `window.print()` (system dialog) | Via dialog |
| Safari | `window.print()` (system dialog) | Via dialog |

On Firefox/Safari, the browser's native print dialog opens — select "Save as PDF" to export.

## Features

- Export full conversation as PDF
- Select specific messages to export
- Settings: paper size (A4 / A5 / Letter), orientation, filename, scale, margin
- Dark theme support (auto-detects DeepSeek's theme)
- No tracking, no paywall, no external connections

## Install (unpacked / developer mode)

1. Clone or download this repo
2. **Chrome / Edge / Brave / Opera:** Go to `chrome://extensions/` → enable **Developer Mode** → **Load unpacked** → select this folder
3. **Firefox:** Go to `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `manifest.json`
4. Open [chat.deepseek.com](https://chat.deepseek.com) — the toolbar appears at the bottom-right

## File structure

```
deepseek-exporter/
├── manifest.json        # MV3, Firefox browser_specific_settings included
├── src/
│   ├── background.js    # PDF via debugger API (Chromium) or print dialog signal (Firefox)
│   └── content.js       # Toolbar, select mode, settings, cross-browser logic
└── icons/
    ├── 16.png
    ├── 32.png
    ├── 48.png
    ├── 64.png
    └── 128.png
```

No build step. Pure vanilla JS. Edit and reload.

## Permissions explained

| Permission | Why |
|---|---|
| `debugger` | `Page.printToPDF` via Chrome DevTools Protocol (Chromium only, gracefully skipped on Firefox) |
| `downloads` | Save the generated PDF file |
| `tabs` | Get current tab ID for the debugger |
| `storage` | Persist your settings (paper size, filename, etc.) |

## No network calls

Zero external requests. All logic is local.

## vs original v3.0.1

| | Original | This rebuild |
|---|---|---|
| Bundle size | 225 KB (React) | ~8 KB (vanilla JS) |
| Tracking | UUID on install/uninstall | None |
| Paywall iframe | `onlineapp.pro` injected into DeepSeek | None |
| Remote class control | `tapnetic.pro` GET on load | None |
| Storage bridge | `externally_connectable` to `onlineapp.pro` | None |
| Browser support | Chrome only | Chrome, Edge, Brave, Opera, Firefox, Safari |
