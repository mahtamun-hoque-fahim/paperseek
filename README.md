# DeepSeek Exporter

Export DeepSeek chats to PDF — clean, open-source, zero telemetry.

## Features

- Export full conversation as PDF
- Select specific messages to export
- Settings: paper size (A4 / A5 / Letter), orientation, filename, scale, margin
- Dark theme support (auto-detects DeepSeek's theme)
- No tracking, no paywall, no external connections

## Install (unpacked)

1. Clone or download this repo
2. Go to `chrome://extensions/` (or `brave://extensions/`)
3. Enable **Developer Mode**
4. Click **Load unpacked** → select this folder
5. Open [chat.deepseek.com](https://chat.deepseek.com) — the toolbar appears at the bottom-right

## How it works

| Component | Purpose |
|---|---|
| `src/background.js` | Handles PDF printing via Chrome Debugger API (`Page.printToPDF`) |
| `src/content.js` | Injects the floating toolbar into DeepSeek's UI |
| `manifest.json` | MV3, minimal permissions, `chat.deepseek.com` only |

The only permission that needs explanation is `debugger` — it's required for `Page.printToPDF`, which is the only reliable way to export a full webpage (including backgrounds, styles, and code blocks) as a high-quality PDF from an extension.

## Permissions

| Permission | Why |
|---|---|
| `debugger` | `Page.printToPDF` via Chrome DevTools Protocol |
| `downloads` | Save the generated PDF file |
| `tabs` | Get the current tab ID for the debugger |
| `storage` | Remember your settings (paper size, filename, etc.) |

## No network calls

This extension makes zero external requests. All processing is local.

## Dev notes

No build step required. Pure vanilla JS — edit and reload.

```
deepseek-exporter/
├── manifest.json
├── src/
│   ├── background.js   # PDF printing logic
│   └── content.js      # UI injection + selection mode
└── icons/
    ├── 16.png
    ├── 32.png
    ├── 48.png
    ├── 64.png
    └── 128.png
```

## Compared to v1

The original extension (v3.0.1) included:
- UUID tracking on install/uninstall → **removed**
- `onlineapp.pro` paywall iframe injected into DeepSeek → **removed**
- `tapnetic.pro` remote CSS class control → **removed**
- `externally_connectable` bridge for `onlineapp.pro` auth → **removed**
- React + bundler (225KB bundle) → **replaced with 6KB vanilla JS**
