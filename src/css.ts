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

interface CssOptions {
  /** Comment body font size in px. */
  fontSize: number;
  /** Comment body line-height multiplier. */
  lineHeight: number;
  /** Horizontal offset per nesting level, in px. */
  indentStep: number;
  /** Nesting levels that still get indented; deeper levels are clamped. */
  indentCap: number;
  /** Highest `indent` attribute HN emits (currently 21). */
  maxIndent: number;
}

/** How many depth-coloured rails we draw. Extra depth is simply clamped. */
const HN_RAIL_LAYERS = 12;

function hnIndentPx(depth: number, o: CssOptions): number {
  return Math.min(depth, o.indentCap) * o.indentStep;
}

/** Hue ramp for the nesting rails; consecutive depths are far apart in hue. */
function hnRailHue(depth: number): number {
  return (depth * 47 + 200) % 360;
}

function hnBuildCss(o: CssOptions): string {
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
  const railLayers: string[] = [];
  const railPositions: string[] = [];
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
  --hn-flash:#efe9c4;
}
:root.hn-dark{
  ${railVarsDark}
  --hn-bg:#14161a;--hn-fg:#d7dbe2;--hn-muted:#98a0aa;
  --hn-link:#e6e9ee;--hn-visited:#98a0aa;
  --hn-badge-bg:#242a33;--hn-badge-fg:#aab2bc;
  --hn-nav-bg:#1b2027;--hn-nav-fg:#c3cad4;--hn-nav-line:#2b313a;--hn-nav-active:#252b33;
  --hn-flash:#2b3542;
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
html.hn-nav-on body{padding-bottom:calc(58px + env(safe-area-inset-bottom))!important}
html:not(.hn-nav-on) #hn-nav{display:none!important}
#hn-nav{
  position:fixed;left:0;right:0;bottom:0;z-index:9000;
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

/* enlarge the [–] collapse target without shifting layout */
.comhead .togg{padding:6px 12px 6px 2px;margin:-6px -12px -6px -2px}

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
