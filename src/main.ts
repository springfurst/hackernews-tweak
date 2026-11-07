/**
 * HN Tweak — readable, dark, mobile-friendly Hacker News.
 *
 * The stylesheet does the reading work. This script injects it, pushes
 * settings into CSS custom properties on <html>, and adds a thumb-reachable
 * comment navigation bar plus a settings sheet.
 *
 * Nothing here restructures HN's DOM: `hn.js` derives the comment tree from
 * the `indent` attribute and collapses by toggling `coll`/`noshow`, so we only
 * add attributes, classes and a couple of fixed-position elements.
 */

interface HnSettings {
  /** "auto" follows prefers-color-scheme. */
  theme: "auto" | "light" | "dark";
  /** Comment body font size in px. */
  fontSize: number;
  /** Comment body line-height multiplier. */
  lineHeight: number;
  /** Horizontal offset per nesting level, in px. */
  indentStep: number;
  /** Nesting levels that still get indented; deeper levels are clamped. */
  indentCap: number;
  /** Show the bottom comment navigation bar. */
  navBar: boolean;
  /** Resume where you left off on a thread. */
  rememberPosition: boolean;
}

const HN_MAX_INDENT = 21;
const HN_SETTINGS_KEY = "hn-tweak:settings";
const HN_POS_PREFIX = "hn-tweak:pos:";
const HN_POS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Space left above a comment when we scroll to it. */
const HN_NAV_OFFSET = 12;

const HN_DEFAULTS: HnSettings = {
  theme: "auto",
  fontSize: 16,
  lineHeight: 1.5,
  indentStep: 10,
  indentCap: 8,
  navBar: true,
  rememberPosition: true,
};

// Greasemonkey API. Declared loosely because we run under Tampermonkey,
// Violentmonkey, or (for local testing) nowhere at all.
declare function GM_addStyle(css: string): void;
declare function GM_getValue<T>(key: string, fallback: T): T;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_registerMenuCommand(name: string, fn: () => void): void;

const hnStore = {
  get<T>(key: string, fallback: T): T {
    if (typeof GM_getValue === "function") {
      const v = GM_getValue<T | undefined>(key, undefined);
      return v === undefined ? fallback : v;
    }
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    if (typeof GM_setValue === "function") {
      GM_setValue(key, value);
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable; keep the in-memory value only */
    }
  },
};

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function hnReadSettings(): HnSettings {
  const stored = hnStore.get<Partial<HnSettings> | null>(HN_SETTINGS_KEY, null);
  return stored && typeof stored === "object"
    ? { ...HN_DEFAULTS, ...stored }
    : { ...HN_DEFAULTS };
}

let hnSettings: HnSettings = { ...HN_DEFAULTS };

/** Single write path: everything (panel, console API, reset) goes through here. */
function hnUpdate(next: Partial<HnSettings>): void {
  hnSettings = { ...hnSettings, ...next };
  hnApplySettings(hnSettings);
  hnStore.set(HN_SETTINGS_KEY, hnSettings);
}

const hnDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function hnPrefersDark(theme: HnSettings["theme"]): boolean {
  return theme === "dark" || (theme === "auto" && hnDarkQuery.matches);
}

/* ------------------------------------------------------------------ */
/* Comment tree                                                        */
/* ------------------------------------------------------------------ */

function hnRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("tr.athing.comtr"));
}

function hnDepth(row: HTMLElement): number {
  const ind = row.querySelector("td.ind");
  return ind ? Number(ind.getAttribute("indent")) || 0 : 0;
}

function hnParentIndex(rows: HTMLElement[], i: number): number {
  const d = hnDepth(rows[i]);
  for (let j = i - 1; j >= 0; j--) if (hnDepth(rows[j]) < d) return j;
  return -1;
}

function hnFirstChildIndex(rows: HTMLElement[], i: number): number {
  const d = hnDepth(rows[i]);
  if (i + 1 < rows.length && hnDepth(rows[i + 1]) === d + 1) return i + 1;
  return -1;
}

