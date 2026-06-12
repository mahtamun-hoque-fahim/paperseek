// content.js
// Injects the export toolbar into chat.deepseek.com.
// No external network calls. No tracking. No paywall.

// ─── Storage helpers ─────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  paperSize: "dse-paper-size",
  landscape: "dse-landscape",
  filename: "dse-filename",
  scale: "dse-scale",
  margin: "dse-margin",
};

function getSetting(key, fallback) {
  const val = localStorage.getItem(key);
  return val !== null ? val : fallback;
}
function setSetting(key, value) {
  localStorage.setItem(key, String(value));
}

// ─── DeepSeek DOM selectors ───────────────────────────────────────────────────
// These target the current DeepSeek chat.deepseek.com DOM structure.
// If DeepSeek updates their HTML, update these selectors.
const SELECTORS = {
  // Outer wrapper for each message bubble (both user and AI)
  messageItem: [
    '[class*="ds-message-container"]',
    '[class*="chat-message"]',
    ".message-container",
    '[class*="fef49d0"]',   // observed class fragment
    '[class*="f9bf7997"]',  // original extension used this
    '[class*="fa81"]',
  ].join(","),
};

function findMessages() {
  // Try each known selector, return the first that gives results
  const candidates = [
    '[class*="ds-message-container"]',
    '[class*="chat-message"]',
    '[class*="fef49d0"]',
    '[class*="f9bf7997"]',
    '[class*="fa81"]',
  ];
  for (const sel of candidates) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) return Array.from(els);
  }
  return [];
}

// ─── State ────────────────────────────────────────────────────────────────────

let isSelectMode = false;
let selectedIds = new Set();
let toolbar = null;
let settingsOpen = false;
let mutationObserver = null;

// ─── Toolbar injection ────────────────────────────────────────────────────────

const TOOLBAR_ID = "dse-toolbar";

