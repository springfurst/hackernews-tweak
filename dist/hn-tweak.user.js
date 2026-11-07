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
/** How many depth-coloured rails we draw. Extra depth is simply clamped. */
const HN_RAIL_LAYERS = 12;
function hnIndentPx(depth, o) {
    return Math.min(depth, o.indentCap) * o.indentStep;
}
/** Hue ramp for the nesting rails; consecutive depths are far apart in hue. */
function hnRailHue(depth) {
    return (depth * 47 + 200) % 360;
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
    // One 1px vertical line per depth, each its own hue. Layers past the row's
    // own indent fall outside the cell and are clipped, so a comment at depth N
    // shows N rails — one per ancestor.
    let railVarsLight = "";
    let railVarsDark = "";
    const railLayers = [];
    const railPositions = [];
    for (let n = 0; n < HN_RAIL_LAYERS; n++) {
        const hue = hnRailHue(n);
        railVarsLight += `--hn-rail-${n}:hsl(${hue} 55% 45%);`;
        railVarsDark += `--hn-rail-${n}:hsl(${hue} 62% 62%);`;
        railLayers.push(`linear-gradient(var(--hn-rail-${n}),var(--hn-rail-${n}))`);
        railPositions.push(n === 0 ? "0 0" : `calc(var(--hn-step)*${n}) 0`);
    }
    return `
:root{
  --hn-fs:${o.fontSize}px;
  --hn-fs-title:${o.fontSize}px;
  --hn-fs-meta:${Math.max(12, o.fontSize - 3)}px;
  --hn-fs-small:${Math.max(11, o.fontSize - 4)}px;
  --hn-lh:${o.lineHeight};
  ${indentVars}
  ${railVarsLight}
  --hn-bg:#f6f6ef;--hn-fg:#1a1a1a;--hn-muted:#5f5f5f;
  --hn-link:#1a1a1a;--hn-visited:#5f5f5f;
  --hn-badge-bg:#deded3;--hn-badge-fg:#3f3f3f;
  --hn-nav-bg:#eceae1;--hn-nav-fg:#333333;--hn-nav-line:#d5d3c9;--hn-nav-active:#dcdad0;
  --hn-flash:#efe9c4;--hn-accent:#2a5d8f;
}
:root.hn-dark{
  ${railVarsDark}
  --hn-bg:#14161a;--hn-fg:#d7dbe2;--hn-muted:#98a0aa;
  --hn-link:#e6e9ee;--hn-visited:#98a0aa;
  --hn-badge-bg:#242a33;--hn-badge-fg:#aab2bc;
  --hn-nav-bg:#1b2027;--hn-nav-fg:#c3cad4;--hn-nav-line:#2b313a;--hn-nav-active:#252b33;
  --hn-flash:#2b3542;--hn-accent:#7fb2e5;
}

/* ---- layout: kill the fixed widths that cause dead space and overflow ---- */
html,body{max-width:100%!important;overflow-x:clip!important}
#hnmain{width:100%!important;min-width:0!important;max-width:100%!important}
.comment,.toptext{max-width:100%!important;overflow:visible!important;overflow-wrap:anywhere!important}
table.comment-tree{width:100%!important;table-layout:fixed!important}
table.comment-tree td>table{width:100%!important;table-layout:fixed!important}
td.votelinks{width:22px!important;min-width:22px!important}

/* ---- nesting: constant step, clamped depth, depth-coloured guide rails ---- */
td.ind img[src="s.gif"]{display:none!important}
td.ind{
  padding:0!important;
  background-image:${railLayers.join(",")};
  background-size:1px 100%;
  background-position:${railPositions.join(",")};
  background-repeat:no-repeat;
}
td.ind[indent="0"]{background:none!important}
${indentRules}

/* Depth badge, shown only where indentation stops being informative.
   hn.js/stamping puts data-depth on .comhead and toggles .hn-deep. */
.comhead.hn-deep::before{
  content:"\\21B3\\00a0" attr(data-depth);
  display:inline-block;
  margin-right:.45em;
  padding:0 .3em;
  border-radius:3px;
  background:var(--hn-badge-bg);
  color:var(--hn-badge-fg);
  font-size:.95em;
  font-variant-numeric:tabular-nums;
  line-height:1.6;
  vertical-align:baseline;
}

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
/* HN ships rows="8"; on a phone that is ~250px of empty box above the thread. */
textarea[name="text"]{height:6.5em!important;min-height:0!important}
/* HN truncates in-comment links to 200px with an ellipsis; let them wrap. */
table.comment-tree .comment a{max-width:none!important;white-space:normal!important;word-break:break-word!important;overflow:visible!important;text-overflow:clip!important;display:inline!important}

/* ---- comment navigation bar ---- */
html.hn-chrome body{padding-bottom:calc(58px + env(safe-area-inset-bottom))!important}
html:not(.hn-chrome) #hn-nav,html:not(.hn-chrome) #hn-gear{display:none!important}
html:not(.hn-nav-on) #hn-nav{display:none!important}

/* Settings live in their own chip beside the bar rather than as a seventh
   button, and stay reachable when the bar itself is switched off. */
#hn-gear{
  position:fixed;left:0;bottom:0;z-index:9000;
  display:flex;align-items:center;justify-content:center;
  width:46px;min-height:55px;
  padding:4px 0 calc(4px + env(safe-area-inset-bottom));
  background:var(--hn-nav-bg);color:var(--hn-nav-fg);
  border:0;border-top:1px solid var(--hn-nav-line);border-right:1px solid var(--hn-nav-line);
  cursor:pointer;-webkit-tap-highlight-color:transparent;
}
#hn-gear:active{background:var(--hn-nav-active)}
#hn-gear svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

#hn-nav{
  position:fixed;left:46px;right:0;bottom:0;z-index:9000;
  display:flex;gap:2px;
  padding:4px 4px calc(4px + env(safe-area-inset-bottom));
  background:var(--hn-nav-bg);
  border-top:1px solid var(--hn-nav-line);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
}
#hn-nav button{
  flex:1 1 0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;min-height:46px;padding:5px 2px;border:0;border-radius:7px;
  background:transparent;color:var(--hn-nav-fg);
  font:inherit;font-size:10px;line-height:1;letter-spacing:.02em;
  cursor:pointer;-webkit-tap-highlight-color:transparent;
}
#hn-nav button:active{background:var(--hn-nav-active)}
#hn-nav button[disabled]{opacity:.3}
#hn-nav svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

/* Briefly highlight where navigation landed. This has to sit on .commtext:
   the !important transparent td background outranks an animation on the
   cell itself. */
@keyframes hn-flash{from{background-color:var(--hn-flash)}to{background-color:transparent}}
tr.hn-flash .commtext{animation:hn-flash 1.3s ease-out;border-radius:3px}

/* Persistent marker for the comment the nav bar is navigating from. Right
   edge, not left: the left gutter already carries the nesting rails. No
   padding or margin, so the marker never re-wraps text as it moves. */
tr.hn-ref td.default{box-shadow:inset -3px 0 0 var(--hn-accent)}

/* enlarge the [–] collapse target without shifting layout */
.comhead .togg{padding:6px 12px 6px 2px;margin:-6px -12px -6px -2px}

/* ---- settings sheet ---- */
#hn-sheet{position:fixed;inset:0;z-index:9500}
#hn-sheet[hidden]{display:none!important}
.hn-sheet-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.5)}
.hn-sheet-panel{
  position:absolute;left:0;right:0;bottom:0;
  max-height:84vh;overflow-y:auto;overscroll-behavior:contain;
  padding:10px 18px calc(20px + env(safe-area-inset-bottom));
  background:var(--hn-nav-bg);color:var(--hn-fg);
  border-radius:14px 14px 0 0;
  box-shadow:0 -10px 34px rgba(0,0,0,.4);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
  animation:hn-sheet-in .18s ease-out;
}
@keyframes hn-sheet-in{from{transform:translateY(16px);opacity:.5}to{transform:none;opacity:1}}
.hn-sheet-grip{width:38px;height:4px;border-radius:2px;background:var(--hn-nav-line);margin:0 auto 14px}
#hn-sheet h3{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--hn-muted);margin:18px 0 8px;font-weight:600}
.hn-seg{display:flex;gap:6px}
.hn-seg button{flex:1;padding:10px 0;border:1px solid var(--hn-nav-line);border-radius:8px;background:transparent;color:var(--hn-fg);font:inherit;font-size:13px;cursor:pointer}
.hn-seg button[aria-checked="true"]{background:var(--hn-accent);border-color:var(--hn-accent);color:var(--hn-bg)}
.hn-field{margin:12px 0}
.hn-field label{display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px}
.hn-field output{color:var(--hn-muted);font-variant-numeric:tabular-nums}
.hn-field input[type="range"]{width:100%;accent-color:var(--hn-accent)}
.hn-check{display:flex;align-items:center;gap:9px;font-size:14px;margin:12px 0;cursor:pointer}
.hn-check input{width:18px;height:18px;accent-color:var(--hn-accent)}
.hn-btn{display:block;width:100%;margin-top:12px;padding:12px;border:1px solid var(--hn-nav-line);border-radius:9px;background:transparent;color:var(--hn-fg);font:inherit;font-size:14px;cursor:pointer}
.hn-btn:active{background:var(--hn-nav-active)}
.hn-done{margin-top:16px;background:var(--hn-accent);border-color:var(--hn-accent);color:var(--hn-bg)}

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
   near 4.5:1 so heavily downvoted comments stay legible. */
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
 * The stylesheet does the reading work. This script injects it, pushes
 * settings into CSS custom properties on <html>, and adds a thumb-reachable
 * comment navigation bar plus a settings sheet.
 *
 * Nothing here restructures HN's DOM: `hn.js` derives the comment tree from
 * the `indent` attribute and collapses by toggling `coll`/`noshow`, so we only
 * add attributes, classes and a couple of fixed-position elements.
 */
const HN_MAX_INDENT = 21;
const HN_SETTINGS_KEY = "hn-tweak:settings";
const HN_POS_PREFIX = "hn-tweak:pos:";
const HN_POS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Space left above a comment when we scroll to it. */
const HN_NAV_OFFSET = 12;
const HN_DEFAULTS = {
    theme: "auto",
    fontSize: 16,
    lineHeight: 1.5,
    indentStep: 10,
    indentCap: 8,
    navBar: true,
    rememberPosition: true,
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
/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
function hnReadSettings() {
    const stored = hnStore.get(HN_SETTINGS_KEY, null);
    return stored && typeof stored === "object"
        ? { ...HN_DEFAULTS, ...stored }
        : { ...HN_DEFAULTS };
}
let hnSettings = { ...HN_DEFAULTS };
/** Single write path: everything (panel, console API, reset) goes through here. */
function hnUpdate(next) {
    hnSettings = { ...hnSettings, ...next };
    hnApplySettings(hnSettings);
    hnStore.set(HN_SETTINGS_KEY, hnSettings);
}
const hnDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function hnPrefersDark(theme) {
    return theme === "dark" || (theme === "auto" && hnDarkQuery.matches);
}
/* ------------------------------------------------------------------ */
/* Comment tree                                                        */
/* ------------------------------------------------------------------ */
function hnRows() {
    return Array.from(document.querySelectorAll("tr.athing.comtr"));
}
function hnDepth(row) {
    const ind = row.querySelector("td.ind");
    return ind ? Number(ind.getAttribute("indent")) || 0 : 0;
}
function hnParentIndex(rows, i) {
    const d = hnDepth(rows[i]);
    for (let j = i - 1; j >= 0; j--)
        if (hnDepth(rows[j]) < d)
            return j;
    return -1;
}
function hnFirstChildIndex(rows, i) {
    const d = hnDepth(rows[i]);
    if (i + 1 < rows.length && hnDepth(rows[i + 1]) === d + 1)
        return i + 1;
    return -1;
}
function hnPrevSiblingIndex(rows, i) {
    const d = hnDepth(rows[i]);
    for (let j = i - 1; j >= 0; j--) {
        const dj = hnDepth(rows[j]);
        if (dj < d)
            return -1;
        if (dj === d)
            return j;
    }
    return -1;
}
function hnRootIndex(rows, i) {
    if (hnDepth(rows[i]) === 0)
        return i;
    for (let j = i - 1; j >= 0; j--)
        if (hnDepth(rows[j]) === 0)
            return j;
    return -1;
}
/** First row at or above this row's depth — i.e. past the whole subtree. */
function hnAfterSubtreeIndex(rows, i) {
    const d = hnDepth(rows[i]);
    for (let j = i + 1; j < rows.length; j++)
        if (hnDepth(rows[j]) <= d)
            return j;
    return -1;
}
/**
 * The comment currently at the top of the reading area. Rows are in document
 * order, so their viewport tops are monotonic — binary search keeps this cheap
 * enough to run every animation frame.
 */
function hnCurrentIndex(rows) {
    // After an explicit jump, stay anchored to the comment we landed on. Deriving
    // it from scroll position immediately would pick whatever sits 35% down the
    // screen, which is usually a *later* comment — so pressing prev twice would
    // move forward, or nowhere at all.
    if (hnOverrideRow) {
        const idx = rows.indexOf(hnOverrideRow);
        if (idx >= 0)
            return idx;
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
        }
        else {
            hi = mid - 1;
        }
    }
    return best;
}
/**
 * Stamp each comment's depth onto its `.comhead` so the stylesheet can render
 * a badge where indentation has been clamped.
 */
function hnUpdateDepths() {
    for (const row of hnRows()) {
        const comhead = row.querySelector(".comhead");
        if (!comhead)
            continue;
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
let hnOverrideRow = null;
/** Last scroll offset we set ourselves, so we can tell programmatic from manual. */
let hnProgrammaticY = -1;
/**
 * Animate the scroll ourselves instead of using `behavior: "smooth"`.
 * Native smooth scrolling is distance-dependent and gets dropped for long
 * jumps, which made navigation feel like it sometimes teleported.
 */
function hnScrollTo(targetY) {
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
    const step = (now) => {
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
function hnCancelScroll() {
    if (hnScrollFrame) {
        cancelAnimationFrame(hnScrollFrame);
        hnScrollFrame = 0;
    }
}
/** Expand any collapsed ancestor so the target is actually rendered. */
function hnEnsureVisible(rows, i) {
    let guard = 0;
    while (rows[i] && rows[i].offsetParent === null && guard++ < 32) {
        const p = hnParentIndex(rows, i);
        if (p < 0)
            break;
        if (rows[p].classList.contains("coll")) {
            rows[p].querySelector(".togg")?.click();
        }
        i = p;
    }
}
let hnFlashTimer = 0;
function hnGoto(row) {
    if (!row)
        return;
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
function hnFoldAndAdvance(rows, i) {
    const row = rows[i];
    const hasChildren = i + 1 < rows.length && hnDepth(rows[i + 1]) > hnDepth(row);
    if (hasChildren && !row.classList.contains("coll")) {
        row.querySelector(".togg")?.click();
    }
    const next = hnAfterSubtreeIndex(rows, i);
    hnGoto(next >= 0 ? rows[next] : rows[i + 1]);
}
/* ------------------------------------------------------------------ */
/* Navigation bar                                                      */
/* ------------------------------------------------------------------ */
const HN_ICONS = {
    parent: '<path d="M8 13V4M4 8l4-4 4 4"/>',
    child: '<path d="M8 3v9M4 8l4 4 4-4"/>',
    prev: '<path d="M10 3L5 8l5 5"/>',
    next: '<path d="M6 3l5 5-5 5"/>',
    fold: '<path d="M3 2h10M4 6l4 4 4-4"/>',
    settings: '<path d="M3 5h10M3 11h10"/><circle cx="6" cy="5" r="1.7"/><circle cx="10" cy="11" r="1.7"/>',
};
function hnBuildNav() {
    if (document.documentElement.getAttribute("op") !== "item")
        return null;
    if (hnRows().length === 0)
        return null;
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
    const buttons = new Map();
    const go = (rows, idx) => {
        if (idx < 0 || idx >= rows.length)
            return;
        hnEnsureVisible(rows, idx);
        hnGoto(rows[idx]);
    };
    const add = (kind, label, action) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("aria-label", label);
        b.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${HN_ICONS[kind]}</svg><span>${label}</span>`;
        b.addEventListener("click", () => {
            const rows = hnRows();
            if (rows.length === 0)
                return;
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
    let refRow = null;
    const refresh = () => {
        const rows = hnRows();
        if (rows.length === 0)
            return;
        const i = hnCurrentIndex(rows);
        if (rows[i] !== refRow) {
            refRow?.classList.remove("hn-ref");
            rows[i].classList.add("hn-ref");
            refRow = rows[i];
        }
        const state = {
            parent: hnParentIndex(rows, i) >= 0,
            child: hnFirstChildIndex(rows, i) >= 0,
            prev: hnPrevSiblingIndex(rows, i) >= 0 || hnParentIndex(rows, i) >= 0,
            next: hnAfterSubtreeIndex(rows, i) >= 0,
            fold: hnAfterSubtreeIndex(rows, i) >= 0,
        };
        for (const [kind, b] of buttons)
            b.disabled = !state[kind];
    };
    document.body.appendChild(bar);
    for (const ev of ["touchstart", "wheel", "keydown"]) {
        window.addEventListener(ev, hnCancelScroll, { passive: true });
    }
    refresh();
    return { refresh };
}
/* ------------------------------------------------------------------ */
/* Settings sheet                                                      */
/* ------------------------------------------------------------------ */
function hnSheet() {
    return document.getElementById("hn-sheet");
}
function hnOpenSheet() {
    const sheet = hnSheet();
    if (!sheet)
        return;
    hnSyncSheet();
    sheet.hidden = false;
}
function hnCloseSheet() {
    const sheet = hnSheet();
    if (sheet)
        sheet.hidden = true;
}
function hnSyncSheet() {
    const sheet = hnSheet();
    if (!sheet)
        return;
    for (const b of sheet.querySelectorAll("[data-theme]")) {
        b.setAttribute("aria-checked", String(b.dataset.theme === hnSettings.theme));
    }
    const bind = (id, value, suffix) => {
        const input = sheet.querySelector(`#${id}`);
        const out = sheet.querySelector(`#${id}-out`);
        if (input)
            input.value = String(value);
        if (out)
            out.textContent = `${value}${suffix}`;
    };
    bind("hn-fs", hnSettings.fontSize, "px");
    bind("hn-step", hnSettings.indentStep, "px");
    bind("hn-cap", hnSettings.indentCap, "");
    const remember = sheet.querySelector("#hn-remember");
    if (remember)
        remember.checked = hnSettings.rememberPosition;
    const navBar = sheet.querySelector("#hn-navbar");
    if (navBar)
        navBar.checked = hnSettings.navBar;
}
function hnBuildSheet() {
    if (hnSheet())
        return;
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
        if (rows.length)
            hnGoto(rows[hnRootIndex(rows, hnCurrentIndex(rows))]);
        hnCloseSheet();
    });
    for (const b of wrap.querySelectorAll("[data-theme]")) {
        b.addEventListener("click", () => {
            const theme = b.dataset.theme;
            hnUpdate({ theme });
            hnSyncSheet();
        });
    }
    const wireRange = (id, key, suffix) => {
        const input = wrap.querySelector(`#${id}`);
        const out = wrap.querySelector(`#${id}-out`);
        input?.addEventListener("input", () => {
            const value = Number(input.value);
            if (out)
                out.textContent = `${value}${suffix}`;
            hnUpdate({ [key]: value });
        });
    };
    wireRange("hn-fs", "fontSize", "px");
    wireRange("hn-step", "indentStep", "px");
    wireRange("hn-cap", "indentCap", "");
    wrap.querySelector("#hn-remember")?.addEventListener("change", (e) => {
        hnUpdate({ rememberPosition: e.target.checked });
    });
    wrap.querySelector("#hn-navbar")?.addEventListener("change", (e) => {
        hnUpdate({ navBar: e.target.checked });
    });
    wrap.querySelector(".hn-reset")?.addEventListener("click", () => {
        hnUpdate({ ...HN_DEFAULTS });
        hnSyncSheet();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape")
            hnCloseSheet();
    });
}
function hnPosKey() {
    if (document.documentElement.getAttribute("op") !== "item")
        return null;
    const id = new URLSearchParams(location.search).get("id");
    return id && /^\d+$/.test(id) ? HN_POS_PREFIX + id : null;
}
function hnSavePosition() {
    if (!hnSettings.rememberPosition)
        return;
    const key = hnPosKey();
    if (!key)
        return;
    const rows = hnRows();
    if (rows.length === 0)
        return;
    const row = rows[hnCurrentIndex(rows)];
    if (!row.id)
        return;
    // The current comment's top relative to the viewport. Restoring is then
    // exact: rowTop - dy reproduces the scroll offset we saved at.
    const dy = Math.round(row.getBoundingClientRect().top);
    hnStore.set(key, { cid: row.id, dy, ts: Date.now() });
}
let hnRestored = false;
function hnRestorePosition() {
    if (hnRestored || !hnSettings.rememberPosition)
        return;
    const key = hnPosKey();
    if (!key)
        return;
    if (location.hash)
        return; // an explicit permalink wins
    const saved = hnStore.get(key, null);
    if (!saved || typeof saved !== "object" || !saved.cid)
        return;
    if (Date.now() - (saved.ts || 0) > HN_POS_TTL_MS)
        return;
    const row = document.getElementById(saved.cid);
    if (!row)
        return;
    hnRestored = true;
    window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - (saved.dy || 0));
}
/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */
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
let hnNav = null;
let hnLastCap = -1;
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
function hnOnScroll() {
    // A real scroll (not ours) releases the jump anchor.
    if (hnOverrideRow && hnScrollFrame === 0 && Math.abs(window.scrollY - hnProgrammaticY) > 4) {
        hnOverrideRow = null;
    }
    if (hnScrollRaf)
        return;
    hnScrollRaf = requestAnimationFrame(() => {
        hnScrollRaf = 0;
        hnNav?.refresh();
        hnSavePosition();
    });
}
function hnStart() {
    hnSettings = hnReadSettings();
    hnApplySettings(hnSettings);
    const boot = () => {
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
    }
    else {
        boot();
    }
    hnDarkQuery.addEventListener("change", () => hnApplySettings(hnSettings));
    window.hnTweak = {
        get settings() {
            return hnSettings;
        },
        apply: hnUpdate,
        openSettings: hnOpenSheet,
    };
}
if (location.hostname === "news.ycombinator.com") {
    hnInjectStyle(hnBuildCss({
        fontSize: HN_DEFAULTS.fontSize,
        lineHeight: HN_DEFAULTS.lineHeight,
        indentStep: HN_DEFAULTS.indentStep,
        indentCap: HN_DEFAULTS.indentCap,
        maxIndent: HN_MAX_INDENT,
    }));
    hnStart();
}

})();
