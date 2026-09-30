window.__ModuleLoader__.load({id: 'harness-docket', factory: (require) => {
var module = {exports:{}}; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/video-thumbnail.js
var active = 0;
var waiting = [];
function captureThumbnail(src, signal) {
  return new Promise((resolve, reject) => {
    let started = false, finished = false, video, timer;
    const abortError = () => new DOMException("Cancelled", "AbortError");
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      const index = waiting.indexOf(start);
      if (index >= 0) waiting.splice(index, 1);
      if (video) {
        video.onloadedmetadata = video.onseeked = video.onerror = null;
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
      }
      if (started) {
        active--;
        waiting.shift()?.();
      }
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => finish(abortError());
    const start = () => {
      if (finished) return;
      started = true;
      active++;
      timer = setTimeout(() => finish(new Error("\u5C01\u9762\u8BFB\u53D6\u8D85\u65F6")), 8e3);
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.onerror = () => finish(new Error("\u65E0\u6CD5\u8BFB\u53D6\u5C01\u9762"));
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(2, Number.isFinite(video.duration) ? video.duration * 0.18 : 0.1);
      };
      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 180;
          const context = canvas.getContext("2d");
          context.drawImage(video, 0, 0, 320, 180);
          finish(null, { url: canvas.toDataURL("image/webp", 0.75), duration: video.duration });
          canvas.width = canvas.height = 0;
        } catch (error) {
          finish(error);
        }
      };
      video.src = src;
      video.load();
    };
    if (signal.aborted) {
      finish(abortError());
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    if (active < 2) start();
    else if (waiting.length < 16) waiting.push(start);
    else finish(new Error("\u5C01\u9762\u961F\u5217\u5DF2\u6EE1"));
  });
}

// src/client/ui.tsx
var import_react = require("react");

// src/client/ui.css
var ui_default = "/* Read-only mapping of verified Harness --dsw tokens. Fallbacks and semantic\n   colours are plugin recommendations, not a DeepSeek official specification. */\n.hdk-ui.hdk-ui {\n  --hdk-surface:var(--dsw-alias-bg-layer-2,#fff);\n  --hdk-field:var(--dsw-alias-bg-layer-1,#fff);\n  --hdk-text:var(--dsw-alias-label-primary,#202124);\n  --hdk-muted:var(--dsw-alias-label-secondary,#62666d);\n  --hdk-line:var(--dsw-alias-border-l3,#d8dadd);\n  --hdk-hover:var(--dsw-alias-interactive-bg-hover,#f1f2f4);\n  --hdk-active:var(--dsw-alias-interactive-bg-active,#e8eaed);\n  --hdk-accent:var(--dsw-alias-state-business-primary,#4267d5);\n  --hdk-primary:var(--dsw-alias-button-primary-fill,#292a2d);\n  --hdk-primary-hover:var(--dsw-alias-button-primary-hover,#424348);\n  --hdk-on-primary:var(--dsw-alias-label-primary-foreground,#fff);\n  --hdk-mask:var(--dsw-alias-bg-mask-1,#0000003d);\n  --hdk-shadow:var(--dsw-elevation-prominent,0 4px 20px #00000014);\n  --hdk-radius:var(--dsw-radius-sm,8px);\n  --hdk-panel-radius:var(--dsw-radius-lg,16px);\n  --hdk-success:#287348; --hdk-danger:#b43832; --hdk-warning:#875a13;\n  --hdk-subtle:color-mix(in srgb,var(--hdk-text) 3%,var(--hdk-surface));\n  --hdk-selected:color-mix(in srgb,var(--hdk-accent) 8%,var(--hdk-surface));\n  --hdk-danger-bg:color-mix(in srgb,var(--hdk-danger) 6%,var(--hdk-surface));\n  --hdk-warning-bg:color-mix(in srgb,var(--hdk-warning) 6%,var(--hdk-surface));\n  --hdk-space-1:4px; --hdk-space-2:8px; --hdk-space-3:12px; --hdk-space-4:16px; --hdk-space-6:24px; --hdk-space-8:32px;\n  color:var(--hdk-text);font-family:var(--dsw-font-family,inherit);font-size:14px;line-height:1.55;color-scheme:light;\n}\nbody[data-ds-dark-theme] .hdk-ui {\n  --hdk-surface:var(--dsw-alias-bg-layer-2,#232325); --hdk-field:var(--dsw-alias-bg-layer-1,#1b1b1d);\n  --hdk-text:var(--dsw-alias-label-primary,#efeff0); --hdk-muted:var(--dsw-alias-label-secondary,#b5b5bd);\n  --hdk-line:var(--dsw-alias-border-l3,#45454a); --hdk-hover:var(--dsw-alias-interactive-bg-hover,#ffffff14);\n  --hdk-active:var(--dsw-alias-interactive-bg-active,#ffffff24); --hdk-accent:var(--dsw-alias-state-business-primary,#8aa7ff);\n  --hdk-primary:var(--dsw-alias-button-primary-fill,#e2e2e5); --hdk-primary-hover:var(--dsw-alias-button-primary-hover,#fafafa);\n  --hdk-on-primary:var(--dsw-alias-label-primary-foreground,#202124); --hdk-mask:var(--dsw-alias-bg-mask-1,#0008);\n  --hdk-success:#8dcea5; --hdk-danger:#ffaaa4; --hdk-warning:#e7bf7a;color-scheme:dark;\n}\n.hdk-ui,.hdk-ui *{box-sizing:border-box}\n.hdk-ui.hdk-ui :where(button,input,select,textarea){font:inherit;color:inherit}\n.hdk-ui.hdk-ui :where(button){cursor:pointer;touch-action:manipulation}\n.hdk-ui.hdk-ui :where(button,input,select,textarea):disabled{opacity:.45;cursor:not-allowed}\n.hdk-ui.hdk-ui :where(button,input,select,textarea,summary,a,[tabindex]):focus-visible{outline:2px solid var(--hdk-accent);outline-offset:2px}\n.hdk-ui.hdk-ui :where(input[type=checkbox],input[type=range],progress){accent-color:var(--hdk-accent)}\n.hdk-ui.hdk-ui :where(input[type=checkbox]){width:16px;height:16px;flex-shrink:0;margin:0}\n.hdk-ui.hdk-ui :where(input[type=range]){min-height:24px}\n.hdk-ui.hdk-ui :where(input:not([type=checkbox]):not([type=range]):not([type=file]),select,textarea){min-width:0;min-height:36px;padding:6px 10px;border:1px solid var(--hdk-line);border-radius:var(--hdk-radius);background:var(--hdk-field);color:var(--hdk-text);font:inherit}\n.hdk-ui.hdk-ui :where(textarea)::placeholder{color:var(--hdk-muted);opacity:1}\n.hdk-ui.hdk-ui :is(.dba-btn,.hda-primary,.hda-secondary,.hda-danger,.hda-upload){display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:6px 12px;border:1px solid var(--hdk-line);border-radius:var(--hdk-radius);background:transparent;color:var(--hdk-text);font:inherit;font-size:14px;line-height:22px;box-shadow:none;transition:background .12s,color .12s,border-color .12s}\n.hdk-ui.hdk-ui :is(.dba-btn,.hda-secondary,.hda-upload):hover:not(:disabled){background:var(--hdk-hover)}\n.hdk-ui.hdk-ui :is(.dba-btn-preview,.hda-primary){background:var(--hdk-primary);border-color:transparent;color:var(--hdk-on-primary);font-weight:500}\n.hdk-ui.hdk-ui :is(.dba-btn-preview,.hda-primary):hover:not(:disabled){background:var(--hdk-primary-hover);color:var(--hdk-on-primary)}\n.hdk-ui.hdk-ui :is(.hda-danger,.hda-text-danger){color:var(--hdk-danger)}\n.hdk-ui.hdk-ui .hda-danger{border-color:color-mix(in srgb,var(--hdk-danger) 35%,var(--hdk-line));background:var(--hdk-danger-bg)}\n.hdk-ui.hdk-ui .hda-danger:hover:not(:disabled){background:color-mix(in srgb,var(--hdk-danger) 12%,var(--hdk-surface))}\n.hdk-ui.hdk-ui :is(.hda-text-button,.hda-icon-button,.hda-small-button,.dba-close,.dba-delete,.dba-refresh){display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:4px 8px;border:1px solid transparent;border-radius:var(--hdk-radius);background:transparent;color:var(--hdk-muted);font-size:13px;box-shadow:none}\n.hdk-ui.hdk-ui :is(.hda-icon-button,.hda-small-button,.dba-close,.dba-delete){width:32px;min-width:32px;padding:0;border-radius:var(--hdk-radius)}\n.hdk-ui.hdk-ui :is(.hda-icon-button,.hda-small-button,.dba-close,.dba-delete,.dba-refresh):hover:not(:disabled){background:var(--hdk-hover);color:var(--hdk-text)}\n.hdk-ui.hdk-ui .dba-delete:hover:not(:disabled){background:var(--hdk-danger-bg);color:var(--hdk-danger)}\n.hdk-ui .hdk-icon{width:16px;height:16px;flex-shrink:0}\n.hdk-ui.hdk-ui :is(.hda-tabs,.dba-tabs){gap:24px}\n.hdk-ui.hdk-ui :is(.hda-tabs,.dba-tabs) button{position:relative;min-height:40px;padding:8px 0;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--hdk-muted);font-size:14px}\n.hdk-ui.hdk-ui :is(.hda-tabs,.dba-tabs) button[aria-selected=true]{border-bottom-color:var(--hdk-accent);color:var(--hdk-text);font-weight:500}\n.hdk-ui.hdk-ui :is(.hda-tabs,.dba-tabs) button:hover{background:transparent;color:var(--hdk-text)}\n.hdk-ui.hdk-ui :is(.hda-header h2,.dba-header h3){margin:0;font-size:16px;line-height:24px;font-weight:500;letter-spacing:normal;color:var(--hdk-text)}\n.hdk-ui .hdk-identity{margin-top:4px;font-size:12px;color:var(--hdk-muted)}\n.hdk-ui.hdk-ui :is(.hda-header,.dba-header){padding:20px 24px 16px;gap:16px}\n.hdk-ui.hdk-ui :is(.hda-dialog,.dba-lib){border:1px solid var(--hdk-line);border-radius:var(--hdk-panel-radius);background:var(--hdk-surface);box-shadow:var(--hdk-shadow);color:var(--hdk-text);font:inherit;outline:none}\n.hdk-ui.hdk-ui :is(.hda-footer,.dba-footer){padding:16px 24px;background:var(--hdk-surface);border-top:1px solid var(--hdk-line)}\n.hdk-ui.hdk-ui :is(.hda-body,.dba-content,.hda-model-list){overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--hdk-line) transparent}\n.hdk-ui.hdk-ui .dba-fit .dba-btn{min-height:32px;padding:4px 8px;border:0;background:transparent;font-size:12px;color:var(--hdk-muted)}\n.hdk-ui.hdk-ui .dba-fit .dba-btn[aria-pressed=true]{background:var(--hdk-surface);color:var(--hdk-text);box-shadow:0 0 0 1px var(--hdk-line)}\n.hdk-ui.hdk-ui .hda-text-danger{color:var(--hdk-danger)}\n.hdk-ui.hdk-ui .dba-tabs button{white-space:nowrap;flex-shrink:0}\n.hdk-ui.hdk-ui .dba-count{padding:0;background:transparent;color:var(--hdk-muted);font-size:12px;font-weight:400}\n@media(max-width:650px){.hdk-ui.hdk-ui :is(.hda-header,.dba-header){padding:16px}.hdk-ui.hdk-ui :is(.hda-footer,.dba-footer){padding:12px 16px}}\n@media(max-width:520px){.hdk-ui.hdk-ui .dba-tabs{gap:16px}.hdk-ui.hdk-ui .dba-upload{padding-inline:8px;flex-shrink:0}.hdk-ui.hdk-ui .dba-toolbar{gap:8px}}\n@media(pointer:coarse){.hdk-ui.hdk-ui :is(.dba-btn,.hda-primary,.hda-secondary,.hda-danger,.hda-upload,.hda-icon-button,.hda-small-button,.hda-text-button,.hda-tabs button){min-height:44px}.hdk-ui.hdk-ui :is(.dba-close,.dba-delete,.hda-icon-button,.hda-small-button){min-width:44px;width:44px}}\n@media(prefers-reduced-motion:reduce){.hdk-ui *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}\n";

// src/client/ui.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function ensureUIStyle() {
  if (document.getElementById("harness-docket-ui-style")) return;
  const sheet = document.createElement("style");
  sheet.id = "harness-docket-ui-style";
  sheet.textContent = ui_default;
  document.head.appendChild(sheet);
}
var paths = {
  play: "m9 5 10 7-10 7Z",
  film: "M4 3h16v18H4ZM4 8h16M4 16h16M8 3v18M16 3v18",
  person: "M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
  upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  refresh: "M3 10a9 9 0 1 1 1 8M3 4v6h6",
  delete: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  move: "M12 2v20M2 12h20m-14-6 4-4 4 4m-10 2-4 4 4 4m2 2 4 4 4-4m2-10 4 4-4 4",
  restore: "M3 10a9 9 0 1 1 2 9M3 4v6h6M12 7v5l3 2",
  cover: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8Z",
  contain: "M3 5h18v14H3ZM7 8h10v8H7Z",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 5 7 7-7 7",
  replay: "M3 10a9 9 0 1 1 1 8M3 4v6h6"
};
function UIIcon({ kind }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "hdk-icon dba-icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: paths[kind === "reset" ? "refresh" : kind === "trash" ? "delete" : kind] || paths.person }) });
}
var focusable = "button, [href], input:not([type=hidden]), select, textarea, summary, [tabindex]";
function useDialogFocus(ref, onClose) {
  const close = (0, import_react.useRef)(onClose);
  close.current = onClose;
  (0, import_react.useEffect)(() => {
    const root = ref.current;
    if (!root) return;
    const before = document.activeElement;
    const candidates = () => Array.from(root.querySelectorAll(focusable)).filter((el) => el.tabIndex >= 0 && !el.matches(":disabled") && !el.closest("[hidden], [inert]") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
    root.focus({ preventScroll: true });
    const keyboard = (event) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const items = candidates(), first = items[0], last = items.at(-1), active2 = document.activeElement;
      if (!items.length) {
        event.preventDefault();
        root.focus();
        return;
      }
      if (event.shiftKey && (active2 === first || active2 === root || !root.contains(active2))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active2 === last || active2 === root || !root.contains(active2))) {
        event.preventDefault();
        first.focus();
      }
    };
    const contain = (event) => {
      if (!root.contains(event.target)) root.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", keyboard, true);
    document.addEventListener("focusin", contain);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("focusin", contain);
      const target = before?.isConnected && before.getClientRects().length ? before : document.querySelector(".hda-menu-toggle");
      target?.focus({ preventScroll: true });
    };
  }, [ref]);
}
function tabKeys(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll("[role=tab]:not(:disabled)"));
  const current = tabs.indexOf(document.activeElement);
  if (current < 0 || !tabs.length) return;
  const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[next].focus();
  tabs[next].click();
}
function useTransientNotice(text, clear, retain = false) {
  const latest = (0, import_react.useRef)(clear);
  latest.current = clear;
  (0, import_react.useEffect)(() => {
    if (!text || retain) return;
    const timer = window.setTimeout(() => latest.current(), 5e3);
    return () => window.clearTimeout(timer);
  }, [text, retain]);
}

// src/client/preferences.js
var namespace = "page-" + Math.random().toString(36).slice(2);
var memory = /* @__PURE__ */ new Map();
var preferenceKey = (key) => key + ":" + namespace;
function configurePreferences(id, storage = globalThis.localStorage) {
  namespace = id;
  try {
    const ownerKey = "harness-docket:legacy-owner", owner = storage.getItem(ownerKey);
    if (owner && owner !== id) return;
    storage.setItem(ownerKey, id);
    for (const key of ["dsh-boot-animation:seen", "dsh-boot-animation:pinned", "dsh-boot-animation:fit", "harness-docket:avatar-position:v1"]) {
      const value = storage.getItem(key);
      if (value !== null && storage.getItem(preferenceKey(key)) === null) storage.setItem(preferenceKey(key), value);
    }
  } catch {
  }
}
function readPreference(key) {
  key = preferenceKey(key);
  try {
    const value = globalThis.localStorage.getItem(key);
    if (value !== null) memory.set(key, value);
    else memory.delete(key);
  } catch {
  }
  return memory.get(key) ?? null;
}
function writePreference(key, value) {
  key = preferenceKey(key);
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) globalThis.localStorage.removeItem(key);
    else globalThis.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// src/client/playback-controller.js