function injectToolbar() {
  if (document.getElementById(TOOLBAR_ID)) return;

  // Styles (injected once)
  const style = document.createElement("style");
  style.id = "dse-styles";
  style.textContent = `
    #dse-toolbar {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      border: 1px solid rgba(0,0,0,0.08);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      transition: opacity 0.2s;
    }
    body[data-ds-theme="dark"] #dse-toolbar,
    body.dark #dse-toolbar {
      background: rgba(30,30,30,0.95);
      border-color: rgba(255,255,255,0.1);
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .dse-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.18s ease;
      white-space: nowrap;
      line-height: 1;
    }
    .dse-btn-primary {
      background: linear-gradient(135deg, #1a73e8, #1557b0);
      color: #fff;
      box-shadow: 0 2px 6px rgba(26,115,232,0.3);
    }
    .dse-btn-primary:hover {
      background: linear-gradient(135deg, #1557b0, #1a73e8);
      box-shadow: 0 4px 10px rgba(26,115,232,0.4);
      transform: translateY(-1px);
    }
    .dse-btn-primary:disabled {
      background: #ccc;
      box-shadow: none;
      cursor: not-allowed;
      transform: none;
    }
    .dse-btn-secondary {
      background: transparent;
      color: #1a73e8;
      border: 1.5px solid #1a73e8;
    }
    .dse-btn-secondary:hover {
      background: rgba(26,115,232,0.08);
      transform: translateY(-1px);
    }
    .dse-btn-danger {
      background: transparent;
      color: #64748b;
      border: 1.5px solid #94a3b8;
    }
    .dse-btn-danger:hover {
      background: rgba(100,116,139,0.1);
    }
    body[data-ds-theme="dark"] .dse-btn-secondary,
    body.dark .dse-btn-secondary {
      color: #60a5fa;
      border-color: #60a5fa;
    }
    body[data-ds-theme="dark"] .dse-btn-danger,
    body.dark .dse-btn-danger {
      color: #94a3b8;
      border-color: #475569;
    }

    /* Settings panel */
    #dse-settings {
      position: fixed;
      bottom: 72px;
      right: 20px;
      z-index: 2147483647;
      background: rgba(255,255,255,0.98);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      padding: 20px;
      width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      animation: dse-appear 0.2s cubic-bezier(0.16,1,0.3,1);
    }
    body[data-ds-theme="dark"] #dse-settings,
    body.dark #dse-settings {
      background: rgba(26,26,26,0.97);
      border-color: rgba(255,255,255,0.1);
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    @keyframes dse-appear {
      from { opacity: 0; transform: scale(0.96) translateY(6px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    .dse-settings-title {
      font-size: 15px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(0,0,0,0.07);
    }
    body[data-ds-theme="dark"] .dse-settings-title,
    body.dark .dse-settings-title {
      color: #f3f4f6;
      border-color: rgba(255,255,255,0.1);
    }
    .dse-field {
      margin-bottom: 14px;
    }
    .dse-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
    }
    body[data-ds-theme="dark"] .dse-label,
    body.dark .dse-label { color: #94a3b8; }
    .dse-input, .dse-select {
      width: 100%;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid rgba(0,0,0,0.12);
      font-size: 13px;
      background: #fff;
      color: #1a1a1a;
      box-sizing: border-box;
      transition: border-color 0.15s, box-shadow 0.15s;
      outline: none;
    }
    .dse-input:focus, .dse-select:focus {
      border-color: #4299e1;
      box-shadow: 0 0 0 3px rgba(66,153,225,0.2);
    }
    body[data-ds-theme="dark"] .dse-input,
    body[data-ds-theme="dark"] .dse-select,
    body.dark .dse-input,
    body.dark .dse-select {
      background: rgba(255,255,255,0.06);
      border-color: rgba(255,255,255,0.12);
      color: #f3f4f6;
    }
    .dse-radio-group {
      display: flex;
      gap: 6px;
    }
    .dse-radio-option {
      flex: 1;
      text-align: center;
    }
    .dse-radio-option input { display: none; }
    .dse-radio-option label {
      display: block;
      padding: 7px;
      border-radius: 8px;
      border: 1.5px solid rgba(0,0,0,0.12);
      font-size: 13px;
      font-weight: 500;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s;
      text-align: center;
    }
    body[data-ds-theme="dark"] .dse-radio-option label,
    body.dark .dse-radio-option label { color: #94a3b8; border-color: rgba(255,255,255,0.15); }
    .dse-radio-option input:checked + label {
      border-color: #4299e1;
      color: #4299e1;
      background: rgba(66,153,225,0.08);
    }
    .dse-slider-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .dse-slider {
      flex: 1;
      -webkit-appearance: none;
      height: 5px;
      border-radius: 3px;
      background: #e2e8f0;
      outline: none;
    }
    .dse-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #4299e1;
      cursor: pointer;
      border: 2px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    }
    .dse-slider-val {
      font-size: 12px;
      color: #64748b;
      min-width: 30px;
      text-align: right;
    }
    body[data-ds-theme="dark"] .dse-slider-val,
    body.dark .dse-slider-val { color: #94a3b8; }
    .dse-settings-footer {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid rgba(0,0,0,0.07);
      display: flex;
      justify-content: flex-end;
    }
    body[data-ds-theme="dark"] .dse-settings-footer,
    body.dark .dse-settings-footer { border-color: rgba(255,255,255,0.1); }

    /* Message selection mode */
    .dse-msg-selectable {
      position: relative !important;
      transition: all 0.2s ease !important;
    }
    .dse-msg-selectable[data-dse-selected="true"] {
      outline: 2px solid #4299e1 !important;
      outline-offset: 3px !important;
      border-radius: 10px !important;
      box-shadow: 0 0 0 5px rgba(66,153,225,0.12) !important;
    }
    .dse-checkbox-wrap {
      position: absolute !important;
      top: 50% !important;
      left: -36px !important;
      transform: translateY(-50%) !important;
      z-index: 100 !important;
      opacity: 0 !important;
      transition: opacity 0.15s !important;
    }
    .dse-msg-selectable:hover .dse-checkbox-wrap,
    .dse-msg-selectable[data-dse-selected="true"] .dse-checkbox-wrap {
      opacity: 1 !important;
    }
    .dse-checkbox {
      width: 22px !important;
      height: 22px !important;
      cursor: pointer !important;
      accent-color: #4299e1 !important;
    }
    .dse-msg-count {
      font-size: 12px;
      color: #64748b;
      padding: 0 4px;
    }
    body[data-ds-theme="dark"] .dse-msg-count,
    body.dark .dse-msg-count { color: #94a3b8; }

    /* Success notification */
    #dse-notification {
      position: fixed;
      bottom: 80px;
      right: 20px;
      z-index: 2147483647;
      background: #fff;
      border-left: 4px solid #22c55e;
      border-radius: 10px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.14);
      padding: 14px 18px;
      min-width: 260px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: #1a1a1a;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: dse-slide-in 0.3s ease;
    }
    @keyframes dse-slide-in {
      from { transform: translateX(110%); opacity: 0; }
      to   { transform: translateX(0); opacity: 1; }
    }
    body[data-ds-theme="dark"] #dse-notification,
    body.dark #dse-notification {
      background: #1e1e1e;
      color: #e5e7eb;
    }
  `;
  document.head.appendChild(style);

  // Build toolbar
  toolbar = document.createElement("div");
  toolbar.id = TOOLBAR_ID;
  toolbar.innerHTML = buildToolbarHTML();
  document.body.appendChild(toolbar);

  attachToolbarListeners();
}