function hnPrevSiblingIndex(rows: HTMLElement[], i: number): number {
  const d = hnDepth(rows[i]);
  for (let j = i - 1; j >= 0; j--) {
    const dj = hnDepth(rows[j]);
    if (dj < d) return -1;
    if (dj === d) return j;
  }
  return -1;
}

function hnRootIndex(rows: HTMLElement[], i: number): number {
  if (hnDepth(rows[i]) === 0) return i;
  for (let j = i - 1; j >= 0; j--) if (hnDepth(rows[j]) === 0) return j;
  return -1;
}

/** First row at or above this row's depth — i.e. past the whole subtree. */
function hnAfterSubtreeIndex(rows: HTMLElement[], i: number): number {
  const d = hnDepth(rows[i]);
  for (let j = i + 1; j < rows.length; j++) if (hnDepth(rows[j]) <= d) return j;
  return -1;
}

/**
 * The comment currently at the top of the reading area. Rows are in document
 * order, so their viewport tops are monotonic — binary search keeps this cheap
 * enough to run every animation frame.
 */
function hnCurrentIndex(rows: HTMLElement[]): number {
  // After an explicit jump, stay anchored to the comment we landed on. Deriving
  // it from scroll position immediately would pick whatever sits 35% down the
  // screen, which is usually a *later* comment — so pressing prev twice would
  // move forward, or nowhere at all.
  if (hnOverrideRow) {
    const idx = rows.indexOf(hnOverrideRow);
    if (idx >= 0) return idx;
    hnOverrideRow = null;
  }

  const anchor = window.innerHeight * 0.35;
  let lo = 0;
  let hi = rows.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].getBoundingClientRect().top <= anchor) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Stamp each comment's depth onto its `.comhead` so the stylesheet can render
 * a badge where indentation has been clamped.
 */
function hnUpdateDepths(): void {
  for (const row of hnRows()) {
    const comhead = row.querySelector(".comhead");
    if (!comhead) continue;
    const depth = hnDepth(row);
    comhead.setAttribute("data-depth", String(depth));
    comhead.classList.toggle("hn-deep", depth > hnSettings.indentCap);
  }
}

/* ------------------------------------------------------------------ */
/* Scroll animation                                                    */
/* ------------------------------------------------------------------ */

let hnScrollFrame = 0;
/** The row an explicit jump landed on; cleared once the reader scrolls by hand. */
let hnOverrideRow: HTMLElement | null = null;
/** Last scroll offset we set ourselves, so we can tell programmatic from manual. */
let hnProgrammaticY = -1;

/**
 * Animate the scroll ourselves instead of using `behavior: "smooth"`.
 * Native smooth scrolling is distance-dependent and gets dropped for long
 * jumps, which made navigation feel like it sometimes teleported.
 */
function hnScrollTo(targetY: number): void {
  cancelAnimationFrame(hnScrollFrame);
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo(0, targetY);
    hnProgrammaticY = window.scrollY;
    return;
  }

  // Longer jumps get a little more time, but never a long, floaty glide.
  const duration = Math.min(520, Math.max(220, Math.abs(delta) * 0.5));
  const started = performance.now();

  const step = (now: number): void => {
    const p = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    window.scrollTo(0, p >= 1 ? targetY : startY + delta * eased);
    // Record the real offset: near the end of the document the browser clamps,
    // and a stale target would look like a manual scroll.
    hnProgrammaticY = window.scrollY;
    hnScrollFrame = p < 1 ? requestAnimationFrame(step) : 0;
  };
  hnScrollFrame = requestAnimationFrame(step);
}

/** Cancel an in-flight glide as soon as the reader takes over. */
function hnCancelScroll(): void {
  if (hnScrollFrame) {
    cancelAnimationFrame(hnScrollFrame);
    hnScrollFrame = 0;
  }
}

