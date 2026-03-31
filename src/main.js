"use strict";

const PLUGIN_ID = "com.asyncpranav.bettercomments";

const TAGS = [
  { test: (t) => /\/\/\s*!|#\s*!/.test(t), cls: "bc-alert" },
  { test: (t) => /\/\/\s*\?|#\s*\?/.test(t), cls: "bc-question" },
  { test: (t) => /\/\/\s*\*[^/]|#\s*\*/.test(t), cls: "bc-highlight" },
  { test: (t) => /\/\/\s*TODO|#\s*TODO/i.test(t), cls: "bc-todo" },
  { test: (t) => /\/\/\s*FIXME|#\s*FIXME/i.test(t), cls: "bc-fixme" },
  { test: (t) => /\/\/\s*NOTE|#\s*NOTE/i.test(t), cls: "bc-note" },
  { test: (t) => /\/\/\s*\/\//.test(t), cls: "bc-strike" },
];

function injectStyles() {
  if (document.getElementById("bc-styles")) return;
  const s = document.createElement("style");
  s.id = "bc-styles";
  // Very high specificity to beat LSP/syntax token colors
  s.textContent = `
    .cm-editor .cm-line.bc-alert,
    .cm-editor .cm-line.bc-alert *,
    .cm-editor .cm-line.bc-alert span,
    .cm-editor .cm-line.bc-alert .tok-comment,
    .cm-editor .cm-line.bc-alert .tok-lineComment { color: #FF3333 !important; font-weight: bold !important; }

    .cm-editor .cm-line.bc-question,
    .cm-editor .cm-line.bc-question *,
    .cm-editor .cm-line.bc-question span,
    .cm-editor .cm-line.bc-question .tok-comment,
    .cm-editor .cm-line.bc-question .tok-lineComment { color: #3399FF !important; }

    .cm-editor .cm-line.bc-highlight,
    .cm-editor .cm-line.bc-highlight *,
    .cm-editor .cm-line.bc-highlight span,
    .cm-editor .cm-line.bc-highlight .tok-comment,
    .cm-editor .cm-line.bc-highlight .tok-lineComment { color: #67D400 !important; font-weight: bold !important; }

    .cm-editor .cm-line.bc-todo,
    .cm-editor .cm-line.bc-todo *,
    .cm-editor .cm-line.bc-todo span,
    .cm-editor .cm-line.bc-todo .tok-comment,
    .cm-editor .cm-line.bc-todo .tok-lineComment { color: #FF8C00 !important; font-weight: bold !important; }

    .cm-editor .cm-line.bc-fixme,
    .cm-editor .cm-line.bc-fixme *,
    .cm-editor .cm-line.bc-fixme span,
    .cm-editor .cm-line.bc-fixme .tok-comment,
    .cm-editor .cm-line.bc-fixme .tok-lineComment { color: #FF4500 !important; font-weight: bold !important; }

    .cm-editor .cm-line.bc-note,
    .cm-editor .cm-line.bc-note *,
    .cm-editor .cm-line.bc-note span,
    .cm-editor .cm-line.bc-note .tok-comment,
    .cm-editor .cm-line.bc-note .tok-lineComment { color: #C679FF !important; }

    .cm-editor .cm-line.bc-strike,
    .cm-editor .cm-line.bc-strike *,
    .cm-editor .cm-line.bc-strike span,
    .cm-editor .cm-line.bc-strike .tok-comment,
    .cm-editor .cm-line.bc-strike .tok-lineComment {
      color: #555555 !important;
      text-decoration: line-through !important;
    }
  `;
  document.head.appendChild(s);
}

function paintLines() {
  document.querySelectorAll(".cm-line").forEach((line) => {
    const text = line.textContent || "";

    for (const cls of [...line.classList]) {
      if (cls.startsWith("bc-")) line.classList.remove(cls);
    }

    for (const tag of TAGS) {
      if (tag.test(text)) {
        line.classList.add(tag.cls);
        break;
      }
    }
  });
}

let _observer = null;
let _rafId = null;
let _debounceId = null;
let _fileListener = null;

// Paint immediately + again after 200ms + again after 600ms
// The 600ms pass catches LSP re-highlighting which is slower
function schedulePaint() {
  // Immediate pass
  if (_rafId) cancelAnimationFrame(_rafId);
  _rafId = requestAnimationFrame(() => {
    _rafId = null;
    paintLines();
  });

  // Debounced pass — catches LSP finishing
  if (_debounceId) clearTimeout(_debounceId);
  _debounceId = setTimeout(() => {
    _debounceId = null;
    paintLines();
  }, 600);
}

function startObserver() {
  paintLines();

  _observer = new MutationObserver(schedulePaint);
  _observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function stopObserver() {
  if (_observer) {
    _observer.disconnect();
    _observer = null;
  }
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  if (_debounceId) {
    clearTimeout(_debounceId);
    _debounceId = null;
  }

  document.querySelectorAll(".cm-line").forEach((line) => {
    for (const cls of [...line.classList]) {
      if (cls.startsWith("bc-")) line.classList.remove(cls);
    }
  });
}

function buildSettingsPage($page, settings, onChange) {
  $page.settitle("Better Comments");
  const rows = [
    {
      key: "showAlert",
      label: "! Alert",
      cls: "bc-alert",
      ex: "// ! will crash",
    },
    {
      key: "showQuestion",
      label: "? Question",
      cls: "bc-question",
      ex: "// ? is this right?",
    },
    {
      key: "showHighlight",
      label: "* Highlight",
      cls: "bc-highlight",
      ex: "// * important",
    },
    { key: "showTodo", label: "TODO", cls: "bc-todo", ex: "// TODO: fix this" },
    {
      key: "showFixme",
      label: "FIXME",
      cls: "bc-fixme",
      ex: "// FIXME: broken",
    },
    { key: "showNote", label: "NOTE", cls: "bc-note", ex: "// NOTE: see docs" },
    {
      key: "showStrike",
      label: "// Strikethrough",
      cls: "bc-strike",
      ex: "// // dead code",
    },
  ];

  $page.innerHTML = `
    <style>
      .bcs { padding:16px; font-family:monospace; color:var(--primary-text-color,#eee); }
      .bcs-head { font-size:11px; text-transform:uppercase; letter-spacing:1px;
        opacity:.4; margin-bottom:12px; }
      .bcs-row { display:flex; align-items:center; justify-content:space-between;
        padding:10px 0; border-bottom:1px solid rgba(255,255,255,.06); gap:8px; }
      .bcs-left { flex:1; }
      .bcs-label { font-size:13px; font-weight:bold; }
      .bcs-ex { font-size:11px; opacity:.4; margin-top:3px; }
      .tog { width:40px; height:22px; background:rgba(255,255,255,.12);
        border-radius:11px; position:relative; cursor:pointer;
        transition:background .2s; flex-shrink:0; }
      .tog.on { background:#67D400; }
      .tog::after { content:''; position:absolute; top:3px; left:3px;
        width:16px; height:16px; border-radius:50%; background:#fff;
        transition:transform .2s; }
      .tog.on::after { transform:translateX(18px); }
    </style>
    <div class="bcs">
      <div class="bcs-head">Tag Visibility</div>
      ${rows
        .map(
          (r) => `
        <div class="bcs-row">
          <div class="bcs-left">
            <div class="bcs-label ${r.cls}">${r.label}</div>
            <div class="bcs-ex">${r.ex}</div>
          </div>
          <div class="tog ${settings[r.key] !== false ? "on" : ""}" data-key="${r.key}"></div>
        </div>
      `,
        )
        .join("")}
    </div>`;

  $page.querySelectorAll(".tog").forEach((el) => {
    el.addEventListener("click", () => {
      const k = el.dataset.key;
      settings[k] = !settings[k];
      el.classList.toggle("on", settings[k]);
      onChange(settings);
    });
  });
}

class BetterComments {
  constructor() {
    this.settings = this._load();
    this.$page = null;
  }

  async init(baseUrl, $page, { firstInit }) {
    this.$page = $page;
    injectStyles();
    this._applyVisibility();
    startObserver();

    _fileListener = () => schedulePaint();
    editorManager.on("file-content-changed", _fileListener);
    editorManager.on("switch-file", _fileListener);

    const commands = acode.require("commands");
    commands.addCommand({
      name: "better-comments:settings",
      description: "Better Comments: Settings",
      exec: () => {
        buildSettingsPage(this.$page, this.settings, (s) => {
          this.settings = s;
          this._save();
          this._applyVisibility();
          paintLines();
        });
        this.$page.show();
      },
    });
  }

  _applyVisibility() {
    const map = {
      showAlert: "bc-alert",
      showQuestion: "bc-question",
      showHighlight: "bc-highlight",
      showTodo: "bc-todo",
      showFixme: "bc-fixme",
      showNote: "bc-note",
      showStrike: "bc-strike",
    };
    let css = "";
    for (const [key, cls] of Object.entries(map)) {
      if (this.settings[key] === false) {
        css += `.cm-editor .cm-line.${cls},
                .cm-editor .cm-line.${cls} * {
                  color: inherit !important;
                  font-weight: inherit !important;
                  text-decoration: none !important;
                }\n`;
      }
    }
    let el = document.getElementById("bc-override");
    if (!el) {
      el = document.createElement("style");
      el.id = "bc-override";
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  _save() {
    try {
      localStorage.setItem(PLUGIN_ID + ".s", JSON.stringify(this.settings));
    } catch (_) {}
  }

  _load() {
    try {
      const r = localStorage.getItem(PLUGIN_ID + ".s");
      if (r) return JSON.parse(r);
    } catch (_) {}
    return {
      showAlert: true,
      showQuestion: true,
      showHighlight: true,
      showTodo: true,
      showFixme: true,
      showNote: true,
      showStrike: true,
    };
  }

  async destroy() {
    stopObserver();
    if (_fileListener) {
      editorManager.off("file-content-changed", _fileListener);
      editorManager.off("switch-file", _fileListener);
      _fileListener = null;
    }
    document.getElementById("bc-styles")?.remove();
    document.getElementById("bc-override")?.remove();
    const commands = acode.require("commands");
    commands.removeCommand("better-comments:settings");
  }
}

if (window.acode) {
  const plugin = new BetterComments();
  acode.setPluginInit(PLUGIN_ID, (baseUrl, $page, cache) =>
    plugin.init(baseUrl, $page, cache),
  );
  acode.setPluginUnmount(PLUGIN_ID, () => plugin.destroy());
}