var PlaybackController = class {
  generation = 0;
  pending = null;
  /** @type {{id: string, name: string, version: string, playId: number, sessionId: string | null, src: string} | null} */
  current = null;
  constructor(fetcher = globalThis.fetch) {
    this.fetcher = (...args) => fetcher.call(globalThis, ...args);
  }
  async open(sessionId, timeout = 8e3) {
    this.cancel();
    const playId = this.generation, abort = new AbortController();
    this.pending = abort;
    const timer = setTimeout(() => abort.abort(), timeout);
    try {
      const response = await this.fetcher("/harness-docket/videos.json", { cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new Error("\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D\u7247\u6E90");
      const data = await response.json();
      if (abort.signal.aborted || playId !== this.generation) return null;
      if (typeof data.activeId !== "string" || !data.activeVersion) throw new Error("\u7247\u5E93\u4E2D\u6CA1\u6709\u53EF\u64AD\u653E\u7684\u89C6\u9891");
      this.current = Object.freeze({ id: data.activeId, name: data.videos?.find((v) => v.id === data.activeId)?.name || "\u5F53\u524D\u7247\u5934", version: data.activeVersion, playId, sessionId, src: "/harness-docket/media/" + encodeURIComponent(data.activeId) + "?v=" + encodeURIComponent(data.activeVersion) });
      return this.current;
    } finally {
      clearTimeout(timer);
      if (this.pending === abort) this.pending = null;
    }
  }
  cancel() {
    this.generation++;
    this.pending?.abort();
    this.pending = null;
    this.current = null;
  }
};
var SessionEntry = class {
  id = null;
  attempted = false;
  update(id, blank, pinned, seen, enabled = true) {
    if (id !== this.id) {
      this.id = id;
      this.attempted = false;
    }
    if (!enabled) {
      this.attempted = true;
      return false;
    }
    if (id === null || this.attempted || id !== pinned && (!blank || seen)) return false;
    this.attempted = true;
    return true;
  }
};

// src/client/floating-avatar.tsx
var import_react10 = require("react");

// src/client/avatar.css
var avatar_default = "/* One character, quiet controls. Layout measurements remain independent of skin. */\n.hda-dock.dba-dock{position:fixed;right:auto;transform:none;z-index:2147482900;pointer-events:none;color:var(--hdk-text);font:inherit;container-type:size}\n.hda-dock *,.hda-veil *{box-sizing:border-box}\n.hda-trigger.dba-dock-toggle{position:absolute;inset:0;width:100%;height:100%;display:block;padding:0;border:0;border-radius:8px;background:transparent!important;box-shadow:none;color:inherit;pointer-events:auto;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}\n.hda-trigger.hda-dragging{cursor:grabbing}\n.hda-trigger:focus-visible{outline:1px solid var(--hdk-accent);outline-offset:3px}\n.hda-canvas-stack,.hda-render-slot,.hda-canvas-wrap,.hda-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}\n.hda-trigger>.hda-canvas-stack{width:calc(100% - 40px)}\n.hda-canvas canvas{display:block;width:100%;height:100%;pointer-events:none}\n.hda-alpha{overflow:hidden}\n.hda-alpha video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;pointer-events:none}\n.hda-loading-dot{position:absolute;left:50%;top:55%;width:6px;height:6px;border-radius:50%;background:var(--hdk-muted);opacity:.65}\n.hda-canvas-wrap[data-status=error] .hda-loading-dot{background:var(--hdk-danger);animation:none}\n\n.hda-menu-toggle{position:absolute;right:auto;bottom:auto;padding:0;display:flex;align-items:center;justify-content:flex-start;border:0;border-radius:6px;background:transparent!important;box-shadow:none;color:var(--hdk-muted);pointer-events:auto;cursor:pointer;touch-action:manipulation;opacity:0;transition:opacity .15s;transform:none!important}\n.hda-menu-toggle[data-side=left]{justify-content:flex-end}\n.hda-dock:hover>.hda-menu-toggle,.hda-dock:focus-within>.hda-menu-toggle,.hda-menu-toggle[aria-expanded=true]{opacity:1}\n.hda-menu-pearl{display:grid;place-items:center;width:var(--menu-diameter);height:var(--menu-diameter);border-radius:50%;corner-shape:round;background:var(--hdk-surface);border:1px solid var(--hdk-line);pointer-events:none}\n.hda-menu-pearl svg{width:100%;height:100%;fill:currentColor}\n.hda-menu-toggle:hover .hda-menu-pearl{background:var(--hdk-hover);border-color:var(--hdk-line)}\n.hda-menu-toggle:focus-visible{outline:2px solid var(--hdk-accent);outline-offset:2px}\n.hda-pocket-menu.hda-menu.dba-dock-panel{position:absolute;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:0;background:none;box-shadow:none;pointer-events:none;overflow:visible;animation:none;transform:none;backdrop-filter:none}\n.hda-menu[hidden]{display:none!important}\n.hda-pocket-menu>button{position:absolute;display:grid;place-items:center;min-width:0;min-height:0;padding:0;margin:0;border:0;border-radius:50%;background:transparent;color:var(--hdk-muted);box-shadow:none;cursor:pointer;touch-action:manipulation;transform:none;transition:none}\n.hda-pocket-token{corner-shape:round;display:grid;place-items:center;width:var(--token-diameter);height:var(--token-diameter);border:1px solid var(--hdk-line);border-radius:50%;background:var(--hdk-surface);box-shadow:var(--hdk-shadow);transform:scale(var(--token-scale));pointer-events:none}\n.hda-pocket-token svg{width:52%;height:52%;stroke-width:1.5}\n.hda-pocket-menu>button[data-landed=true]:hover .hda-pocket-token,.hda-pocket-menu>button:focus-visible .hda-pocket-token{border-color:var(--hdk-accent);background:var(--hdk-hover);color:var(--hdk-muted)}\n.hda-pocket-menu>button:focus-visible{outline:1px solid var(--hdk-accent);outline-offset:1px}\n.hda-pocket-menu>button:disabled{color:var(--hdk-muted);cursor:default}\n.hda-pocket-menu>button[aria-pressed=true] .hda-pocket-token{border-color:var(--hdk-line);background:var(--hdk-selected)}\n.hda-pocket-label{font-size:12px;position:absolute;left:50%;top:calc(50% + var(--token-diameter)/2 + 3px);transform:translateX(-50%);white-space:nowrap;padding:2px 5px;border:1px solid var(--hdk-line);border-radius:4px;background:var(--hdk-surface);color:var(--hdk-muted);font:inherit;pointer-events:none;opacity:0}\n.hda-pocket-menu>button[data-landed=true]:hover .hda-pocket-label,.hda-pocket-menu>button[data-landed=true]:focus-visible .hda-pocket-label{font-size:12px;opacity:1}\n.hda-pocket-menu>button[data-label-above=true] .hda-pocket-label{font-size:12px;top:auto;bottom:calc(50% + var(--token-diameter)/2 + 3px)}\n.hda-menu-notice{position:fixed;z-index:2147482901;left:12px;bottom:12px;max-width:calc(100vw - 24px);padding:8px 12px;border:1px solid var(--hdk-line);border-radius:7px;background:var(--hdk-danger-bg);color:var(--hdk-danger);font:inherit;pointer-events:auto}\n.hda-menu-notice button{margin-left:8px;color:inherit;background:none;border:0;text-decoration:underline;cursor:pointer}\n.hda-floating-reaction,.hda-preview-reaction{position:absolute;left:4%;top:0;width:calc(92% - 40px);height:28%;display:flex;justify-content:center;pointer-events:none;z-index:2;overflow:hidden}\n.hda-floating-reaction[hidden]{display:none}\n.hda-reaction{display:flex;align-items:center;justify-content:flex-start;flex-direction:column;gap:3px;width:100%;height:100%;overflow:hidden;animation:hda-reaction var(--reaction-duration,3s) both;animation-play-state:inherit;pointer-events:none}\n.hda-symbol,.hda-reaction img{display:grid;place-items:center;width:min(var(--reaction-size,32px),12cqh,30cqw);height:min(var(--reaction-size,32px),12cqh,30cqw);flex-shrink:0;object-fit:contain;background:none;border:0;box-shadow:none;filter:none;border-radius:0;color:#cc7b8d;font:inherit;font-size:min(24px,11cqh);line-height:1}\n.hda-symbol-question{color:#a88c61}.hda-symbol-music{color:#7e92a8}\n.hda-reaction-text{max-width:100%;padding:3px 7px;border:1px solid var(--hdk-line);border-radius:7px;background:var(--hdk-surface);color:var(--hdk-text);font:inherit;font-size:clamp(9px,4cqh,11px);line-height:1.4;text-align:center;overflow:hidden;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}\n@keyframes hda-reaction{0%{opacity:0;transform:translateY(3px)}12%,82%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-3px)}}\n.hda-veil{position:fixed;inset:0;z-index:2147483250;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--hdk-mask);pointer-events:auto;color:var(--hdk-text);font:inherit;--hda-line:var(--hdk-line)}\n.hda-dialog{width:min(880px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--hdk-line);border-radius:var(--hdk-panel-radius);background:var(--hdk-surface);box-shadow:var(--hdk-shadow);outline:none}\n.hda-dialog svg{width:17px;height:17px;flex-shrink:0}\n.hda-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:23px 26px 16px;flex-shrink:0}\n.hda-header h2{font-size:16px;font-weight:600;letter-spacing:.02em;margin:0}.hda-header p{margin:5px 0 0;color:var(--hdk-muted);font-size:12px}\n.hda-tabs{display:flex;gap:24px;padding:0 24px;margin-bottom:16px;border-bottom:1px solid var(--hda-line);flex-shrink:0}\n.hda-tabs button{min-height:40px;padding:8px 0;border:0;border-bottom:2px solid transparent;border-radius:0;background:none;color:var(--hdk-muted);font-size:12px}\n.hda-tabs button[aria-selected=true]{border-bottom-color:var(--hdk-line);color:var(--hdk-muted)}\n.hda-body{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);grid-auto-rows:max-content;gap:24px;min-height:0;padding:0 24px 24px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--hdk-line) transparent}\n.hda-stage{position:relative;align-self:start;min-width:0;border:0;border-radius:var(--hdk-radius);background:var(--hdk-subtle);overflow:hidden}\n.hda-stage-label{display:flex;align-items:center;gap:6px;margin:12px 14px;color:var(--hdk-muted);font-size:12px}.hda-stage-label>span:last-child{margin-left:auto}\n.hda-dot{width:4px;height:4px;border-radius:50%;background:var(--hdk-surface)}\n.hda-preview{position:relative;height:275px;margin:0 12px;container-type:size}\n.hda-preview-reaction{left:10%;width:80%;height:24%}\n.hda-stage-caption{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 14px 17px;text-align:center;overflow-wrap:anywhere}.hda-stage-caption strong{font-size:15px;font-weight:500}.hda-stage-caption span{color:var(--hdk-muted);font-size:12px}\n.hda-inspection{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:14px;border-top:1px solid var(--hdk-line);color:var(--hdk-muted);font-size:12px}.hda-inspection[hidden]{display:none}\n.hda-motion-inspector{display:grid;grid-template-columns:1fr 1fr;gap:9px;width:100%;min-width:0}.hda-motion-inspector label{display:flex;flex-direction:column;gap:5px;min-width:0}.hda-inspector-heading,.hda-inspector-note{grid-column:1/-1}.hda-inspector-heading{display:flex;justify-content:space-between;color:var(--hdk-muted)}.hda-inspector-heading small,.hda-inspector-note{font-weight:400;font-size:12px;color:var(--hdk-muted)}.hda-inspector-note{margin:0}\n.hda-inspection select{width:100%;max-width:100%}.hda-inspection .hda-angle{display:flex;align-items:center;gap:10px;width:100%}.hda-angle input{flex:1;min-width:0}.hda-checkbox{display:flex;align-items:center;gap:6px}\n.hda-editor-column,.hda-picker{display:flex;flex-direction:column;gap:16px;min-width:0}.hda-picker[hidden]{display:none!important}\n.hda-section-title{display:flex;justify-content:space-between;align-items:center;gap:8px}.hda-section-title h3{font-size:13px;font-weight:500;margin:0}.hda-section-title h3 span{margin-left:6px;color:var(--hdk-muted);font-size:12px}\n.hda-model-list{display:flex;flex-direction:column;gap:4px;padding:2px}\n.hda-model{display:flex;align-items:center;gap:9px;flex-shrink:0;min-width:0;width:100%;min-height:54px;padding:8px 10px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--hdk-text);text-align:left}.hda-model:hover{background:var(--hdk-hover)}.hda-model.hda-selected{border-color:var(--hdk-accent);background:var(--hdk-selected)}\n.hda-model-icon{display:grid;place-items:center;width:26px;height:32px;flex-shrink:0;color:var(--hdk-muted)}.hda-model-text{display:flex;flex-direction:column;gap:2px;min-width:0}.hda-model-text strong{font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hda-model-text small{font-size:12px;color:var(--hdk-muted)}.hda-current{display:flex;align-items:center;gap:3px;margin-left:auto;color:var(--hdk-muted);white-space:nowrap;font-size:12px}.hda-current svg{width:12px;height:12px}\n.hda-upload{display:flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:7px 12px;border:1px dashed var(--hdk-line);border-radius:7px;background:var(--hdk-subtle);color:var(--hdk-muted);font-size:12px}.hda-upload:hover{background:var(--hdk-hover);border-color:var(--hdk-line)}\n.hda-help,.hda-details,.hda-details p{margin:0;color:var(--hdk-muted);font-size:12px;line-height:1.8}.hda-help a{color:var(--hdk-muted);text-decoration:underline}.hda-details{display:flex;flex-direction:column;gap:3px;border-top:1px solid var(--hda-line);padding-top:10px}\n.hda-settings{border-top:1px solid var(--hda-line);padding-top:12px}.hda-settings label{display:block;color:var(--hdk-muted);font-size:12px}.hda-settings label span{float:right;color:var(--hdk-muted)}.hda-settings input{display:block;width:100%;margin:10px 0}\n.hda-text-button{display:inline-flex;align-items:center;gap:4px;padding:3px 0;border:0;background:none;color:var(--hdk-muted);font-size:12px;text-align:left}.hda-text-button:hover{text-decoration:underline}.hda-text-button svg{width:12px;height:12px}\n.hda-footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;padding:14px 26px;border-top:1px solid var(--hda-line);background:var(--hdk-subtle)}.hda-feedback{flex:1;min-width:140px;color:var(--hdk-muted);font-size:12px;overflow-wrap:anywhere}.hda-footer-actions{display:flex;flex-wrap:wrap;gap:8px}.hda-footer-actions[hidden]{display:none}\n.hda-controls{display:flex;flex-direction:column;gap:16px;min-width:0}.hda-settings-fields{border:0;padding:0;margin:0;display:contents;min-width:0}.hda-controls label{display:flex;flex-direction:column;gap:8px;color:var(--hdk-text);font-size:14px}.hda-controls label span{color:var(--hdk-muted)}.hda-controls input:not([type=checkbox]):not([type=range]),.hda-controls select,.hda-rename input{width:100%;min-width:0}.hda-controls input[type=range]{width:100%}.hda-controls .hda-toggle{flex-direction:row;align-items:center;gap:7px}.hda-controls small{color:var(--hdk-muted);font-size:12px}\n.hda-inline{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.hda-inline>label,.hda-inline>select,.hda-inline>input{flex:1;min-width:100px}.hda-inline>button{flex-shrink:1;max-width:100%;overflow-wrap:anywhere}\n.hda-card{display:flex;flex-direction:column;gap:10px;padding:16px 0 0;border:0;border-top:1px solid var(--hdk-line);border-radius:0;background:transparent}.hda-card h4{margin:0;font-size:12px;font-weight:500;color:var(--hdk-muted)}.hda-card p{margin:0;overflow-wrap:anywhere;font-size:12px;color:var(--hdk-muted)}.hda-random-note{border:0;padding:4px 0;background:none}\n.hda-tag{color:var(--hdk-muted);font-size:12px}.hda-controls-feedback{color:var(--hdk-muted);font-size:12px;min-height:18px;overflow-wrap:anywhere}.hda-attached-settings{display:flex;flex-direction:column;gap:10px;padding-top:12px;border-top:1px solid var(--hda-line)}\n.hda-menu-preview{position:absolute;inset:0;pointer-events:none}.hda-menu-preview .hda-menu-toggle{opacity:1;cursor:default;pointer-events:none}\n.hda-rename{display:flex;flex-direction:column;gap:8px;color:var(--hdk-text);font-size:14px}\n.hda-behavior-settings{border-top:1px solid var(--hdk-line);padding-top:12px}.hda-behavior-settings summary{cursor:pointer;color:var(--hdk-muted);font-size:12px}.hda-behavior-settings[open]{display:flex;flex-direction:column;gap:12px}.hda-behavior-settings label{margin-top:10px}\n.hda-progress{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:12px;color:var(--hdk-muted)}.hda-progress progress{width:100%;height:4px;accent-color:var(--hdk-accent)}.hda-progress button{margin-left:auto;border:0;background:none;color:inherit}\n.hda-error{color:var(--hdk-danger);font-size:12px;margin:0;overflow-wrap:anywhere}.hda-unsaved{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 24px;background:var(--hdk-warning-bg);border-top:1px solid var(--hdk-line);color:var(--hdk-warning);font-size:12px}.hda-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}\n@media(pointer:coarse){.hda-menu-toggle{opacity:1}}\n@media(max-width:650px){.hda-veil{padding:8px}.hda-dialog{max-height:calc(100dvh - 16px);border-radius:var(--hdk-panel-radius)}.hda-header{padding:17px 17px 12px}.hda-header h2{font-size:16px}.hda-tabs{padding:0 17px;margin-bottom:14px}.hda-body{grid-template-columns:1fr;padding:0 16px 18px;gap:17px}.hda-preview{height:200px}.hda-footer{padding:12px 16px}.hda-footer-actions{width:100%;justify-content:flex-end}.hda-stage:not([data-tab=model]) .hda-preview{height:130px;width:110px;margin:0 8px}.hda-stage:not([data-tab=model]) .hda-stage-label,.hda-stage:not([data-tab=model]) .hda-inspection{display:none}.hda-stage:not([data-tab=model]) .hda-stage-caption{position:absolute;left:130px;right:12px;top:37px;align-items:flex-start;text-align:left;padding:0}.hda-model-list{max-height:none}.hda-unsaved{padding:12px 16px}}\n@media(prefers-reduced-motion:reduce){.hda-dock *,.hda-dialog *{animation:none!important;transition:none!important}}\n/* Playback feedback stays fixed in the viewport while the character moves. */\n.hda-playback-mark{position:absolute;right:-2px;bottom:-3px;display:grid;place-items:center;width:12px;height:12px;border-radius:50%;corner-shape:round;background:var(--hdk-surface);color:var(--hdk-muted);border:1px solid var(--hdk-line);font:inherit;font-size:9px;line-height:1;font-style:normal}\n.hda-pocket-token{position:relative}\n.hda-speech-bubble{position:fixed;top:max(16px,env(safe-area-inset-top));right:max(16px,env(safe-area-inset-right));width:min(260px,calc(100vw - 32px));z-index:2147482950;box-sizing:border-box;pointer-events:none;color:var(--hdk-text);font:inherit;line-height:1.6;background:var(--hdk-surface);border:1px solid var(--hdk-line);border-radius:10px;box-shadow:var(--hdk-shadow);padding:9px 12px;overflow-wrap:anywhere}\n.hda-voice-settings{border-bottom:1px solid var(--hdk-line);padding-bottom:14px;margin-bottom:16px;font-size:13px}\n.hda-voice-settings summary{cursor:pointer;color:var(--hdk-text)}\n.hda-voice-settings label{display:flex;align-items:center;gap:8px;margin:10px 0;color:var(--hdk-muted)}\n.hda-voice-settings select{min-width:0;max-width:100%;flex:1}.hda-voice-settings input[type=range]{min-width:0;flex:1}\n.dba-playback-settings{display:flex;align-items:center;flex-wrap:wrap;gap:9px 18px;padding:12px 24px;border-top:1px solid var(--hdk-line);border-bottom:1px solid var(--hdk-line);background:var(--hdk-subtle);color:var(--hdk-muted);font:inherit}\n.dba-playback-settings label{display:flex;align-items:center;gap:6px}.dba-playback-settings input{accent-color:var(--hdk-accent)}.dba-playback-settings small{width:100%;color:var(--hdk-muted);font-size:12px}.dba-playback-status{overflow-wrap:anywhere;font-size:12px}\n\n@media(max-height:650px){.hda-dialog{overflow:auto}.hda-body{overflow:visible;flex-shrink:0}}\n@media(pointer:coarse){.hda-pocket-label{font-size:12px;font-size:12px}}\n\n.hda-navigation{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 24px 16px;border-bottom:1px solid var(--hdk-line);flex-shrink:0}\n.hda-navigation .hda-tabs{border:0;padding:0;margin:0}\n.hda-field-group{display:flex;flex-direction:column;gap:16px;border-top:1px solid var(--hdk-line);padding-top:16px;min-width:0}\n.hda-field-group h4{font-size:14px;font-weight:500;margin:0;color:var(--hdk-text)}\n@media(max-width:650px){.hda-navigation{margin:0 16px 16px;gap:8px}.hda-navigation .hda-tabs{gap:16px}}\n\n.hda-speech-bubble.hdk-ui{pointer-events:none}\n";

// src/client/attached-menu-layout.js
var menuDefaults = () => ({ side: "auto", height: 0, gap: 3 });
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function maskFromPixels(rgba, width, height, cssWidth, cssHeight, threshold = 32) {
  const pixels = new Uint8Array(width * height), integral = new Uint32Array((width + 1) * (height + 1));
  const labels = new Uint16Array(pixels.length), queue = new Int32Array(pixels.length), regions = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels[y * width + x] = +(rgba[((height - 1 - y) * width + x) * 4 + 3] >= threshold);
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += pixels[y * width + x];
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row;
    }
  }
  for (let i = 0; i < pixels.length; i++) {
    if (!pixels[i] || labels[i]) continue;
    const id = regions.length + 1, region = { id, area: 0, left: width, right: 0, top: height, bottom: 0 };
    let start = 0, end = 1;
    queue[0] = i;
    labels[i] = id;
    while (start < end) {
      const n = queue[start++], x = n % width, y = Math.floor(n / width);
      region.area++;
      region.left = Math.min(region.left, x);
      region.right = Math.max(region.right, x + 1);
      region.top = Math.min(region.top, y);
      region.bottom = Math.max(region.bottom, y + 1);
      for (const next of [x ? n - 1 : -1, x < width - 1 ? n + 1 : -1, n - width, n + width]) if (next >= 0 && next < pixels.length && pixels[next] && !labels[next]) {
        labels[next] = id;
        queue[end++] = next;
      }
    }
    regions.push(region);
  }
  regions.sort((a, b) => b.area - a.area);
  if (!regions.length) return null;
  const major = regions.filter((r) => r.area >= regions[0].area * 0.6);
  const bounds = (rs) => ({ left: Math.min(...rs.map((r) => r.left)) * cssWidth / width, right: Math.max(...rs.map((r) => r.right)) * cssWidth / width, top: Math.min(...rs.map((r) => r.top)) * cssHeight / height, bottom: Math.max(...rs.map((r) => r.bottom)) * cssHeight / height });
  const primary = major.map((r) => r.id), columns = new Uint32Array(width);
  let total = 0;
  for (let i = 0; i < labels.length; i++) if (primary.includes(labels[i])) {
    columns[i % width]++;
    total++;
  }
  let median = 0, count = 0;
  while (median < width - 1 && count + columns[median] < total / 2) count += columns[median++];
  return { width, height, cssWidth, cssHeight, pixels, integral, labels, primary, subjectX: (median + 0.5) * cssWidth / width, body: bounds(major), bounds: bounds(regions), confidence: major.length === 1 ? "primary" : "multiple" };
}
function overlapsMask(mask, rect, pad = 0) {
  if (!mask) return false;
  const { width: w, height: h2, cssWidth, cssHeight, integral } = mask;
  const x0 = clamp(Math.floor((rect.x - pad) * w / cssWidth), 0, w), x1 = clamp(Math.ceil((rect.x + rect.width + pad) * w / cssWidth), 0, w);
  const y0 = clamp(Math.floor((rect.y - pad) * h2 / cssHeight), 0, h2), y1 = clamp(Math.ceil((rect.y + rect.height + pad) * h2 / cssHeight), 0, h2), stride = w + 1;
  return integral[y1 * stride + x1] - integral[y1 * stride + x0] - integral[y0 * stride + x1] + integral[y0 * stride + x0] > 0;
}
var intersects = (a, b, gap = 0) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
function edgeAt(mask, y, side) {
  const row = clamp(Math.floor(y * mask.height / mask.cssHeight), 0, mask.height - 1);
  let edge = side === "right" ? -Infinity : Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let x = 0; x < mask.width; x++) {
    const n = (row + dy) * mask.width + x;
    if (mask.primary.includes(mask.labels[n])) edge = side === "right" ? Math.max(edge, (x + 1) * mask.cssWidth / mask.width) : Math.min(edge, x * mask.cssWidth / mask.width);
  }
  return edge;
}
function layoutAttachedMenu({ measurement, width, height, origin = { x: 0, y: 0 }, viewport, preferences = menuDefaults(), touch = false, expanded = false, previous = null }) {
  const mask = measurement?.mask, ref = measurement?.referenceHeight || height * 0.48;
  const diameter = clamp(ref * 0.1, 14, 18), target = touch ? 44 : 32, actionTarget = touch ? 44 : 36, actionDiameter = touch ? 34 : 30;
  const body = mask?.body || { left: width * 0.15, right: width * 0.85, top: height * 0.1, bottom: height * 0.9 };
  const anchor = measurement?.anchor || { x: mask?.subjectX ?? (body.left + body.right) / 2, y: body.top + (body.bottom - body.top) * 0.6 };
  const safe = (rect) => rect.x + origin.x >= viewport.left + 8 && rect.y + origin.y >= viewport.top + 8 && rect.x + rect.width + origin.x <= viewport.left + viewport.width - 8 && rect.y + rect.height + origin.y <= viewport.top + viewport.height - 8 && !overlapsMask(mask, rect);
  const fallbackBody = { x: body.left, y: body.top, width: body.right - body.left, height: body.bottom - body.top };
  const clear = (rect) => safe(rect) && (mask || !intersects(rect, fallbackBody));
  const preferred = preferences.side !== "auto" ? preferences.side : previous?.side || "right";
  const sides = [preferred, preferred === "right" ? "left" : "right"], candidates = [];
  const baseY = anchor.y + preferences.height * ref;
  const offsets = [0, -0.04, 0.04, -0.08, 0.08, -0.12, 0.12, -0.18, 0.18, -0.25, 0.25];
  for (const side of sides) for (const offset of offsets) {
    const y = clamp(baseY + offset * ref, body.top + 2, body.bottom - 2), edge = mask ? edgeAt(mask, y, side) : body[side];
    if (!Number.isFinite(edge)) continue;
    for (const extra of [0, 2, 5, 10, 18]) {
      const inner = edge + (side === "right" ? 1 : -1) * (preferences.gap + extra);
      const toggle = { x: side === "right" ? inner : inner - target, y: y - target / 2, width: target, height: target };
      if (!clear(toggle)) continue;
      const center = { x: inner + (side === "right" ? 1 : -1) * diameter / 2, y };
      candidates.push({ side, toggle, center, diameter, actionDiameter, score: Math.abs(y - baseY) * 0.8 + Math.abs(inner - anchor.x) + extra * 2, actions: [], kind: "closed", notice: "", safe: true });
      break;
    }
  }
  const actionLayouts = (c) => {
    const direction = c.side === "right" ? 1 : -1, step = actionTarget + 22;
    const positions = [];
    for (const shift of [0, -step * 0.45, step * 0.45]) positions.push({ kind: "arc", points: [[target + 22, -step], [target + 38, 0], [target + 22, step]].map(([x, y]) => [x, y + shift]) });
    for (const shift of [0, -step, step]) positions.push({ kind: "column", points: [[target + 26, -step], [target + 26, 0], [target + 26, step]].map(([x, y]) => [x, y + shift]) });
    for (const p of positions) {
      const actions = p.points.map(([x, y]) => {
        const hit = { x: c.center.x + direction * x - actionTarget / 2, y: c.center.y + y - actionTarget / 2, width: actionTarget, height: actionTarget };
        const label = { x: hit.x + actionTarget / 2 - 23, y: hit.y + actionTarget + 1, width: 46, height: 16 };
        return { hit, label };
      });
      if (actions.every((a) => clear(a.hit) && clear(a.label) && !intersects(c.toggle, a.hit, 4) && !intersects(c.toggle, a.label, 4)) && actions.every((a, i) => actions.every((b, j) => i === j || !intersects(a.hit, b.hit, 4) && !intersects(a.hit, b.label, 4) && !intersects(a.label, b.label, 4)))) return { ...c, actions, kind: p.kind };
    }
    return null;
  };
  if (previous && previous.diameter === diameter && previous.touch === touch && Math.abs(previous.baseY - baseY) < ref * 0.08 && clear(previous.toggle) && (!mask || Math.abs((previous.side === "right" ? previous.toggle.x : previous.toggle.x + target) - edgeAt(mask, previous.center.y, previous.side)) <= preferences.gap + 5) && Math.abs(previous.center.y - baseY) < ref * 0.3) {
    const dy = expanded || Math.abs(baseY - previous.baseY) < 1.5 ? 0 : (baseY - previous.baseY) * 0.55;
    const follow = { ...previous.toggle, y: previous.toggle.y + dy };
    const c = { ...previous, ...clear(follow) ? { toggle: follow, center: { ...previous.center, y: previous.center.y + dy } } : {}, actions: [], notice: preferences.side !== "auto" && previous.side !== preferences.side ? "\u5DF2\u4E34\u65F6\u6362\u4FA7\u907F\u8BA9\uFF0C\u4FDD\u5B58\u7684\u9996\u9009\u4FA7\u4E0D\u53D8\u3002" : "", kind: "closed" };
    if (!expanded || previous.actions?.length && previous.actions.every((a) => clear(a.hit) && clear(a.label))) return { ...c, ...expanded ? { actions: previous.actions, kind: previous.kind } : {}, baseY, touch };
  }
  const sidePenalty = preferences.side === "auto" ? 8 : 1e3;
  candidates.sort((a, b) => a.score + (a.side === preferred ? 0 : sidePenalty) - b.score - (b.side === preferred ? 0 : sidePenalty));
  let chosen = expanded ? candidates.map(actionLayouts).find(Boolean) : candidates[0];
  if (!chosen) {
    chosen = candidates[0];
    if (!chosen) {
      const x = clamp(width + 3, viewport.left + 8 - origin.x, viewport.left + viewport.width - target - 8 - origin.x);
      const y = clamp(baseY - target / 2, viewport.top + 8 - origin.y, viewport.top + viewport.height - target - 8 - origin.y);
      chosen = { side: "right", toggle: { x, y, width: target, height: target }, center: { x: x + diameter / 2, y: y + target / 2 }, diameter, actionDiameter, actions: [], kind: "unavailable", safe: false };
    }
    if (expanded) chosen.notice = "\u7A7A\u95F4\u4E0D\u8DB3\uFF0C\u8BF7\u79FB\u52A8\u4EBA\u7269\u6216\u8C03\u6574\u7A97\u53E3\u540E\u5C55\u5F00\u3002";
  }
  if (preferences.side !== "auto" && chosen.side !== preferences.side) chosen.notice = "\u5DF2\u4E34\u65F6\u6362\u4FA7\u907F\u8BA9\uFF0C\u4FDD\u5B58\u7684\u9996\u9009\u4FA7\u4E0D\u53D8\u3002";
  return { ...chosen, baseY, touch };
}

