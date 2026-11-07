/**
 * HN Tweak — readable, dark, mobile-friendly Hacker News.
 *
 * The stylesheet does the reading work. This script injects it, pushes
 * settings into CSS custom properties on <html>, and adds a thumb-reachable
 * comment navigation bar.
 *
 * Nothing here restructures HN's DOM: `hn.js` derives the comment tree from
 * the `indent` attribute and collapses by toggling `coll`/`noshow`, so we only
 * add attributes, classes and one fixed-position element.
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

function hnReadSettings(): HnSettings {
  const stored = hnStore.get<Partial<HnSettings> | null>(HN_SETTINGS_KEY, null);
  return stored && typeof stored === "object"
    ? { ...HN_DEFAULTS, ...stored }
    : { ...HN_DEFAULTS };
}

function hnSaveSettings(s: HnSettings): void {
  hnStore.set(HN_SETTINGS_KEY, s);
}

const hnDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

let hnCurrent: HnSettings = { ...HN_DEFAULTS };

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

function hnNextSiblingIndex(rows: HTMLElement[], i: number): number {
  const d = hnDepth(rows[i]);
  for (let j = i + 1; j < rows.length; j++) {
    const dj = hnDepth(rows[j]);
    if (dj < d) return -1;
    if (dj === d) return j;
  }
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
    comhead.classList.toggle("hn-deep", depth > hnCurrent.indentCap);
  }
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

const HN_ICONS: Record<string, string> = {
  top: '<path d="M8 13V4M4 8l4-4 4 4M3 2h10"/>',
  parent: '<path d="M8 13V4M4 8l4-4 4 4"/>',
  child: '<path d="M8 3v9M4 8l4 4 4-4"/>',
  prev: '<path d="M10 3L5 8l5 5"/>',
  next: '<path d="M6 3l5 5-5 5"/>',
  fold: '<path d="M3 2h10M4 6l4 4 4-4"/>',
};

let hnFlashTimer = 0;
let hnScrollFrame = 0;

/**
 * Animate the scroll ourselves instead of using `behavior: "smooth"`.
 * Native smooth scrolling is distance-dependent and gets dropped for long
 * jumps, which made navigation feel like it sometimes teleported.
 */