/** Expand any collapsed ancestor so the target is actually rendered. */
function hnEnsureVisible(rows: HTMLElement[], i: number): void {
  let guard = 0;
  while (rows[i] && rows[i].offsetParent === null && guard++ < 32) {
    const p = hnParentIndex(rows, i);
    if (p < 0) break;
    if (rows[p].classList.contains("coll")) {
      rows[p].querySelector<HTMLElement>(".togg")?.click();
    }
    i = p;
  }
}

let hnFlashTimer = 0;

function hnGoto(row: HTMLElement | undefined): void {
  if (!row) return;
  hnOverrideRow = row;
  hnScrollTo(row.getBoundingClientRect().top + window.scrollY - HN_NAV_OFFSET);

  row.classList.remove("hn-flash");
  void row.offsetWidth; // restart the animation
  row.classList.add("hn-flash");
  clearTimeout(hnFlashTimer);
  hnFlashTimer = window.setTimeout(() => row.classList.remove("hn-flash"), 1400);
}

/**
 * Collapse the subtree (if any) and jump past it. We click HN's own toggle so
 * `coll` / `noshow` / the "[N more]" label / server-side state all stay
 * consistent — reimplementing collstate() would fight hn.js.
 */
function hnFoldAndAdvance(rows: HTMLElement[], i: number): void {
  const row = rows[i];
  const hasChildren = i + 1 < rows.length && hnDepth(rows[i + 1]) > hnDepth(row);

  if (hasChildren && !row.classList.contains("coll")) {
    row.querySelector<HTMLElement>(".togg")?.click();
  }

  const next = hnAfterSubtreeIndex(rows, i);
  hnGoto(next >= 0 ? rows[next] : rows[i + 1]);
}

/* ------------------------------------------------------------------ */
/* Navigation bar                                                      */
/* ------------------------------------------------------------------ */

const HN_ICONS: Record<string, string> = {
  parent: '<path d="M8 13V4M4 8l4-4 4 4"/>',
  child: '<path d="M8 3v9M4 8l4 4 4-4"/>',
  prev: '<path d="M10 3L5 8l5 5"/>',
  next: '<path d="M6 3l5 5-5 5"/>',
  fold: '<path d="M3 2h10M4 6l4 4 4-4"/>',
  settings: '<path d="M3 5h10M3 11h10"/><circle cx="6" cy="5" r="1.7"/><circle cx="10" cy="11" r="1.7"/>',
};

interface HnNav {
  refresh: () => void;
}

function hnBuildNav(): HnNav | null {
  if (document.documentElement.getAttribute("op") !== "item") return null;
  if (hnRows().length === 0) return null;

  const gear = document.createElement("button");
  gear.type = "button";
  gear.id = "hn-gear";
  gear.setAttribute("aria-label", "HN Tweak settings");
  gear.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${HN_ICONS.settings}</svg>`;
  gear.addEventListener("click", hnOpenSheet);
  document.body.appendChild(gear);

  const bar = document.createElement("nav");
  bar.id = "hn-nav";
  bar.setAttribute("aria-label", "Comment navigation");

  const buttons = new Map<string, HTMLButtonElement>();

  const go = (rows: HTMLElement[], idx: number): void => {
    if (idx < 0 || idx >= rows.length) return;
    hnEnsureVisible(rows, idx);
    hnGoto(rows[idx]);
  };

  const add = (
    kind: keyof typeof HN_ICONS,
    label: string,
    action: (rows: HTMLElement[], i: number) => void,
  ): void => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${HN_ICONS[kind]}</svg><span>${label}</span>`;
    b.addEventListener("click", () => {
      const rows = hnRows();
      if (rows.length === 0) return;
      action(rows, hnCurrentIndex(rows));
    });
    buttons.set(kind, b);
    bar.appendChild(b);
  };

  // Left to right: the rarely-used action first, the ones a right thumb
  // reaches for (next/prev, parent/child) last.
  add("fold", "fold", (rows, i) => hnFoldAndAdvance(rows, i));
  add("parent", "parent", (rows, i) => go(rows, hnParentIndex(rows, i)));
  add("child", "child", (rows, i) => go(rows, hnFirstChildIndex(rows, i)));
  add("prev", "prev", (rows, i) => {
    // Step back: previous sibling, or up to the parent when this is a first
    // child. "Previous sibling only" was unavailable for over half of all
    // comments, which read as the button being broken.
    const sib = hnPrevSiblingIndex(rows, i);
    go(rows, sib >= 0 ? sib : hnParentIndex(rows, i));
  });
  add("next", "next", (rows, i) => {
    // First row at or above this depth: the next sibling, or the parent's next
    // sibling when this was the last child. Skips the subtree, like HN's own
    // "next".
    go(rows, hnAfterSubtreeIndex(rows, i));
  });

  let refRow: HTMLElement | null = null;

  const refresh = (): void => {
    const rows = hnRows();
    if (rows.length === 0) return;
    const i = hnCurrentIndex(rows);

    if (rows[i] !== refRow) {
      refRow?.classList.remove("hn-ref");
      rows[i].classList.add("hn-ref");
      refRow = rows[i];
    }

    const state: Record<string, boolean> = {
      parent: hnParentIndex(rows, i) >= 0,
      child: hnFirstChildIndex(rows, i) >= 0,
      prev: hnPrevSiblingIndex(rows, i) >= 0 || hnParentIndex(rows, i) >= 0,
      next: hnAfterSubtreeIndex(rows, i) >= 0,
      fold: hnAfterSubtreeIndex(rows, i) >= 0,
    };
    for (const [kind, b] of buttons) b.disabled = !state[kind];
  };

  document.body.appendChild(bar);
  for (const ev of ["touchstart", "wheel", "keydown"] as const) {
    window.addEventListener(ev, hnCancelScroll, { passive: true });
  }
  refresh();
  return { refresh };
}