// src/client/companion-controls.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var assetURL = (id) => "/harness-docket/companion/asset?id=" + encodeURIComponent(id);
var defaultProfile = (data) => ({ roaming: true, speed: 32, walk: data?.defaults?.walk || null, idle: null, mode: "random", fixed: "hello", interactions: [
  { id: "hello", name: "\u89C1\u5230\u4F60\u5F88\u5F00\u5FC3", enabled: true, action: "wave", motion: null, expression: "happy", intensity: 0.7, sticker: "heart", size: 32, duration: 3, text: "" },
  { id: "curious", name: "\u6709\u4EC0\u4E48\u65B0\u9C9C\u4E8B", enabled: true, action: "head", motion: null, expression: "surprised", intensity: 0.5, sticker: "question", size: 60, duration: 3, text: "" },
  { id: "music", name: "\u8F7B\u677E\u4E00\u4E0B", enabled: true, action: "wave", motion: null, expression: "relaxed", intensity: 0.7, sticker: "music", size: 64, duration: 3.5, text: "" }
] });
function Sticker({ interaction }) {
  const symbols = { heart: "\u2661", question: "?", music: "\u266B" };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-reaction", style: { "--reaction-size": interaction.size + "px", "--reaction-duration": interaction.duration + "s" }, children: [
    interaction.sticker !== "none" && (symbols[interaction.sticker] ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "hda-symbol hda-symbol-" + interaction.sticker, children: symbols[interaction.sticker] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { src: assetURL(interaction.sticker), alt: "", onError: (e) => {
      e.currentTarget.style.display = "none";
    } })),
    interaction.text && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "hda-reaction-text", children: interaction.text })
  ] });
}
var errors = (e) => e?.message || "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
function CompanionControls({ tab, id, data, initial: initial2, reload, request: request2, renderer: renderer2, capabilities, onPreview, motionStatus, onEditState, onMenuDraft }) {
  const [profile, setProfile] = (0, import_react2.useState)(() => structuredClone(initial2)), [selected, setSelected] = (0, import_react2.useState)(initial2.interactions[0].id);
  const [assetId, setAssetId] = (0, import_react2.useState)(""), [clips, setClips] = (0, import_react2.useState)([]), [clip, setClip] = (0, import_react2.useState)(0), [name, setName] = (0, import_react2.useState)("");
  const [busy, setBusy] = (0, import_react2.useState)(false), [notice, setNotice] = (0, import_react2.useState)(""), [error, setError] = (0, import_react2.useState)(""), [progress, setProgress] = (0, import_react2.useState)(null), [removeId, setRemoveId] = (0, import_react2.useState)("");
  const [interactionClips, setInteractionClips] = (0, import_react2.useState)([]);
  const [dirty, setDirty] = (0, import_react2.useState)(false), [previewed, setPreviewed] = (0, import_react2.useState)("");
  const xhr = (0, import_react2.useRef)(null), alive = (0, import_react2.useRef)(true), lock = (0, import_react2.useRef)(false), loadToken = (0, import_react2.useRef)(0);
  const uploadInput = (0, import_react2.useRef)(null), stickerInput = (0, import_react2.useRef)(null), greetingInput = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => () => {
    alive.current = false;
    xhr.current?.abort();
    loadToken.current++;
  }, []);
  useTransientNotice(notice, () => setNotice(""), dirty);
  const revision = (0, import_react2.useRef)(data.revisions?.[id] || 0);
  const [conflict, setConflict] = (0, import_react2.useState)(false);
  const initialValue = JSON.stringify(initial2);
  (0, import_react2.useEffect)(() => {
    if (!dirty) {
      setProfile(JSON.parse(initialValue));
      revision.current = data.revisions?.[id] || 0;
    }
  }, [initialValue, data.revisions?.[id]]);
  (0, import_react2.useEffect)(() => {
    onMenuDraft?.(profile.attachedMenu || menuDefaults());
  }, [profile.attachedMenu]);
  const menu = profile.attachedMenu || menuDefaults();
  const editMenu = (patch) => edit({ ...profile, attachedMenu: { ...menu, ...patch } });
  const edit = (next) => {
    setProfile(next);
    setDirty(true);
    setNotice("");
  };
  const interaction = profile.interactions.find((i) => i.id === selected) || profile.interactions[0];
  (0, import_react2.useEffect)(() => {
    onEditState(dirty, busy);
  }, [dirty, busy]);
  (0, import_react2.useEffect)(() => {
    let active2 = true;
    setInteractionClips([]);
    if (interaction.motion) renderer2().then((m) => m.motionAsset(interaction.motion.id)).then((data2) => {
      if (active2) setInteractionClips(data2.clips.map((c, index) => ({ index, name: c.name, duration: c.duration })));
    }).catch((e) => {
      if (active2) setError(errors(e));
    });
    return () => {
      active2 = false;
    };
  }, [interaction.motion?.id]);
  const editInteraction = (patch) => edit({ ...profile, interactions: profile.interactions.map((i) => i.id === interaction.id ? { ...i, ...patch } : i) });
  const perform = async (fn) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      if (alive.current) setError(errors(e));
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };
  const selectMotion = async (next) => {
    const token = ++loadToken.current;
    setAssetId(next);
    setClips([]);
    setClip(0);
    setPreviewed("");
    setName(data.assets.find((a) => a.id === next)?.name || "");
    if (!next) return;
    try {
      const module2 = await renderer2(), parsed = await module2.motionAsset(next);
      if (!alive.current || token !== loadToken.current) return;
      setClips(parsed.clips.map((c, index) => ({ index, name: c.name, duration: c.duration })));
      setError("");
    } catch (e) {
      if (alive.current && token === loadToken.current) setError(errors(e));
    }
  };
  const upload = (file, kind) => perform(async () => {
    if (!file.size || file.size > (kind === "motion" ? 50 : 5) * 1024 ** 2) throw new Error(kind === "motion" ? "FBX \u5E94\u5728 50 MB \u4EE5\u5185" : "\u8D34\u7EB8\u5E94\u5728 5 MB \u4EE5\u5185");
    setNotice("\u6B63\u5728\u68C0\u67E5\u6587\u4EF6\u2026");
    if (kind === "motion") {
      if (!/\.fbx$/i.test(file.name)) throw new Error("\u8BF7\u9009\u62E9 FBX \u6587\u4EF6");
      await (await renderer2()).inspectMotion(await file.arrayBuffer());
    } else {
      if (!/\.(png|webp|gif)$/i.test(file.name)) throw new Error("\u8BF7\u9009\u62E9 PNG\u3001WebP \u6216 GIF");
      const url = URL.createObjectURL(file);
      try {
        await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => image.width <= 2048 && image.height <= 2048 ? resolve() : reject(new Error("\u8D34\u7EB8\u5C3A\u5BF8\u4E0D\u80FD\u8D85\u8FC7 2048 \xD7 2048"));
          image.onerror = () => reject(new Error("\u56FE\u7247\u65E0\u6CD5\u89E3\u7801"));
          image.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (!alive.current) return;
    setProgress(0);
    setNotice("");
    const result = await new Promise((resolve, reject) => {
      const req = new XMLHttpRequest();
      xhr.current = req;
      req.open("POST", "/harness-docket/companion/upload?filename=" + encodeURIComponent(file.name));
      req.timeout = 12e4;
      req.upload.onprogress = (e) => {
        if (e.lengthComputable && alive.current) setProgress(Math.round(e.loaded / e.total * 100));
      };
      req.onload = () => {
        try {
          const result2 = JSON.parse(req.responseText);
          if (!result2.ok) throw new Error(result2.error || "\u4E0A\u4F20\u5931\u8D25");
          resolve(result2);
        } catch (e) {
          reject(e);
        }
      };
      req.onerror = () => reject(new Error("\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u8BD5"));
      req.onabort = () => reject(new Error("\u5DF2\u53D6\u6D88\u4E0A\u4F20"));
      req.ontimeout = () => reject(new Error("\u4E0A\u4F20\u8D85\u65F6"));
      req.send(file);
    });
    await reload();
    if (!alive.current) return;
    if (kind === "motion") {
      await selectMotion(result.item.id);
      setName(result.item.name);
    } else editInteraction({ sticker: result.item.id });
    setNotice(kind === "motion" ? "\u4E0A\u4F20\u5B8C\u6210\u3002\u8BF7\u9009\u62E9\u7247\u6BB5\u5E76\u9884\u89C8\uFF0C\u518D\u7ED1\u5B9A\u5230\u89D2\u8272\u3002" : "\u8D34\u7EB8\u5DF2\u52A0\u5165\u5F53\u524D\u4E92\u52A8\uFF0C\u4FDD\u5B58\u540E\u751F\u6548\u3002");
  });
  const binding = assetId ? { id: assetId, clip } : null;
  const preview = () => {
    setError("");
    onPreview("walk", binding);
    setPreviewed(assetId + ":" + clip);
  };
  const bind = (slot) => {
    edit({ ...profile, [slot]: binding });
    setNotice("\u5DF2\u9009\u62E9\uFF0C\u4FDD\u5B58\u8BBE\u7F6E\u540E\u751F\u6548\u3002");
  };
  const bindInteraction = () => {
    const next = { ...defaultProfile().interactions[0], id: crypto.randomUUID(), name: name.slice(0, 40), action: "idle", motion: binding, expression: "", sticker: "music", text: "", duration: Math.max(2, Math.min(600, Math.ceil(clips[clip].duration * 2) / 2)) };
    edit({ ...profile, interactions: [...profile.interactions, next] });
    setSelected(next.id);
    setNotice("\u5DF2\u52A0\u5165\u70B9\u51FB\u4E92\u52A8\uFF0C\u6309\u5B8C\u6574\u7247\u6BB5\u8BBE\u7F6E\u65F6\u957F\u3002\u4FDD\u5B58\u8BBE\u7F6E\u540E\u751F\u6548\u3002");
  };
  const copyInteraction = () => {
    const next = { ...structuredClone(interaction), id: crypto.randomUUID(), name: (interaction.name + " \u526F\u672C").slice(0, 40) };
    edit({ ...profile, interactions: [...profile.interactions, next] });
    setSelected(next.id);
  };
  const importGreetings = (file) => perform(async () => {
    if (file.size > 64 * 1024) throw new Error("\u62DB\u547C\u8BED\u6587\u4EF6\u5E94\u5728 64 KB \u4EE5\u5185");
    const raw = (await file.text()).replace(/^\uFEFF/, "");
    const lines = /\.json$/i.test(file.name) ? JSON.parse(raw) : raw.split(/\r?\n/).filter((line) => line.trim());
    if (!Array.isArray(lines) || !lines.length || lines.some((line) => typeof line !== "string" || !line.trim() || line.length > 80)) throw new Error("\u8BF7\u4F7F\u7528\u6BCF\u884C\u4E00\u53E5\u7684 TXT \u6216\u5B57\u7B26\u4E32\u6570\u7EC4 JSON\uFF0C\u6BCF\u53E5 1\u201380 \u5B57");
    if (profile.interactions.length + lines.length > 12) throw new Error("\u6700\u591A\u4FDD\u5B58 12 \u4E2A\u7EC4\u5408\uFF0C\u8BF7\u51CF\u5C11\u5BFC\u5165\u6570\u91CF\u6216\u5220\u9664\u4E0D\u7528\u7684\u7EC4\u5408\uFF1B\u73B0\u6709\u5185\u5BB9\u672A\u6539\u53D8");
    const added = lines.map((text) => ({ ...structuredClone(interaction), id: crypto.randomUUID(), name: text.slice(0, 40), text }));
    edit({ ...profile, interactions: [...profile.interactions, ...added] });
    setSelected(added[0].id);
    setNotice("\u62DB\u547C\u8BED\u5DF2\u8FFD\u52A0\u4E3A\u72EC\u7ACB\u7EC4\u5408\uFF0C\u6CBF\u7528\u5F53\u524D\u52A8\u4F5C\u548C\u8868\u60C5\uFF0C\u53EF\u5206\u522B\u4FEE\u6539\u3002\u4FDD\u5B58\u540E\u751F\u6548\u3002");
  });
  const assetName = (b) => b ? (data.assets.find((a) => a.id === b.id)?.name || "\u8D44\u6E90\u5DF2\u5220\u9664") + " \xB7 \u7247\u6BB5 " + (b.clip + 1) : "\u5185\u7F6E\u52A8\u4F5C";
  const canBind = !!binding && capabilities.motion && clips.length > 0 && previewed === assetId + ":" + clip && motionStatus === "ready";
  const label = { happy: "\u5F00\u5FC3", angry: "\u751F\u6C14", sad: "\u96BE\u8FC7", relaxed: "\u653E\u677E", surprised: "\u60CA\u8BB6", neutral: "\u81EA\u7136", aa: "\u5F20\u5634 \xB7 A", ih: "\u53E3\u578B \xB7 I", ou: "\u53E3\u578B \xB7 U", ee: "\u53E3\u578B \xB7 E", oh: "\u53E3\u578B \xB7 O" };
  const save = () => perform(async () => {
    if (motionStatus === "loading") throw new Error("\u8BF7\u7B49\u5F85\u52A8\u4F5C\u9884\u89C8\u5B8C\u6210");
    if (!["ready", ""].includes(motionStatus)) throw new Error("\u8BF7\u5148\u4FEE\u6B63\u52A8\u4F5C\u9884\u89C8\u4E2D\u7684\u95EE\u9898");
    for (const binding2 of [profile.walk, profile.idle, ...profile.interactions.map((i) => i.motion)]) {
      if (!binding2) continue;
      if (!capabilities.motion) throw new Error("\u5F53\u524D\u6A21\u578B\u65E0\u6CD5\u4F7F\u7528\u5916\u90E8\u52A8\u4F5C\uFF0C\u8BF7\u6062\u590D\u5185\u7F6E\u52A8\u4F5C");
      const parsed = await (await renderer2()).motionAsset(binding2.id);
      if (!parsed.clips[binding2.clip]) throw new Error("\u6240\u9009\u52A8\u4F5C\u7247\u6BB5\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
    }
    try {
      const result = await request2("companion/settings", { id, profile: { ...profile, mode: "random" }, revision: revision.current });
      revision.current = result.revision;
      setDirty(false);
      setConflict(false);
      await reload();
      setNotice("\u5DF2\u4FDD\u5B58\uFF0C\u56DE\u5230\u9875\u9762\u5373\u53EF\u4F53\u9A8C\u3002");
    } catch (e) {
      if (e.status === 409) {
        setConflict(true);
        await reload();
      }
      ;
      throw e;
    }
  });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("form", { id: "hda-companion-settings", onSubmit: (e) => {
    e.preventDefault();
    void save();
  }, className: "hda-controls", "aria-label": tab === "model" ? "\u8D34\u8EAB\u83DC\u5355\u8BBE\u7F6E" : tab === "motion" ? "\u52A8\u4F5C\u5E93" : "\u4E92\u52A8\u8BBE\u7F6E", children: [
    conflict && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { role: "alert", className: "hda-error", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u8BBE\u7F6E\u5DF2\u66F4\u65B0\uFF0C\u5F53\u524D\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002\u53EF\u5BFC\u51FA\u8349\u7A3F\u7528\u4E8E\u6BD4\u8F83\uFF0C\u518D\u8F7D\u5165\u6700\u65B0\u8BBE\u7F6E\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-secondary", onClick: () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "companion-draft.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
      }, children: "\u5BFC\u51FA\u5F53\u524D\u8349\u7A3F" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-danger", onClick: () => {
        setProfile(structuredClone(initial2));
        revision.current = data.revisions?.[id] || 0;
        setDirty(false);
        setConflict(false);
        setError("");
      }, children: "\u653E\u5F03\u8349\u7A3F\u5E76\u8F7D\u5165\u6700\u65B0\u8BBE\u7F6E" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("fieldset", { disabled: busy, className: "hda-settings-fields", children: tab === "model" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-attached-settings", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-section-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: "\u8D34\u8EAB\u83DC\u5355" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "hda-tag", children: "\u5F53\u524D\u89D2\u8272" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
        "\u5165\u53E3\u4F4D\u7F6E",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { "aria-label": "\u8D34\u8EAB\u83DC\u5355\u4F4D\u7F6E", value: menu.side, onChange: (e) => editMenu({ side: e.target.value }), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "auto", children: "\u81EA\u52A8" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "left", children: "\u5DE6\u4FA7\u4F18\u5148" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "right", children: "\u53F3\u4FA7\u4F18\u5148" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
        "\u9AD8\u5EA6\u5FAE\u8C03 ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          Math.round(menu.height * 100),
          "%"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { "aria-label": "\u8D34\u8EAB\u83DC\u5355\u9AD8\u5EA6", type: "range", min: "-.15", max: ".15", step: ".01", value: menu.height, onChange: (e) => editMenu({ height: +e.target.value }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
        "\u8D34\u8EAB\u95F4\u8DDD ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          menu.gap,
          "px"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { "aria-label": "\u8D34\u8EAB\u83DC\u5355\u95F4\u8DDD", type: "range", min: "2", max: "10", step: "1", value: menu.gap, onChange: (e) => editMenu({ gap: +e.target.value }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "hda-help", children: "\u5DE6\u4FA7\u9884\u89C8\u4F1A\u5B9E\u65F6\u66F4\u65B0\u3002\u4FDD\u5B58\u540E\u6309\u89D2\u8272\u8BB0\u4F4F\uFF1B\u7A7A\u95F4\u4E0D\u8DB3\u65F6\u4F1A\u4E34\u65F6\u6362\u4FA7\u907F\u8BA9\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-text-button", onClick: () => edit({ ...profile, attachedMenu: menuDefaults() }), children: "\u6062\u590D\u81EA\u52A8\u8D34\u8EAB\u83DC\u5355" })
    ] }) : tab === "motion" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-section-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("h3", { children: [
          "\u52A8\u4F5C\u5E93 ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: data.assets.filter((a) => a.kind === "motion").length })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "hda-tag", children: "FBX" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "hda-help", children: "\u672C\u5730\u52A8\u4F5C\u5DF2\u81EA\u52A8\u52A0\u5165\uFF0C\u4E5F\u53EF\u4E0A\u4F20 FBX\uFF08\u5E26\u76AE\u80A4\u6216\u7EAF\u52A8\u4F5C\uFF09\u3002\u9009\u62E9\u7247\u6BB5\u5E76\u9884\u89C8\u540E\uFF0C\u53EF\u7528\u4E8E\u884C\u8D70\u3001\u5F85\u673A\u6216\u70B9\u51FB\u4E92\u52A8\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { hidden: true, ref: uploadInput, type: "file", accept: ".fbx", onChange: (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void upload(f, "motion");
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "hda-upload", disabled: busy, onClick: () => uploadInput.current?.click(), children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(UIIcon, { kind: "upload" }),
        "\u4E0A\u4F20 FBX \u52A8\u4F5C"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
        "\u9009\u62E9\u52A8\u4F5C",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { "aria-label": "\u9009\u62E9 FBX \u52A8\u4F5C", value: assetId, onChange: (e) => void selectMotion(e.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "\u9009\u62E9\u52A8\u4F5C" }),
          data.assets.filter((a) => a.kind === "motion").map((a) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: a.id, children: a.name }, a.id))
        ] })
      ] }),
      assetId && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
          "\u540D\u79F0",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-inline", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { "aria-label": "\u52A8\u4F5C\u540D\u79F0", value: name, maxLength: 80, onChange: (e) => setName(e.target.value) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-secondary", disabled: busy || !name.trim(), onClick: () => void perform(async () => {
              await request2("companion/rename", { id: assetId, name });
              await reload();
              setNotice("\u540D\u79F0\u5DF2\u66F4\u65B0");
            }), children: "\u91CD\u547D\u540D" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
          "\u52A8\u753B\u7247\u6BB5",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("select", { "aria-label": "\u52A8\u753B\u7247\u6BB5", value: clip, onChange: (e) => {
            setClip(Number(e.target.value));
            setPreviewed("");
          }, children: clips.map((c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value: c.index, children: [
            c.name || "\u7247\u6BB5 " + (c.index + 1),
            " \xB7 ",
            c.duration.toFixed(1),
            " \u79D2"
          ] }, c.index)) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-inline", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-secondary", disabled: !capabilities.motion || !clips.length, onClick: preview, children: "\u9884\u89C8\u52A8\u4F5C" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-secondary", disabled: !canBind, onClick: () => bind("walk"), children: "\u7528\u4F5C\u884C\u8D70" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-secondary", disabled: !canBind, onClick: () => bind("idle"), children: "\u7528\u4F5C\u5F85\u673A" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-secondary", disabled: !canBind || profile.interactions.length >= 12, onClick: bindInteraction, children: "\u7528\u4F5C\u4E92\u52A8" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "hda-secondary", disabled: !canBind, onClick: () => {
            editInteraction({ motion: binding });
            setNotice("\u5DF2\u66F4\u65B0\u5F53\u524D\u7EC4\u5408\u7684\u52A8\u4F5C\uFF0C\u62DB\u547C\u8BED\u548C\u8868\u60C5\u4FDD\u7559\u3002\u4FDD\u5B58\u540E\u751F\u6548\u3002");
          }, children: [
            "\u7528\u4E8E\u5F53\u524D\u7EC4\u5408\uFF1A",
            interaction.name
          ] })
        ] }),
        !capabilities.motion && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "hda-help", children: "\u5F53\u524D\u89D2\u8272\u65E0\u6CD5\u6620\u5C04\u6B64\u7C7B\u52A8\u4F5C\uFF0C\u8BF7\u9009\u62E9 VRM \u6216 Mixamo \u9AA8\u67B6 GLB\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-text-button hda-text-danger", onClick: () => setRemoveId(assetId), children: "\u5220\u9664\u6B64\u52A8\u4F5C" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h4", { children: "\u65E5\u5E38\u6D3B\u52A8" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "hda-toggle", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: profile.roaming, onChange: (e) => edit({ ...profile, roaming: e.target.checked }) }),
          "\u5728\u9875\u9762\u5185\u81EA\u7531\u884C\u8D70"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
          "\u884C\u8D70\u901F\u5EA6 ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
            profile.speed,
            " px/s"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "range", min: "15", max: "70", value: profile.speed, onChange: (e) => edit({ ...profile, speed: +e.target.value }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { children: [
          "\u884C\u8D70\uFF1A",
          assetName(profile.walk)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { children: [
          "\u5F85\u673A\uFF1A",
          assetName(profile.idle)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-text-button", onClick: () => edit({ ...profile, walk: null, idle: null }), children: "\u6062\u590D\u5185\u7F6E\u884C\u8D70\u4E0E\u5F85\u673A" })
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-section-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: "\u70B9\u51FB\u4E92\u52A8" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "hda-tag", children: "\u52A8\u4F5C \xB7 \u8868\u60C5 \xB7 \u8D34\u7EB8" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-inline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("select", { "aria-label": "\u9009\u62E9\u4E92\u52A8", value: interaction.id, onChange: (e) => setSelected(e.target.value), children: profile.interactions.map((i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: i.id, children: i.name }, i.id)) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "hda-secondary", disabled: profile.interactions.length >= 12, onClick: () => {
          const next = { ...defaultProfile().interactions[0], id: crypto.randomUUID(), name: "\u65B0\u4E92\u52A8" };
          edit({ ...profile, interactions: [...profile.interactions, next] });
          setSelected(next.id);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(UIIcon, { kind: "plus" }),
          "\u65B0\u5EFA"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-inline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-secondary", disabled: profile.interactions.length >= 12, onClick: copyInteraction, children: "\u590D\u5236\u5F53\u524D\u7EC4\u5408" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-secondary", onClick: () => greetingInput.current?.click(), children: "\u5BFC\u5165\u62DB\u547C\u8BED" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { hidden: true, ref: greetingInput, type: "file", accept: ".txt,.json", onChange: (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void importGreetings(f);
      } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "hda-help", children: "\u52A8\u4F5C\u548C\u62DB\u547C\u8BED\u53EF\u81EA\u7531\u642D\u914D\u3002\u590D\u5236\u7EC4\u5408\u540E\u4FEE\u6539\u5373\u53EF\u4FDD\u7559\u539F\u7EC4\u5408\u3002\u5BFC\u5165 TXT\uFF08\u6BCF\u884C\u4E00\u53E5\uFF09\u6216 JSON \u5B57\u7B26\u4E32\u6570\u7EC4\uFF0C\u6BCF\u53E5\u6700\u591A 80 \u5B57\uFF1B\u53EA\u8FFD\u52A0\uFF0C\u4E0D\u8986\u76D6\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
        "\u4E92\u52A8\u540D\u79F0",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { value: interaction.name, maxLength: 40, onChange: (e) => editInteraction({ name: e.target.value }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "hda-toggle", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: interaction.enabled, onChange: (e) => editInteraction({ enabled: e.target.checked }) }),
        "\u53C2\u4E0E\u70B9\u51FB\u4E92\u52A8"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "hda-field-group", "aria-label": "\u52A8\u4F5C\u4E0E\u8868\u60C5", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h4", { children: "\u52A8\u4F5C\u4E0E\u8868\u60C5" }),
        capabilities.alpha ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "hda-help", children: "\u70B9\u51FB\u65F6\u968F\u673A\u64AD\u653E\u89D2\u8272\u81EA\u5E26\u7684\u56DE\u5E94\u52A8\u753B\uFF1B\u8868\u60C5\u5DF2\u5305\u542B\u5728\u52A8\u753B\u4E2D\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "\u8EAB\u4F53\u52A8\u4F5C",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { value: interaction.motion ? "fbx:" + interaction.motion.id : interaction.action, onChange: (e) => e.target.value.startsWith("fbx:") ? editInteraction({ motion: { id: e.target.value.slice(4), clip: 0 } }) : editInteraction({ action: e.target.value, motion: null, duration: Math.min(4, interaction.duration) }), children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "wave", children: "\u6325\u624B" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "head", children: "\u597D\u5947\u5730\u8F6C\u5934" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "idle", children: "\u81EA\u7136\u5F85\u673A" }),
              capabilities.motion && data.assets.filter((a) => a.kind === "motion").map((a) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "fbx:" + a.id, children: a.name }, a.id))
            ] })
          ] }),
          interaction.motion && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "\u52A8\u753B\u7247\u6BB5",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("select", { value: interaction.motion.clip, onChange: (e) => editInteraction({ motion: { ...interaction.motion, clip: +e.target.value } }), children: interactionClips.map((c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value: c.index, children: [
              c.name || "\u7247\u6BB5 " + (c.index + 1),
              " \xB7 ",
              c.duration.toFixed(1),
              " \u79D2"
            ] }, c.index)) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "\u8138\u90E8\u8868\u60C5",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { value: capabilities.expressions.includes(interaction.expression) ? interaction.expression : "", onChange: (e) => editInteraction({ expression: e.target.value }), children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "\u81EA\u7136\u8868\u60C5" }),
              capabilities.expressions.filter((e) => !e.startsWith("blink") && !e.startsWith("look")).map((e) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: e, children: label[e] || e }, e))
            ] })
          ] }),
          !capabilities.expressions.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "hda-help", children: "\u6B64\u6A21\u578B\u672A\u63D0\u4F9B\u8138\u90E8\u8868\u60C5\uFF0C\u4ECD\u53EF\u4F7F\u7528\u8EAB\u4F53\u52A8\u4F5C\u548C\u8D34\u7EB8\u3002" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "\u8868\u60C5\u5F3A\u5EA6 ",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
              Math.round(interaction.intensity * 100),
              "%"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "range", min: "0", max: "1", step: ".05", value: interaction.intensity, onChange: (e) => editInteraction({ intensity: +e.target.value }) })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
          "\u76EE\u5149\u8DDF\u968F",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { disabled: !capabilities.gaze || capabilities.gaze === "none", value: profile.gaze || "gentle", onChange: (e) => edit({ ...profile, gaze: e.target.value }), children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "off", children: "\u5173\u95ED" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "gentle", children: "\u8F7B\u67D4" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "noticeable", children: "\u660E\u663E" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: capabilities.gaze === "eyes" ? "\u773C\u775B\u4F18\u5148\u8DDF\u968F\uFF0C\u5934\u90E8\u8F7B\u5FAE\u8F85\u52A9\uFF1B\u52A8\u4F5C\u64AD\u653E\u65F6\u8BA9\u52A8\u4F5C\u4F18\u5148\u3002" : capabilities.gaze === "head" ? "\u6B64\u89D2\u8272\u652F\u6301\u8F7B\u5FAE\u8F6C\u5934\uFF0C\u6CA1\u6709\u53EF\u63A7\u773C\u90E8\u3002" : "\u6B64\u89D2\u8272\u6CA1\u6709\u53EF\u63A7\u7684\u76EE\u5149\uFF0C\u4FDD\u7559\u81EA\u7136\u59FF\u6001\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "hda-field-group", "aria-label": "\u8D34\u7EB8\u4E0E\u77ED\u53E5", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h4", { children: "\u8D34\u7EB8\u4E0E\u77ED\u53E5" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
          "\u5934\u9876\u8D34\u7EB8",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { value: interaction.sticker, onChange: (e) => editInteraction({ sticker: e.target.value }), children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "heart", children: "\u2661 \u7231\u5FC3" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "question", children: "? \u95EE\u53F7" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "music", children: "\u266B \u97F3\u7B26" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "none", children: "\u4E0D\u663E\u793A\u8D34\u7EB8" }),
            data.assets.filter((a) => a.kind === "sticker").map((a) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: a.id, children: a.name }, a.id))
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { hidden: true, ref: stickerInput, type: "file", accept: ".png,.webp,.gif", onChange: (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f, "sticker");
        } }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-inline", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-secondary", disabled: busy, onClick: () => stickerInput.current?.click(), children: "\u4E0A\u4F20\u8868\u60C5\u8D34\u7EB8" }),
          data.assets.some((a) => a.id === interaction.sticker) && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-text-button hda-text-danger", onClick: () => setRemoveId(interaction.sticker), children: "\u5220\u9664\u8D34\u7EB8" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "hda-help", children: "PNG / WebP / GIF \xB7 \u6700\u5927 5 MB\u30012048 \xD7 2048" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-inline", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "\u5927\u5C0F ",
            interaction.size,
            "px",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "range", min: "32", max: "128", value: interaction.size, onChange: (e) => editInteraction({ size: +e.target.value }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "\u65F6\u957F ",
            interaction.duration,
            "s",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "range", min: "2", max: interaction.motion ? Math.max(4, interaction.duration, Math.ceil(interactionClips[interaction.motion.clip]?.duration || 4)) : 4, step: ".5", value: interaction.duration, onChange: (e) => editInteraction({ duration: +e.target.value }) })
          ] })
        ] }),
        interaction.motion && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-text-button", disabled: !interactionClips[interaction.motion.clip], onClick: () => editInteraction({ duration: Math.max(2, Math.min(600, Math.ceil(interactionClips[interaction.motion.clip].duration * 2) / 2)) }), children: "\u6309\u5B8C\u6574\u52A8\u4F5C\u8BBE\u7F6E\u65F6\u957F" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
          "\u60F3\u8BF4\u7684\u8BDD",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { maxLength: 80, value: interaction.text, placeholder: "\u53EF\u9009\uFF0C\u4F8B\u5982\uFF1A\u4ECA\u5929\u4E5F\u8981\u5F00\u5FC3\u5440", onChange: (e) => editInteraction({ text: e.target.value }) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-inline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-secondary", onClick: () => onPreview(interaction.action, interaction.motion, interaction), children: "\u9884\u89C8\u5B8C\u6574\u4E92\u52A8" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-text-button hda-text-danger", disabled: profile.interactions.length <= 1, onClick: () => edit({ ...profile, interactions: profile.interactions.filter((i) => i.id !== interaction.id), daily: profile.daily?.filter((e) => e.id !== interaction.id), events: Object.fromEntries(Object.entries(profile.events || {}).filter(([, id2]) => id2 !== interaction.id)) }), children: "\u5220\u9664\u6B64\u4E92\u52A8" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { className: "hda-behavior-settings", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("summary", { children: "\u65E5\u5E38\u4E0E\u4F1A\u8BDD\u72B6\u6001" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "hda-toggle", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: profile.dailyEnabled !== false, onChange: (e) => edit({ ...profile, dailyEnabled: e.target.checked }) }),
          "\u5076\u5C14\u505A\u4E9B\u5C0F\u52A8\u4F5C"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "hda-toggle", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: !!profile.daily?.some((e) => e.id === interaction.id), onChange: (e) => edit({ ...profile, daily: e.target.checked ? [...profile.daily || [], { id: interaction.id, weight: 10, cooldown: 30 }] : profile.daily?.filter((e2) => e2.id !== interaction.id) }) }),
          "\u5C06\u5F53\u524D\u4E92\u52A8\u52A0\u5165\u65E5\u5E38\u5019\u9009"
        ] }),
        profile.daily?.find((e) => e.id === interaction.id) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-inline", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "\u51FA\u73B0\u6743\u91CD",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { "aria-label": "\u65E5\u5E38\u52A8\u4F5C\u6743\u91CD", type: "number", min: "1", max: "100", value: profile.daily.find((e) => e.id === interaction.id).weight, onChange: (e) => edit({ ...profile, daily: profile.daily?.map((d) => d.id === interaction.id ? { ...d, weight: +e.target.value } : d) }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "\u6700\u77ED\u95F4\u9694\uFF08\u79D2\uFF09",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { "aria-label": "\u65E5\u5E38\u52A8\u4F5C\u51B7\u5374", type: "number", min: "10", max: "600", value: profile.daily.find((e) => e.id === interaction.id).cooldown, onChange: (e) => edit({ ...profile, daily: profile.daily?.map((d) => d.id === interaction.id ? { ...d, cooldown: +e.target.value } : d) }) })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "hda-help", children: "\u65E5\u5E38\u53EA\u64AD\u653E\u52A8\u4F5C\u548C\u8868\u60C5\u3002\u4F1A\u8BDD\u72B6\u6001\u53EA\u8DDF\u968F\u5F53\u524D\u6253\u5F00\u7684\u4F1A\u8BDD\uFF0C\u70B9\u51FB\u540E\u6062\u590D\u3002" }),
        !capabilities.alpha && [["thinking", "\u601D\u8003"], ["working", "\u5DE5\u4F5C"], ["waiting", "\u7B49\u5F85\u786E\u8BA4"], ["success", "\u5B8C\u6210"], ["error", "\u51FA\u9519"]].map(([state2, title]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
          title,
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { "aria-label": title + "\u72B6\u6001\u4E92\u52A8", value: profile.events?.[state2] || "", onChange: (e) => edit({ ...profile, events: { ...profile.events, [state2]: e.target.value } }), children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "\u81EA\u52A8" }),
            profile.interactions.filter((i) => i.enabled).map((i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: i.id, children: i.name }, i.id))
          ] })
        ] }, state2))
      ] })
    ] }) }),
    removeId && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u5220\u9664\u540E\uFF0C\u4F7F\u7528\u5B83\u7684\u7EC4\u5408\u5C06\u6062\u590D\u5185\u7F6E\u8D44\u6E90\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-inline", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-danger", disabled: busy, onClick: () => void perform(async () => {
          await request2("companion/delete", { id: removeId });
          (await renderer2()).forgetMotionAsset(removeId);
          const clean = structuredClone(profile);
          if (clean.walk?.id === removeId) clean.walk = null;
          if (clean.idle?.id === removeId) clean.idle = null;
          for (const i of clean.interactions) {
            if (i.motion?.id === removeId) {
              i.motion = null;
              i.duration = Math.min(4, i.duration);
            }
            ;
            if (i.sticker === removeId) i.sticker = "heart";
          }
          ;
          edit(clean);
          if (assetId === removeId) void selectMotion("");
          setRemoveId("");
          onPreview("idle", null);
          await reload();
        }), children: "\u786E\u8BA4\u5220\u9664\u8D44\u6E90" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "hda-secondary", onClick: () => setRemoveId(""), children: "\u53D6\u6D88" })
      ] })
    ] }),
    data.errors?.map((e) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "hda-error", children: [
      e.name,
      "\uFF1A",
      e.error
    ] }, e.name)),
    progress !== null && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "hda-progress", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("progress", { "aria-label": "\u8D44\u6E90\u4E0A\u4F20\u8FDB\u5EA6", max: "100", value: progress }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        "\u4E0A\u4F20\u4E2D ",
        progress,
        "%"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: () => xhr.current?.abort(), children: "\u53D6\u6D88" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "hda-controls-feedback", role: "status", children: error ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "hda-error", children: error }) : motionStatus && !["ready", "loading"].includes(motionStatus) ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "hda-error", children: motionStatus }) : notice || (motionStatus === "loading" ? "\u6B63\u5728\u9002\u914D\u52A8\u4F5C\u2026" : dirty ? "\u6709\u672A\u4FDD\u5B58\u7684\u8BBE\u7F6E" : "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u70B9\u51FB\u4EBA\u7269\u5373\u53EF\u4E92\u52A8\u3002") })
  ] });
}

