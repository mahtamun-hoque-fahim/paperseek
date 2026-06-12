// content.js — PaperSeek
// Export DeepSeek chats to PDF.
// Chrome/Edge/Brave/Opera: silent PDF via debugger API.
// Firefox/Safari: window.print() system dialog.
// Zero telemetry. Zero external calls.

// ─── Cross-browser shim ───────────────────────────────────────────────────────
const api = typeof browser !== "undefined" ? browser : chrome;

// Chrome/Edge/Brave/Opera have chrome.debugger → silent PDF.
// Firefox/Safari fall back to window.print().
const IS_CHROMIUM = !!(
  typeof chrome !== "undefined" &&
  chrome.runtime &&
  typeof chrome.debugger !== "undefined"
);

// ─── Storage ──────────────────────────────────────────────────────────────────
const K = {
  paperSize: "ps-paper-size",
  landscape: "ps-landscape",
  filename:  "ps-filename",
  scale:     "ps-scale",
  margin:    "ps-margin",
};
const get = (k, fb) => { const v = localStorage.getItem(k); return v !== null ? v : fb; };
const set = (k, v) => localStorage.setItem(k, String(v));

// ─── DeepSeek message detection ───────────────────────────────────────────────
function findMessages() {
  const tries = [
    '[class*="ds-message-container"]',
    '[class*="chat-message"]',
    '[class*="fef49d0"]',
    '[class*="f9bf7997"]',
    '[class*="fa81"]',
  ];
  for (const s of tries) {
    const els = document.querySelectorAll(s);
    if (els.length) return Array.from(els);
  }
  return [];
}

// ─── State ────────────────────────────────────────────────────────────────────
let isSelectMode = false;
let selectedIds  = new Set();
let toolbar      = null;
let settingsOpen = false;
let msgObserver  = null;

// ─── Print styles (Firefox fallback) ─────────────────────────────────────────
function injectPrintStyles() {
  if (document.getElementById("ps-print-styles")) return;
  const s = document.createElement("style");
  s.id = "ps-print-styles";
  s.textContent = `
    @media print {
      #ps-toolbar, #ps-settings, #ps-notification,
      header, nav, aside,
      [class*="sidebar"], [class*="input-area"],
      [class*="bottom-bar"], [class*="action-bar"],
      [class*="ds-input"], [class*="suggestion"], [class*="footer"] {
        display: none !important;
      }
      .ps-print-hidden { display: none !important; }
      body { background: #fff !important; }
    }
  `;
  document.head.appendChild(s);
}

// ─── Design tokens ────────────────────────────────────────────────────────────
// Mint:     #3DF49A   → Fahim's brand accent across all projects
// Dark bg:  #0A0A0A   → Jet black glass toolbar
// Surface:  #141414   → Slightly lifted surface
// Border:   rgba(255,255,255,0.09)
// Text:     #F1F5F9 primary / #64748B secondary
// Danger:   #F87171