/* ------------------------------------------------------------------ */
/* Settings sheet                                                      */
/* ------------------------------------------------------------------ */

function hnSheet(): HTMLElement | null {
  return document.getElementById("hn-sheet");
}

function hnOpenSheet(): void {
  const sheet = hnSheet();
  if (!sheet) return;
  hnSyncSheet();
  sheet.hidden = false;
}

function hnCloseSheet(): void {
  const sheet = hnSheet();
  if (sheet) sheet.hidden = true;
}

function hnSyncSheet(): void {
  const sheet = hnSheet();
  if (!sheet) return;

  for (const b of sheet.querySelectorAll<HTMLElement>("[data-theme]")) {
    b.setAttribute("aria-checked", String(b.dataset.theme === hnSettings.theme));
  }

  const bind = (id: string, value: number, suffix: string): void => {
    const input = sheet.querySelector<HTMLInputElement>(`#${id}`);
    const out = sheet.querySelector<HTMLElement>(`#${id}-out`);
    if (input) input.value = String(value);
    if (out) out.textContent = `${value}${suffix}`;
  };
  bind("hn-fs", hnSettings.fontSize, "px");
  bind("hn-step", hnSettings.indentStep, "px");
  bind("hn-cap", hnSettings.indentCap, "");

  const remember = sheet.querySelector<HTMLInputElement>("#hn-remember");
  if (remember) remember.checked = hnSettings.rememberPosition;

  const navBar = sheet.querySelector<HTMLInputElement>("#hn-navbar");
  if (navBar) navBar.checked = hnSettings.navBar;
}

