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

## Navigation

On comment pages a fixed bar sits at the bottom, tracking whichever comment is
at the top of the reading area. It is ordered for a right thumb — the
recovery and rarely-used actions are leftmost, the ones you reach for are
rightmost:

| Button | Goes to |
| --- | --- |
| `back` | the previous stop on the reading trail |
| `forward` | the next stop on the trail |
| `parent` | one level up |
| `child` | first reply |
| `prev` | previous sibling, or up to the parent when this is a first child |
| `next` | next sibling, or the parent's next sibling when this is the last child |

Back/forward walk a single trail of *stops* — places you came to rest,
whether you got there by jumping or by scrolling. A stack of jumps alone goes
stale as soon as you scroll: after reading on for a screen or two, the jump
you would undo is no longer related to where you are, so back teleports.

So scrolling also leaves stops. Once scrolling settles, a manual scroll that
moved far enough and landed on a different comment becomes a stop of its own.
Back then returns to where that scroll *started* rather than jumping past
everything you just read. A new stop truncates the forward branch, as a browser
does. The trail is capped at 60 entries.

Before any back/forward (or jump), the current position is written into the
current waypoint, so the opposite button returns to exactly where you were —
including a partial scroll that never became a stop. Two dead zones keep this
from turning into noise, both adjustable under **Navigation** in the panel:

| Setting | Default | Meaning |
| --- | --- | --- |
| Settle time | 600 ms | how long scrolling must be still before it can become a stop |
| Scroll dead zone | 1.50 screens | how far a manual scroll must move to become its own stop |
| Position dead zone | 0.10 screens | how far you must drift before it rewrites the current waypoint |

There is no time-based expiry: reading a long comment can take minutes, so
elapsed time says nothing about whether a stop is still relevant. Distance
does.

`fold` moved into the control panel as "Collapse subtree & advance" — HN's own
`[–]` already covers plain collapsing, so it no longer needs a bar slot.

A gear sits to the left of the bar as its own chip rather than a seventh
button, and opens the control panel. It stays put when the bar itself is
switched off, so settings are never unreachable. "Jump to top of thread" lives
in that panel — it was the least-used bar button and gave the gear its slot
without making the bar busier.

Buttons disable themselves when there is nowhere to go, and the comment the bar
is navigating from is marked with an accent bar on its right edge (the left gutter already
carries the nesting rails).

Navigation is computed from the `indent` attribute — the same source of truth
`hn.js` uses — so it needs no extra DOM and survives HN's own collapsing.

After a jump the bar stays anchored to the comment you landed on, and only
falls back to the scroll position once you scroll by hand — otherwise the
"current" comment would immediately become whatever sits 35% down the screen,
which is usually a later one, and pressing `prev` twice would move forward.

Scrolling is animated in script rather than via `behavior: "smooth"`, because
native smooth scrolling is distance-dependent and is dropped for long jumps
(anything over ~3 viewports used to teleport). Duration scales mildly with
distance and is capped at 520ms; `prefers-reduced-motion` and any touch/wheel/
key press cancel straight to the destination.

`fold` clicks HN's real `[–]` toggle rather than reimplementing `collstate()`,
so `coll` / `noshow` / the `[N more]` label and the server-side collapse POST
all stay consistent.

Scrolling back to a thread resumes where you left off (7-day TTL, skipped when
the URL has a `#permalink`).

## Control panel

Tap the gear to open a bottom sheet with theme, font size, indent step, indent
cap, remember-position and navigation-bar toggles, plus reset. Changes apply
live behind the sheet and persist to `GM_setValue("hn-tweak:settings")`
(`localStorage` when the GM API is absent). Close with Done, the backdrop, or
Escape. The same sheet is registered as a userscript menu command
(`HN Tweak settings`) as a second way in.

Everything can also be driven from the console:

```js
hnTweak.apply({ theme: "dark" });   // "auto" | "light" | "dark"
hnTweak.apply({ fontSize: 17 });
hnTweak.apply({ indentStep: 8, indentCap: 6 });  // badge appears past depth 6
hnTweak.apply({ navBar: false });
hnTweak.apply({ rememberPosition: false });
hnTweak.apply({ settleMs: 900, scrollDeadZone: 2.5, positionDeadZone: 0.2 });
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

- [x] Thumb-reachable comment nav (top / parent / child / prev / next / fold)
- [x] Remember reading position per thread
- [x] Collapse-and-advance
- [x] Minimal settings sheet

[Violentmonkey]: https://addons.mozilla.org/android/addon/violentmonkey/
[Tampermonkey]: https://addons.mozilla.org/android/addon/tampermonkey/