// src/client/activity-clock.js
var ActivityClock = class {
  token = 0;
  remaining = 0;
  playing = false;
  begin(seconds) {
    this.token++;
    this.remaining = seconds;
    this.playing = false;
    return this.token;
  }
  ready(token) {
    if (token === this.token && this.remaining > 0) this.playing = true;
  }
  advance(delta) {
    if (!this.playing || !Number.isFinite(delta) || delta <= 0) return false;
    this.remaining -= delta;
    if (this.remaining > 0) return false;
    this.playing = false;
    this.remaining = 0;
    return true;
  }
  cancel() {
    this.token++;
    this.remaining = 0;
    this.playing = false;
  }
};

// src/client/motion-inspector.tsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function MotionInspector({ data, enabled, basicEnabled, ready, action, status, renderer: renderer2, preview }) {
  const [scope, setScope] = (0, import_react3.useState)("all"), [asset, setAsset] = (0, import_react3.useState)(""), [clip, setClip] = (0, import_react3.useState)(0), [seconds, setSeconds] = (0, import_react3.useState)(5);
  const [clips, setClips] = (0, import_react3.useState)([]), [error, setError] = (0, import_react3.useState)(""), [loading, setLoading] = (0, import_react3.useState)(false);
  const motions = data.assets.filter((a) => a.kind === "motion" && (scope === "all" || (scope === "uploaded" ? a.source !== "local" : a.source === "local")));
  (0, import_react3.useEffect)(() => {
    let active2 = true;
    setClips([]);
    setError("");
    setLoading(!!asset);
    if (asset) renderer2().then((m) => m.motionAsset(asset)).then((parsed) => {
      if (active2) setClips(parsed.clips);
    }).catch((e) => {
      if (active2) setError(e.message);
    }).finally(() => {
      if (active2) setLoading(false);
    });
    return () => {
      active2 = false;
    };
  }, [asset]);
  (0, import_react3.useEffect)(() => {
    if (asset && !motions.some((a) => a.id === asset)) {
      setAsset("");
      preview("idle", null);
    }
  }, [data.assets, scope]);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "hda-motion-inspector", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "hda-inspector-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "\u52A8\u4F5C\u68C0\u67E5" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: "\u4EC5\u9884\u89C8 \xB7 \u4E0D\u4FEE\u6539\u7ED1\u5B9A" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
      "\u52A8\u4F5C\u6765\u6E90",
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { "aria-label": "\u68C0\u67E5\u52A8\u4F5C\u6765\u6E90", value: scope, onChange: (e) => setScope(e.target.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "all", children: "\u5168\u90E8\u52A8\u4F5C" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "uploaded", children: "\u7528\u6237\u4E0A\u4F20" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "local", children: "\u672C\u5730\u5BFC\u5165" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
      "\u68C0\u67E5\u52A8\u4F5C",
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { "aria-label": "\u68C0\u67E5\u52A8\u4F5C", value: asset ? "fbx:" + asset : action, disabled: !ready || !enabled && !basicEnabled, onChange: (e) => {
        const value = e.target.value;
        setClip(0);
        setAsset(value.startsWith("fbx:") ? value.slice(4) : "");
        preview(value.startsWith("fbx:") ? "idle" : value, null);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("optgroup", { label: "\u57FA\u7840\u68C0\u67E5", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "walk", children: "\u884C\u8D70" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "wave", children: "\u6325\u624B" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "idle", children: "\u5F85\u673A" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "left", children: "\u5DE6\u81C2\u62AC\u8D77\u4E0E\u5C48\u8098" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "right", children: "\u53F3\u81C2\u62AC\u8D77\u4E0E\u5C48\u8098" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "head", children: "\u8F6C\u5934" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "rest", children: "\u539F\u59CB\u59FF\u6001" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("optgroup", { label: "\u8D44\u6E90\u5E93\u52A8\u4F5C", children: motions.map((a) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "fbx:" + a.id, disabled: !enabled, children: a.name }, a.id)) })
      ] })
    ] }),
    asset && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
        "\u7247\u6BB5",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("select", { "aria-label": "\u68C0\u67E5\u52A8\u4F5C\u7247\u6BB5", value: clip, disabled: loading, onChange: (e) => setClip(+e.target.value), children: clips.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: i, children: [
          c.name || "\u7247\u6BB5 " + (i + 1),
          " \xB7 ",
          c.duration.toFixed(1),
          " \u79D2"
        ] }, i)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
        "\u68C0\u67E5\u65F6\u9650",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("select", { "aria-label": "\u68C0\u67E5\u65F6\u9650", value: seconds, onChange: (e) => setSeconds(+e.target.value), children: [3, 5, 10, 15].map((n) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: n, children: [
          n,
          " \u79D2"
        ] }, n)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "hda-secondary", disabled: !ready || !enabled || !clips[clip] || loading, onClick: () => preview("idle", { id: asset, clip }, seconds), children: "\u64AD\u653E\u68C0\u67E5\u52A8\u4F5C" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "hda-text-button", onClick: () => preview("idle", null), children: "\u505C\u6B62\u68C0\u67E5" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "hda-inspector-note", role: "status", children: error || (status && !["ready", "loading"].includes(status) ? status : loading ? "\u6B63\u5728\u8BFB\u53D6\u52A8\u4F5C\u7247\u6BB5\u2026" : !enabled ? "\u5F53\u524D\u6A21\u578B\u4FDD\u7559\u81EA\u8EAB\u52A8\u753B\uFF1BFBX \u68C0\u67E5\u9700\u8981\u53EF\u6620\u5C04\u7684\u4EBA\u5F62\u9AA8\u67B6\u3002" : !motions.length ? "\u6B64\u8303\u56F4\u6682\u65E0\u52A8\u4F5C\uFF0C\u53EF\u524D\u5F80\u52A8\u4F5C\u5E93\u4E0A\u4F20\u3002" : asset ? "\u68C0\u67E5\u6700\u591A 15 \u79D2\uFF0C\u5230\u65F6\u6062\u590D\u5F85\u673A\u3002" : "\u53EF\u68C0\u67E5\u57FA\u7840\u59FF\u6001\u6216\u9009\u62E9\u8D44\u6E90\u5E93\u4E2D\u7684\u52A8\u4F5C\u3002") })
  ] });
}

// src/client/companion-random.js
function createInteractionPicker(random = Math.random) {
  let remaining = [], previous = "", signature = "";
  return (choices) => {
    const nextSignature = JSON.stringify(choices.map((i) => i.id));
    if (signature !== nextSignature) {
      remaining = [];
      signature = nextSignature;
    }
    if (!remaining.length) {
      remaining = choices.map((i) => i.id);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      if (remaining.length > 1 && remaining.at(-1) === previous) [remaining[0], remaining[remaining.length - 1]] = [remaining.at(-1), remaining[0]];
    }
    previous = remaining.pop() || "";
    return choices.find((i) => i.id === previous);
  };
}
function interactionChoices(profile, defaults) {
  const distinct = (items) => {
    const seen = /* @__PURE__ */ new Set();
    return items.filter((i) => {
      const key = JSON.stringify([i.motion || i.action, i.expression, i.intensity, i.sticker, i.text]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  let choices = distinct(profile.interactions.filter((i) => i.enabled));
  if (choices.length < 2) choices = distinct([...choices, ...defaults.map((i) => ({ ...i, id: "fallback:" + i.id }))]);
  return choices;
}

// src/client/attached-menu.tsx
var import_react4 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function useAttachedMenu(measurement, width, height, origin, viewport, preferences, touch, expanded) {
  const previous = (0, import_react4.useRef)(null), identity = [measurement?.id, measurement?.version, width, height, touch, JSON.stringify(preferences)].join(":");
  const key = (0, import_react4.useRef)(identity);
  return (0, import_react4.useMemo)(() => {
    if (key.current !== identity) {
      previous.current = null;
      key.current = identity;
    }
    const start = performance.now();
    const layout = layoutAttachedMenu({ measurement, width, height, origin, viewport, preferences: preferences || menuDefaults(), touch, expanded, previous: previous.current });
    layout.cpuMs = performance.now() - start;
    previous.current = layout;
    return layout;
  }, [measurement, width, height, origin.x, origin.y, viewport.left, viewport.top, viewport.width, viewport.height, identity, expanded]);
}
function MenuToggle({ layout, expanded = false, buttonRef, ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { ref: buttonRef, type: "button", className: "hda-menu-toggle", "data-side": layout.side, "aria-expanded": expanded, ...props, style: { left: layout.toggle.x, top: layout.toggle.y, width: layout.toggle.width, height: layout.toggle.height, "--menu-diameter": layout.diameter + "px" }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "hda-menu-pearl", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { viewBox: "0 0 18 18", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "5", cy: "9", r: ".75" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "9", cy: "9", r: ".75" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("circle", { cx: "13", cy: "9", r: ".75" })
  ] }) }, layout.side) });
}
function LayoutDebug({ measurement, layout }) {
  if (!new URLSearchParams(location.search).has("hda-layout-debug") || !measurement?.mask) return null;
  const m = measurement.mask, b = m.body;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { className: "hda-layout-debug", width: m.cssWidth, height: m.cssHeight, "aria-hidden": "true", style: { overflow: "visible", position: "absolute", inset: 0, pointerEvents: "none" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, fill: "none", stroke: "#36a89d", strokeWidth: ".5" }),
    Array.from({ length: m.height }, (_, y) => {
      const xs = [];
      for (let x = 0; x < m.width; x++) if (m.pixels[y * m.width + x]) xs.push(x);
      return xs.length ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: xs.map((x) => `M${x * m.cssWidth / m.width} ${y * m.cssHeight / m.height}h${m.cssWidth / m.width}`).join(""), stroke: "#ef996a", opacity: ".35", strokeWidth: m.cssHeight / m.height }, y) : null;
    }),
    [layout.toggle, ...layout.actions.flatMap((a) => [a.hit, a.label])].map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: r.x, y: r.y, width: r.width, height: r.height, fill: "none", stroke: "#616ccb", strokeWidth: ".5" }, i))
  ] });
}

// src/client/companion-roam.js
function advanceRoam(position, target, delta, speed, maxX, maxY) {
  const dx = (target.x - position.x) * maxX, dy = (target.y - position.y) * maxY, distance = Math.hypot(dx, dy);
  const step = Math.min(distance, speed * Math.min(0.1, Math.max(0, delta)));
  return { x: Math.max(0, Math.min(1, position.x + (distance && maxX ? dx / distance * step / maxX : 0))), y: Math.max(0, Math.min(1, position.y + (distance && maxY ? dy / distance * step / maxY : 0))), arrived: distance <= 2, angle: Math.atan2(dx, dy) };
}

// src/client/alpha-character.tsx
var import_react5 = require("react");

// src/client/alpha-video.js
function alphaSources(item, key, video, userAgent = "", preferred = "") {
  const clip = item.clips[key];
  const sources = [{ format: "webm", ...clip }];
  if (clip.hevc && video.canPlayType('video/quicktime; codecs="hvc1"')) sources.push({ format: "hevc", ...clip.hevc });
  const apple = /AppleWebKit/i.test(userAgent) && (/iPhone|iPad|iPod/i.test(userAgent) || !/Chrome|Chromium|Edg|OPR|Android/i.test(userAgent));
  const first = preferred || (apple ? "hevc" : "webm");
  return sources.sort((a, b) => Number(b.format === first) - Number(a.format === first)).map((source) => ({
    format: source.format,
    url: "/harness-docket/pet-clip?id=" + encodeURIComponent(item.id) + "&clip=" + key + "&format=" + source.format + "&v=" + source.sha256
  }));
}
var cancelled = () => new DOMException("Cancelled", "AbortError");
var loadError = () => new Error("\u89D2\u8272\u52A8\u753B\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002");
function guarded(signal, timeout, operation) {
  return new Promise((resolve, reject) => {
    let settled = false, cleanup = () => {
    };
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      cleanup();
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => finish(cancelled());
    const timer = setTimeout(() => finish(loadError()), timeout);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    try {
      cleanup = operation((value) => finish(null, value), finish) || (() => {
      });
    } catch (error) {
      finish(error);
    }
    if (settled) cleanup();
  });
}
async function loadAlphaSource(video, sources, { signal, verify, timeout = 15e3 }) {
  let failure = loadError();
  for (const source of sources) {
    if (signal.aborted) throw cancelled();
    try {
      await guarded(signal, timeout, (resolve, reject) => {
        const fail = () => reject(loadError());
        video.addEventListener("loadeddata", resolve, { once: true });
        video.addEventListener("error", fail, { once: true });
        video.src = source.url;
        video.load();
        return () => {
          video.removeEventListener("loadeddata", resolve);
          video.removeEventListener("error", fail);
        };
      });
      await guarded(signal, timeout, (resolve, reject) => {
        video.play().then(resolve, reject);
      });
      for (let attempt = 0; attempt < 20; attempt++) {
        await guarded(signal, timeout, (resolve) => {
          const timer = setTimeout(resolve, 50);
          return () => clearTimeout(timer);
        });
        try {
          verify(video);
          return source.format;
        } catch (error) {
          if (attempt === 19) throw error;
        }
      }
    } catch (error) {
      if (signal.aborted) throw cancelled();
      video.pause();
      failure = error;
    }
  }
  throw failure;
}

// src/client/alpha-character.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function AlphaCharacter(props) {
  const host = (0, import_react5.useRef)(null), players = (0, import_react5.useRef)([]), front = (0, import_react5.useRef)(-1);
  const callbacks = (0, import_react5.useRef)(props);
  callbacks.current = props;
  const [status, setStatus] = (0, import_react5.useState)("loading"), sequence = (0, import_react5.useRef)(0), previousClick = (0, import_react5.useRef)("click2");
  const playingReady = (0, import_react5.useRef)(false);
  const preferredFormat = (0, import_react5.useRef)("");
  const sampler = (0, import_react5.useRef)(null);
  const paused = (0, import_react5.useRef)(props.paused), mirror = (0, import_react5.useRef)(false), loadedId = (0, import_react5.useRef)("");
  paused.current = props.paused;
  const { item, action, motionRevision = 0, oneShot } = props;
  const sample = (video, verify = false) => {
    const canvas = sampler.current ||= document.createElement("canvas"), w = 128, h2 = 72;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (verify) {
      canvas.width = w;
      canvas.height = h2;
      context.drawImage(video, 0, 0, w, h2);
      const pixels = context.getImageData(0, 0, w, h2).data;
      let transparent = 0, opaque = 0;
      for (let n = 3; n < pixels.length; n += 4) {
        if (pixels[n] < 16) transparent++;
        if (pixels[n] > 128) opaque++;
      }
      if (transparent < w * h2 * 0.1 || opaque < 10) throw new Error("\u89D2\u8272\u52A8\u753B\u7684\u900F\u660E\u80CC\u666F\u89E3\u7801\u5931\u8D25\uFF0C\u8BF7\u66F4\u65B0\u6D4F\u89C8\u5668\u540E\u91CD\u8BD5\uFF0C\u6216\u6682\u7528 3D \u89D2\u8272\u3002");
    }
    if (!host.current || !callbacks.current.onLayout) return;
    const cssWidth = host.current.clientWidth, cssHeight = host.current.clientHeight;
    const sampleWidth = Math.max(32, Math.round(64 * cssWidth / cssHeight));
    if (canvas.width !== sampleWidth) canvas.width = sampleWidth;
    if (canvas.height !== 64) canvas.height = 64;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    context.translate(mirror.current ? canvas.width : 0, canvas.height);
    context.scale(mirror.current ? -1 : 1, -1);
    context.drawImage(video, (canvas.width - video.videoWidth * scale) / 2, (canvas.height - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale);
    const mask = maskFromPixels(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, cssWidth, cssHeight);
    const value = { id: item.id, version: item.version, cssWidth, cssHeight, mask, referenceHeight: cssHeight * 0.7, confidence: "alpha" };
    host.current.__hdaMeasurement = value;
    callbacks.current.onLayout(value);
  };
  (0, import_react5.useEffect)(() => {
    const serial = ++sequence.current, controller = new AbortController();
    playingReady.current = false;
    const index = front.current === 0 ? 1 : 0, video = players.current[index];
    let key = item.clips[action] ? action : action === "wave" ? "click1" : "idle";
    if (oneShot) {
      key = previousClick.current === "click1" ? "click2" : "click1";
      previousClick.current = key;
    }
    callbacks.current.onMotionStatus?.("loading", motionRevision);
    const load = async () => {
      video.loop = !oneShot;
      video.playbackRate = 1;
      const format = await loadAlphaSource(video, alphaSources(item, key, video, navigator.userAgent, preferredFormat.current), {
        signal: controller.signal,
        verify: (candidate) => sample(candidate, true)
      });
      if (sequence.current !== serial) return;
      preferredFormat.current = format;
      if (paused.current || document.hidden) video.pause();
      const old = players.current[front.current];
      if (old) {
        old.pause();
        old.style.opacity = "0";
        old.removeAttribute("src");
        old.load();
      }
      front.current = index;
      video.style.opacity = "1";
      playingReady.current = true;
      setStatus("ready");
      loadedId.current = item.id;
      callbacks.current.onReady?.(item);
      callbacks.current.onCapabilities?.({ motion: false, expressions: [], alpha: true });
      callbacks.current.onMotionStatus?.("ready", motionRevision);
    };
    void load().catch((error) => {
      if (error.name === "AbortError" || serial !== sequence.current) return;
      if (index !== front.current) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      if (front.current < 0) {
        setStatus("error");
        callbacks.current.onError?.(error.message);
      } else callbacks.current.onMotionStatus?.(error.message, motionRevision);
    });
    return () => {
      controller.abort();
      if (index !== front.current) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [item.id, item.version, action, motionRevision, oneShot]);
  (0, import_react5.useEffect)(() => {
    const sync2 = () => {
      const video = players.current[front.current];
      if (!video) return;
      if (props.paused || document.hidden) video.pause();
      else void video.play().catch(() => {
      });
    };
    sync2();
    document.addEventListener("visibilitychange", sync2);
    return () => document.removeEventListener("visibilitychange", sync2);
  }, [props.paused, status]);
  (0, import_react5.useEffect)(() => {
    mirror.current = action === "walk" && Math.sin(props.angle || 0) > 0;
    for (const video of players.current) if (video) video.style.transform = mirror.current ? "scaleX(-1)" : "";
  }, [action, props.angle]);
  (0, import_react5.useEffect)(() => {
    const ownedPlayers = players.current.filter((video) => !!video);
    let frame = 0, lastTime = -1, lastVideo = null, sampled = 0, lastTick = 0;
    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || paused.current || now - lastTick < 1e3 / 30) return;
      lastTick = now;
      const video = players.current[front.current];
      if (!video) return;
      if (lastVideo !== video) {
        lastTime = video.currentTime;
        lastVideo = video;
      }
      const delta = video.currentTime - lastTime;
      lastTime = video.currentTime;
      if (playingReady.current && !paused.current && !document.hidden && !video.paused && delta > 0) callbacks.current.onTick?.(Math.min(delta, 0.1));
      if (playingReady.current && video.ended && !paused.current && !document.hidden) callbacks.current.onTick?.(0.016);
      if (!paused.current && !document.hidden && now - sampled > 500 && video.readyState >= 2) {
        sampled = now;
        sample(video);
      }
    };
    frame = requestAnimationFrame(tick);
    const resize = new ResizeObserver(() => {
      const v = players.current[front.current];
      if (v?.readyState >= 2) sample(v);
    });
    if (host.current) resize.observe(host.current);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      sequence.current++;
      if (sampler.current) sampler.current.width = sampler.current.height = 0;
      sampler.current = null;
      for (const video of ownedPlayers) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [item.id]);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "hda-canvas-wrap hda-alpha-wrap", "data-status": status, "data-motion-id": "", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "hda-canvas hda-alpha", ref: host, "data-model-id": loadedId.current || item.id, children: [0, 1].map((i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("video", { ref: (node) => {
      players.current[i] = node;
    }, muted: true, playsInline: true, preload: "none", "aria-hidden": "true" }, i)) }),
    status !== "ready" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "hda-loading-dot", role: "status", "aria-label": status === "error" ? "\u89D2\u8272\u52A0\u8F7D\u5931\u8D25" : "\u89D2\u8272\u52A0\u8F7D\u4E2D" })
  ] });
}

// src/client/companion-feedback.tsx
var import_react7 = require("react");

// src/client/playback-state.ts
var import_react6 = require("react");
var ENABLED = "harness-docket:autoplay:v1";
var PIN = "dsh-boot-animation:pinned";
var state = null;
var noticeId = 0;
var selectionGeneration = 0;
var consumedNotice = 0;
var listeners = /* @__PURE__ */ new Set();
var publish = (next) => {
  state = { ...getPlaybackState(), ...next };
  listeners.forEach((fn) => fn());
};
var getPlaybackState = () => state ??= { enabled: readPreference(ENABLED) !== "false", pinned: readPreference(PIN), selected: null, selectionKnown: false, play: { phase: "idle", playId: 0, source: "auto" }, notice: null };
function consumeNotice(id) {
  if (id <= consumedNotice) return false;
  consumedNotice = id;
  return true;
}
function say(text) {
  publish({ notice: { id: ++noticeId, text, at: Date.now() } });
}
function setAutoplay(enabled) {
  if (enabled === getPlaybackState().enabled) return;
  const saved = writePreference(ENABLED, String(enabled));
  publish({ enabled });
  say(!saved ? `\u672C\u9875\u5DF2${enabled ? "\u5F00\u542F" : "\u5173\u95ED"}\uFF0C\u4F46\u8FD9\u6B21\u6CA1\u80FD\u8BB0\u4F4F\u8BBE\u7F6E\u3002` : enabled ? getPlaybackState().selectionKnown && !getPlaybackState().selected ? "\u81EA\u52A8\u64AD\u653E\u5DF2\u5F00\u542F\uFF0C\u5148\u53BB\u7247\u5E93\u9009\u4E00\u4E2A\u7247\u5934\u5427\u3002" : "\u81EA\u52A8\u64AD\u653E\u5DF2\u5F00\u542F\uFF0C\u4E0B\u6B21\u542F\u52A8\u9875\u9762\u6216\u8FDB\u5165\u65B0\u4F1A\u8BDD\u4F1A\u64AD\u653E\u7247\u5934\u3002" : "\u81EA\u52A8\u64AD\u653E\u5DF2\u5173\u95ED\uFF0C\u9700\u8981\u65F6\u53EF\u4EE5\u53BB\u7247\u5E93\u9884\u89C8\u3002");
}
function setPinned(id) {
  const saved = writePreference(PIN, id);
  publish({ pinned: id });
  if (!saved) say("\u672C\u9875\u5DF2\u66F4\u65B0\u91CD\u64AD\u89C4\u5219\uFF0C\u4F46\u8FD9\u6B21\u6CA1\u80FD\u8BB0\u4F4F\u8BBE\u7F6E\u3002");
}
function setPlayback(play) {
  publish({ play });
  if (play.phase === "failed") say("\u8FD9\u6BB5\u7247\u5934\u6CA1\u80FD\u64AD\u653E\uFF0C\u53EF\u4EE5\u53BB\u7247\u5E93\u91CD\u8BD5\u3002");
}
function advancePlayback(playId, phase) {
  if (getPlaybackState().play.playId === playId) publish({ play: { ...getPlaybackState().play, phase } });
}
function selectedFromList(data) {
  const item = data.videos?.find((v) => v.id === data.activeId);
  publish({ selectionKnown: true, selected: item ? { id: item.id, name: item.name, version: data.activeVersion || item.version || "" } : null });
}
async function refreshSelection() {
  const generation = ++selectionGeneration;
  try {
    const r = await fetch("/harness-docket/videos.json", { cache: "no-store", signal: AbortSignal.timeout(8e3) });
    if (!r.ok) throw new Error("Unavailable selection");
    const data = await r.json();
    if (generation === selectionGeneration) selectedFromList(data);
  } catch {
    if (generation === selectionGeneration) publish({ selectionKnown: false });
  }
}
var sync = (event) => {
  if (event.key === null || event.key === preferenceKey(ENABLED) || event.key === preferenceKey(PIN)) publish({ enabled: readPreference(ENABLED) !== "false", pinned: readPreference(PIN) });
};
function subscribe(fn) {
  if (!listeners.size) window.addEventListener("storage", sync);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) window.removeEventListener("storage", sync);
  };
}
var usePlayback = () => (0, import_react6.useSyncExternalStore)(subscribe, getPlaybackState, getPlaybackState);
function playbackDescription(value = getPlaybackState()) {
  const labels = { idle: "\u672A\u64AD\u653E", resolving: "\u6B63\u5728\u8BFB\u53D6\u7247\u6E90", loading: "\u6B63\u5728\u52A0\u8F7D", playing: value.play.source === "preview" ? "\u6B63\u5728\u9884\u89C8" : "\u6B63\u5728\u64AD\u653E", buffering: "\u6B63\u5728\u7F13\u51B2", completed: "\u5DF2\u7ED3\u675F", skipped: "\u5DF2\u8DF3\u8FC7", failed: "\u64AD\u653E\u5931\u8D25", disabled: "\u5DF2\u505C\u6B62\u81EA\u52A8\u64AD\u653E", left: "\u5DF2\u79BB\u5F00\u4F1A\u8BDD" };
  return labels[value.play.phase] + (value.play.name ? `\u300A${value.play.name}\u300B` : "");
}

// src/client/companion-speech.js
var CompanionSpeech = class {
  constructor(engine, createUtterance, changed = (_value = false) => {
  }, failed = () => {
  }) {
    this.failed = failed;
    this.engine = engine;
    this.create = createUtterance;
    this.changed = changed;
    this.generation = 0;
    this.active = false;
  }
  cancel() {
    this.generation++;
    if (this.active) this.engine?.cancel();
    this.active = false;
    this.changed(false);
  }
  speak(text, { enabled = false, volume = 0.7, voice = "" } = {}) {
    this.cancel();
    if (!enabled || !this.engine || !text) return false;
    const utterance = this.create(text), token = this.generation;
    const voices = this.engine.getVoices(), selected = voices.find((v) => v.voiceURI === voice) || voices.find((v) => /^zh/i.test(v.lang));
    if (!selected) return false;
    utterance.voice = selected;
    utterance.lang = selected.lang;
    utterance.volume = Math.max(0, Math.min(1, volume));
    utterance.rate = 1;
    const done = () => {
      if (token === this.generation) {
        this.active = false;
        this.changed(false);
      }
    };
    utterance.onstart = () => {
      if (token === this.generation) this.changed(true);
    };
    utterance.onend = done;
    utterance.onerror = () => {
      if (token === this.generation) this.failed();
      done();
    };
    this.active = true;
    try {
      this.engine.speak(utterance);
      return true;
    } catch {
      done();
      return false;
    }
  }
};
function voicePreferences(raw) {
  try {
    const v = JSON.parse(raw || "{}") || {};
    return { voice: typeof v.voice === "string" ? v.voice : "", volume: Number.isFinite(v.volume) ? Math.max(0, Math.min(1, v.volume)) : 0.7, speech: v.speech === true };
  } catch {
    return { voice: "", volume: 0.7, speech: false };
  }
}