function hnBuildSheet(): void {
  if (hnSheet()) return;

  const wrap = document.createElement("div");
  wrap.id = "hn-sheet";
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="hn-sheet-backdrop"></div>
    <div class="hn-sheet-panel" role="dialog" aria-modal="true" aria-label="HN Tweak settings">
      <div class="hn-sheet-grip"></div>
      <button type="button" class="hn-btn hn-top">Jump to top of thread</button>

      <h3>Theme</h3>
      <div class="hn-seg" role="radiogroup" aria-label="Theme">
        <button type="button" data-theme="auto" role="radio">Auto</button>
        <button type="button" data-theme="light" role="radio">Light</button>
        <button type="button" data-theme="dark" role="radio">Dark</button>
      </div>

      <h3>Reading</h3>
      <div class="hn-field">
        <label for="hn-fs">Font size <output id="hn-fs-out"></output></label>
        <input id="hn-fs" type="range" min="13" max="20" step="1">
      </div>
      <div class="hn-field">
        <label for="hn-step">Indent step <output id="hn-step-out"></output></label>
        <input id="hn-step" type="range" min="6" max="14" step="1">
      </div>
      <div class="hn-field">
        <label for="hn-cap">Indent cap <output id="hn-cap-out"></output></label>
        <input id="hn-cap" type="range" min="3" max="12" step="1">
      </div>
      <label class="hn-check"><input id="hn-remember" type="checkbox"> Remember reading position</label>

      <h3>Chrome</h3>
      <label class="hn-check"><input id="hn-navbar" type="checkbox"> Navigation bar</label>

      <button type="button" class="hn-btn hn-reset">Reset to defaults</button>
      <button type="button" class="hn-btn hn-done">Done</button>
    </div>`;
  document.body.appendChild(wrap);

  wrap.querySelector(".hn-sheet-backdrop")?.addEventListener("click", hnCloseSheet);
  wrap.querySelector(".hn-done")?.addEventListener("click", hnCloseSheet);
  wrap.querySelector(".hn-top")?.addEventListener("click", () => {
    const rows = hnRows();
    if (rows.length) hnGoto(rows[hnRootIndex(rows, hnCurrentIndex(rows))]);
    hnCloseSheet();
  });

  for (const b of wrap.querySelectorAll<HTMLElement>("[data-theme]")) {
    b.addEventListener("click", () => {
      const theme = b.dataset.theme as HnSettings["theme"];
      hnUpdate({ theme });
      hnSyncSheet();
    });
  }

  const wireRange = (id: string, key: "fontSize" | "indentStep" | "indentCap", suffix: string): void => {
    const input = wrap.querySelector<HTMLInputElement>(`#${id}`);
    const out = wrap.querySelector<HTMLElement>(`#${id}-out`);
    input?.addEventListener("input", () => {
      const value = Number(input.value);
      if (out) out.textContent = `${value}${suffix}`;
      hnUpdate({ [key]: value } as Partial<HnSettings>);
    });
  };
  wireRange("hn-fs", "fontSize", "px");
  wireRange("hn-step", "indentStep", "px");
  wireRange("hn-cap", "indentCap", "");

  wrap.querySelector<HTMLInputElement>("#hn-remember")?.addEventListener("change", (e) => {
    hnUpdate({ rememberPosition: (e.target as HTMLInputElement).checked });
  });
  wrap.querySelector<HTMLInputElement>("#hn-navbar")?.addEventListener("change", (e) => {
    hnUpdate({ navBar: (e.target as HTMLInputElement).checked });
  });

  wrap.querySelector(".hn-reset")?.addEventListener("click", () => {
    hnUpdate({ ...HN_DEFAULTS });
    hnSyncSheet();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hnCloseSheet();
  });
}

/* ------------------------------------------------------------------ */
/* Reading position                                                    */
/* ------------------------------------------------------------------ */

interface HnSavedPos {
  cid: string;
  dy: number;
  ts: number;
}

function hnPosKey(): string | null {
  if (document.documentElement.getAttribute("op") !== "item") return null;
  const id = new URLSearchParams(location.search).get("id");
  return id && /^\d+$/.test(id) ? HN_POS_PREFIX + id : null;
}

function hnSavePosition(): void {
  if (!hnSettings.rememberPosition) return;
  const key = hnPosKey();
  if (!key) return;
  const rows = hnRows();
  if (rows.length === 0) return;
  const row = rows[hnCurrentIndex(rows)];
  if (!row.id) return;
  // The current comment's top relative to the viewport. Restoring is then
  // exact: rowTop - dy reproduces the scroll offset we saved at.
  const dy = Math.round(row.getBoundingClientRect().top);
  hnStore.set(key, { cid: row.id, dy, ts: Date.now() } satisfies HnSavedPos);
}

let hnRestored = false;

