# HN Tweak

A userscript that makes Hacker News readable on a phone: bigger type, dark
mode, and no horizontal overflow.

Aimed at Firefox for Android + [Violentmonkey] or [Tampermonkey] (both list
Android support on AMO: Violentmonkey ≥ 121, Tampermonkey ≥ 120).

## What it fixes

These were measured against HN's current `news.css`, not guessed:

| Problem | Cause | Fix |
| --- | --- | --- |
| Comments stop short of the right edge | `.comment { max-width: 350px }` bands keyed to viewport width (270/350/460/…), ignoring indent. On a 430px phone that wastes **48px**; at 360px, **58px**. | `max-width: 100%` + fixed table layout |
| Horizontal scrolling | `#hnmain { min-width: 796px }` is only neutralised inside a `300px–750px` media query, so at 760px wide the page is 804px → **44px overflow** | `width: 100%; min-width: 0` unconditionally |
| Deep replies unreadable in landscape | Indentation is a 1px GIF with a `width` attribute, rescaled to 12px/level *only* inside `max-width: 750px`. In landscape it reverts to 40px/level — at depth 14 that leaves a **202px** comment body. | Hide the spacer, drive offset from the `indent` attribute, clamp at 8 levels, draw nesting rails |
| Text too small | `.comment` is 9pt (12px), `.comhead` 8pt (10.67px), `.reply` **10px**, `.toptext`/`.default` 13.3px | 16px body, 13px metadata, scaled from one `--hn-fs` variable |
| No dark mode | HN ships none, and colours are presentational attributes (`bgcolor="#f6f6ef"`), so overrides need `!important` | `prefers-color-scheme`-aware theme |
| Low-contrast text | `.toptext`/`.default` are `#828282` — **3.4:1** on the light background, failing WCAG AA | Re-mapped greys, all body text ≥ 4.5:1 |
| Deep replies indistinguishable | Indent is clamped at 8 levels, so depth 9+ all look identical | A hue-coded 1px rail per ancestor level, plus a `↳ 9` badge once depth exceeds `indentCap` |
| Empty comment box eats the top of every thread | `textarea rows="8"` is ~250px on a phone | `6.5em` (104px) |

Contrast was verified programmatically in both themes: every audited selector
now passes WCAG AA (4.5:1 for normal text). The downvote-grey ramp keeps HN's
"this is dimmed" signal but floors at ~4.5:1 instead of HN's ~1.4:1.

## Install

1. Install Violentmonkey or Tampermonkey in Firefox for Android.
2. Grant it access to all sites (Android Firefox requires this for userscripts).
3. Open `dist/hn-tweak.user.js` and install it.

## Develop

```sh
npm install
npm run build      # -> dist/hn-tweak.user.js
npm run typecheck
```

`src/css.ts` holds the stylesheet, `src/main.ts` the runtime. The build runs
`tsc` and concatenates the two emitted files inside an IIFE, then prepends the
userscript metadata block. No bundler.

## Settings

v1 is stylesheet-only. Settings live in `GM_getValue("hn-tweak:settings")`
(`localStorage` when the GM API is absent) and can be poked from the console:

```js
hnTweak.apply({ theme: "dark" });   // "auto" | "light" | "dark"
hnTweak.apply({ fontSize: 17 });
hnTweak.apply({ indentStep: 8, indentCap: 6 });  // badge appears past depth 6
```

`indentCap` is what the depth badge keys off: at or below the cap the rails
already convey the level, so no number is shown.

Every knob is a CSS custom property on `<html>`, so the sheet itself is
injected once and never rebuilt.

## Design notes

- **Do not restructure the DOM.** `hn.js` derives the comment tree from the
  `indent` attribute and collapses by toggling `coll`/`noshow` classes (and
  POSTing `collapse?id=` when logged in, so state persists server-side). We
  only add styles.
- HN already emits `parent` / `root` / `prev` / `next` anchors per comment —
  they are plain `href="#id"` jumps, so comment navigation costs no JS. v2
  should surface them as tap targets rather than reimplement them.

## Roadmap

- [ ] Thumb-reachable comment nav (parent / prev / next / root / first child)
- [ ] Remember reading position per thread
- [ ] Collapse-and-advance
- [ ] Minimal settings sheet

[Violentmonkey]: https://addons.mozilla.org/android/addon/violentmonkey/
[Tampermonkey]: https://addons.mozilla.org/android/addon/tampermonkey/
