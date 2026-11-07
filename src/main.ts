/**
 * HN Tweak — readable, dark, mobile-friendly Hacker News.
 *
 * v1 is stylesheet-only. The script's job is to inject the sheet once and then
 * push settings into CSS custom properties on <html>.
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
}

const HN_MAX_INDENT = 21;
const HN_SETTINGS_KEY = "hn-tweak:settings";

const HN_DEFAULTS: HnSettings = {
  theme: "auto",
  fontSize: 16,
  lineHeight: 1.5,
  indentStep: 10,
  indentCap: 8,
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

function hnPrefersDark(theme: HnSettings["theme"]): boolean {
  return theme === "dark" || (theme === "auto" && hnDarkQuery.matches);
}

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
    const width = Math.min(n, s.indentCap) * s.indentStep;
    style.setProperty(`--hn-w-${n}`, `${width}px`);
  }

  root.classList.toggle("hn-dark", hnPrefersDark(s.theme));
}

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

function hnMain(): void {
  if (location.hostname !== "news.ycombinator.com") return;

  hnInjectStyle(
    hnBuildCss({
      fontSize: HN_DEFAULTS.fontSize,
      lineHeight: HN_DEFAULTS.lineHeight,
      indentStep: HN_DEFAULTS.indentStep,
      indentCap: HN_DEFAULTS.indentCap,
      maxIndent: HN_MAX_INDENT,
    }),
  );

  let settings = hnReadSettings();
  hnApplySettings(settings);

  hnDarkQuery.addEventListener("change", () => hnApplySettings(settings));

  // Exposed for the browser console and for the settings UI in v2.
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

hnMain();