// src/client/companion-feedback.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var KEY = "harness-docket:voice:v1";
function initial() {
  return voicePreferences(readPreference(KEY) ?? readPreference("harness-docket:conversation:v1"));
}
function useCompanionVoice(scope, suspended, onSpeaking) {
  const [settings, setSettings] = (0, import_react7.useState)(initial), [note, setNote] = (0, import_react7.useState)("");
  const speech = (0, import_react7.useRef)(null);
  const cancel = (0, import_react7.useCallback)(() => speech.current?.cancel(), []);
  (0, import_react7.useEffect)(() => {
    cancel();
    const hidden = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      cancel();
    };
  }, [scope, suspended, cancel]);
  const speak = (0, import_react7.useCallback)((text, preview = false) => {
    if (document.hidden || suspended || !preview && !settings.speech) return;
    if (!speech.current) speech.current = new CompanionSpeech(window.speechSynthesis, (text2) => new SpeechSynthesisUtterance(text2), (value = false) => onSpeaking(value), () => setNote("\u8BED\u97F3\u6682\u4E0D\u53EF\u7528\uFF0C\u6587\u5B57\u63D0\u793A\u4ECD\u6B63\u5E38\u663E\u793A\u3002"));
    setNote("");
    if (!speech.current.speak(text, { ...settings, enabled: true })) setNote("\u6CA1\u6709\u53EF\u7528\u7684\u4E2D\u6587\u58F0\u97F3\uFF0C\u6587\u5B57\u63D0\u793A\u4ECD\u6B63\u5E38\u663E\u793A\u3002");
  }, [settings, suspended, onSpeaking]);
  const edit = (next) => {
    cancel();
    setSettings(next);
    setNote(writePreference(KEY, JSON.stringify(next)) ? "" : "\u8BBE\u7F6E\u4EC5\u5728\u672C\u9875\u6709\u6548\uFF0C\u672A\u80FD\u4FDD\u5B58\u3002");
  };
  return { settings, note, edit, speak, cancel };
}
function CompanionVoiceSettings({ voice }) {
  const [open, setOpen] = (0, import_react7.useState)(false), [voices, setVoices] = (0, import_react7.useState)([]);
  (0, import_react7.useEffect)(() => voice.cancel, [voice.cancel]);
  (0, import_react7.useEffect)(() => {
    if (!open) return;
    const engine = window.speechSynthesis, update = () => setVoices(engine?.getVoices() || []);
    update();
    engine?.addEventListener("voiceschanged", update);
    return () => {
      engine?.removeEventListener("voiceschanged", update);
      voice.cancel();
    };
  }, [open, voice.cancel]);
  const { settings, edit } = voice;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("details", { className: "hda-voice-settings", onToggle: (e) => setOpen(e.currentTarget.open), children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("summary", { children: "\u64AD\u653E\u63D0\u793A\u4E0E\u58F0\u97F3" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "hda-help", children: "\u5207\u6362\u7247\u5934\u81EA\u52A8\u64AD\u653E\u65F6\u663E\u793A\u77ED\u63D0\u793A\u3002\u6717\u8BFB\u9ED8\u8BA4\u5173\u95ED\uFF0C\u8BBE\u7F6E\u5373\u65F6\u751F\u6548\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("input", { type: "checkbox", checked: settings.speech, onChange: (e) => edit({ ...settings, speech: e.target.checked }) }),
      "\u6717\u8BFB\u64AD\u653E\u63D0\u793A"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { children: [
      "\u58F0\u97F3",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { value: settings.voice, onChange: (e) => edit({ ...settings, voice: e.target.value }), children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: "\u81EA\u52A8\u9009\u62E9\u4E2D\u6587\u58F0\u97F3" }),
        voices.map((v) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: v.voiceURI, children: v.name }, v.voiceURI))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { children: [
      "\u97F3\u91CF",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("input", { type: "range", min: "0", max: "1", step: ".1", value: settings.volume, onChange: (e) => edit({ ...settings, volume: Number(e.target.value) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "hda-secondary", onClick: () => voice.speak("\u4F60\u597D\uFF0C\u6211\u4F1A\u5728\u8FD9\u91CC\u966A\u7740\u4F60\u3002", true), children: "\u8BD5\u542C\u58F0\u97F3" }),
    voice.note && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "hda-help", role: "status", children: voice.note })
  ] });
}
function CompanionNotice({ suspended, settling, voice }) {
  const { notice } = usePlayback(), shown = (0, import_react7.useRef)(0), [bubble, setBubble] = (0, import_react7.useState)("");
  (0, import_react7.useEffect)(() => {
    if (suspended) {
      setBubble("");
      voice.cancel();
    }
  }, [suspended, voice.cancel]);
  (0, import_react7.useEffect)(() => {
    const hidden = () => {
      if (document.hidden) {
        setBubble("");
        shown.current = notice?.id || 0;
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [notice?.id]);
  (0, import_react7.useEffect)(() => {
    if (!notice || shown.current === notice.id || suspended || settling) return;
    shown.current = notice.id;
    if (document.hidden || Date.now() - notice.at > 4500 || !consumeNotice(notice.id)) return;
    setBubble(notice.text);
    voice.speak(notice.text);
  }, [notice, suspended, settling, voice.speak]);
  (0, import_react7.useEffect)(() => {
    if (!bubble) return;
    const timer = setTimeout(() => setBubble(""), 3500);
    return () => clearTimeout(timer);
  }, [bubble, notice?.id]);
  return bubble && !suspended && !settling ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "hda-speech-bubble hdk-ui", role: "status", children: bubble }) : null;
}

// src/client/pocket-menu.tsx
var import_react8 = __toESM(require("react"), 1);

// src/client/pocket-menu-layout.js
var clamp2 = (x, a, b) => Math.max(a, Math.min(b, x));
var ease = (x) => {
  x = clamp2(x, 0, 1);
  return x * x * (3 - 2 * x);
};
var SETTLE = 0.08;
var CYCLE = 0.08;
var RELEASE = 0.5;
var DURATION = 1.18;
function pocketMenuLayout({ measurement, width, height, origin, viewport, touch = false, side = "auto" }) {
  const body = measurement?.mask?.body || { left: width * 0.32, right: width * 0.68, top: height * 0.46, bottom: height * 0.94 };
  const reference = measurement?.referenceHeight || body.bottom - body.top;
  const diameter = clamp2(reference * 0.22, 22, 30), hit = touch ? 44 : Math.max(34, diameter + 8);
  const center = { x: (body.left + body.right) / 2, y: measurement?.anchor?.y || (body.top + body.bottom) / 2 };
  const preferred = side === "left" ? Math.PI : side === "right" ? 0 : origin.x + center.x > viewport.width / 2 ? Math.PI : 0;
  const angles = [preferred, preferred + Math.PI, -Math.PI / 2, Math.PI / 2, ...Array.from({ length: 24 }, (_, i) => i * Math.PI / 12)];
  let best = null;
  for (let r = Math.max(48, reference * 0.55, hit * 1.12); r <= Math.max(170, reference * 1.3); r += 4) {
    for (let order = 0; order < angles.length; order++) {
      const axis = angles[order];
      const points = [-Math.PI / 3, 0, Math.PI / 3].map((a) => ({ x: center.x + r * Math.cos(axis + a), y: center.y + r * Math.sin(axis + a) }));
      const safe = points.every((p) => {
        const rect = { x: p.x - hit / 2, y: p.y - hit / 2, width: hit, height: hit };
        return origin.x + rect.x >= (viewport.left || 0) + 6 && origin.x + rect.x + hit <= (viewport.left || 0) + viewport.width - 6 && origin.y + rect.y >= (viewport.top || 0) + 6 && origin.y + rect.y + hit <= (viewport.top || 0) + viewport.height - 6 && (!measurement?.mask || !overlapsMask(measurement.mask, rect, 3));
      });
      if (!safe) continue;
      const score = r + order * 3;
      if (!best || score < best.score) best = { points, center, radius: r, axis, diameter, hit, score, side: Math.cos(axis) < 0 ? -1 : 1 };
    }
  }
  if (!best) {
    const r = hit * 1.12, axis = -Math.PI / 2;
    const c = { x: clamp2(origin.x + center.x, hit + 6, viewport.width - hit - 6) - origin.x, y: clamp2(origin.y + center.y, r + hit / 2 + 6, viewport.height - hit / 2 - 6) - origin.y };
    best = { center: c, radius: r, axis, diameter, hit, side: 1, fallback: true, points: [-Math.PI / 3, 0, Math.PI / 3].map((a) => ({ x: c.x + r * Math.cos(axis + a), y: c.y + r * Math.sin(axis + a) })) };
  }
  best.points.sort((a, b) => Math.abs(Math.cos(best.axis)) > 0.5 ? a.y - b.y : a.x - b.x);
  return best;
}
function tokenFlight(start, end, progress) {
  const t = ease(progress), lift = Math.sin(Math.PI * t) * Math.min(12, Math.hypot(end.x - start.x, end.y - start.y) * 0.15);
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t - lift };
}

// src/client/pocket-menu.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function PocketMenu({ expanded, layout, frame, children, menuRef }) {
  const previous = (0, import_react8.useRef)([]), focused = (0, import_react8.useRef)(false);
  (0, import_react8.useEffect)(() => {
    if (expanded) {
      previous.current = [];
      focused.current = false;
    }
  }, [expanded]);
  const time = frame?.time || 0, instant = frame?.instant, closing = frame?.closing;
  const entries = import_react8.default.Children.toArray(children).map((child, i) => {
    const local = time - SETTLE - i * CYCLE, end = layout.points[i];
    let visible = expanded && (instant || local >= RELEASE - 0.16), point = end, scale = 1, landed = instant || local >= RELEASE + 0.32, reveal = instant ? 1 : ease((local - RELEASE + 0.16) / 0.12);
    if (!instant && !landed) {
      const start = frame?.release?.[i] || frame?.palm || end;
      if (local <= RELEASE) {
        point = frame?.palm || end;
        scale = 0.08 + 0.34 * ease((local - RELEASE + 0.16) / 0.16);
      } else {
        const progress = (local - RELEASE) / 0.32;
        point = tokenFlight(start, end, progress);
        scale = 0.42 + 0.58 * ease(progress);
      }
    }
    if (closing && previous.current[i]) {
      ({ visible, point, scale, landed, reveal } = previous.current[i]);
    } else previous.current[i] = { visible, point, scale, landed, reveal };
    const labelAbove = (menuRef.current?.getBoundingClientRect().top || 0) + end.y + layout.diameter / 2 + 25 > window.innerHeight - 6;
    return import_react8.default.cloneElement(child, {
      "data-index": i,
      "data-landed": landed,
      "data-visible": visible,
      "data-label-above": labelAbove,
      tabIndex: visible && landed ? 0 : -1,
      "aria-hidden": !visible,
      style: { left: point.x - layout.hit / 2, top: point.y - layout.hit / 2, width: layout.hit, height: layout.hit, opacity: visible ? reveal * (closing ? frame.opacity : 1) : 0, visibility: visible ? "visible" : "hidden", pointerEvents: expanded && visible && landed ? "auto" : "none", "--token-scale": scale, "--token-diameter": layout.diameter + "px" }
    });
  });
  (0, import_react8.useEffect)(() => {
    if (!expanded || focused.current || !(instant || time >= DURATION)) return;
    menuRef.current?.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
    focused.current = true;
  }, [expanded, instant, time]);
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { ref: menuRef, className: "hda-menu hda-pocket-menu dba-dock-panel", id: "hda-actions", role: "menu", "aria-label": "\u684C\u5BA0\u5FEB\u6377\u529F\u80FD", "aria-busy": expanded && !instant && time < DURATION, hidden: !expanded && (!closing || !frame?.active), "data-arc": JSON.stringify(layout), "data-time": time, onKeyDown: (event) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...menuRef.current.querySelectorAll("button:not(:disabled)[data-landed=true]")];
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }, children: entries });
}

