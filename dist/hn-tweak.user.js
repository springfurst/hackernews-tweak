// ==UserScript==
// @name         HN Tweak
// @namespace    hn-tweak
// @version      0.1.0
// @description  Readable, dark, mobile-friendly Hacker News
// @match        https://news.ycombinator.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// ==/UserScript==

(function () {
"use strict";

/**
 * Stylesheet for HN Tweak.
 *
 * Written to override `news.css`, which ships hardcoded `max-width` bands for
 * `.comment` in its "mobile device" media queries. Those bands are the root
 * cause of both the dead space on the right and the horizontal overflow at
 * depth, because they ignore how far the comment is indented.
 *
 * The stylesheet itself never changes after injection: every knob is a CSS
 * custom property on `<html>`, so settings can be applied (and re-applied)
 * with `style.setProperty` alone. That keeps us compatible with
 * `GM_addStyle`, which does not hand back the element it created.
 */
function hnIndentPx(depth, o) {
    return Math.min(depth, o.indentCap) * o.indentStep;
}
function hnBuildCss(o) {
    // HN renders indentation as a 1px transparent GIF whose `width` attribute is
    // 40 * depth. news.css only rescales it to 12px/level inside a
    // `300px..750px` media query, and only for depths 1..21 — so landscape and
    // deep threads both blow out. We hide the spacer and drive the offset from
    // the `indent` attribute instead, which is the same source of truth hn.js
    // uses for collapsing.
    let indentVars = "";
    let indentRules = "";
    for (let n = 0; n <= o.maxIndent; n++) {
        indentVars += `--hn-w-${n}:${hnIndentPx(n, o)}px;`;
        indentRules += `td.ind[indent="${n}"]{width:var(--hn-w-${n})!important}`;
    }
    return `
:root{
  --hn-fs:${o.fontSize}px;
  --hn-fs-title:${o.fontSize}px;
  --hn-fs-meta:${Math.max(12, o.fontSize - 3)}px;
  --hn-fs-small:${Math.max(11, o.fontSize - 4)}px;
  --hn-lh:${o.lineHeight};
  ${indentVars}
  --hn-bg:#f6f6ef;--hn-fg:#1a1a1a;--hn-muted:#5f5f5f;
  --hn-link:#1a1a1a;--hn-visited:#5f5f5f;--hn-rail:#cfcfc6;
}
:root.hn-dark{
  --hn-bg:#14161a;--hn-fg:#d7dbe2;--hn-muted:#98a0aa;
  --hn-link:#e6e9ee;--hn-visited:#98a0aa;--hn-rail:#2b313a;
}

/* ---- layout: kill the fixed widths that cause dead space and overflow ---- */
html,body{max-width:100%!important;overflow-x:clip!important}
#hnmain{width:100%!important;min-width:0!important;max-width:100%!important}
.comment,.toptext{max-width:100%!important;overflow:visible!important;overflow-wrap:anywhere!important}
table.comment-tree{width:100%!important;table-layout:fixed!important}
table.comment-tree td>table{width:100%!important;table-layout:fixed!important}
td.votelinks{width:22px!important;min-width:22px!important}

/* ---- nesting: constant step, clamped depth, guide rails ---- */
td.ind img[src="s.gif"]{display:none!important}
td.ind{padding:0!important;background:repeating-linear-gradient(to right,var(--hn-rail) 0 1px,transparent 1px var(--hn-step))}
td.ind[indent="0"]{background:none!important}
${indentRules}

/* ---- type ---- */
.commtext{font-size:var(--hn-fs)!important;line-height:var(--hn-lh)!important;color:var(--hn-fg)!important}
.title,.titleline{font-size:var(--hn-fs-title)!important;line-height:1.35!important}
.titleline a{color:var(--hn-link)!important}
.subtext{font-size:var(--hn-fs-meta)!important;color:var(--hn-muted)!important}
.subtext a:link,.subtext a:visited{color:var(--hn-muted)!important}
.comhead{font-size:var(--hn-fs-meta)!important;line-height:1.4!important;color:var(--hn-muted)!important}
.comhead a:link,.comhead a:visited{color:var(--hn-link)!important}
/* news.css paints these #828282, which is only 3.4:1 on the light background. */
.default,.toptext{font-size:var(--hn-fs)!important;color:var(--hn-fg)!important}
.title{color:var(--hn-fg)!important}
.rank{color:var(--hn-muted)!important}
.sitestr,.sitebit{color:var(--hn-muted)!important}
.morelink{font-size:var(--hn-fs)!important}
/* The "reply" link lives inside <font size="1"> and renders at 10px. */
.reply,.reply a,.reply font{font-size:var(--hn-fs-meta)!important}
.yclinks,.yclinks a{font-size:var(--hn-fs-small)!important;color:var(--hn-muted)!important}
.yclinks a:link,.yclinks a:visited{color:var(--hn-muted)!important}
input[type="submit"],input[type="button"]{font-size:var(--hn-fs-meta)!important}
.pagetop,.pagetop a{font-size:var(--hn-fs-meta)!important}
.pagetop b,.pagetop b a{font-size:var(--hn-fs)!important}
/* HN truncates in-comment links to 200px with an ellipsis; let them wrap. */
table.comment-tree .comment a{max-width:none!important;white-space:normal!important;word-break:break-word!important;overflow:visible!important;text-overflow:clip!important;display:inline!important}

/* ---- dark ---- */
html.hn-dark{color-scheme:dark}
html.hn-dark,html.hn-dark body{background:var(--hn-bg)!important;color:var(--hn-fg)!important}
html.hn-dark #hnmain{background-color:var(--hn-bg)!important}
/* Inner cells must stay transparent or they paint over the orange header. */
html.hn-dark #hnmain td{background-color:transparent!important}
html.hn-dark #hnmain td[bgcolor]{background-color:#ff6600!important}
html.hn-dark a:link{color:var(--hn-link)!important}
html.hn-dark a:visited{color:var(--hn-visited)!important}
html.hn-dark .comment a:link,html.hn-dark .comment a:visited{color:#7fb2e5!important}
/* Downvote greys: keep HN's "this is greyed out" signal, but keep a floor
   near 4:1 so heavily downvoted comments stay legible. */
html.hn-dark .c5a,html.hn-dark .c5a a:link{color:#c3c9d2!important}
html.hn-dark .c73,html.hn-dark .c73 a:link{color:#b8bec7!important}
html.hn-dark .c82,html.hn-dark .c82 a:link{color:#adb4bd!important}
html.hn-dark .c88,html.hn-dark .c88 a:link{color:#a2a9b2!important}
html.hn-dark .c9c,html.hn-dark .c9c a:link{color:#97a0a9!important}
html.hn-dark .cae,html.hn-dark .cae a:link{color:#8d959e!important}
html.hn-dark .cbe,html.hn-dark .cbe a:link{color:#838b94!important}
html.hn-dark .cce,html.hn-dark .cce a:link{color:#7d858e!important}
html.hn-dark .cdd,html.hn-dark .cdd a:link{color:#78808a!important}
html.hn-dark .comhead,html.hn-dark .subtext,html.hn-dark .yclinks,
html.hn-dark .age a:link,html.hn-dark .age a:visited{color:var(--hn-muted)!important}
/* .votearrow is triangle.svg (fill #999); invert so it reads on dark. */
html.hn-dark .votearrow{filter:invert(1) brightness(1.7)}
html.hn-dark .pagetop,html.hn-dark .pagetop a:link,html.hn-dark .pagetop a:visited{color:#1a1a1a!important}
html.hn-dark .title a:link,html.hn-dark .title a:visited{color:var(--hn-link)!important}
html.hn-dark pre{background:#1b1f25!important;color:var(--hn-fg)!important}
html.hn-dark textarea,html.hn-dark input[type="text"],html.hn-dark input[type="password"],html.hn-dark input[type="number"]{background:#1d2026!important;color:var(--hn-fg)!important;border:1px solid #333a44!important}
html.hn-dark input[readonly]{background:#1d2026!important;color:var(--hn-muted)!important}
html.hn-dark input[type="submit"]{background:#2a2f37!important;color:var(--hn-fg)!important;border:1px solid #3a424d!important}
html.hn-dark .reply a:link,html.hn-dark .reply a:visited{color:var(--hn-muted)!important}
`;
}

/**
 * HN Tweak — readable, dark, mobile-friendly Hacker News.
 *
 * v1 is stylesheet-only. The script's job is to inject the sheet once and then
 * push settings into CSS custom properties on <html>.
 */
const HN_MAX_INDENT = 21;
const HN_SETTINGS_KEY = "hn-tweak:settings";
const HN_DEFAULTS = {
    theme: "auto",
    fontSize: 16,
    lineHeight: 1.5,
    indentStep: 10,
    indentCap: 8,
};
const hnStore = {
    get(key, fallback) {
        if (typeof GM_getValue === "function") {
            const v = GM_getValue(key, undefined);
            return v === undefined ? fallback : v;
        }
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        }
        catch {
            return fallback;
        }
    },
    set(key, value) {
        if (typeof GM_setValue === "function") {
            GM_setValue(key, value);
            return;
        }
        try {
            localStorage.setItem(key, JSON.stringify(value));
        }
        catch {
            /* storage unavailable; keep the in-memory value only */
        }
    },
};
function hnReadSettings() {
    const stored = hnStore.get(HN_SETTINGS_KEY, null);
    return stored && typeof stored === "object"
        ? { ...HN_DEFAULTS, ...stored }
        : { ...HN_DEFAULTS };
}
function hnSaveSettings(s) {
    hnStore.set(HN_SETTINGS_KEY, s);
}
const hnDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function hnPrefersDark(theme) {
    return theme === "dark" || (theme === "auto" && hnDarkQuery.matches);
}
function hnApplySettings(s) {
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
function hnInjectStyle(css) {
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
function hnMain() {
    if (location.hostname !== "news.ycombinator.com")
        return;
    hnInjectStyle(hnBuildCss({
        fontSize: HN_DEFAULTS.fontSize,
        lineHeight: HN_DEFAULTS.lineHeight,
        indentStep: HN_DEFAULTS.indentStep,
        indentCap: HN_DEFAULTS.indentCap,
        maxIndent: HN_MAX_INDENT,
    }));
    let settings = hnReadSettings();
    hnApplySettings(settings);
    hnDarkQuery.addEventListener("change", () => hnApplySettings(settings));
    // Exposed for the browser console and for the settings UI in v2.
    window.hnTweak = {
        get settings() {
            return settings;
        },
        apply(next) {
            settings = { ...settings, ...next };
            hnApplySettings(settings);
            hnSaveSettings(settings);
        },
    };
}
hnMain();

})();