const CSS = `
  /* ── Toolbar ─────────────────────────────────── */
  #ps-toolbar {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: rgba(10, 10, 10, 0.94);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.09);
    box-shadow:
      0 0 0 1px rgba(0,0,0,0.5),
      0 8px 32px rgba(0,0,0,0.55),
      0 2px 8px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
  }

  /* ── Buttons ─────────────────────────────────── */
  .ps-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 13px;
    border: none;
    border-radius: 9px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    transition: all 0.15s ease;
    letter-spacing: -0.01em;
  }

  /* Primary — solid mint */
  .ps-btn-primary {
    background: #3DF49A;
    color: #080D0A;
    box-shadow: 0 1px 0 rgba(255,255,255,0.12) inset,
                0 2px 8px rgba(61, 244, 154, 0.25);
  }
  .ps-btn-primary:hover {
    background: #52F7A5;
    box-shadow: 0 1px 0 rgba(255,255,255,0.16) inset,
                0 4px 14px rgba(61, 244, 154, 0.35);
    transform: translateY(-1px);
  }
  .ps-btn-primary:active { transform: translateY(0); }
  .ps-btn-primary:disabled {
    background: #1E2922;
    color: #3D5045;
    box-shadow: none;
    cursor: not-allowed;
    transform: none;
  }

  /* Ghost — outlined */
  .ps-btn-ghost {
    background: rgba(255,255,255,0.04);
    color: #94A3B8;
    border: 1px solid rgba(255,255,255,0.09);
  }
  .ps-btn-ghost:hover {
    background: rgba(255,255,255,0.08);
    color: #CBD5E1;
    border-color: rgba(255,255,255,0.14);
  }

  /* Danger ghost */
  .ps-btn-danger {
    background: transparent;
    color: #6B7280;
    border: 1px solid rgba(255,255,255,0.07);
  }
  .ps-btn-danger:hover {
    background: rgba(248, 113, 113, 0.08);
    color: #F87171;
    border-color: rgba(248, 113, 113, 0.2);
  }

  /* Icon-only button */
  .ps-btn-icon {
    padding: 7px;
    background: rgba(255,255,255,0.04);
    color: #64748B;
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 9px;
    transition: all 0.15s ease;
  }
  .ps-btn-icon:hover {
    background: rgba(255,255,255,0.08);
    color: #3DF49A;
    border-color: rgba(61,244,154,0.25);
  }
  .ps-btn-icon svg { display: block; }

  /* Count badge */
  .ps-count {
    font-size: 12px;
    color: #3DF49A;
    padding: 0 4px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }

  /* Firefox hint */
  .ps-hint {
    font-size: 11px;
    color: #374151;
    padding: 0 2px;
  }

  /* ── Settings panel ──────────────────────────── */
  #ps-settings {
    position: fixed;
    bottom: 68px;
    right: 20px;
    z-index: 2147483647;
    background: #0E0E0E;
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 16px;
    box-shadow:
      0 0 0 1px rgba(0,0,0,0.6),
      0 24px 64px rgba(0,0,0,0.7),
      0 8px 24px rgba(0,0,0,0.5);
    padding: 18px;
    width: 290px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    animation: ps-in 0.2s cubic-bezier(0.16,1,0.3,1);
  }
  @keyframes ps-in {
    from { opacity: 0; transform: scale(0.96) translateY(8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  .ps-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .ps-panel-title {
    font-size: 14px;
    font-weight: 600;
    color: #F1F5F9;
    letter-spacing: -0.02em;
  }
  .ps-badge {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 7px;
    border-radius: 20px;
    background: rgba(61,244,154,0.1);
    color: #3DF49A;
    border: 1px solid rgba(61,244,154,0.2);
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }

  .ps-field { margin-bottom: 13px; }
  .ps-label {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: #4B5563;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 6px;
  }

  .ps-input, .ps-select {
    width: 100%;
    padding: 8px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255,255,255,0.08);
    font-size: 13px;
    background: rgba(255,255,255,0.04);
    color: #E2E8F0;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    -webkit-appearance: none;
    appearance: none;
  }
  .ps-input::placeholder { color: #374151; }
  .ps-input:focus, .ps-select:focus {
    border-color: rgba(61,244,154,0.4);
    box-shadow: 0 0 0 3px rgba(61,244,154,0.08);
    background: rgba(255,255,255,0.06);
  }
  .ps-select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%234B5563' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 9px center;
    background-size: 14px;
    padding-right: 28px;
    cursor: pointer;
  }

  /* Radio toggle group */
  .ps-toggle {
    display: flex;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 9px;
    padding: 3px;
    gap: 3px;
  }
  .ps-toggle-opt { flex: 1; }
  .ps-toggle-opt input { display: none; }
  .ps-toggle-opt label {
    display: block;
    text-align: center;
    padding: 6px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 500;
    color: #4B5563;
    cursor: pointer;
    transition: all 0.15s;
  }
  .ps-toggle-opt input:checked + label {
    background: rgba(61,244,154,0.12);
    color: #3DF49A;
    border: 1px solid rgba(61,244,154,0.22);
  }
  .ps-toggle-opt label:hover { color: #94A3B8; }

  /* Slider */
  .ps-slider-row { display: flex; align-items: center; gap: 10px; }
  .ps-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: rgba(255,255,255,0.08);
    outline: none;
  }
  .ps-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #3DF49A;
    cursor: pointer;
    border: 2px solid #0A0A0A;
    box-shadow: 0 0 0 1px rgba(61,244,154,0.3);
    transition: box-shadow 0.15s;
  }
  .ps-slider::-webkit-slider-thumb:hover {
    box-shadow: 0 0 0 4px rgba(61,244,154,0.15);
  }
  .ps-slider-val {
    font-size: 12px;
    color: #3DF49A;
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  /* Firefox note */
  .ps-ff-note {
    font-size: 12px;
    color: #374151;
    line-height: 1.6;
    padding: 10px 12px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 9px;
  }

  .ps-panel-footer {
    margin-top: 14px;
    padding-top: 13px;
    border-top: 1px solid rgba(255,255,255,0.07);
    display: flex;
    justify-content: flex-end;
  }

  /* ── Message selection ───────────────────────── */
  .ps-selectable {
    position: relative !important;
    transition: box-shadow 0.18s ease !important;
  }
  .ps-selectable[data-ps-sel="true"] {
    outline: 2px solid rgba(61,244,154,0.6) !important;
    outline-offset: 4px !important;
    border-radius: 10px !important;
  }
  .ps-chk-wrap {
    position: absolute !important;
    top: 50% !important;
    left: -36px !important;
    transform: translateY(-50%) !important;
    z-index: 9999 !important;
    opacity: 0 !important;
    transition: opacity 0.15s !important;
    pointer-events: all !important;
  }
  .ps-selectable:hover .ps-chk-wrap,
  .ps-selectable[data-ps-sel="true"] .ps-chk-wrap { opacity: 1 !important; }
  .ps-chk {
    width: 20px !important;
    height: 20px !important;
    cursor: pointer !important;
    accent-color: #3DF49A !important;
    border-radius: 5px !important;
  }

  /* ── Notification ────────────────────────────── */
  #ps-notification {
    position: fixed;
    bottom: 76px;
    right: 20px;
    z-index: 2147483647;
    background: #0E0E0E;
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 11px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    padding: 12px 16px;
    min-width: 240px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    color: #E2E8F0;
    display: flex;
    align-items: center;
    gap: 10px;
    animation: ps-slide 0.28s cubic-bezier(0.16,1,0.3,1);
  }
  @keyframes ps-slide {
    from { transform: translateX(110%); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
`;