// src/client/work-status.ts
var import_react9 = require("react");
function useWorkStatus(sessionId) {
  const [snapshot, setSnapshot] = (0, import_react9.useState)({ sessionId, state: null, revision: 0 });
  (0, import_react9.useEffect)(() => {
    let dead = false, timer, controller = null;
    setSnapshot({ sessionId, state: null, revision: 0 });
    const poll = async () => {
      if (dead || !sessionId) return;
      if (!document.hidden) {
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 6e3);
        try {
          const response = await fetch("/harness-docket/work-status.json?session=" + encodeURIComponent(sessionId), { cache: "no-store", signal: controller.signal });
          if (response.ok) {
            const next = await response.json();
            if (!dead && next.sessionId === sessionId) setSnapshot((before) => before.sessionId === sessionId && before.revision === next.revision ? before : next);
          }
        } catch {
        } finally {
          clearTimeout(timeout);
        }
      }
      if (!dead) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      dead = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [sessionId]);
  return snapshot.sessionId === sessionId ? snapshot : { sessionId, state: null, revision: 0 };
}

// src/client/companion-behavior.js
function behaviorPriority({ paused, reaction, work, daily, walking }) {
  if (paused) return "paused";
  if (reaction) return "interacting";
  if (work) return work;
  if (daily) return "daily";
  return walking ? "walking" : "idle";
}
function createDailyPicker(random = Math.random) {
  let last = "", due = 8;
  const played = /* @__PURE__ */ new Map();
  return (seconds, profile) => {
    if (profile.dailyEnabled === false || seconds < due) return null;
    due = seconds + 10 + random() * 10;
    const entries = (profile.daily || []).filter((e) => e.weight > 0 && seconds - (played.get(e.id) ?? -Infinity) >= e.cooldown).map((e) => ({ ...e, interaction: profile.interactions.find((i) => i.id === e.id && i.enabled) })).filter((e) => e.interaction);
    const pool = entries.some((e) => e.id !== last) ? entries.filter((e) => e.id !== last) : entries;
    if (!pool.length) return { id: "daily:look", action: "head", motion: null, expression: "", intensity: 0, duration: 3, text: "", sticker: "none", size: 32 };
    let weight = random() * pool.reduce((sum, e) => sum + e.weight, 0);
    const chosen = pool.find((e) => (weight -= e.weight) < 0) || pool.at(-1);
    last = chosen.id;
    played.set(last, seconds);
    return { ...chosen.interaction, text: "", sticker: "none" };
  };
}

// assets/pets/blue-maid/manifest.json
var manifest_default = {
  schemaVersion: 1,
  id: "alpha:blue-maid",
  name: "\u84DD\u6BDB\u5C0F\u5973\u4EC6",
  version: "0521efa5-2",
  sourceUrl: "https://github.com/PC2005-cloud/dsh-pet",
  license: "\u7D20\u6750\u4EC5\u9650\u975E\u5546\u7528\uFF1B\u4ECB\u7ECD\u3001\u5C55\u793A\u3001\u5206\u53D1\u987B\u6807\u6CE8\u539F\u4F5C\u8005 GitHub \u5730\u5740\u3002",
  width: 640,
  height: 360,
  foot: 330,
  body: {
    left: 240,
    top: 80,
    right: 400,
    bottom: 330
  },
  clips: {
    idle: {
      file: "idle.webm",
      original: "\u5F85\u673A\u547C\u5438\u4F11\u95F2.webm",
      bytes: 441437,
      sha256: "deb965d05a85dacf5ff4a20faa757846f0d11679598c3ec578a5571487660395",
      hevc: {
        file: "idle.mov",
        bytes: 1809619,
        sha256: "7ebe0ef1eb9117358f253f090429cca9912b0d84cb91aecc6e58dde7180535eb"
      }
    },
    head: {
      file: "head.webm",
      original: "\u4E1C\u5F20\u897F\u671B.webm",
      bytes: 427005,
      sha256: "a20ed02ccc5e72075a3ca83fabb57d9aac5ded699f52d00ec6de72069799fcd5",
      hevc: {
        file: "head.mov",
        bytes: 1671352,
        sha256: "b567c1636b349bff2a8d0cfda6a86d4afb097f87c2dd0a2bf34b39e138fa1f16"
      }
    },
    walk: {
      file: "walk.webm",
      original: "\u8783\u87F9\u8D70\u8DEF.webm",
      bytes: 596902,
      sha256: "5696b0878be38cc450d6eaace837aef1c1b5834f1382bc6c11c2de582f284673",
      hevc: {
        file: "walk.mov",
        bytes: 1902426,
        sha256: "63b5e399e9341e20bf2251647c3b23bd9a79130256ede5c5c744ce76e4aa3321"
      }
    },
    drag: {
      file: "drag.webm",
      original: "\u88AB\u9F20\u6807\u62D6\u62FD\u60AC\u7A7A\u53CD\u9988.webm",
      bytes: 464764,
      sha256: "31373a86026636eecc890db763760309360310eb095cf5575b13c9ca2a6cc80e",
      hevc: {
        file: "drag.mov",
        bytes: 1808769,
        sha256: "f8d12d63f3eac70f121d7547efb7079ff7d493b78da63fedbbc2e4f6057e8f0f"
      }
    },
    click1: {
      file: "click1.webm",
      original: "\u70B9\u51FB\u56DE\u5E94-\u5143\u6C14\u6325\u624B.webm",
      bytes: 421669,
      sha256: "48cd729ccdcf746369942ea954d242e9afdd5643e1dac3827fa5e67450eb8776",
      hevc: {
        file: "click1.mov",
        bytes: 1610153,
        sha256: "2bb70dcf5b3ea92499635b676837d16a2b45c43f6c7dd7400fcf26ecf8384c7b"
      }
    },
    click2: {
      file: "click2.webm",
      original: "\u70B9\u51FB\u56DE\u5E94-\u5BB3\u7F9E\u60CA\u8BB6.webm",
      bytes: 538281,
      sha256: "a04968bbc46d1ebea07f81e5dabd93b0b67a9d07f1371e9887b33075134ad00d",
      hevc: {
        file: "click2.mov",
        bytes: 1876416,
        sha256: "75644bb8a22249f79ff654d5ced93b2a093a4e8dbfff49184c5e48e03e2d9a26"
      }
    },
    thinking: {
      file: "thinking.webm",
      original: "\u5DE5\u4F5C\u72B6\u6001-\u601D\u8003\u5192\u6CE1.webm",
      bytes: 408849,
      sha256: "b4a36cfa28ea5d7089e362a01972c6e880297c6dcd0d39f1994efd889a3c1be5",
      hevc: {
        file: "thinking.mov",
        bytes: 1696055,
        sha256: "da8b723f5f2302a5bb317f5d485517d2fa8ecbb6acf4902f620bfb587ecbc923"
      }
    },
    working: {
      file: "working.webm",
      original: "\u5DE5\u4F5C\u72B6\u6001-\u5FD9\u788C\u70B9\u6309.webm",
      bytes: 475613,
      sha256: "b5d702e0c04adb7b255ac702001c24da36c8bf95efc891f693f4976986ab2435",
      hevc: {
        file: "working.mov",
        bytes: 1822351,
        sha256: "921aa14a596e55becc11b1d271487c663737fd1c1b307d0b61b14c5f753a9134"
      }
    },
    waiting: {
      file: "waiting.webm",
      original: "\u5DE5\u4F5C\u72B6\u6001-\u539F\u5730\u8E31\u6B65\u5F20\u671B.webm",
      bytes: 471725,
      sha256: "a56c17ef901fa531324a46a04def2381f65922d319ec83dadde34d2a4669e411",
      hevc: {
        file: "waiting.mov",
        bytes: 1791845,
        sha256: "f14077825b907eefc1dc7c2de2002e83facccb74135fa5e6478443b65530d511"
      }
    },
    success: {
      file: "success.webm",
      original: "\u5DE5\u4F5C\u72B6\u6001-\u96C0\u8DC3\u5E86\u795D.webm",
      bytes: 488024,
      sha256: "3ff681051a0bb4f152d7535d64b7f3194c30298bf56d41e521216a278f135d3e",
      hevc: {
        file: "success.mov",
        bytes: 1679394,
        sha256: "de95a2f460de3ff90977307f33ed36ff354df0fdaf10873e6941de0ebe06055c"
      }
    },
    error: {
      file: "error.webm",
      original: "\u5DE5\u4F5C\u72B6\u6001-\u5782\u5934\u53F9\u6C14\u5192\u6C57.webm",
      bytes: 198937,
      sha256: "ab00c844e62221905574b4c070e0d7b6fa14fb2afa1064c27a160f10e25f7196",
      hevc: {
        file: "error.mov",
        bytes: 766792,
        sha256: "2178c92e2441ea305890334cc6adbf32802c8f18d66524ce9dcaebaa5cc8c23a"
      }
    }
  },
  derivatives: {
    format: "HEVC with Alpha / QuickTime",
    source: "The unchanged WebM clips in this manifest",
    encoder: "Apple AVAssetWriter AVVideoCodecType.hevcWithAlpha; BGRA decoded using FFmpeg libvpx-vp9",
    script: "scripts/transcode-pet-hevc.mjs",
    license: "Same attribution and noncommercial terms as the originals"
  }
};

// src/client/default-character.js
var DEFAULT_CHARACTER = { ...manifest_default, source: "animation", format: "alpha-video", human: false, rigged: false, boneCount: 0, bytes: Object.values(manifest_default.clips).reduce((sum, clip) => sum + clip.bytes + (clip.hevc?.bytes || 0), 0) };

// src/client/floating-avatar.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var DEFAULT = DEFAULT_CHARACTER;
var SETTINGS = "harness-docket:avatar-position:v1";
var rendererModule = null;
var renderer = () => rendererModule ??= import("/harness-docket/avatar-renderer.js?v=0.9.2").catch((e) => {
  rendererModule = null;
  throw e;
});
var keyOf = (item) => item.id + ":" + item.version;
var message = (error) => error instanceof Error ? error.message : String(error);
async function request(path, data) {
  const response = await fetch("/harness-docket/" + path, data ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw Object.assign(new Error(result.error || "\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u540E\u91CD\u8BD5"), { status: response.status });
  return result;
}
function ensureStyle() {
  ensureUIStyle();
  if (document.getElementById("harness-docket-avatar-style")) return;
  const sheet = document.createElement("style");
  sheet.id = "harness-docket-avatar-style";
  sheet.textContent = avatar_default;
  document.head.appendChild(sheet);
}
function AvatarCanvas(props) {
  const kind = props.item.format === "alpha-video" ? "alpha" : "model";
  const [front, setFront] = (0, import_react10.useState)(kind), lastReady = (0, import_react10.useRef)(props), current = (0, import_react10.useRef)(props.item);
  const committed = (0, import_react10.useRef)(false), readyCapabilities = (0, import_react10.useRef)(null);
  current.current = props.item;
  (0, import_react10.useEffect)(() => {
    if (committed.current && front === kind && keyOf(lastReady.current.item) === keyOf(props.item)) {
      props.onReady?.(props.item);
      if (readyCapabilities.current) props.onCapabilities?.(readyCapabilities.current);
      props.onMotionStatus?.("ready", props.motionRevision || 0);
    }
  }, [kind, props.item.id, props.item.version]);
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hda-canvas-stack", children: [.../* @__PURE__ */ new Set([front, kind])].map((slot) => {
    const candidate = slot === kind;
    const value = candidate ? { ...props, onReady: (item) => {
      if (keyOf(item) !== keyOf(current.current)) return;
      committed.current = true;
      lastReady.current = props;
      setFront(kind);
      props.onReady?.(item);
    }, onCapabilities: (value2) => {
      readyCapabilities.current = value2;
      props.onCapabilities?.(value2);
    } } : { ...lastReady.current, paused: true, onReady: void 0, onError: void 0, onMotionStatus: void 0, onTick: void 0, onLayout: void 0 };
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hda-render-slot", style: { visibility: slot === front ? "inherit" : "hidden" }, "aria-hidden": slot !== front, children: slot === "alpha" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(AlphaCharacter, { ...value }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ModelCanvas, { ...value }) }, slot);
  }) });
}
function ModelCanvas({ item, paused = false, action = "walk", bones = false, angle = 0, pace = 1, oneShot = false, motion = null, motionRevision = 0, expression = "", intensity = 0.8, onCapabilities, onMotionStatus, onTick, onReady, onError, onLayout, pocketOpen = false, pocketSide = 1, pocketSuspended = false, onPocket, gazeMode = "gentle", gazeEnabled = true, speaking = false }) {
  const host = (0, import_react10.useRef)(null), view = (0, import_react10.useRef)(null), callbacks = (0, import_react10.useRef)({ onReady, onError, onCapabilities, onMotionStatus, onTick, onLayout, onPocket });
  const canTick = (0, import_react10.useRef)(false);
  callbacks.current = { onReady, onError, onCapabilities, onMotionStatus, onTick, onLayout, onPocket };
  const [generation, setGeneration] = (0, import_react10.useState)(0), [status, setStatus] = (0, import_react10.useState)("loading"), [error, setError] = (0, import_react10.useState)("");
  (0, import_react10.useEffect)(() => {
    let cancelled2 = false;
    renderer().then((module2) => {
      if (cancelled2 || !host.current) return;
      view.current = module2.createAvatarView(host.current, { onPocket: (value) => callbacks.current.onPocket?.(value), onLayout: onLayout ? (value) => callbacks.current.onLayout?.(value) : void 0, onTick: (delta) => {
        if (canTick.current) callbacks.current.onTick?.(delta);
      }, onError: (text) => {
        setStatus("error");
        setError(text);
        callbacks.current.onError?.(text);
      } });
      setGeneration((n) => n + 1);
    }).catch((e) => {
      if (!cancelled2) {
        setStatus("error");
        setError("\u65E0\u6CD5\u52A0\u8F7D 3D\uFF0C\u5FEB\u6377\u529F\u80FD\u4ECD\u53EF\u4F7F\u7528");
        callbacks.current.onError?.(message(e));
      }
    });
    return () => {
      cancelled2 = true;
      view.current?.dispose();
      view.current = null;
    };
  }, []);
  (0, import_react10.useEffect)(() => {
    if (!view.current) return;
    const abort = new AbortController();
    canTick.current = false;
    setStatus("loading");
    setError("");
    view.current.load(item, abort.signal).then((ready) => {
      if (abort.signal.aborted || !ready) return;
      setStatus("ready");
      callbacks.current.onReady?.(item);
      callbacks.current.onCapabilities?.(view.current.capabilities());
    }).catch((e) => {
      if (!abort.signal.aborted) {
        setStatus("error");
        setError(message(e));
        callbacks.current.onError?.(message(e));
      }
    });
    return () => abort.abort();
  }, [generation, item.id, item.version]);
  (0, import_react10.useEffect)(() => {
    view.current?.setPaused(paused);
  }, [generation, paused]);
  (0, import_react10.useEffect)(() => {
    view.current?.setPocket(pocketOpen, pocketSide, pocketSuspended);
  }, [generation, status, pocketOpen, pocketSide, pocketSuspended]);
  (0, import_react10.useEffect)(() => {
    view.current?.setAnimation(action);
    view.current?.setSkeleton(bones);
    view.current?.setAngle(angle);
  }, [generation, action, bones, angle]);
  (0, import_react10.useEffect)(() => {
    if (!view.current || status !== "ready") return;
    let active2 = true;
    canTick.current = false;
    callbacks.current.onMotionStatus?.("loading", motionRevision);
    view.current.setMotion(motion, oneShot).then(() => {
      if (active2) {
        canTick.current = true;
        callbacks.current.onMotionStatus?.("ready", motionRevision);
      }
    }).catch((e) => {
      if (active2) callbacks.current.onMotionStatus?.(e.name === "AbortError" ? "\u52A8\u4F5C\u52A0\u8F7D\u5DF2\u53D6\u6D88\u6216\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5" : message(e), motionRevision);
    });
    return () => {
      active2 = false;
    };
  }, [generation, status, item.id, item.version, motion?.id, motion?.clip, oneShot, motionRevision]);
  (0, import_react10.useEffect)(() => {
    view.current?.setGaze(gazeMode, gazeEnabled);
    view.current?.setSpeaking(speaking);
  }, [generation, status, gazeMode, gazeEnabled, speaking]);
  (0, import_react10.useEffect)(() => {
    view.current?.setPace(pace);
  }, [generation, pace]);
  (0, import_react10.useEffect)(() => {
    view.current?.setExpression(expression, intensity);
  }, [generation, expression, intensity]);
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-canvas-wrap", "data-status": status, "data-motion-id": motion?.id || "", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hda-canvas", ref: host }),
    status !== "ready" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "hda-loading-dot", role: "status", "aria-label": status === "error" ? "\u89D2\u8272\u52A0\u8F7D\u5931\u8D25" : "\u89D2\u8272\u52A0\u8F7D\u4E2D" }),
    error && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "hda-sr", role: "status", children: error })
  ] });
}
function initialPosition() {
  try {
    const data = JSON.parse(localStorage.getItem(preferenceKey(SETTINGS)) || "null");
    if (data && [data.x, data.y, data.size].every(Number.isFinite)) return { x: Math.min(1, Math.max(0, data.x)), y: Math.min(1, Math.max(0, data.y)), size: Math.min(300, Math.max(120, data.size)) };
  } catch {
  }
  return { x: 0.94, y: 0.75, size: 210 };
}
function persist(position) {
  try {
    localStorage.setItem(preferenceKey(SETTINGS), JSON.stringify(position));
  } catch {
  }
}
function AvatarDock({ sessionId, isPinned, playerDisabled, playerTitle, onPlayer, onOpenLibrary, suspended }) {
  ensureStyle();
  const [catalog, setCatalog] = (0, import_react10.useState)(null), [failure, setFailure] = (0, import_react10.useState)("");
  const [companion, setCompanion] = (0, import_react10.useState)({ assets: [], profiles: {} });
  const reloadCompanion = (0, import_react10.useCallback)(async () => {
    setCompanion(await request("companion.json"));
  }, []);
  const [reaction, setReaction] = (0, import_react10.useState)(null), [walking, setWalking] = (0, import_react10.useState)(false), [heading, setHeading] = (0, import_react10.useState)(0), [hovered, setHovered] = (0, import_react10.useState)(false), [renderReady, setRenderReady] = (0, import_react10.useState)(false);
  const activity = (0, import_react10.useRef)(new ActivityClock()), reactionRef = (0, import_react10.useRef)(null);
  const [reactionRevision, setReactionRevision] = (0, import_react10.useState)(0), [reactionStarted, setReactionStarted] = (0, import_react10.useState)(false);
  const pickInteraction = (0, import_react10.useRef)(createInteractionPicker());
  const dailyPicker = (0, import_react10.useRef)(createDailyPicker()), dailySeconds = (0, import_react10.useRef)(0), workSeconds = (0, import_react10.useRef)(0);
  const reactionKind = (0, import_react10.useRef)("click"), work = useWorkStatus(sessionId), [finishedWork, setFinishedWork] = (0, import_react10.useState)("");
  const workKey = sessionId + ":" + work.revision, workState = finishedWork === workKey ? null : work.state;
  (0, import_react10.useEffect)(() => {
    workSeconds.current = 0;
  }, [workKey]);
  const [speaking, setSpeaking] = (0, import_react10.useState)(false);
  const [retry, setRetry] = (0, import_react10.useState)(0);
  const [expanded, setExpandedState] = (0, import_react10.useState)(false), [manager, setManager] = (0, import_react10.useState)(false), [covered, setCovered] = (0, import_react10.useState)(!!window.__HDK_STARTUP__?.active);
  const [position, setPosition] = (0, import_react10.useState)(initialPosition), [viewport, setViewport] = (0, import_react10.useState)({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
  const dock = (0, import_react10.useRef)(null), trigger = (0, import_react10.useRef)(null), menu = (0, import_react10.useRef)(null);
  const drag = (0, import_react10.useRef)(null), suppressClick = (0, import_react10.useRef)(false);
  const positionRef = (0, import_react10.useRef)(position);
  (0, import_react10.useEffect)(() => {
    positionRef.current = position;
  }, [position]);
  const [dragging, setDragging] = (0, import_react10.useState)(false), [measurement, setMeasurement] = (0, import_react10.useState)(null);
  const [touch, setTouch] = (0, import_react10.useState)(() => matchMedia("(pointer:coarse)").matches);
  const toggle = (0, import_react10.useRef)(null);
  (0, import_react10.useEffect)(() => {
    const media = matchMedia("(pointer:coarse)");
    const change = () => setTouch(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const selected = catalog?.items.find((i) => i.id === catalog.activeId) || DEFAULT;
  const profile = companion.profiles[selected.id] || defaultProfile(selected.human && selected.source !== "builtin" ? companion : void 0);
  const voice = useCompanionVoice(selected.id + ":" + sessionId, suspended || covered || dragging, setSpeaking);
  const alpha = selected.format === "alpha-video";
  const thought = companion.assets.find((asset) => asset.kind === "motion" && asset.key === "think");
  const workInteraction = profile.interactions.find((i) => i.id === profile.events?.[workState || ""] && i.enabled);
  const paused = suspended || manager || covered || dragging || expanded;
  const behavior = behaviorPriority({ paused, reaction: reaction && reactionKind.current === "click", work: workState, daily: reaction, walking });
  const height = Math.min(position.size, Math.max(64, viewport.height - 24)), width = height * (alpha ? 1 : 0.64) + 40;
  const maxX = Math.max(0, viewport.width - width - 16), maxY = Math.max(0, viewport.height - height - 16);
  const left = 8 + maxX * positionRef.current.x, top = 8 + maxY * positionRef.current.y;
  const measured = measurement?.id === selected.id && measurement?.version === selected.version ? measurement : null;
  const layout = useAttachedMenu(measured, width - 40, height, { x: left, y: top }, viewport, profile.attachedMenu, touch, false);
  const [pocketFrame, setPocketFrame] = (0, import_react10.useState)(null), pocketBusy = (0, import_react10.useRef)(false);
  pocketBusy.current = !!pocketFrame?.active;
  const setExpanded = (value) => {
    const next = typeof value === "function" ? value(expanded) : value;
    if (next && !expanded) setPocketFrame(null);
    setExpandedState(next);
  };
  const arcRef = (0, import_react10.useRef)(null), arcKey = [selected.id, width, height, viewport.width, viewport.height, left, top].join(":");
  const arcIdentity = (0, import_react10.useRef)(""), arcWasOpen = (0, import_react10.useRef)(false);
  if (!arcRef.current || arcIdentity.current !== arcKey || expanded && !arcWasOpen.current) {
    arcRef.current = pocketMenuLayout({ measurement: measured, width: width - 40, height, origin: { x: left, y: top }, viewport, touch, side: profile.attachedMenu?.side });
    arcIdentity.current = arcKey;
  }
  arcWasOpen.current = expanded;
  const arc = arcRef.current;
  (0, import_react10.useEffect)(() => {
    if (!expanded || !alpha && renderReady) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !renderReady) {
      setPocketFrame({ instant: true, time: 4 });
      return;
    }
    const start = performance.now(), palm = { x: arc.center.x + arc.side * height * 0.1, y: arc.center.y };
    let frame = 0, previous = 0;
    const tick = (now) => {
      frame = 0;
      if (document.hidden) {
        frame = 0;
        return;
      }
      if (now - start >= 1180 || now - previous >= 1e3 / 30) {
        previous = now;
        setPocketFrame({ active: true, time: Math.min(1.18, (now - start) / 1e3), palm, release: [palm, palm, palm] });
      }
      if (now - start < 1180) frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      if (!document.hidden && !frame) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resume);
      setPocketFrame(null);
    };
  }, [expanded, alpha, renderReady]);
  const bodyHit = (event) => !measured?.mask || overlapsMask(measured.mask, { x: event.clientX - (dock.current?.getBoundingClientRect().left || left), y: event.clientY - (dock.current?.getBoundingClientRect().top || top), width: 1, height: 1 }, 2);
  const load = (0, import_react10.useCallback)(async () => {
    const data = await request("avatars.json");
    setCatalog(data);
    setFailure("");
    return data;
  }, []);
  (0, import_react10.useEffect)(() => {
    const moving = (event) => {
      const start = drag.current;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < 6) return;
      start.moved = true;
      event.preventDefault();
      setDragging(true);
      setExpanded(false);
      const next = { ...positionRef.current, x: maxX ? Math.min(1, Math.max(0, (start.left + dx - 8) / maxX)) : 0, y: maxY ? Math.min(1, Math.max(0, (start.top + dy - 8) / maxY)) : 0 };
      positionRef.current = next;
      setPosition(next);
    };
    const finish = (event) => {
      const start = drag.current;
      if (!start || event.pointerId !== start.id) return;
      drag.current = null;
      setDragging(false);
      if (start.moved) {
        suppressClick.current = true;
        persist(positionRef.current);
      }
      if (trigger.current?.hasPointerCapture(event.pointerId)) trigger.current.releasePointerCapture(event.pointerId);
    };
    window.addEventListener("pointermove", moving, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    return () => {
      window.removeEventListener("pointermove", moving, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
    };
  }, [maxX, maxY]);
  (0, import_react10.useEffect)(() => {
    void load().catch((e) => setFailure(message(e)));
  }, [load]);
  (0, import_react10.useEffect)(() => {
    void reloadCompanion().catch((e) => setFailure(message(e)));
  }, [reloadCompanion]);
  (0, import_react10.useEffect)(() => {
    setRenderReady(false);
    setPocketFrame(null);
    setReaction(null);
    reactionRef.current = null;
    activity.current.cancel();
    dailyPicker.current = createDailyPicker();
    dailySeconds.current = 0;
  }, [selected.id]);
  (0, import_react10.useEffect)(() => {
    if (workState && reactionKind.current === "daily") {
      activity.current.cancel();
      reactionRef.current = null;
      setReaction(null);
    }
  }, [workKey]);
  (0, import_react10.useEffect)(() => {
    let frame = 0, last = 0, waitUntil = performance.now() + 1500;
    let target = { x: Math.random(), y: Math.random() };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      if (last && now - last < 32) return;
      const delta = last ? Math.min(0.08, (now - last) / 1e3) : 0;
      last = now;
      if (expanded || pocketBusy.current) return;
      if (!renderReady || !profile.roaming || reduced.matches || document.hidden || suspended || covered || manager || expanded || hovered || workState || trigger.current?.matches(":focus-visible") || drag.current || reactionRef.current !== null) {
        setWalking(false);
        return;
      }
      if (now < waitUntil) {
        setWalking(false);
        return;
      }
      const next = advanceRoam(positionRef.current, target, delta, profile.speed * height / 210, maxX, maxY);
      if (next.arrived) {
        setWalking(false);
        persist(positionRef.current);
        waitUntil = now + 1200 + Math.random() * 1800;
        target = { x: 0.05 + Math.random() * 0.9, y: 0.05 + Math.random() * 0.9 };
        return;
      }
      setWalking(true);
      setHeading(next.angle);
      const point = { ...positionRef.current, x: next.x, y: next.y };
      positionRef.current = point;
      if (dock.current) {
        dock.current.style.left = 8 + maxX * point.x + "px";
        dock.current.style.top = 8 + maxY * point.y + "px";
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [renderReady, profile.roaming, profile.speed, suspended, covered, manager, expanded, hovered, workState, maxX, maxY, height]);
  (0, import_react10.useEffect)(() => {
    setPosition(positionRef.current);
  }, [expanded, manager, hovered, suspended]);
  const interact = () => {
    setExpanded(false);
    if (reactionRef.current && reactionKind.current !== "daily" || !renderReady) return;
    const choices = interactionChoices(profile, defaultProfile().interactions);
    const next = pickInteraction.current(choices);
    if (!next) return;
    setExpanded(false);
    setWalking(false);
    setHeading(0);
    setReaction(next);
    reactionKind.current = "click";
    reactionRef.current = next;
    setReactionStarted(false);
    setReactionRevision(activity.current.begin(next.duration));
  };
  (0, import_react10.useEffect)(() => {
    const resize = () => setViewport({ left: window.visualViewport?.offsetLeft || 0, top: window.visualViewport?.offsetTop || 0, width: window.visualViewport?.width || window.innerWidth, height: window.visualViewport?.height || window.innerHeight });
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    const coverage = (event) => setCovered(Boolean(event.detail));
    window.addEventListener("harness-docket:playback", coverage);
    setCovered(Boolean(document.querySelector(".dba-root")));
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
      window.removeEventListener("harness-docket:playback", coverage);
    };
  }, []);
  (0, import_react10.useEffect)(() => {
    if (!expanded || manager || suspended) return;
    const outside = (event) => {
      if (event.target instanceof Node && !dock.current?.contains(event.target)) setExpanded(false);
    };
    const keyboard = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
        toggle.current?.focus();
      }
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", keyboard);
    };
  }, [expanded, manager, suspended]);
  const move = (x, y) => {
    const next = { ...position, x: maxX ? Math.min(1, Math.max(0, (x - 8) / maxX)) : 0, y: maxY ? Math.min(1, Math.max(0, (y - 8) / maxY)) : 0 };
    positionRef.current = next;
    setPosition(next);
    return next;
  };
  const closeManager = (0, import_react10.useCallback)(() => setManager(false), []);
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("nav", { ref: dock, className: "hda-dock dba-dock hdk-ui" + (expanded ? " dba-dock-open" : ""), "aria-label": "Harness- docket \u5FEB\u6377\u529F\u80FD", "data-interaction": reaction?.id || "", "data-activity": behavior, "data-renderer": alpha ? "alpha-video" : "3d", onPointerEnter: () => setHovered(true), onPointerLeave: () => setHovered(false), "data-menu-layout": JSON.stringify(layout), style: { left, top, width, height, visibility: covered || manager || suspended ? "hidden" : "visible" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "button",
        {
          ref: trigger,
          className: "hda-trigger dba-dock-toggle" + (dragging ? " hda-dragging" : ""),
          type: "button",
          "aria-label": "\u4E0E\u89D2\u8272\u4E92\u52A8",
          "aria-description": "\u70B9\u51FB\u4E92\u52A8\uFF0C\u62D6\u52A8\u79FB\u52A8\uFF1B\u53F3\u952E\u6216\u83DC\u5355\u952E\u6253\u5F00\u5FEB\u6377\u529F\u80FD",
          onContextMenu: (event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded(true);
          },
          onPointerDown: (event) => {
            if (event.button !== 0 || !event.isPrimary || expanded && !bodyHit(event)) return;
            suppressClick.current = false;
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: dock.current?.getBoundingClientRect().left ?? left, top: dock.current?.getBoundingClientRect().top ?? top, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          },
          onDragStart: (event) => event.preventDefault(),
          onClick: (event) => {
            if (expanded && event.detail !== 0 && !bodyHit(event)) return;
            if (suppressClick.current && event.detail !== 0) {
              suppressClick.current = false;
              return;
            }
            ;
            interact();
          },
          onKeyDown: (event) => {
            if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") {
              event.preventDefault();
              setExpanded(true);
              return;
            }
            ;
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const step = event.shiftKey ? 30 : 10;
            persist(move(left + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), top + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)));
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
            AvatarCanvas,
            {
              item: selected,
              gazeMode: profile.gaze,
              gazeEnabled: !workState && !dragging && !expanded,
              speaking,
              onLayout: setMeasurement,
              pocketOpen: expanded,
              pocketSide: arc.side,
              pocketSuspended: suspended || manager || covered || dragging,
              onPocket: setPocketFrame,
              motionRevision: reactionRevision,
              onTick: (delta) => {
                if (activity.current.advance(delta)) {
                  reactionRef.current = null;
                  setReaction(null);
                  setReactionStarted(false);
                }
                if (reactionRef.current) return;
                if (workState) {
                  if (["success", "error"].includes(workState)) {
                    workSeconds.current += delta;
                    if (workSeconds.current >= 4) setFinishedWork(workKey);
                  }
                  ;
                  return;
                }
                if (hovered || paused || !renderReady || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
                dailySeconds.current += delta;
                const next = dailyPicker.current(dailySeconds.current, profile);
                if (next) {
                  reactionKind.current = "daily";
                  reactionRef.current = next;
                  setReaction(next);
                  setWalking(false);
                  setReactionStarted(false);
                  setReactionRevision(activity.current.begin(next.duration));
                }
              },
              oneShot: !!reaction && (!alpha || reactionKind.current === "click"),
              pace: walking && !workState ? profile.speed / 32 : 1,
              action: alpha && dragging ? "drag" : reaction?.action || (workState ? alpha ? workState : workInteraction?.action || (workState === "thinking" ? "head" : workState === "success" ? "wave" : "idle") : walking ? "walk" : "idle"),
              angle: reaction || workState ? 0 : heading,
              motion: alpha ? null : reaction?.motion || (reaction ? null : workState ? workInteraction?.motion || (workState === "thinking" && selected.human && selected.source !== "builtin" && thought ? { id: thought.id, clip: 0 } : null) : walking ? profile.walk : profile.idle),
              expression: reaction?.expression || workInteraction?.expression || (workState === "success" ? "happy" : ""),
              intensity: reaction?.intensity ?? workInteraction?.intensity,
              paused,
              onReady: () => setRenderReady(true),
              onError: (text) => {
                setMeasurement(null);
                setFailure(text);
                setRenderReady(false);
                activity.current.cancel();
                reactionRef.current = null;
                setReaction(null);
              },
              onMotionStatus: (text, revision) => {
                if (revision !== activity.current.token || !reactionRef.current) {
                  if (!["ready", "loading"].includes(text)) setFailure(text);
                  return;
                }
                ;
                if (text === "ready") {
                  activity.current.ready(revision);
                  setReactionStarted(true);
                } else if (text !== "loading") {
                  setFailure(text);
                  activity.current.cancel();
                  reactionRef.current = null;
                  setReaction(null);
                }
              }
            },
            retry
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(MenuToggle, { layout, expanded, buttonRef: toggle, "aria-label": expanded ? "\u6536\u8D77\u5FEB\u6377\u529F\u80FD" : "\u5C55\u5F00\u5FEB\u6377\u529F\u80FD", "aria-controls": "hda-actions", onClick: () => setExpanded((value) => !value) }),
      reaction && reactionKind.current === "click" && reactionStarted && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hda-floating-reaction", hidden: expanded || manager || suspended, style: { animationPlayState: expanded || manager || suspended ? "paused" : "running" }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Sticker, { interaction: reaction }, reactionRevision) }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(PocketMenu, { expanded, layout: arc, frame: pocketFrame, menuRef: menu, children: [{ kind: "play", label: playerTitle, aria: "\u7247\u5934\u81EA\u52A8\u64AD\u653E\uFF1A" + (isPinned ? "\u5F00" : "\u5173"), className: "dba-player", disabled: playerDisabled, pressed: isPinned, run: onPlayer }, { kind: "film", label: "\u7247\u5E93", aria: "\u6253\u5F00\u7247\u5934\u7247\u5E93", className: "dba-lib-open", run: onOpenLibrary }, { kind: "person", label: "\u89D2\u8272", aria: "\u7BA1\u7406\u89D2\u8272\u6A21\u578B", className: "dba-dock-add", run: () => {
        setManager(true);
        void load().catch((e) => setFailure(message(e)));
      } }].map(
        (item) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("button", { role: "menuitem", className: item.className, "aria-label": item.aria, "aria-pressed": item.pressed, disabled: item.disabled, onClick: () => {
          setExpanded(false);
          item.run();
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "hda-pocket-token", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(UIIcon, { kind: item.kind }),
            item.kind === "play" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("i", { className: "hda-playback-mark", "aria-hidden": "true", children: isPinned ? "\u2713" : "\uFF0F" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "hda-pocket-label", children: item.label })
        ] }, item.kind)
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(LayoutDebug, { measurement: measured, layout })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(CompanionNotice, { suspended: suspended || manager || covered || dragging, settling: !!pocketFrame?.active, voice }, selected.id + ":" + sessionId),
    expanded && failure && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-menu-notice hdk-ui", role: "status", children: [
      failure,
      failure && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { onClick: () => {
        setRetry((value) => value + 1);
        void load().catch((e) => setFailure(message(e)));
      }, children: "\u91CD\u8BD5" })
    ] }),
    manager && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(AvatarManager, { voice, companion, reloadCompanion, catalog, reload: load, onClose: closeManager, position, onSize: (size) => {
      const next = { ...position, size };
      setPosition(next);
      persist(next);
    }, onReset: () => {
      const next = { x: 0.94, y: 0.75, size: 210 };
      setPosition(next);
      persist(next);
    } })
  ] });
}
function AvatarManager({ voice, companion, reloadCompanion, catalog, reload, onClose, position, onSize, onReset }) {
  const [previewId, setPreviewId] = (0, import_react10.useState)(catalog?.activeId || DEFAULT.id), [ready, setReady] = (0, import_react10.useState)(""), [error, setError] = (0, import_react10.useState)(""), [notice, setNotice] = (0, import_react10.useState)("");
  const [busy, setBusy] = (0, import_react10.useState)(false), [progress, setProgress] = (0, import_react10.useState)(null), [action, setAction] = (0, import_react10.useState)("walk"), [bones, setBones] = (0, import_react10.useState)(false), [angle, setAngle] = (0, import_react10.useState)(0), [confirmDelete, setConfirmDelete] = (0, import_react10.useState)(false);
  const [settingsDirty, setSettingsDirty] = (0, import_react10.useState)(false), [settingsBusy, setSettingsBusy] = (0, import_react10.useState)(false), [closing, setClosing] = (0, import_react10.useState)(false), [pendingModel, setPendingModel] = (0, import_react10.useState)("");
  const [tab, setTab] = (0, import_react10.useState)("model"), [motion, setMotion] = (0, import_react10.useState)(null), [previewInteraction, setPreviewInteraction] = (0, import_react10.useState)(null), [capabilities, setCapabilities] = (0, import_react10.useState)({ expressions: [], motion: false }), [motionStatus, setMotionStatus] = (0, import_react10.useState)("ready");
  const [motionRevision, setMotionRevision] = (0, import_react10.useState)(0), [menuDraft, setMenuDraft] = (0, import_react10.useState)(), [previewMeasurement, setPreviewMeasurement] = (0, import_react10.useState)(null);
  const previewClock = (0, import_react10.useRef)(new ActivityClock());
  const preview = (value, binding, interaction, seconds) => {
    const revision = previewClock.current.begin(seconds || interaction?.duration || Infinity);
    setAction(value);
    setMotion(binding);
    setMotionRevision(revision);
    setPreviewInteraction(interaction || null);
    setMotionStatus(binding ? "loading" : "ready");
  };
  const dirtyRef = (0, import_react10.useRef)(false);
  dirtyRef.current = settingsDirty;
  const askClose = (0, import_react10.useCallback)(() => {
    if (dirtyRef.current) setClosing(true);
    else onClose();
  }, [onClose]);
  const dialog = (0, import_react10.useRef)(null), input = (0, import_react10.useRef)(null), xhr = (0, import_react10.useRef)(null), lock = (0, import_react10.useRef)(false), mounted = (0, import_react10.useRef)(true);
  const items = catalog?.items || [DEFAULT], item = items.find((i) => i.id === previewId) || items[0];
  const previewMenu = useAttachedMenu(previewMeasurement?.id === item.id ? previewMeasurement : null, previewMeasurement?.cssWidth || 220, previewMeasurement?.cssHeight || 300, { x: 0, y: 0 }, { left: -100, top: -100, width: (previewMeasurement?.cssWidth || 220) + 200, height: (previewMeasurement?.cssHeight || 300) + 200 }, menuDraft, false, false);
  const [modelName, setModelName] = (0, import_react10.useState)(item.name);
  (0, import_react10.useEffect)(() => {
    setModelName(item.name);
  }, [item.id, item.name]);
  useDialogFocus(dialog, askClose);
  useTransientNotice(notice, () => setNotice(""));
  (0, import_react10.useEffect)(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      xhr.current?.abort();
    };
  }, []);
  const perform = async (fn) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      if (mounted.current) setError(message(e));
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };
  const choose = (id, discard = false) => {
    if (id === item.id) return;
    previewClock.current.cancel();
    if (!discard && settingsDirty && id !== item.id) {
      setPendingModel(id);
      return;
    }
    ;
    if (id !== item.id) setReady("");
    setPreviewId(id);
    setTab("model");
    setError("");
    setNotice("");
    setAction("walk");
    setMotion(null);
    setPreviewInteraction(null);
    setCapabilities({ expressions: [], motion: false });
    setBones(false);
    setAngle(0);
    setConfirmDelete(false);
  };
  const upload = (file) => perform(async () => {
    if (!/\.(vrm|glb)$/i.test(file.name)) throw new Error("\u8BF7\u9009\u62E9 VRM \u6216 GLB \u6A21\u578B");
    if (!file.size || file.size > 50 * 1024 * 1024) throw new Error("\u6A21\u578B\u5E94\u5927\u4E8E 0 \u5B57\u8282\u4E14\u4E0D\u8D85\u8FC7 50 MB");
    setProgress(0);
    const result = await new Promise((resolve, reject) => {
      const request2 = new XMLHttpRequest();
      xhr.current = request2;
      request2.open("POST", "/harness-docket/avatars/upload?filename=" + encodeURIComponent(file.name));
      request2.setRequestHeader("content-type", "model/gltf-binary");
      request2.timeout = 12e4;
      request2.upload.onprogress = (event) => {
        if (event.lengthComputable && mounted.current) setProgress(Math.round(event.loaded / event.total * 100));
      };
      request2.onload = () => {
        try {
          const data = JSON.parse(request2.responseText);
          if (request2.status < 200 || request2.status >= 300 || !data.ok) reject(new Error(data.error || "\u4E0A\u4F20\u5931\u8D25"));
          else resolve(data);
        } catch {
          reject(new Error("\u4E0A\u4F20\u54CD\u5E94\u65E0\u6548"));
        }
      };
      request2.onerror = () => reject(new Error("\u4E0A\u4F20\u4E2D\u65AD\uFF0C\u8BF7\u68C0\u67E5\u8FDE\u63A5"));
      request2.onabort = () => reject(new Error("\u5DF2\u53D6\u6D88\u4E0A\u4F20"));
      request2.ontimeout = () => reject(new Error("\u4E0A\u4F20\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5"));
      request2.send(file);
    });
    xhr.current = null;
    await reload();
    if (mounted.current) {
      choose(result.item.id);
      setNotice("\u5DF2\u4E0A\u4F20\u3002\u8BF7\u68C0\u67E5\u52A8\u4F5C\uFF0C\u518D\u70B9\u51FB\u201C\u4F7F\u7528\u6B64\u89D2\u8272\u201D\u3002");
    }
  });
  const use = () => perform(async () => {
    if (ready !== keyOf(item)) throw new Error("\u8BF7\u7B49\u5F85\u6A21\u578B\u9884\u89C8\u52A0\u8F7D\u5B8C\u6210");
    await request("avatars/select", { id: item.id, version: item.version });
    await reload();
    setNotice("\u5DF2\u66F4\u6362\u4E3A\u300C" + item.name + "\u300D");
  });
  const remove = () => perform(async () => {
    await request("avatars/delete", { id: item.id });
    const next = await reload();
    choose(next.activeId);
    setNotice("\u5DF2\u5220\u9664\u4E0A\u4F20\u7684\u89D2\u8272");
  });
  const restoreDefault = () => perform(async () => {
    if (!items.some((model) => model.id === DEFAULT.id)) {
      await request("avatars/restore-animation", {});
      await reload();
    }
    choose(DEFAULT.id);
  });
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hda-veil hdk-ui", onPointerDown: (event) => {
    if (event.target === event.currentTarget) askClose();
  }, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-dialog", ref: dialog, role: "dialog", "aria-modal": "true", "aria-labelledby": "hda-title", tabIndex: -1, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("header", { className: "hda-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h2", { id: "hda-title", children: "\u89D2\u8272\u7BA1\u7406" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "hdk-identity", children: "Harness- docket \xB7 \u63D2\u4EF6" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "hda-icon-button", onClick: askClose, "aria-label": "\u5173\u95ED\u89D2\u8272\u7BA1\u7406", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(UIIcon, { kind: "close" }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hda-navigation", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hda-tabs", onKeyDown: tabKeys, role: "tablist", "aria-label": "\u4F19\u4F34\u8BBE\u7F6E", children: [["model", "\u89D2\u8272"], ...item.format === "alpha-video" ? [] : [["motion", "\u52A8\u4F5C\u5E93"]], ["interaction", "\u4E92\u52A8"]].map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { role: "tab", id: "hda-tab-" + value, "aria-controls": "hda-settings-panel", tabIndex: tab === value ? 0 : -1, "aria-selected": tab === value, onClick: () => {
      setTab(value);
      setPreviewInteraction(null);
    }, children: label }, value)) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-body", id: "hda-settings-panel", role: "tabpanel", "aria-labelledby": "hda-tab-" + tab, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "hda-stage", "data-tab": tab, "aria-label": "\u89D2\u8272\u9884\u89C8", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-stage-label", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "hda-dot" }),
          item.format === "alpha-video" ? "\u900F\u660E\u52A8\u753B" : item.format,
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: item.source === "local" ? "\u672C\u5730\u6A21\u578B" : item.source === "uploaded" ? "\u5DF2\u4E0A\u4F20" : "\u5185\u7F6E\u89D2\u8272" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-preview", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(AvatarCanvas, { item, gazeMode: companion.profiles[item.id]?.gaze, onLayout: setPreviewMeasurement, action, oneShot: !!previewInteraction, motion, motionRevision, expression: previewInteraction?.expression || "", intensity: previewInteraction?.intensity, onCapabilities: setCapabilities, onTick: (delta) => {
            if (previewClock.current.advance(delta)) {
              setPreviewInteraction(null);
              setMotion(null);
              setAction("idle");
            }
          }, onMotionStatus: (text, revision) => {
            setMotionStatus(text);
            if (text === "ready") previewClock.current.ready(revision);
            else if (text !== "loading") previewClock.current.cancel();
          }, bones, angle, onReady: (loaded) => {
            setReady(keyOf(loaded));
            setError("");
          }, onError: (text) => {
            setReady("");
            setError(text);
          } }),
          tab === "model" && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "hda-menu-preview", "data-menu-layout": JSON.stringify(previewMenu), children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(MenuToggle, { layout: previewMenu, "aria-label": "\u8D34\u8EAB\u5165\u53E3\u9884\u89C8", tabIndex: -1, disabled: true }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(LayoutDebug, { measurement: previewMeasurement, layout: previewMenu })
          ] }),
          previewInteraction && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hda-preview-reaction", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Sticker, { interaction: previewInteraction }, JSON.stringify(previewInteraction)) })
        ] }, "preview"),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-stage-caption", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("strong", { children: item.name }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: item.format === "alpha-video" ? "\u900F\u660E\u52A8\u753B \xB7 \u70B9\u51FB\u56DE\u5E94" : item.human ? "\u6807\u51C6\u4EBA\u5F62 \xB7 \u53EF\u68C0\u67E5\u9AA8\u9ABC\u52A8\u4F5C" : item.animations ? "\u64AD\u653E\u6A21\u578B\u81EA\u5E26\u52A8\u753B" : "\u9759\u6001\u89D2\u8272" })
        ] }),
        item.format === "alpha-video" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hda-inspection", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { children: [
          "\u9884\u89C8\u52A8\u4F5C",
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("select", { "aria-label": "\u900F\u660E\u89D2\u8272\u9884\u89C8\u52A8\u4F5C", value: action, onChange: (e) => preview(e.target.value, null), children: Object.entries(item.clips || {}).map(([key, clip]) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: key, children: clip.original.replace(".webm", "") }, key)) })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-inspection", hidden: item.format === "alpha-video", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(MotionInspector, { data: companion, basicEnabled: item.human, enabled: capabilities.motion, ready: ready === keyOf(item), action, status: motionStatus, renderer, preview: (a, b, seconds) => preview(a, b, void 0, seconds) }, item.id),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "hda-checkbox", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "checkbox", checked: bones, onChange: (e) => setBones(e.target.checked), disabled: !item.rigged }),
            "\u663E\u793A\u9AA8\u67B6"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: "hda-angle", children: [
            "\u67E5\u770B\u89D2\u5EA6",
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "range", "aria-label": "\u9884\u89C8\u65CB\u8F6C\u89D2\u5EA6", min: "-180", max: "180", value: Math.round(angle * 180 / Math.PI), onChange: (e) => setAngle(Number(e.target.value) * Math.PI / 180) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-editor-column", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "hda-picker", "aria-label": "\u89D2\u8272\u5217\u8868", hidden: tab !== "model", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "hda-help hda-main-chat-guide", children: "\u76F4\u63A5\u5728 Harness \u4E3B\u8F93\u5165\u6846\u63D0\u95EE\u3001\u7EE7\u7EED\u4EFB\u52A1\u3002\u4EBA\u7269\u4F1A\u968F\u5F53\u524D\u4F1A\u8BDD\u72B6\u6001\u4F5C\u51FA\u53CD\u9988\uFF1B\u70B9\u51FB\u4EBA\u7269\u53EF\u4E92\u52A8\u3002" }),
          tab === "model" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(CompanionVoiceSettings, { voice }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-section-title", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("h3", { children: [
              "\u89D2\u8272\u6536\u85CF ",
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: items.length })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "hda-small-button", disabled: busy, onClick: () => void perform(async () => {
              await reload();
              setNotice("\u89D2\u8272\u5217\u8868\u5DF2\u5237\u65B0");
            }), "aria-label": "\u5237\u65B0\u89D2\u8272\u5217\u8868", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(UIIcon, { kind: "reset" }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hda-model-list", children: items.map((model) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("button", { className: "hda-model" + (model.id === item.id ? " hda-selected" : ""), disabled: busy, "aria-label": "\u9884\u89C8\u89D2\u8272 " + model.name, "aria-pressed": model.id === item.id, onClick: () => choose(model.id), children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "hda-model-icon", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(UIIcon, { kind: "person" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "hda-model-text", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("strong", { title: model.name, children: model.name }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("small", { children: [
                model.format === "alpha-video" ? "\u900F\u660E\u52A8\u753B" : model.format,
                model.bytes ? " \xB7 " + (model.bytes / 1024 / 1024).toFixed(1) + " MB" : " \xB7 \u968F\u65F6\u53EF\u7528"
              ] })
            ] }),
            catalog?.activeId === model.id && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "hda-current", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(UIIcon, { kind: "check" }),
              "\u4F7F\u7528\u4E2D"
            ] })
          ] }, model.id)) }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { hidden: true, ref: input, type: "file", accept: ".vrm,.glb", onChange: (e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) void upload(file);
          } }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("button", { className: "hda-upload", onClick: () => input.current?.click(), disabled: busy, children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(UIIcon, { kind: "upload" }),
            "\u4E0A\u4F20\u4F60\u7684\u6A21\u578B"
          ] }),
          !items.some((i) => i.format === "alpha-video") && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "hda-text-button", disabled: busy, onClick: () => void perform(async () => {
            await request("avatars/restore-animation", {});
            await reload();
            setNotice("\u900F\u660E\u52A8\u753B\u89D2\u8272\u5DF2\u52A0\u5165\u5217\u8868\uFF0C\u8BF7\u5148\u9884\u89C8\u3002");
          }), children: "\u6DFB\u52A0 dsh-pet \u900F\u660E\u89D2\u8272" }),
          item.sourceUrl && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "hda-help", children: [
            "\u7D20\u6750\u6765\u81EA ",
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("a", { href: item.sourceUrl, target: "_blank", rel: "noreferrer", children: "PC2005-cloud/dsh-pet" }),
            " \xB7 \u4EC5\u9650\u975E\u5546\u7528"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "hda-help", children: [
            "VRM 0.x / 1.0\u3001GLB \xB7 \u6700\u5927 50 MB",
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("br", {}),
            "\u6A21\u578B\u4E0E\u7EB9\u7406\u9700\u5305\u542B\u5728\u540C\u4E00\u4E2A\u6587\u4EF6\u4E2D\u3002"
          ] }),
          progress !== null && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-progress", role: "status", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("progress", { "aria-label": "\u6A21\u578B\u4E0A\u4F20\u8FDB\u5EA6", max: "100", value: progress }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: progress < 100 ? "\u4E0A\u4F20\u4E2D " + progress + "%" : "\u6B63\u5728\u6821\u9A8C\u9AA8\u67B6\u4E0E\u8499\u76AE\u2026" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { onClick: () => xhr.current?.abort(), children: "\u53D6\u6D88" })
          ] }),
          item.source !== "builtin" && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("form", { className: "hda-rename", onSubmit: (e) => {
            e.preventDefault();
            void perform(async () => {
              await request("avatars/rename", { id: item.id, name: modelName });
              await reload();
              setNotice("\u89D2\u8272\u540D\u79F0\u5DF2\u66F4\u65B0\uFF0C\u52A8\u4F5C\u548C\u4E92\u52A8\u8BBE\u7F6E\u4FDD\u7559\u3002");
            });
          }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { htmlFor: "hda-model-name", children: "\u89D2\u8272\u540D\u79F0" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-inline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { id: "hda-model-name", "aria-label": "\u89D2\u8272\u540D\u79F0", maxLength: 100, value: modelName, disabled: busy, onChange: (e) => setModelName(e.target.value) }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "hda-secondary", disabled: busy || !modelName.trim() || modelName.trim() === item.name, children: "\u4FDD\u5B58\u540D\u79F0" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-settings", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { children: [
              "\u60AC\u6D6E\u5927\u5C0F ",
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
                position.size,
                "px"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "range", "aria-label": "\u60AC\u6D6E\u89D2\u8272\u5927\u5C0F", min: "120", max: "300", step: "10", value: position.size, onChange: (e) => onSize(Number(e.target.value)) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("button", { className: "hda-text-button", onClick: onReset, children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(UIIcon, { kind: "move" }),
              "\u91CD\u7F6E\u5927\u5C0F\u4E0E\u4F4D\u7F6E"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-details", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: ready === keyOf(item) ? "\u2713 \u9884\u89C8\u52A0\u8F7D\u5B8C\u6210" : "\u6B63\u5728\u51C6\u5907\u9884\u89C8" }),
            item.boneCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
              item.boneCount,
              " \u4E2A\u4EBA\u5F62\u9AA8\u9ABC \xB7 \u7ED3\u6784\u6821\u9A8C\u901A\u8FC7"
            ] }),
            item.author && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
              "\u4F5C\u8005\uFF1A",
              item.author
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { children: "\u8BF7\u5207\u6362\u68C0\u67E5\u52A8\u4F5C\uFF0C\u786E\u8BA4\u5173\u8282\u53D8\u5F62\u81EA\u7136\u540E\u518D\u4F7F\u7528\u3002" })
          ] }),
          catalog?.errors.map((failure, index) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("p", { className: "hda-error", children: [
            failure.name,
            "\uFF1A",
            failure.error
          ] }, index))
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(CompanionControls, { tab, id: item.id, data: companion, initial: companion.profiles[item.id] || defaultProfile(item.human && item.source !== "builtin" ? companion : void 0), reload: reloadCompanion, request, renderer, capabilities, onPreview: preview, motionStatus, onMenuDraft: setMenuDraft, onEditState: (dirty, busy2) => {
          setSettingsDirty(dirty);
          setSettingsBusy(busy2);
        } }, item.id + ":" + item.version)
      ] })
    ] }),
    pendingModel && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-unsaved", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u5207\u6362\u89D2\u8272\u4F1A\u653E\u5F03\u5F53\u524D\u672A\u4FDD\u5B58\u7684\u8BBE\u7F6E\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "hda-secondary", onClick: () => setPendingModel(""), children: "\u7EE7\u7EED\u7F16\u8F91" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "hda-danger", onClick: () => {
        choose(pendingModel, true);
        setPendingModel("");
      }, children: "\u653E\u5F03\u4FEE\u6539\u5E76\u5207\u6362" })
    ] }),
    closing && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-unsaved", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u89D2\u8272\u8BBE\u7F6E\u5C1A\u672A\u4FDD\u5B58\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "hda-secondary", onClick: () => setClosing(false), children: "\u7EE7\u7EED\u7F16\u8F91" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "hda-danger", onClick: onClose, children: "\u653E\u5F03\u4FEE\u6539\u5E76\u5173\u95ED" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("footer", { className: "hda-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "hda-feedback", role: "status", children: error ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "hda-error", children: error }) : notice || (tab === "model" ? "\u9009\u62E9\u89D2\u8272\u9884\u89C8\uFF0C\u70B9\u51FB\u201C\u4F7F\u7528\u6B64\u89D2\u8272\u201D\u5E94\u7528\u3002" : settingsDirty ? "\u6709\u672A\u4FDD\u5B58\u7684\u8BBE\u7F6E" : "\u8BBE\u7F6E\u4FDD\u5B58\u540E\u751F\u6548\u3002") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "hda-footer-actions", hidden: tab !== "model", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "hda-secondary", disabled: busy, onClick: () => void restoreDefault(), children: "\u6062\u590D\u9ED8\u8BA4\u89D2\u8272" }),
        ["uploaded", "animation"].includes(item.source) && (confirmDelete ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "hda-danger", disabled: busy, onClick: () => void remove(), children: "\u786E\u8BA4\u5220\u9664" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("button", { className: "hda-danger", disabled: busy, onClick: () => setConfirmDelete(true), children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(UIIcon, { kind: "trash" }),
          "\u5220\u9664"
        ] })),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("button", { className: settingsDirty ? "hda-secondary" : "hda-primary", disabled: busy || ready !== keyOf(item) || catalog?.activeId === item.id, onClick: () => void use(), children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(UIIcon, { kind: "check" }),
          catalog?.activeId === item.id ? "\u6B63\u5728\u4F7F\u7528" : "\u4F7F\u7528\u6B64\u89D2\u8272"
        ] })
      ] }),
      (tab !== "model" || settingsDirty) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "submit", form: "hda-companion-settings", className: "hda-primary", disabled: !settingsDirty || settingsBusy, children: settingsBusy ? "\u6B63\u5728\u4FDD\u5B58\u2026" : tab === "model" ? "\u4FDD\u5B58\u8D34\u8EAB\u83DC\u5355\u8BBE\u7F6E" : "\u4FDD\u5B58\u52A8\u4F5C\u4E0E\u4E92\u52A8\u8BBE\u7F6E" })
    ] })
  ] }) });
}