function hnRestorePosition(): void {
  if (hnRestored || !hnSettings.rememberPosition) return;
  const key = hnPosKey();
  if (!key) return;
  if (location.hash) return; // an explicit permalink wins
  const saved = hnStore.get<HnSavedPos | null>(key, null);
  if (!saved || typeof saved !== "object" || !saved.cid) return;
  if (Date.now() - (saved.ts || 0) > HN_POS_TTL_MS) return;
  const row = document.getElementById(saved.cid);
  if (!row) return;
  hnRestored = true;
  window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - (saved.dy || 0));
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function hnInjectStyle(css: string): void {
  if (typeof GM_addStyle === "function") {
    GM_addStyle(css);
    return;
  }
  // At @run-at document-start <head> may not exist yet.
  const el = document.createElement("style");
  el.id = "hn-tweak";
  el.textContent = css;
  (document.head ?? document.documentElement).appendChild(el);
}

let hnNav: HnNav | null = null;
let hnLastCap = -1;

function hnApplySettings(s: HnSettings): void {
  const root = document.documentElement;
  const style = root.style;

  style.setProperty("--hn-fs", `${s.fontSize}px`);
  style.setProperty("--hn-fs-title", `${s.fontSize}px`);
  style.setProperty("--hn-fs-meta", `${Math.max(12, s.fontSize - 3)}px`);
  style.setProperty("--hn-fs-small", `${Math.max(11, s.fontSize - 4)}px`);
  style.setProperty("--hn-lh", String(s.lineHeight));
  style.setProperty("--hn-step", `${s.indentStep}px`);

  for (let n = 0; n <= HN_MAX_INDENT; n++) {
    style.setProperty(`--hn-w-${n}`, `${Math.min(n, s.indentCap) * s.indentStep}px`);
  }

  root.classList.toggle("hn-dark", hnPrefersDark(s.theme));
  root.classList.toggle("hn-chrome", hnNav !== null);
  root.classList.toggle("hn-nav-on", hnNav !== null && s.navBar);

  // Only the badge threshold depends on indentCap; skip the DOM walk on every
  // font-size or indent-step slider tick.
  if (s.indentCap !== hnLastCap) {
    hnLastCap = s.indentCap;
    hnUpdateDepths();
  }
}

let hnScrollRaf = 0;

function hnOnScroll(): void {
  // A real scroll (not ours) releases the jump anchor.
  if (hnOverrideRow && hnScrollFrame === 0 && Math.abs(window.scrollY - hnProgrammaticY) > 4) {
    hnOverrideRow = null;
  }
  if (hnScrollRaf) return;
  hnScrollRaf = requestAnimationFrame(() => {
    hnScrollRaf = 0;
    hnNav?.refresh();
    hnSavePosition();
  });
}

function hnStart(): void {
  hnSettings = hnReadSettings();
  hnApplySettings(hnSettings);

  const boot = (): void => {
    hnNav = hnBuildNav();
    hnBuildSheet();
    hnApplySettings(hnSettings);
    hnRestorePosition();

    window.addEventListener("scroll", hnOnScroll, { passive: true });
    window.addEventListener("pagehide", hnSavePosition);
    window.addEventListener("resize", () => hnNav?.refresh(), { passive: true });

    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("HN Tweak settings", hnOpenSheet);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  hnDarkQuery.addEventListener("change", () => hnApplySettings(hnSettings));

  (window as unknown as { hnTweak: unknown }).hnTweak = {
    get settings() {
      return hnSettings;
    },
    apply: hnUpdate,
    openSettings: hnOpenSheet,
  };
}

if (location.hostname === "news.ycombinator.com") {
  hnInjectStyle(
    hnBuildCss({
      fontSize: HN_DEFAULTS.fontSize,
      lineHeight: HN_DEFAULTS.lineHeight,
      indentStep: HN_DEFAULTS.indentStep,
      indentCap: HN_DEFAULTS.indentCap,
      maxIndent: HN_MAX_INDENT,
    }),
  );
  hnStart();
}