function hnScrollTo(targetY: number): void {
  cancelAnimationFrame(hnScrollFrame);
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 2) {
    window.scrollTo(0, targetY);
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo(0, targetY);
    return;
  }

  // Longer jumps get a little more time, but never a long, floaty glide.
  const duration = Math.min(520, Math.max(220, Math.abs(delta) * 0.5));
  const started = performance.now();

  const step = (now: number): void => {
    const p = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    window.scrollTo(0, startY + delta * eased);
    hnScrollFrame = p < 1 ? requestAnimationFrame(step) : 0;
    if (p >= 1) window.scrollTo(0, targetY);
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

function hnGoto(row: HTMLElement | undefined): void {
  if (!row) return;
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
  const hasChildren =
    i + 1 < rows.length && hnDepth(rows[i + 1]) > hnDepth(row);

  if (hasChildren && !row.classList.contains("coll")) {
    const togg = row.querySelector<HTMLElement>(".togg");
    togg?.click();
  }

  const next = hnAfterSubtreeIndex(rows, i);
  hnGoto(next >= 0 ? rows[next] : rows[i + 1]);
}

interface HnNav {
  refresh: () => void;
}

function hnBuildNav(): HnNav | null {
  if (document.documentElement.getAttribute("op") !== "item") return null;
  if (hnRows().length === 0) return null;

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

  add("top", "top", (rows, i) => go(rows, hnRootIndex(rows, i)));
  add("parent", "parent", (rows, i) => go(rows, hnParentIndex(rows, i)));
  add("child", "child", (rows, i) => go(rows, hnFirstChildIndex(rows, i)));
  add("prev", "prev", (rows, i) => go(rows, hnPrevSiblingIndex(rows, i)));
  add("next", "next", (rows, i) => {
    // Fall back to the ancestor's next sibling so "next" always advances.
    const sib = hnNextSiblingIndex(rows, i);
    go(rows, sib >= 0 ? sib : i + 1);
  });
  add("fold", "fold", (rows, i) => hnFoldAndAdvance(rows, i));

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
      top: hnRootIndex(rows, i) !== i,
      parent: hnParentIndex(rows, i) >= 0,
      child: hnFirstChildIndex(rows, i) >= 0,
      prev: hnPrevSiblingIndex(rows, i) >= 0,
      next: i + 1 < rows.length,
      fold: i + 1 < rows.length,
    };
    for (const [kind, b] of buttons) b.disabled = !state[kind];
  };

  document.body.appendChild(bar);
  document.documentElement.classList.add("hn-nav-on");
  for (const ev of ["touchstart", "wheel", "keydown"] as const) {
    window.addEventListener(ev, hnCancelScroll, { passive: true });
  }
  refresh();
  return { refresh };
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
  if (!hnCurrent.rememberPosition) return;
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
  if (hnRestored || !hnCurrent.rememberPosition) return;
  const key = hnPosKey();
  if (!key) return;
  if (location.hash) return; // an explicit permalink wins
  const saved = hnStore.get<HnSavedPos | null>(key, null);
  if (!saved || typeof saved !== "object" || !saved.cid) return;
  if (Date.now() - (saved.ts || 0) > HN_POS_TTL_MS) return;
  const row = document.getElementById(saved.cid);
  if (!row) return;
  hnRestored = true;
  const top = row.getBoundingClientRect().top + window.scrollY - (saved.dy || 0);
  window.scrollTo(0, top);
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

function hnApplySettings(s: HnSettings): void {
  hnCurrent = s;
  const root = document.documentElement;
  const style = root.style;

  style.setProperty("--hn-fs", `${s.fontSize}px`);
  style.setProperty("--hn-fs-title", `${s.fontSize}px`);
  style.setProperty("--hn-fs-meta", `${Math.max(12, s.fontSize - 3)}px`);
  style.setProperty("--hn-fs-small", `${Math.max(11, s.fontSize - 4)}px`);
  style.setProperty("--hn-lh", String(s.lineHeight));
  style.setProperty("--hn-step", `${s.indentStep}px`);

  for (let n = 0; n <= HN_MAX_INDENT; n++) {
    const width = Math.min(n, s.indentCap) * s.indentStep;
    style.setProperty(`--hn-w-${n}`, `${width}px`);
  }

  root.classList.toggle("hn-dark", hnPrefersDark(s.theme));
  root.classList.toggle("hn-nav-on", s.navBar && hnNav !== null);

  hnUpdateDepths();
}

let hnNav: HnNav | null = null;

function hnOnScroll(): void {
  if (hnScrollRaf) return;
  hnScrollRaf = requestAnimationFrame(() => {
    hnScrollRaf = 0;
    hnNav?.refresh();
    hnSavePosition();
  });
}

let hnScrollRaf = 0;

function hnStart(): void {
  let settings = hnReadSettings();
  hnApplySettings(settings);

  const boot = (): void => {
    hnNav = hnBuildNav();
    hnApplySettings(settings);
    hnRestorePosition();

    window.addEventListener("scroll", hnOnScroll, { passive: true });
    window.addEventListener("pagehide", hnSavePosition);
    window.addEventListener("resize", () => hnNav?.refresh(), { passive: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  hnDarkQuery.addEventListener("change", () => hnApplySettings(settings));

  // Exposed for the browser console and for the settings UI.
  (window as unknown as { hnTweak: unknown }).hnTweak = {
    get settings() {
      return settings;
    },
    apply(next: Partial<HnSettings>) {
      settings = { ...settings, ...next };
      hnApplySettings(settings);
      hnSaveSettings(settings);
    },
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