// src/client/single-companion.ts
var import_react11 = require("react");
function useSingleCompanion() {
  const [owned, setOwned] = (0, import_react11.useState)(false);
  (0, import_react11.useEffect)(() => {
    const scope = window;
    const registry = scope[Symbol.for("harness-docket:single-companion")] ||= /* @__PURE__ */ new Map();
    const token = {}, notify2 = () => {
      const first = registry.keys().next().value;
      registry.forEach((update, key) => update(key === first));
    };
    registry.set(token, setOwned);
    notify2();
    return () => {
      registry.delete(token);
      notify2();
    };
  }, []);
  return owned;
}

// src/client/index.ts
var import_react12 = require("react");
var inject = ["slots", "uiSession"];
var LIST_URL = "/harness-docket/videos.json";
var SELECT_URL = "/harness-docket/select";
var UPLOAD_URL = "/harness-docket/upload";
var TRASH_URL = "/harness-docket/trash.json";
var DELETE_URL = "/harness-docket/delete";
var RESTORE_URL = "/harness-docket/restore";
var SEEN_KEY = "dsh-boot-animation:seen";
var FIT_KEY = "dsh-boot-animation:fit";
var STALL_TIMEOUT_MS = 25e3;
function readFit() {
  try {
    return readPreference(FIT_KEY) === "contain" ? "contain" : "cover";
  } catch {
    return "cover";
  }
}
function writeFit(fit) {
  try {
    writePreference(FIT_KEY, fit);
  } catch {
  }
}
var DEBUG = false;
function formatArgs(args) {
  return args.map((a) => {
    if (typeof a === "object" && a !== null) {
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    }
    return String(a);
  }).join(" ");
}
var diagnosticLines = 0;
function narrate(text) {
  if (diagnosticLines >= 20) return;
  diagnosticLines++;
  try {
    console.log("[Harness- docket] " + text.slice(0, 2048));
  } catch {
  }
}
function log(...args) {
  if (!DEBUG) return;
  narrate(formatArgs(args));
}
function notify(...args) {
  narrate(formatArgs(args));
}
function readSeen() {
  try {
    const parsed = JSON.parse(readPreference(SEEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
function hasPlayed(sessionId) {
  return readSeen().includes(sessionId);
}
function markPlayed(sessionId) {
  try {
    const seen = readSeen();
    if (!seen.includes(sessionId)) seen.push(sessionId);
    writePreference(SEEN_KEY, JSON.stringify(seen));
  } catch {
  }
}
var STYLE_ID = "harness-docket-style";
var CSS = `
.dba-root{position:fixed;inset:0;z-index:2147483000;background:#000;
  display:flex;align-items:center;justify-content:center;
  pointer-events:auto;cursor:default;overflow:hidden;user-select:none}
.dba-video{width:100%;height:100%;object-fit:contain;background:#000;display:block;pointer-events:none}
.dba-video::-webkit-media-controls{display:none!important}
/* The ONLY difference between the fit modes is object-fit.
   Do not "harden" this with position/inset changes: the bar fix does not need
   them, and an overlay that rendered correctly under flex + percentage sizing
   went fully black in the real app the one time the layout mechanics were
   rewritten for no reason. Minimal change, or you trade a cosmetic defect for
   a functional one.
   NOTE: never put a backtick in this block \u2014 the whole sheet is a template
   literal, and one backtick ends it. scripts/check-css-template.mjs enforces it. */
.dba-video.dba-cover{object-fit:cover;object-position:center}
.dba-skip{position:absolute;top:20px;right:22px;z-index:2;
  border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.55);
  color:#fff;border-radius:8px;padding:8px 18px;min-height:40px;
  font:inherit;font-size:13px;line-height:1.4;cursor:pointer}
.dba-skip:hover{background:rgba(0,0,0,.8)}
.dba-skip:focus-visible{outline:2px solid #fff;outline-offset:3px}
.dba-veil{position:fixed;inset:0;z-index:2147483200;background:var(--hdk-mask);
  display:flex;align-items:center;justify-content:center;padding:24px}
.dba-lib{--dba-muted:var(--hdk-muted);--dba-line:var(--hdk-line);--dba-accent:var(--hdk-accent);
  box-sizing:border-box;width:min(960px,100%);max-height:calc(100dvh - 48px);display:flex;flex-direction:column;
  overflow:hidden;background:var(--hdk-surface);color:var(--hdk-text);border:1px solid var(--hdk-line);
  border-radius:var(--hdk-panel-radius);box-shadow:var(--hdk-shadow);font-family:inherit;font-size:13px;line-height:1.55}
.dba-lib *{box-sizing:border-box}
.dba-lib p{margin:0;color:var(--dba-muted);font-size:12px}
.dba-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:20px 24px 16px;flex-shrink:0}
.dba-lib h3{margin:0 0 6px;font-size:16px;font-weight:600;letter-spacing:-.04em;line-height:1.3}
.dba-btn:disabled,.dba-choice:disabled{opacity:.45;cursor:not-allowed}
.dba-icon{width:16px;height:16px;flex-shrink:0}
.dba-toolbar{display:flex;gap:16px;align-items:center;margin:0 24px;min-height:48px;border-bottom:1px solid var(--dba-line);flex-shrink:0}
.dba-tabs{display:flex;gap:24px;align-self:stretch;flex:1}
.dba-count{font-size:12px;font-variant-numeric:tabular-nums;padding:1px 6px;border-radius:5px;background:var(--hdk-line);color:var(--hdk-muted)}
.dba-upload{margin-bottom:8px}
.dba-content{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--hdk-line) transparent;padding:16px 24px 24px}
.dba-section-note{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;color:var(--dba-muted);font-size:12px}
.dba-section-note strong{font-weight:500;color:var(--hdk-muted)}
.dba-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.dba-item{min-width:0;position:relative;border:1px solid var(--dba-line);border-radius:var(--hdk-radius);background:var(--hdk-surface);transition:border-color .15s,background .15s}
.dba-item:hover{border-color:var(--hdk-line);background:var(--hdk-hover)}
.dba-item.dba-cur{border-color:var(--hdk-accent);background:var(--hdk-selected);box-shadow:none}
.dba-choice{width:100%;min-width:0;display:flex;flex-direction:column;background:transparent;
  border:0;border-radius:11px;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:0;overflow:hidden}
.dba-thumb{display:block;position:relative;width:100%;aspect-ratio:16/9;background:var(--hdk-subtle);overflow:hidden}
.dba-thumb video{display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;opacity:0;transition:opacity .2s}
.dba-thumb.dba-thumb-ready video{opacity:1}
.dba-thumb-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:var(--hdk-muted);font-size:12px}
.dba-thumb-fallback .dba-icon{width:26px;height:26px}
.dba-duration{position:absolute;right:9px;bottom:9px;padding:2px 6px;border-radius:4px;background:#080b12cc;color:#fff;
  font-size:12px;line-height:1.5;font-variant-numeric:tabular-nums}
.dba-selected{position:absolute;top:10px;left:10px;display:flex;align-items:center;gap:4px;
  padding:3px 7px;border:1px solid var(--hdk-line);border-radius:5px;background:var(--hdk-surface);color:var(--hdk-text);font-size:12px;pointer-events:none}
.dba-selected .dba-icon{width:12px;height:12px}
.dba-details{min-width:0;display:flex;flex-direction:column;gap:5px}
.dba-choice .dba-details{width:100%;padding:12px 48px 12px 12px}
.dba-nm{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500}
.dba-details small{color:var(--dba-muted);font-size:12px;line-height:1.5}
.dba-btn.dba-delete{position:absolute;right:8px;bottom:12px}

.dba-b-warn{display:block;padding:0 13px 10px;color:var(--hdk-warning);font-size:12px}
.dba-item:has(.dba-b-warn) .dba-delete{bottom:42px}
.dba-footer{flex-shrink:0;background:var(--hdk-surface);border-top:1px solid var(--dba-line);padding:16px 24px}
.dba-current{display:flex;align-items:center;gap:9px;min-width:0;flex:1}
.dba-current>.dba-icon{color:var(--dba-accent);width:20px;height:20px}
.dba-current .dba-details{gap:2px;flex:1}
.dba-current .dba-details small{font-size:12px}
.dba-bar{display:flex;align-items:center;gap:16px}
.dba-btn.dba-btn-preview{flex-shrink:0}
.dba-settings{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;padding-top:16px;margin-top:16px;border-top:1px solid var(--dba-line)}
.dba-fit{display:flex;flex-wrap:wrap;align-items:center;gap:12px;color:var(--dba-muted);font-size:12px}
.dba-fit-options{display:flex;gap:2px;border:1px solid var(--dba-line);padding:3px;border-radius:8px;background:var(--hdk-subtle)}
.dba-msg{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--dba-muted);overflow-wrap:anywhere}
.dba-msg{min-height:24px;margin-top:8px}.dba-msg:not(:empty){padding-top:0}
.dba-msg .dba-btn{flex-shrink:0;min-height:28px;font-size:12px;padding:5px 9px}
.dba-msg.dba-ok{color:var(--hdk-success)}.dba-msg.dba-err{color:var(--hdk-danger)}
.dba-progress{display:flex;gap:12px;align-items:center;padding:12px 24px 0;font-size:12px;color:var(--dba-accent)}
.dba-progress progress{flex:1;min-width:0;height:5px;accent-color:var(--hdk-accent)}
.dba-trash-note{display:flex;align-items:flex-start;gap:10px;padding:0 0 12px;border:0;border-radius:0;margin-bottom:16px;color:var(--dba-muted)}
.dba-trash-note>.dba-icon{margin-top:2px;color:var(--dba-accent)}
.dba-trash-list{display:flex;flex-direction:column;gap:8px}
.dba-trash-item{display:flex;align-items:center;gap:14px;padding:14px}
.dba-trash-item>.dba-icon{width:22px;height:22px;color:var(--hdk-muted)}
.dba-trash-item .dba-details{flex:1}.dba-trash-item small{overflow-wrap:anywhere}
.dba-empty{grid-column:1/-1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;
  min-height:180px;padding:25px;text-align:center;color:var(--dba-muted);font-size:12px}
.dba-empty>.dba-icon{width:32px;height:32px;color:var(--hdk-muted)}
.dba-empty strong{font-size:14px;font-weight:500;color:var(--hdk-text)}
@media(max-width:760px){.dba-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dba-section-note{align-items:flex-start;flex-direction:column;gap:4px}}
@media(max-width:520px){.dba-veil{padding:10px}.dba-lib{max-height:calc(100dvh - 20px);border-radius:var(--hdk-panel-radius)}
.dba-header{padding:20px 18px 14px;gap:10px}.dba-lib h3{font-size:16px}.dba-header p{font-size:12px;max-width:260px}
.dba-toolbar{margin:0 18px;gap:10px}.dba-tabs{gap:16px}.dba-tabs .dba-icon{display:none}
.dba-upload{padding:7px 10px;font-size:12px}.dba-content{padding:16px 18px 20px}.dba-grid{grid-template-columns:minmax(0,1fr);gap:14px}
.dba-footer{padding:15px 18px}.dba-bar{gap:12px}.dba-btn.dba-btn-preview{flex-shrink:0}
.dba-current>.dba-icon{display:none}.dba-settings{gap:6px;padding-top:12px;margin-top:12px}.dba-fit{gap:7px}.dba-refresh{padding:6px}.dba-progress{padding:12px 18px 0}.dba-msg{flex-wrap:wrap;gap:8px}
.dba-trash-item{gap:10px;padding:12px}.dba-trash-item>.dba-icon{display:none}}
@media(max-height:650px){.dba-lib{overflow:auto}.dba-content{overflow:visible;flex-shrink:0}.dba-header{padding-top:16px;padding-bottom:12px}}
@media(prefers-reduced-motion:reduce){.dba-lib *{transition:none!important}}


`;
function ensureStyle2() {
  ensureUIStyle();
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
var noopSubscribe = () => () => {
};
function useCurrentSession(store) {
  const binding = (0, import_react12.useSyncExternalStore)(
    store === null ? noopSubscribe : store.subscribe,
    store === null ? () => null : store.getSnapshot
  );
  const sessionId = typeof binding?.props?.sessionId === "string" ? binding.props.sessionId : null;
  return { sessionId, isNewConversation: binding?.hooks?.session?.blankBit === true };
}
function BootOverlay({
  store,
  previewAt = 0
}) {
  ensureStyle2();
  const { sessionId, isNewConversation } = useCurrentSession(store);
  const fit = readFit();
  const playback = usePlayback();
  const source = (0, import_react12.useRef)("auto");
  const [showing, setShowing] = (0, import_react12.useState)(false);
  const [src, setSrc] = (0, import_react12.useState)("");
  const [playId, setPlayId] = (0, import_react12.useState)(0);
  const controller = (0, import_react12.useRef)(new PlaybackController()), entry = (0, import_react12.useRef)(new SessionEntry());
  const playbackSession = (0, import_react12.useRef)(null);
  const videoRef = (0, import_react12.useRef)(null);
  const startup = window.__HDK_STARTUP__;
  const startupEntry = (0, import_react12.useRef)(!!startup?.attempted);
  const startupSession = (0, import_react12.useRef)(null);
  (0, import_react12.useEffect)(() => {
    if (!startup?.attempted) return;
    const sync2 = () => {
      if (startup.phase === "completed" && startupSession.current) markPlayed(startupSession.current);
      setPlayback({ phase: startup.phase, playId: -1, source: "auto" });
      window.dispatchEvent(new CustomEvent("harness-docket:playback", { detail: startup.active }));
    };
    sync2();
    window.addEventListener("harness-docket:startup", sync2);
    return () => {
      window.removeEventListener("harness-docket:startup", sync2);
      startup.close("left");
    };
  }, []);
  const close = (0, import_react12.useCallback)((state2 = "skipped", expected) => {
    if (expected !== void 0 && controller.current.generation !== expected) return;
    const activePlay = getPlaybackState().play;
    setPlayback({ ...activePlay, phase: state2 });
    if (state2 === "failed") notify("playback failed");
    else log("playback " + state2);
    if (state2 === "completed" && source.current === "auto" && playbackSession.current) markPlayed(playbackSession.current);
    controller.current.cancel();
    setShowing(false);
    const video = videoRef.current;
    if (video !== null) {
      try {
        video.pause();
      } catch {
      }
    }
  }, []);
  const open = (0, import_react12.useCallback)((id = null) => {
    setShowing(false);
    log("playback attempted");
    source.current = id === null ? "preview" : "auto";
    const pending = controller.current.open(id);
    const generation = controller.current.generation, origin = source.current;
    setPlayback({ phase: "resolving", source: origin, playId: generation });
    void pending.then((play) => {
      if (!play || generation !== controller.current.generation) return;
      setPlayback({ phase: "loading", source: origin, playId: play.playId, id: play.id, version: play.version, name: play.name });
      playbackSession.current = id;
      setSrc(play.src);
      setPlayId(play.playId);
      setShowing(true);
    }).catch((error) => {
      if (generation === controller.current.generation) {
        notify("playback failed", error.message);
        setPlayback({ ...getPlaybackState().play, phase: "failed" });
      }
    });
  }, []);
  (0, import_react12.useEffect)(() => () => controller.current.cancel(), []);
  (0, import_react12.useEffect)(() => {
    window.dispatchEvent(new CustomEvent("harness-docket:playback", { detail: showing || !!startup?.active }));
    return () => {
      window.dispatchEvent(new CustomEvent("harness-docket:playback", { detail: false }));
    };
  }, [showing]);
  (0, import_react12.useEffect)(() => {
    if (startupEntry.current) {
      if (sessionId !== null) {
        startupSession.current = sessionId;
        if (startup?.phase === "completed") markPlayed(sessionId);
        entry.current.update(sessionId, true, sessionId, false, true);
        startupEntry.current = false;
      }
      return;
    }
    if (entry.current.id !== sessionId && startup?.active) startup.close("left");
    if (entry.current.id !== sessionId) close("left");
    if (entry.current.update(sessionId, isNewConversation, getPlaybackState().pinned, sessionId ? hasPlayed(sessionId) : false, playback.enabled)) open(sessionId);
  }, [sessionId, isNewConversation, open, close, playback.enabled]);
  (0, import_react12.useEffect)(() => {
    if (!playback.enabled) {
      startup?.close("disabled");
      if (source.current === "auto" && (controller.current.pending || showing)) close("disabled");
    }
  }, [playback.enabled, showing, close]);
  (0, import_react12.useEffect)(() => {
    if (previewAt === 0) return;
    log("preview requested", previewAt);
    open();
  }, [previewAt, open]);
  (0, import_react12.useEffect)(() => {
    if (!showing) return void 0;
    const video = videoRef.current;
    if (video === null) return void 0;
    video.muted = true;
    const openedAt = performance.now();
    let active2 = true;
    let lastProgressAt = openedAt;
    let lastTime = video.currentTime;
    const report = (label, writer = notify) => writer(label, {
      ms: Math.round(performance.now() - openedAt),
      readyState: video.readyState,
      networkState: video.networkState,
      src: video.currentSrc || video.src
    });
    const onPlaying = () => {
      if (!active2) return;
      advancePlayback(playId, "playing");
      report("playback started", log);
    };
    const onWaiting = () => {
      if (active2) advancePlayback(playId, "buffering");
    };
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    const attempt = video.play();
    if (attempt !== void 0 && typeof attempt.then === "function") {
      attempt.then(() => log("play started")).catch((error) => {
        if (!active2) return;
        notify("play rejected", String(error));
        close("failed", playId);
      });
    }
    const guard = window.setInterval(() => {
      const now = performance.now();
      if (document.hidden || video.currentTime !== lastTime) {
        lastProgressAt = now;
        lastTime = video.currentTime;
      } else if (now - lastProgressAt >= STALL_TIMEOUT_MS) {
        report("stalled, no progress for " + STALL_TIMEOUT_MS + "ms");
        close("failed", playId);
      }
    }, 1e3);
    return () => {
      active2 = false;
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      window.clearInterval(guard);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [showing, src, playId, close]);
  if (!showing) return null;
  const blockInteraction = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (0, import_react12.createElement)(
    "div",
    {
      className: "dba-root hdk-ui",
      onClick: blockInteraction,
      onDoubleClick: blockInteraction,
      onContextMenu: blockInteraction
    },
    (0, import_react12.createElement)("video", {
      key: playId,
      ref: videoRef,
      className: fit === "cover" ? "dba-video dba-cover" : "dba-video",
      src,
      muted: true,
      autoPlay: true,
      loop: false,
      playsInline: true,
      controls: false,
      controlsList: "nodownload nofullscreen noremoteplayback",
      disablePictureInPicture: true,
      disableRemotePlayback: true,
      tabIndex: -1,
      preload: "auto",
      onEnded: () => close("completed", playId),
      onError: () => {
        const video = videoRef.current;
        const code = video?.error?.code ?? 0;
        const message2 = video?.error?.message ?? "";
        notify("video element error", { code, message: message2, src: video?.currentSrc || src, readyState: video?.readyState ?? -1 });
        close("failed", playId);
      }
    }),
    (0, import_react12.createElement)("button", {
      type: "button",
      className: "dba-skip",
      "aria-label": "\u8DF3\u8FC7\u542F\u52A8\u52A8\u753B",
      onClick: (event) => {
        event.stopPropagation();
        close("skipped", playId);
      }
    }, "\u8DF3\u8FC7")
  );
}
function FloatingDock({ store, onOpen, suspended }) {
  const { sessionId } = useCurrentSession(store);
  const playback = usePlayback();
  (0, import_react12.useEffect)(() => {
    void refreshSelection();
  }, []);
  const playerTitle = "\u81EA\u52A8\u64AD\u653E\uFF1A" + (playback.enabled ? "\u5F00" : "\u5173");
  return (0, import_react12.createElement)(AvatarDock, { sessionId, isPinned: playback.enabled, playerDisabled: false, playerTitle, onPlayer: () => setAutoplay(!getPlaybackState().enabled), onOpenLibrary: onOpen, suspended });
}
function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
}
var SOURCE_LABEL = {
  yours: "\u6211\u7684\u4E0A\u4F20",
  embedded: "\u5185\u7F6E\u7247\u5934",
  env: "\u5916\u90E8\u7247\u6E90"
};
function VideoThumbnail({ video }) {
  const frame = (0, import_react12.useRef)(null);
  const [visible, setVisible] = (0, import_react12.useState)(false), [poster, setPoster] = (0, import_react12.useState)("");
  const [failed, setFailed] = (0, import_react12.useState)(false), [duration, setDuration] = (0, import_react12.useState)("");
  (0, import_react12.useEffect)(() => {
    const element = frame.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)), { root: element.closest(".dba-content"), rootMargin: "100px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  (0, import_react12.useEffect)(() => {
    setPoster("");
    setFailed(false);
    if (!visible) return;
    const abort = new AbortController();
    const src = "/harness-docket/media/" + encodeURIComponent(video.id) + (video.version ? "?v=" + encodeURIComponent(video.version) : "");
    void captureThumbnail(src, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setPoster(result.url);
      if (Number.isFinite(result.duration)) {
        const seconds = Math.floor(result.duration);
        setDuration(Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0"));
      }
    }).catch((error) => {
      if (!abort.signal.aborted) setFailed(true);
    });
    return () => abort.abort();
  }, [visible, video.id, video.version]);
  return (0, import_react12.createElement)(
    "span",
    { ref: frame, className: "dba-thumb" + (poster ? " dba-thumb-ready" : ""), "aria-hidden": true },
    poster ? (0, import_react12.createElement)("img", { src: poster, alt: "", width: 320, height: 180, style: { width: "100%", height: "100%", objectFit: "cover" } }) : (0, import_react12.createElement)("span", { className: "dba-thumb-fallback" }, (0, import_react12.createElement)(UIIcon, { kind: "film" }), failed ? "\u6682\u65E0\u5C01\u9762" : "\u6B63\u5728\u8BFB\u53D6\u5C01\u9762"),
    duration ? (0, import_react12.createElement)("span", { className: "dba-duration" }, duration) : null
  );
}
async function requestJson(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error ?? "\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u6216\u7A0D\u540E\u91CD\u8BD5");
  return data;
}
function VideoLibrary({ onClose, onPreview, sessionId }) {
  ensureStyle2();
  const playback = usePlayback();
  const [state2, setState] = (0, import_react12.useState)(null);
  const [trash, setTrash] = (0, import_react12.useState)([]);
  const [tab, setTab] = (0, import_react12.useState)("library");
  const [fit, setFit] = (0, import_react12.useState)(() => readFit());
  const [msg, setMsg] = (0, import_react12.useState)({ text: "", kind: "" });
  const [busy, setBusy] = (0, import_react12.useState)(false);
  const [progress, setProgress] = (0, import_react12.useState)(null);
  const [undo, setUndo] = (0, import_react12.useState)(null);
  const fileInput = (0, import_react12.useRef)(null);
  const uploadRequest = (0, import_react12.useRef)(null);
  const dialog = (0, import_react12.useRef)(null);
  const operation = (0, import_react12.useRef)(false);
  const load = (0, import_react12.useCallback)(async () => {
    const [data, bin] = await Promise.all([
      requestJson(LIST_URL),
      requestJson(TRASH_URL)
    ]);
    setState(data);
    selectedFromList(data);
    setTrash(bin.items);
  }, []);
  (0, import_react12.useEffect)(() => {
    void load().catch((error) => setMsg({ text: "\u8BFB\u53D6\u7247\u5E93\u5931\u8D25\uFF1A" + String(error.message), kind: "dba-err" }));
  }, [load]);
  useDialogFocus(dialog, onClose);
  (0, import_react12.useEffect)(() => () => uploadRequest.current?.abort(), []);
  useTransientNotice(msg.text, () => setMsg({ text: "", kind: "" }), msg.kind !== "dba-ok" || !!undo);
  const perform = async (action) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setMsg({ text: "", kind: "" });
    try {
      await action();
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : String(error), kind: "dba-err" });
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const post = (url, id) => requestJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id })
  });
  const choose = (id) => perform(async () => {
    const data = await post(SELECT_URL, id);
    await load();
    setMsg({ text: "\u5DF2\u8BBE\u4E3A\u7247\u5934\uFF1A" + data.name, kind: "dba-ok" });
  });
  const remove = (video) => perform(async () => {
    const data = await post(DELETE_URL, video.id);
    setUndo(data.item.id);
    await load();
    setMsg({ text: "\u5DF2\u5C06\u300C" + video.name + "\u300D\u79FB\u5165\u56DE\u6536\u7AD9\uFF0C30 \u5929\u5185\u53EF\u6062\u590D\u3002", kind: "dba-ok" });
  });
  const restore = (id) => perform(async () => {
    const data = await post(RESTORE_URL, id);
    setUndo(null);
    await load();
    setMsg({ text: "\u5DF2\u6062\u590D\u300C" + data.name + "\u300D\uFF0C\u53EF\u5728\u7247\u5E93\u4E2D\u9009\u62E9\u3002", kind: "dba-ok" });
  });
  const upload = (file) => perform(async () => {
    if (file.size === 0 || file.size > (state2?.maxUploadBytes ?? 250 * 1024 * 1024)) throw new Error("\u8BF7\u9009\u62E9\u4E0D\u8D85\u8FC7 250 MB \u7684\u975E\u7A7A\u89C6\u9891");
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!(state2?.accepts ?? [".mp4", ".m4v", ".mov", ".webm", ".mkv"]).includes(ext)) throw new Error("\u8BF7\u9009\u62E9 MP4\u3001M4V\u3001MOV\u3001WebM \u6216 MKV \u89C6\u9891");
    setProgress(0);
    try {
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        uploadRequest.current = xhr;
        xhr.open("POST", UPLOAD_URL + "?filename=" + encodeURIComponent(file.name));
        xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100));
        };
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(data);
            else reject(new Error(data.error ?? "\u4E0A\u4F20\u5931\u8D25"));
          } catch {
            reject(new Error("\u4E0A\u4F20\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55\u6216\u7A0D\u540E\u91CD\u8BD5"));
          }
        };
        xhr.onerror = () => reject(new Error("\u7F51\u7EDC\u4E2D\u65AD\uFF0C\u89C6\u9891\u672A\u4E0A\u4F20\u5B8C\u6210"));
        xhr.timeout = 3e5;
        xhr.ontimeout = () => reject(new Error("\u4E0A\u4F20\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5"));
        xhr.onabort = () => reject(new Error("\u5DF2\u53D6\u6D88\u4E0A\u4F20"));
        xhr.send(file);
      });
      if (state2) {
        const duplicate = state2.videos.find((v) => v.version === result.video.version);
        const videos2 = duplicate ? state2.videos.map((v) => v === duplicate ? { ...v, copies: (v.copies || 1) + 1 } : v) : [...state2.videos, result.video];
        if (result.active && !videos2.some((v) => v.id === result.active.id)) videos2.push(result.active);
        const next = { ...state2, videos: videos2, activeId: result.active?.id ?? null, activeVersion: result.active?.version ?? null };
        setState(next);
        selectedFromList(next);
      }
      setTab("library");
      setMsg({ text: "\u5DF2\u4E0A\u4F20\u300C" + result.name + "\u300D\u3002\u70B9\u51FB\u89C6\u9891\u5373\u53EF\u5207\u6362\u4E3A\u7247\u5934\u3002", kind: "dba-ok" });
    } finally {
      uploadRequest.current = null;
      setProgress(null);
    }
  });
  const videos = state2?.videos ?? [];
  const activeId = state2?.activeId ?? null;
  const active2 = videos.find((video) => video.id === activeId);
  return (0, import_react12.createElement)(
    "div",
    { className: "dba-veil hdk-ui", onClick: (event) => {
      if (event.target === event.currentTarget) onClose();
    } },
    (0, import_react12.createElement)(
      "div",
      { className: "dba-lib", ref: dialog, role: "dialog", "aria-modal": true, "aria-labelledby": "dba-library-title", "aria-describedby": "dba-library-description", tabIndex: -1 },
      (0, import_react12.createElement)(
        "header",
        { className: "dba-header" },
        (0, import_react12.createElement)(
          "div",
          null,
          (0, import_react12.createElement)("h3", { id: "dba-library-title" }, "\u7247\u5934\u7247\u5E93"),
          (0, import_react12.createElement)("p", { id: "dba-library-description", className: "hdk-identity" }, "Harness- docket \xB7 \u63D2\u4EF6")
        ),
        (0, import_react12.createElement)("button", { type: "button", className: "dba-btn dba-close", "aria-label": "\u5173\u95ED\u7247\u5934\u7247\u5E93", title: "\u5173\u95ED \xB7 Esc", onClick: onClose }, (0, import_react12.createElement)(UIIcon, { kind: "close" }))
      ),
      (0, import_react12.createElement)(
        "div",
        { className: "dba-playback-settings" },
        (0, import_react12.createElement)("label", null, (0, import_react12.createElement)("input", { type: "checkbox", checked: playback.enabled, onChange: (e) => setAutoplay(e.target.checked) }), "\u7247\u5934\u81EA\u52A8\u64AD\u653E\uFF1A" + (playback.enabled ? "\u5F00" : "\u5173")),
        (0, import_react12.createElement)("label", null, (0, import_react12.createElement)("input", { type: "checkbox", disabled: !sessionId, checked: !!sessionId && playback.pinned === sessionId, onChange: (e) => setPinned(e.target.checked ? sessionId : null) }), "\u5F53\u524D\u4F1A\u8BDD\u6BCF\u6B21\u8FDB\u5165\u91CD\u64AD"),
        (0, import_react12.createElement)("span", { role: "status", className: "dba-playback-status" }, playbackDescription(playback)),
        (0, import_react12.createElement)("small", null, playback.enabled ? "\u9875\u9762\u542F\u52A8\u65F6\u64AD\u653E\uFF0C\u65B0\u4F1A\u8BDD\u64AD\u653E\u4E00\u6B21\uFF1B\u624B\u52A8\u9884\u89C8\u72EC\u7ACB\u53EF\u7528\u3002" : "\u6240\u6709\u81EA\u52A8\u7247\u5934\u5DF2\u5173\u95ED\uFF0C\u624B\u52A8\u9884\u89C8\u4ECD\u53EF\u4F7F\u7528\u3002")
      ),
      (0, import_react12.createElement)(
        "div",
        { className: "dba-toolbar" },
        (0, import_react12.createElement)(
          "div",
          { className: "dba-tabs", role: "tablist", "aria-label": "\u7247\u5E93\u89C6\u56FE", onKeyDown: tabKeys },
          (0, import_react12.createElement)(
            "button",
            { type: "button", className: "dba-btn" + (tab === "library" ? " dba-btn-on" : ""), disabled: busy, role: "tab", id: "dba-tab-library", "aria-controls": "dba-library-panel", tabIndex: tab === "library" ? 0 : -1, "aria-selected": tab === "library", "aria-pressed": tab === "library", onClick: () => setTab("library") },
            (0, import_react12.createElement)(UIIcon, { kind: "film" }),
            "\u89C6\u9891",
            (0, import_react12.createElement)("span", { className: "dba-count" }, videos.length)
          ),
          (0, import_react12.createElement)(
            "button",
            { type: "button", className: "dba-btn dba-trash-tab" + (tab === "trash" ? " dba-btn-on" : ""), disabled: busy, role: "tab", id: "dba-tab-trash", "aria-controls": "dba-library-panel", tabIndex: tab === "trash" ? 0 : -1, "aria-selected": tab === "trash", "aria-pressed": tab === "trash", onClick: () => setTab("trash") },
            (0, import_react12.createElement)(UIIcon, { kind: "delete" }),
            "\u56DE\u6536\u7AD9",
            (0, import_react12.createElement)("span", { className: "dba-count" }, trash.length)
          )
        ),
        (0, import_react12.createElement)("input", { ref: fileInput, type: "file", hidden: true, accept: ".mp4,.m4v,.mov,.webm,.mkv", onChange: (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload(file);
        } }),
        (0, import_react12.createElement)("button", { type: "button", className: "dba-btn dba-upload", disabled: busy || !state2, onClick: () => fileInput.current?.click() }, (0, import_react12.createElement)(UIIcon, { kind: "upload" }), "\u4E0A\u4F20\u89C6\u9891")
      ),
      progress === null ? null : (0, import_react12.createElement)(
        "div",
        { className: "dba-progress" },
        (0, import_react12.createElement)("progress", { value: progress, max: 100, "aria-label": "\u89C6\u9891\u4E0A\u4F20\u8FDB\u5EA6" }),
        (0, import_react12.createElement)("span", null, progress === 100 ? "\u6B63\u5728\u4FDD\u5B58\u2026" : progress + "%"),
        (0, import_react12.createElement)("button", { type: "button", className: "dba-btn", onClick: () => uploadRequest.current?.abort() }, "\u53D6\u6D88")
      ),
      (0, import_react12.createElement)(
        "div",
        { className: "dba-content", id: "dba-library-panel", role: "tabpanel", "aria-labelledby": "dba-tab-" + tab, "aria-busy": busy || !state2 && msg.kind !== "dba-err" },
        tab === "library" ? (0, import_react12.createElement)(
          "div",
          null,
          (0, import_react12.createElement)("div", { className: "dba-section-note" }, (0, import_react12.createElement)("strong", null, "\u70B9\u51FB\u5C01\u9762\uFF0C\u8BBE\u4E3A\u4F1A\u8BDD\u7247\u5934"), (0, import_react12.createElement)("span", null, "\u5355\u4E2A\u89C6\u9891 \u2264 250 MB \xB7 \u63A8\u8350 MP4\uFF08H.264\uFF09")),
          (0, import_react12.createElement)(
            "div",
            { className: "dba-grid" },
            ...videos.map((v) => (0, import_react12.createElement)(
              "div",
              { key: v.id, className: "dba-item" + (v.id === activeId ? " dba-cur" : "") },
              (0, import_react12.createElement)(
                "button",
                {
                  type: "button",
                  className: "dba-choice",
                  disabled: busy,
                  "aria-pressed": v.id === activeId,
                  "aria-label": "\u4F7F\u7528 " + v.name,
                  onClick: () => {
                    if (v.id !== activeId) void choose(v.id);
                  }
                },
                (0, import_react12.createElement)(VideoThumbnail, { key: v.version ?? v.mtime, video: v }),
                (0, import_react12.createElement)(
                  "span",
                  { className: "dba-details" },
                  (0, import_react12.createElement)("span", { className: "dba-nm", title: v.name }, v.name),
                  (0, import_react12.createElement)("small", null, (SOURCE_LABEL[v.source] ?? v.source) + " \xB7 " + formatBytes(v.bytes) + ((v.copies ?? 1) > 1 ? " \xB7 \u5DF2\u5408\u5E76 " + v.copies + " \u4EFD" : ""))
                )
              ),
              v.id === activeId ? (0, import_react12.createElement)("span", { className: "dba-selected" }, (0, import_react12.createElement)(UIIcon, { kind: "check" }), "\u5F53\u524D\u7247\u5934") : null,
              (v.ext === ".mp4" || v.ext === ".m4v") && v.faststart === false ? (0, import_react12.createElement)("span", { className: "dba-b-warn", title: "\u6B64\u89C6\u9891\u53EF\u80FD\u9700\u8981\u4E0B\u8F7D\u5B8C\u6210\u540E\u624D\u80FD\u64AD\u653E" }, "\u52A0\u8F7D\u53EF\u80FD\u8F83\u6162") : null,
              v.deletable !== false ? (0, import_react12.createElement)("button", {
                type: "button",
                className: "dba-btn dba-delete",
                disabled: busy,
                "aria-label": "\u5220\u9664 " + v.name,
                title: "\u79FB\u5165\u56DE\u6536\u7AD9\uFF0C30 \u5929\u5185\u53EF\u6062\u590D",
                onClick: () => void remove(v)
              }, (0, import_react12.createElement)(UIIcon, { kind: "delete" })) : null
            )),
            videos.length ? null : (0, import_react12.createElement)(
              "div",
              { className: "dba-empty" },
              (0, import_react12.createElement)(UIIcon, { kind: "film" }),
              (0, import_react12.createElement)("strong", null, state2 ? "\u6682\u65E0\u89C6\u9891" : msg.kind === "dba-err" ? "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u7247\u5E93" : "\u6B63\u5728\u8BFB\u53D6\u7247\u5E93\u2026"),
              (0, import_react12.createElement)("span", null, state2 ? "\u4E0A\u4F20\u559C\u6B22\u7684\u89C6\u9891\uFF0C\u6216\u4ECE\u56DE\u6536\u7AD9\u6062\u590D\u3002" : msg.kind === "dba-err" ? "\u8BF7\u70B9\u51FB\u5237\u65B0\u91CD\u8BD5\u3002" : "\u6B63\u5728\u83B7\u53D6\u89C6\u9891\u5217\u8868\u3002")
            )
          )
        ) : (0, import_react12.createElement)(
          "div",
          null,
          (0, import_react12.createElement)("div", { className: "dba-trash-note" }, (0, import_react12.createElement)(UIIcon, { kind: "restore" }), (0, import_react12.createElement)("p", null, "\u5220\u9664\u7684\u89C6\u9891\u4FDD\u7559 30 \u5929\uFF0C\u5230\u671F\u81EA\u52A8\u6E05\u7406\u3002\u6062\u590D\u540E\u53EF\u91CD\u65B0\u9009\u62E9\uFF0C\u540C\u540D\u6587\u4EF6\u4F1A\u53E6\u5B58\u3002")),
          (0, import_react12.createElement)(
            "div",
            { className: "dba-trash-list" },
            ...trash.map((item) => (0, import_react12.createElement)(
              "div",
              { key: item.id, className: "dba-item dba-trash-item" },
              (0, import_react12.createElement)(UIIcon, { kind: "film" }),
              (0, import_react12.createElement)(
                "span",
                { className: "dba-details" },
                (0, import_react12.createElement)("span", { className: "dba-nm", title: item.name }, item.name),
                (0, import_react12.createElement)("small", null, formatBytes(item.bytes) + " \xB7 \u5269\u4F59 " + Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 864e5)) + " \u5929 \xB7 " + new Date(item.expiresAt).toLocaleDateString() + " \u5230\u671F")
              ),
              (0, import_react12.createElement)("button", { type: "button", className: "dba-btn dba-restore", disabled: busy, onClick: () => void restore(item.id), "aria-label": "\u6062\u590D " + item.name }, (0, import_react12.createElement)(UIIcon, { kind: "restore" }), "\u6062\u590D")
            ))
          ),
          trash.length ? null : (0, import_react12.createElement)("div", { className: "dba-empty" }, (0, import_react12.createElement)(UIIcon, { kind: "delete" }), (0, import_react12.createElement)("strong", null, "\u56DE\u6536\u7AD9\u662F\u7A7A\u7684"), (0, import_react12.createElement)("span", null, "\u5220\u9664\u7684\u89C6\u9891\u4F1A\u5728\u8FD9\u91CC\u4FDD\u7559 30 \u5929\u3002"))
        )
      ),
      (0, import_react12.createElement)(
        "footer",
        { className: "dba-footer" },
        (0, import_react12.createElement)(
          "div",
          { className: "dba-bar" },
          (0, import_react12.createElement)(
            "div",
            { className: "dba-current" },
            (0, import_react12.createElement)(UIIcon, { kind: "play" }),
            (0, import_react12.createElement)("div", { className: "dba-details" }, (0, import_react12.createElement)("small", null, "\u5F53\u524D\u7247\u5934 \xB7 \u7528\u4E8E\u65B0\u4F1A\u8BDD\u548C\u6307\u5B9A\u4F1A\u8BDD"), (0, import_react12.createElement)("span", { className: "dba-nm", title: active2?.name }, active2?.name ?? (state2 ? "\u5C1A\u672A\u9009\u62E9\u7247\u5934" : "\u6B63\u5728\u8BFB\u53D6\u2026")))
          ),
          (0, import_react12.createElement)("button", { type: "button", className: "dba-btn dba-btn-preview", disabled: busy || !activeId, onClick: onPreview }, (0, import_react12.createElement)(UIIcon, { kind: "play" }), "\u9884\u89C8\u5F53\u524D")
        ),
        (0, import_react12.createElement)(
          "div",
          { className: "dba-settings" },
          tab === "library" ? (0, import_react12.createElement)(
            "div",
            { className: "dba-fit" },
            (0, import_react12.createElement)("span", null, "\u753B\u9762\u9002\u914D"),
            (0, import_react12.createElement)(
              "div",
              { className: "dba-fit-options", role: "group", "aria-label": "\u753B\u9762\u9002\u914D" },
              ...["cover", "contain"].map((mode) => (0, import_react12.createElement)("button", {
                key: mode,
                type: "button",
                className: "dba-btn" + (fit === mode ? " dba-btn-on" : ""),
                "aria-pressed": fit === mode,
                title: mode === "cover" ? "\u586B\u6EE1\u5C4F\u5E55\uFF0C\u53EF\u80FD\u88C1\u5207\u753B\u9762\u8FB9\u7F18" : "\u4FDD\u7559\u5B8C\u6574\u753B\u9762\uFF0C\u53EF\u80FD\u663E\u793A\u9ED1\u8FB9",
                onClick: () => {
                  writeFit(mode);
                  setFit(mode);
                }
              }, (0, import_react12.createElement)(UIIcon, { kind: mode }), mode === "cover" ? "\u94FA\u6EE1\u5C4F\u5E55" : "\u5B8C\u6574\u663E\u793A"))
            )
          ) : (0, import_react12.createElement)("p", null, "\u6062\u590D\u540E\uFF0C\u5728\u7247\u5E93\u4E2D\u91CD\u65B0\u9009\u62E9"),
          (0, import_react12.createElement)("button", { type: "button", className: "dba-btn dba-refresh", disabled: busy, onClick: () => void perform(async () => {
            await load();
            setMsg({ text: "\u7247\u5E93\u5DF2\u5237\u65B0", kind: "dba-ok" });
          }) }, (0, import_react12.createElement)(UIIcon, { kind: "refresh" }), "\u5237\u65B0")
        ),
        (0, import_react12.createElement)(
          "div",
          { className: "dba-msg " + msg.kind, role: msg.kind === "dba-err" ? "alert" : "status", "aria-live": "polite" },
          msg.text,
          undo && trash.some((item) => item.id === undo) ? (0, import_react12.createElement)("button", { type: "button", className: "dba-btn", disabled: busy, onClick: () => void restore(undo) }, "\u64A4\u9500\u5220\u9664") : null
        )
      )
    )
  );
}
function apply(ctx) {
  const startup = window.__HDK_STARTUP__;
  if (startup?.namespace) configurePreferences(startup.namespace);
  const candidate = ctx.uiSession?.adapter?.current;
  const store = candidate !== void 0 && typeof candidate.getSnapshot === "function" && typeof candidate.subscribe === "function" ? candidate : null;
  log("apply", { hasUiSession: ctx.uiSession !== void 0, hasStore: store !== null });
  const AppRoot = () => {
    const owned = useSingleCompanion();
    const { sessionId } = useCurrentSession(store);
    const [ready, setReady] = (0, import_react12.useState)(!!startup?.namespace);
    (0, import_react12.useEffect)(() => {
      if (startup?.namespace) return;
      const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 8e3);
      fetch("/harness-docket/client-config.json", { cache: "no-store", signal: abort.signal }).then((r) => {
        if (!r.ok) throw new Error("\u8BFB\u53D6\u914D\u7F6E\u5931\u8D25");
        return r.json();
      }).then((data) => {
        if (typeof data.namespace === "string") configurePreferences(data.namespace);
      }).catch(() => {
      }).finally(() => {
        clearTimeout(timeout);
        setReady(true);
      });
      return () => {
        clearTimeout(timeout);
        abort.abort();
      };
    }, []);
    const [libOpen, setLibOpen] = (0, import_react12.useState)(false);
    const [previewAt, setPreviewAt] = (0, import_react12.useState)(0);
    if (!ready || !owned) return null;
    return (0, import_react12.createElement)(
      import_react12.Fragment,
      null,
      (0, import_react12.createElement)(BootOverlay, { store, previewAt }),
      (0, import_react12.createElement)(FloatingDock, { store, onOpen: () => setLibOpen(true), suspended: libOpen }),
      libOpen ? (0, import_react12.createElement)(VideoLibrary, {
        sessionId,
        onClose: () => setLibOpen(false),
        onPreview: () => {
          setLibOpen(false);
          setPreviewAt((n) => n + 1);
        }
      }) : null
    );
  };
  const mount = () => {
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register({ name: "shell.overlay", id: "harness-docket", order: 900 }, AppRoot)
    );
  };
  if (typeof ctx.effect === "function") ctx.effect(mount, "harness-docket: mounts");
  else mount();
}

return module.exports;
}});