function buildToolbarHTML() {
  return `
    <button class="dse-btn dse-btn-primary" id="dse-export-btn">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/>
        <polyline points="9 15 12 18 15 15"/>
      </svg>
      Export PDF
    </button>
    <button class="dse-btn dse-btn-secondary" id="dse-select-btn">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 11 12 14 22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
      Select
    </button>
    <button class="dse-btn dse-btn-secondary" id="dse-settings-btn" title="Settings" style="padding:7px 9px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  `;
}

function buildSelectModeHTML(count) {
  return `
    <span class="dse-msg-count">${count} selected</span>
    <button class="dse-btn dse-btn-primary" id="dse-export-btn" ${count === 0 ? "disabled" : ""}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      Export Selected
    </button>
    <button class="dse-btn dse-btn-danger" id="dse-cancel-select-btn">Cancel</button>
  `;
}

function attachToolbarListeners() {
  toolbar.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    if (btn.id === "dse-export-btn") handleExport();
    if (btn.id === "dse-select-btn") enterSelectMode();
    if (btn.id === "dse-cancel-select-btn") exitSelectMode();
    if (btn.id === "dse-settings-btn") toggleSettings();
  });
}

// ─── Settings panel ───────────────────────────────────────────────────────────

function toggleSettings() {
  if (settingsOpen) {
    closeSettings();
  } else {
    openSettings();
  }
}

