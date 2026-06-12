# PaperSeek

Export DeepSeek chats to PDF — clean, open-source, zero telemetry.

## Browser support

| Browser | PDF method | Auto-download |
|---|---|---|
| Chrome | Debugger API | Yes |
| Edge | Debugger API | Yes |
| Brave | Debugger API | Yes |
| Opera | Debugger API | Yes |
| Firefox | System print dialog | Via dialog |
| Safari | System print dialog | Via dialog |

## Features

- Export full conversation as PDF
- Select specific messages to export
- Paper size: A4 / A5 / Letter
- Portrait or landscape orientation
- Custom filename, scale, margin
- Dark-glass floating toolbar — works on DeepSeek's light and dark themes
- No tracking, no paywall, no external connections

## Install (developer / unpacked)

**Chrome / Edge / Brave / Opera**
1. Go to `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **Load unpacked** → select this folder

**Firefox**
1. Go to `about:debugging`
2. **This Firefox** → **Load Temporary Add-on**
3. Select `manifest.json`

## File structure

```
paperseek/
├── manifest.json
├── src/
│   ├── background.js   — PDF via Chrome Debugger API
│   └── content.js      — Toolbar UI, select mode, settings
└── icons/
    ├── 16.png
    ├── 32.png
    ├── 48.png
    ├── 64.png
    └── 128.png
```

No build step. Pure vanilla JS.

## Permissions

| Permission | Reason |
|---|---|
| `debugger` | `Page.printToPDF` via Chrome DevTools Protocol |
| `downloads` | Save the PDF file |
| `tabs` | Resolve the current tab ID |
| `storage` | Persist settings across sessions |

Zero network calls. All logic runs locally.