// ─── SVG icons ────────────────────────────────────────────────────────────────
const ICONS = {
  export: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>`,
  select: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  settings: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  ok: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3DF49A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  err: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F87171" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

// ─── Toolbar HTML ──────────────────────────────────────────────────────────────
const TOOLBAR_ID = "ps-toolbar";

function buildDefaultHTML() {
  const hint = IS_CHROMIUM ? "" : `<span class="ps-hint">print dialog</span>`;
  return `
    <button class="ps-btn ps-btn-primary" id="ps-export-btn">${ICONS.export} Export PDF</button>
    <button class="ps-btn ps-btn-ghost"   id="ps-select-btn">${ICONS.select} Select</button>
    ${hint}
    <button class="ps-btn-icon" id="ps-settings-btn" title="Settings" aria-label="Settings">${ICONS.settings}</button>
  `;
}

function buildSelectHTML(count) {
  return `
    <span class="ps-count">${count} selected</span>
    <button class="ps-btn ps-btn-primary" id="ps-export-btn" ${count === 0 ? "disabled" : ""}>${ICONS.export} Export</button>
    <button class="ps-btn ps-btn-danger"  id="ps-cancel-btn">Cancel</button>
  `;
}

// ─── Toolbar injection ────────────────────────────────────────────────────────
function injectToolbar() {
  if (document.getElementById(TOOLBAR_ID)) return;

  const style = document.createElement("style");
  style.id = "ps-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
  injectPrintStyles();

  toolbar = document.createElement("div");
  toolbar.id = TOOLBAR_ID;
  toolbar.innerHTML = buildDefaultHTML();
  document.body.appendChild(toolbar);
  bindListeners();
}

function bindListeners() {
  toolbar.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "ps-export-btn")   handleExport();
    if (b.id === "ps-select-btn")   enterSelect();
    if (b.id === "ps-cancel-btn")   exitSelect();
    if (b.id === "ps-settings-btn") toggleSettings();
  });
}

// ─── Settings panel ───────────────────────────────────────────────────────────
function toggleSettings() { settingsOpen ? closeSettings() : openSettings(); }

function openSettings() {
  closeSettings(); settingsOpen = true;
  const paperSize = get(K.paperSize, "a4");
  const landscape = get(K.landscape, "false") === "true";
  const filename  = get(K.filename,  "deepseek-chat");
  const scale     = parseFloat(get(K.scale,  "1"));
  const margin    = parseFloat(get(K.margin, "0.4"));

  const panel = document.createElement("div");
  panel.id = "ps-settings";
  panel.innerHTML = `
    <div class="ps-panel-header">
      <span class="ps-panel-title">Export settings</span>
      <span class="ps-badge">${IS_CHROMIUM ? "Chrome" : "Firefox"}</span>
    </div>

    <div class="ps-field">
      <label class="ps-label">Filename</label>
      <input class="ps-input" id="ps-s-fn" type="text" value="${filename}" placeholder="deepseek-chat">
    </div>

    <div class="ps-field">
      <label class="ps-label">Paper size</label>
      <select class="ps-select" id="ps-s-paper">
        <option value="a4"     ${paperSize==="a4"     ?"selected":""}>A4  —  210 × 297 mm</option>
        <option value="a5"     ${paperSize==="a5"     ?"selected":""}>A5  —  148 × 210 mm</option>
        <option value="letter" ${paperSize==="letter" ?"selected":""}>Letter  —  8.5 × 11 in</option>
      </select>
    </div>

    <div class="ps-field">
      <label class="ps-label">Orientation</label>
      <div class="ps-toggle">
        <div class="ps-toggle-opt">
          <input type="radio" name="ps-ori" id="ps-portrait"  value="false" ${!landscape?"checked":""}>
          <label for="ps-portrait">Portrait</label>
        </div>
        <div class="ps-toggle-opt">
          <input type="radio" name="ps-ori" id="ps-landscape" value="true"  ${landscape ?"checked":""}>
          <label for="ps-landscape">Landscape</label>
        </div>
      </div>
    </div>

    ${IS_CHROMIUM ? `
    <div class="ps-field">
      <label class="ps-label">Scale</label>
      <div class="ps-slider-row">
        <input class="ps-slider" id="ps-s-scale" type="range" min="0.5" max="1.5" step="0.05" value="${scale}">
        <span class="ps-slider-val" id="ps-scale-v">${Math.round(scale*100)}%</span>
      </div>
    </div>
    <div class="ps-field">
      <label class="ps-label">Margin</label>
      <div class="ps-slider-row">
        <input class="ps-slider" id="ps-s-margin" type="range" min="0" max="1" step="0.05" value="${margin}">
        <span class="ps-slider-val" id="ps-margin-v">${margin.toFixed(2)}"</span>
      </div>
    </div>
    ` : `
    <div class="ps-field">
      <div class="ps-ff-note">Scale and margin are set in your browser's print dialog.</div>
    </div>
    `}

    <div class="ps-panel-footer">
      <button class="ps-btn ps-btn-primary" id="ps-save-btn">Save</button>
    </div>
  `;
  document.body.appendChild(panel);

  if (IS_CHROMIUM) {
    panel.querySelector("#ps-s-scale").addEventListener("input", e => {
      panel.querySelector("#ps-scale-v").textContent = Math.round(parseFloat(e.target.value)*100)+"%";
    });
    panel.querySelector("#ps-s-margin").addEventListener("input", e => {
      panel.querySelector("#ps-margin-v").textContent = parseFloat(e.target.value).toFixed(2)+'"';
    });
  }

  panel.querySelector("#ps-save-btn").addEventListener("click", () => {
    set(K.paperSize, panel.querySelector("#ps-s-paper").value);
    set(K.landscape, panel.querySelector('input[name="ps-ori"]:checked').value);
    set(K.filename,  panel.querySelector("#ps-s-fn").value.trim() || "deepseek-chat");
    if (IS_CHROMIUM) {
      set(K.scale,  panel.querySelector("#ps-s-scale").value);
      set(K.margin, panel.querySelector("#ps-s-margin").value);
    }
    closeSettings();
  });

  setTimeout(() => document.addEventListener("click", outsideClick), 0);
}

function outsideClick(e) {
  const panel = document.getElementById("ps-settings");
  if (panel && !panel.contains(e.target) && !e.target.closest("#ps-settings-btn")) closeSettings();
}
function closeSettings() {
  settingsOpen = false;
  document.getElementById("ps-settings")?.remove();
  document.removeEventListener("click", outsideClick);
}

// ─── Select mode ──────────────────────────────────────────────────────────────
function enterSelect() {
  isSelectMode = true; selectedIds.clear();
  toolbar.innerHTML = buildSelectHTML(0); bindListeners();
  attachCheckboxes();
  msgObserver = new MutationObserver(attachCheckboxes);
  msgObserver.observe(document.body, { childList: true, subtree: true });
}

function exitSelect() {
  isSelectMode = false; selectedIds.clear();
  msgObserver?.disconnect(); msgObserver = null;
  document.querySelectorAll(".ps-selectable").forEach(el => {
    el.classList.remove("ps-selectable");
    el.removeAttribute("data-ps-sel"); el.removeAttribute("data-ps-id");
    el.querySelector(".ps-chk-wrap")?.remove();
  });
  toolbar.innerHTML = buildDefaultHTML(); bindListeners();
}

function attachCheckboxes() {
  findMessages().forEach((el, i) => {
    if (el.querySelector(".ps-chk-wrap")) return;
    const id = `ps-${i}`;
    el.setAttribute("data-ps-id", id);
    el.classList.add("ps-selectable");
    const wrap = document.createElement("span");
    wrap.className = "ps-chk-wrap";
    wrap.innerHTML = `<input type="checkbox" class="ps-chk" data-ps-id="${id}">`;
    el.appendChild(wrap);
    wrap.querySelector(".ps-chk").addEventListener("change", e => {
      const mid = e.target.getAttribute("data-ps-id");
      const mel = document.querySelector(`[data-ps-id="${mid}"]`);
      e.target.checked ? (selectedIds.add(mid), mel?.setAttribute("data-ps-sel","true"))
                       : (selectedIds.delete(mid), mel?.removeAttribute("data-ps-sel"));
      toolbar.innerHTML = buildSelectHTML(selectedIds.size); bindListeners();
    });
  });
}

// ─── Export ───────────────────────────────────────────────────────────────────
async function handleExport() {
  const btn = document.getElementById("ps-export-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Exporting…"; }

  const hidden = [];
  if (isSelectMode && selectedIds.size > 0) {
    document.querySelectorAll(".ps-selectable").forEach(el => {
      if (el.getAttribute("data-ps-sel") !== "true") {
        el.classList.add("ps-print-hidden"); hidden.push(el);
      }
    });
  }

  const dateStr  = new Date().toISOString().split("T")[0];
  const base     = get(K.filename, "deepseek-chat");
  const options  = {
    paperSize: get(K.paperSize, "a4"),
    landscape: get(K.landscape, "false") === "true",
    scale:     parseFloat(get(K.scale,  "1")),
    margin:    parseFloat(get(K.margin, "0.4")),
    filename:  `${base}-${dateStr}.pdf`,
  };

  if (IS_CHROMIUM) {
    if (toolbar) toolbar.style.display = "none";
    const sp = document.getElementById("ps-settings");
    if (sp) sp.style.display = "none";

    await new Promise(r => setTimeout(r, 80));
    let res;
    try { res = await api.runtime.sendMessage({ type: "EXPORT_PDF", options }); }
    catch(err) { res = { ok: false, error: err.message }; }

    hidden.forEach(el => el.classList.remove("ps-print-hidden"));
    if (toolbar) toolbar.style.display = "";
    if (sp) sp.style.display = "";

    if (res?.usePrint) { firefoxPrint(hidden, btn); return; }
    restoreBtn(btn);
    res?.ok ? (isSelectMode && exitSelect(), notify("PDF saved")) : notify(res?.error || "Export failed", true);
  } else {
    firefoxPrint(hidden, btn);
  }
}

function firefoxPrint(hiddenEls, btn) {
  if (toolbar) toolbar.style.display = "none";
  closeSettings();
  window.print();
  setTimeout(() => {
    hiddenEls.forEach(el => el.classList.remove("ps-print-hidden"));
    if (toolbar) toolbar.style.display = "";
    restoreBtn(btn);
    if (isSelectMode) exitSelect();
  }, 500);
}

function restoreBtn(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = isSelectMode ? `${ICONS.export} Export` : `${ICONS.export} Export PDF`;
}

// ─── Notification ─────────────────────────────────────────────────────────────
function notify(msg, isErr = false) {
  document.getElementById("ps-notification")?.remove();
  const el = document.createElement("div");
  el.id = "ps-notification";
  el.style.borderLeft = `3px solid ${isErr ? "#F87171" : "#3DF49A"}`;
  el.innerHTML = `${isErr ? ICONS.err : ICONS.ok}<span>${msg}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el?.remove(), 3500);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  if (window.location.hostname !== "chat.deepseek.com") return;
  if (document.getElementById(TOOLBAR_ID)) return;
  injectToolbar();
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", init)
  : init();

let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(init, 500); }
}).observe(document.body, { childList: true, subtree: true });