function openSettings() {
  closeSettings();
  settingsOpen = true;

  const paperSize = getSetting(STORAGE_KEYS.paperSize, "a4");
  const landscape = getSetting(STORAGE_KEYS.landscape, "false") === "true";
  const filename = getSetting(STORAGE_KEYS.filename, "deepseek-chat");
  const scale = parseFloat(getSetting(STORAGE_KEYS.scale, "1"));
  const margin = parseFloat(getSetting(STORAGE_KEYS.margin, "0.4"));

  const panel = document.createElement("div");
  panel.id = "dse-settings";
  panel.innerHTML = `
    <div class="dse-settings-title">Export Settings</div>

    <div class="dse-field">
      <label class="dse-label">Filename</label>
      <input class="dse-input" id="dse-s-filename" type="text" value="${filename}" placeholder="deepseek-chat" />
    </div>

    <div class="dse-field">
      <label class="dse-label">Paper Size</label>
      <select class="dse-select" id="dse-s-paper">
        <option value="a4" ${paperSize === "a4" ? "selected" : ""}>A4 (210 x 297mm)</option>
        <option value="a5" ${paperSize === "a5" ? "selected" : ""}>A5 (148 x 210mm)</option>
        <option value="letter" ${paperSize === "letter" ? "selected" : ""}>Letter (8.5 x 11in)</option>
      </select>
    </div>

    <div class="dse-field">
      <label class="dse-label">Orientation</label>
      <div class="dse-radio-group">
        <div class="dse-radio-option">
          <input type="radio" name="dse-orientation" id="dse-portrait" value="false" ${!landscape ? "checked" : ""}>
          <label for="dse-portrait">Portrait</label>
        </div>
        <div class="dse-radio-option">
          <input type="radio" name="dse-orientation" id="dse-landscape" value="true" ${landscape ? "checked" : ""}>
          <label for="dse-landscape">Landscape</label>
        </div>
      </div>
    </div>

    <div class="dse-field">
      <label class="dse-label">Scale <span id="dse-scale-val">${Math.round(scale * 100)}%</span></label>
      <div class="dse-slider-row">
        <input class="dse-slider" id="dse-s-scale" type="range" min="0.5" max="1.5" step="0.05" value="${scale}" />
        <span class="dse-slider-val" id="dse-scale-disp">${Math.round(scale * 100)}%</span>
      </div>
    </div>

    <div class="dse-field">
      <label class="dse-label">Margin (inches)</label>
      <div class="dse-slider-row">
        <input class="dse-slider" id="dse-s-margin" type="range" min="0" max="1" step="0.05" value="${margin}" />
        <span class="dse-slider-val" id="dse-margin-disp">${margin.toFixed(2)}"</span>
      </div>
    </div>

    <div class="dse-settings-footer">
      <button class="dse-btn dse-btn-primary" id="dse-save-settings">Save</button>
    </div>
  `;
  document.body.appendChild(panel);

  // Live update labels
  panel.querySelector("#dse-s-scale").addEventListener("input", (e) => {
    const v = Math.round(parseFloat(e.target.value) * 100) + "%";
    panel.querySelector("#dse-scale-disp").textContent = v;
  });
  panel.querySelector("#dse-s-margin").addEventListener("input", (e) => {
    panel.querySelector("#dse-margin-disp").textContent = parseFloat(e.target.value).toFixed(2) + '"';
  });

  panel.querySelector("#dse-save-settings").addEventListener("click", () => {
    setSetting(STORAGE_KEYS.paperSize, panel.querySelector("#dse-s-paper").value);
    setSetting(STORAGE_KEYS.landscape, panel.querySelector('input[name="dse-orientation"]:checked').value);
    setSetting(STORAGE_KEYS.filename, panel.querySelector("#dse-s-filename").value.trim() || "deepseek-chat");
    setSetting(STORAGE_KEYS.scale, panel.querySelector("#dse-s-scale").value);
    setSetting(STORAGE_KEYS.margin, panel.querySelector("#dse-s-margin").value);
    closeSettings();
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", outsideSettingsClick);
  }, 0);
}

function outsideSettingsClick(e) {
  const panel = document.getElementById("dse-settings");
  if (panel && !panel.contains(e.target) && !document.getElementById("dse-settings-btn")?.contains(e.target)) {
    closeSettings();
  }
}

function closeSettings() {
  settingsOpen = false;
  document.getElementById("dse-settings")?.remove();
  document.removeEventListener("click", outsideSettingsClick);
}

// ─── Message selection mode ───────────────────────────────────────────────────

function enterSelectMode() {
  isSelectMode = true;
  selectedIds.clear();
  toolbar.innerHTML = buildSelectModeHTML(0);
  attachToolbarListeners();
  attachCheckboxesToMessages();

  // Watch for new messages (e.g. streaming AI response)
  mutationObserver = new MutationObserver(() => attachCheckboxesToMessages());
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

function exitSelectMode() {
  isSelectMode = false;
  selectedIds.clear();
  mutationObserver?.disconnect();
  mutationObserver = null;

  // Remove checkboxes and selection styles
  document.querySelectorAll(".dse-msg-selectable").forEach((el) => {
    el.classList.remove("dse-msg-selectable");
    el.removeAttribute("data-dse-selected");
    el.querySelector(".dse-checkbox-wrap")?.remove();
  });

  toolbar.innerHTML = buildToolbarHTML();
  attachToolbarListeners();
}

function attachCheckboxesToMessages() {
  const messages = findMessages();
  messages.forEach((el, idx) => {
    if (el.querySelector(".dse-checkbox-wrap")) return; // already done

    const id = `dse-msg-${idx}`;
    el.setAttribute("data-dse-id", id);
    el.classList.add("dse-msg-selectable");

    const wrap = document.createElement("span");
    wrap.className = "dse-checkbox-wrap";
    wrap.innerHTML = `<input type="checkbox" class="dse-checkbox" data-dse-id="${id}" />`;
    el.appendChild(wrap);

    wrap.querySelector(".dse-checkbox").addEventListener("change", (e) => {
      const msgId = e.target.getAttribute("data-dse-id");
      const msgEl = document.querySelector(`[data-dse-id="${msgId}"]`);
      if (e.target.checked) {
        selectedIds.add(msgId);
        msgEl?.setAttribute("data-dse-selected", "true");
      } else {
        selectedIds.delete(msgId);
        msgEl?.removeAttribute("data-dse-selected");
      }
      updateSelectModeCount();
    });
  });
}

function updateSelectModeCount() {
  toolbar.innerHTML = buildSelectModeHTML(selectedIds.size);
  attachToolbarListeners();
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function handleExport() {
  const exportBtn = document.getElementById("dse-export-btn");
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.textContent = "Exporting...";
  }

  // If in select mode, hide non-selected messages temporarily
  let hidden = [];
  if (isSelectMode && selectedIds.size > 0) {
    document.querySelectorAll(".dse-msg-selectable").forEach((el) => {
      if (el.getAttribute("data-dse-selected") !== "true") {
        el.style.display = "none";
        hidden.push(el);
      }
    });
  }

  // Hide toolbar while printing
  if (toolbar) toolbar.style.display = "none";
  const settingsPanel = document.getElementById("dse-settings");
  if (settingsPanel) settingsPanel.style.display = "none";

  const dateStr = new Date().toISOString().split("T")[0];
  const baseFilename = getSetting(STORAGE_KEYS.filename, "deepseek-chat");
  const filename = `${baseFilename}-${dateStr}.pdf`;

  const options = {
    paperSize: getSetting(STORAGE_KEYS.paperSize, "a4"),
    landscape: getSetting(STORAGE_KEYS.landscape, "false") === "true",
    scale: parseFloat(getSetting(STORAGE_KEYS.scale, "1")),
    margin: parseFloat(getSetting(STORAGE_KEYS.margin, "0.4")),
    filename,
  };

  // Small delay to allow display:none to take effect
  await new Promise((r) => setTimeout(r, 80));

  const response = await chrome.runtime.sendMessage({
    type: "EXPORT_PDF",
    tabId: null, // background resolves from sender.tab
    options,
  });

  // Restore hidden messages
  hidden.forEach((el) => (el.style.display = ""));
  if (toolbar) toolbar.style.display = "";
  if (settingsPanel) settingsPanel.style.display = "";

  if (exportBtn) {
    exportBtn.disabled = false;
    exportBtn.innerHTML = isSelectMode ? "Export Selected" : `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/>
        <polyline points="9 15 12 18 15 15"/>
      </svg>
      Export PDF
    `;
  }

  if (response?.ok) {
    if (isSelectMode) exitSelectMode();
    showNotification("PDF saved successfully");
  } else {
    showNotification(`Export failed: ${response?.error || "Unknown error"}`, true);
  }
}

// ─── Notification ─────────────────────────────────────────────────────────────

function showNotification(message, isError = false) {
  document.getElementById("dse-notification")?.remove();
  const el = document.createElement("div");
  el.id = "dse-notification";
  el.style.borderLeftColor = isError ? "#ef4444" : "#22c55e";
  el.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${isError ? "#ef4444" : "#22c55e"}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      ${isError
        ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
        : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'}
    </svg>
    <span>${message}</span>
  `;
  document.body.appendChild(el);
  setTimeout(() => el?.remove(), 4000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  if (window.location.hostname !== "chat.deepseek.com") return;
  if (document.getElementById(TOOLBAR_ID)) return;

  injectToolbar();
}

// Run once DOM is ready, then watch for SPA navigations
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Re-inject on SPA route changes (DeepSeek is a React SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(init, 500);
  }
}).observe(document.body, { childList: true, subtree: true });
