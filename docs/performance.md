# Performance harnesses

This repository has three, each aimed at a different layer. All of them compile
the real source and print numbers; none of them asserts a threshold.

| Harness | Command | Measures |
| ------- | ------- | -------- |
| Render cost | `node .perf/run.mjs` | re-renders, image hints, console issues for 200 cards |
| Playback resolver | `npm run measure:playback` | wall-clock time, request count and connections for the server-side provider inspection |
| Press-to-player | `npm run measure:player` | time from "play" to the player element existing, cold vs. warmed on intent |

The last two exist because opening a title inside CINEMAX was slower than opening
the same provider page on its own. `scripts/measure-playback.mjs` runs the real
`web-resolver.ts` against a local fixture provider (iframe player, three refusing
frames then one open frame, six slow media candidates, five dead candidates then
a live one, six candidates that never answer) and reports the before/after
figures in `docs/round7-report.md` §3. `.perf/playback-run.mjs` renders the real
`PlaybackOverlay` in jsdom with a fixed plan-API latency and records when the
`<iframe>`/`<video>` element appears — that interval is exactly what
`plan-cache.ts` and the intent-prefetch remove.

---

# Render-cost harness (`/.perf`)

This repository has no headless browser, emulator or device in the environment it
is developed and verified in, so "it feels faster" cannot be measured the usual
way. `.perf` is a small, in-repo harness that mounts the **real** components in
jsdom against a **production** React build and reports what the phone actually
pays for: mount cost, the cost of a catalogue revalidation, how many components
re-rendered, and how the images were emitted.

It is a development tool. It is never imported by the app, it is not part of the
bundle, and its generated output is ignored by git and by ESLint.

## Running it

```bash
node .perf/run.mjs         # production React: wall-clock mount + render counters
node .perf/run.mjs --dev   # development React: <Profiler> commit durations
```

Results are written to `.perf/last-run.json` (production) and
`.perf/last-run.dev.json` (development) and echoed to stdout.

Requirements: `node_modules` installed (for React) and `esbuild` + `jsdom`
available - the harness resolves both from `android/.toolchain/tests/node_modules`,
the toolchain the Android test stage already uses.

## What it measures

`.perf/harness.tsx` mounts, in one tree:

* `CatalogueProvider` + `WatchlistProvider` (the real providers),
* a `HomeLike` component that consumes the catalogue and feeds `MovieRow`,
* the real `MovieRow` with **200** cards, and the real `PlatformRail` with all
  19 platform marks,
* a `WatchProbe` that subscribes to the watchlist context - i.e. every save
  button on a page.

The 200 records are generated in the harness (titles `Title 1…200`, TMDB-shaped
image URLs). **No database record, no demo data and no fixture is involved**; the
`fetch` used by the providers is answered locally by the harness.

It then replays what a phone does:

1. **mount** - initial render, timed with `performance.now()`;
2. **60 scroll events** on the poster track, dispatched as a gesture would;
3. **a revalidation with an unchanged library** - what happens when the app is
   brought back to the foreground on Android, or the tab regains focus on the
   web, after 30 s (`CatalogueProvider` dispatches `cinemax:catalogue-refresh`);
4. **a revalidation with one edited title** - the admin renamed a movie, which
   must still reach the screen;
5. `console.error`/`console.warn` are captured, so React's development warnings
   (missing keys, invalid props, `act()` misuse) are reported instead of hidden.

Counters live in the component bodies, so they stay exact in a production build,
where `<Profiler>` is a no-op. `--dev` swaps React for its development build to
read commit durations; the development build is slower, so the two modes are
used for different questions (counts vs. relative cost) and are never mixed
inside a comparison.

## Results (200 cards, 19 platform marks)

Production React build:

| measurement | value |
| --- | --- |
| mount, 200 cards + 19 marks | **29.8 ms** |
| 60 scroll events on the poster track | **3.9 ms** total |
| re-renders on an unchanged revalidation | **0** |
| React development warnings during the run | **0** |
| `<img>` elements emitted | 238 - 213 `loading="lazy"`, 25 `eager` (the first six rail discs and every studio-picker mark) |
| images with intrinsic `width`/`height` | 200 of 200 posters (the 19 brand marks are boxed by CSS) |
| images with `decoding="async"` | 238 of 238 |

Development React build, median of 3 runs, commit durations attributed to the
step that caused them:

| commit | before | after |
| --- | --- | --- |
| initial load (skeleton → 200 cards) | 417.21 ms | 423.45 ms |
| revalidation, library unchanged | **110.62 ms** | **8.07 ms** |
| revalidation, one title edited | 93.78 ms | **7.92 ms** |

The initial-load cost is dominated by painting 200 cards for the first time and
is unchanged (within run-to-run noise). The revalidation columns are the fix
described below.

## What the harness condemned, and what was changed

### 1. A revalidation re-rendered the whole library

`CatalogueProvider` re-reads `/api/movies`, `/api/categories` and `/api/slides`
on focus/visibility after 30 s and replaced its state with the freshly decoded
arrays. Every consumer re-rendered, and - because each row received new object
identities - every `MovieCard` did too, even though nothing had changed. On a
200-title library the harness measured that as a 110 ms commit; on the Android
WebView it lands as a visible stall whenever the app is resumed.

Fix (in `src/components/CatalogueProvider.tsx`): a `reconcile()` step reuses the
previous record objects for records that came back byte-identical
(`JSON.stringify` comparison, done once per load, off the render path), returns
the previous array when *everything* is identical, and `setCatalogue` returns
the previous **state object** when nothing changed at all - so the context value
keeps its identity and no consumer re-renders.

Behaviour is preserved: an edited, added or deleted record produces a different
payload, so it is not reconciled away. The harness proves both halves - after an
unchanged revalidation exactly 0 components re-render, and after editing one
title the row re-renders and the new title is on screen (`editedTitleShown`).

A side benefit: with per-record identity preserved, editing one title now
re-renders **one** card instead of two hundred (93.78 ms → 7.92 ms).

Failure semantics were deliberately left as they were: a rejected `/api/movies`
still clears the list and surfaces the error banner.

### 2. A catalogue revalidation re-rendered every save button

`WatchlistProvider.toggle` listed `catalogue` in its dependency list, only so it
could look up a title when appending a newly saved movie. That made `toggle` -
and therefore the whole context value - change identity on every catalogue
revalidation, re-rendering every component that calls `useWatchlist()`: every
`MovieSaveButton` on the page subscribed to the same value.

Fix (in `src/components/WatchlistProvider.tsx`): the catalogue is read through a
ref that is kept in sync by an effect, so `toggle` stays stable across catalogue
refreshes. The value only changes when the watchlist itself does (saved ids,
pending ids, loading and error states).

### 3. Four `@next/next/no-img-element` disables

All four are kept, each with the concrete reason recorded next to it:

| file | element | why not `next/image` |
| --- | --- | --- |
| `src/components/Artwork.tsx` | posters/backdrops | admins point titles at any licensed image host; the optimizer only serves hosts listed in `images.remotePatterns` at build time. The element already does what the optimizer would: `srcSet` at real widths (185-780), `sizes` per layout, intrinsic `width`/`height`, lazy/eager + `fetchPriority` and async decode. |
| `src/components/PlatformLogo.tsx` | the 19 brand marks | 16 of the 19 marks are SVG, which `next/image` refuses without `dangerouslyAllowSVG`; the rest are WebP. A 1-2 KB local file through the optimizer is an extra request and re-encode for zero saving. |
| `src/components/BottomNav.tsx` | CINEMAX nav mark | same as above: a 991 B in-repo SVG, already sized 20x20. |
| `src/components/ProviderLanding.tsx` | oEmbed thumbnail | the host is only known at runtime, from the provider's own oEmbed response. |

`ProviderLanding`'s thumbnail also gained `loading="lazy"` and
`decoding="async"` (it was the only image on the site without them).

## What was already right (verified, not changed)

These were suspected hot spots and were measured or read line by line; no change
was needed, so none was made:

* **`MovieRow` scroll handling** already coalesces scroll events into one
  `requestAnimationFrame` and only calls `setState` when an arrow's disabled
  state actually changes - 60 dispatched scroll events cost 3.9 ms in total and
  re-render nothing.
* **`MovieCard` hover preview** is behind a 400 ms timer, only starts on
  `(hover: hover) and (pointer: fine)`, stops itself with an
  `IntersectionObserver` when the card leaves the viewport, destroys the
  `hls.js` instance on unmount, and only one preview may run at a time.
* **`VideoPlayer`** coalesces `timeupdate` into one frame with `pendingPlayback`
  and writes resume progress at most every 5 s; every timer and listener is
  cleared on unmount.
* **`BottomNav`** already defers the O(collections x titles) `collectionMeta`
  pass until the More sheet is opened, and its route-change state sync is the
  documented "adjust state during render" pattern (no extra commit, no flash).
* **CSS** is already built for WebView scrolling: `.movie-row` and `.site-footer`
  use `content-visibility: auto` with `contain-intrinsic-size`, posters and
  shimmer placeholders use `contain: paint` / `contain: layout paint`, and only
  two `backdrop-filter` rules exist in the whole sheet.
* **Images**: every poster/backdrop is lazy but the first six (above the fold),
  all carry intrinsic dimensions and `decoding="async"`, and TMDB sources are
  rewritten to `w500`/`w1280` with a `srcSet`, so a phone never downloads an
  original.
* **The Android WebView layer** was re-read for this round: no
  `shouldInterceptRequest` blocking the network thread, no `setLayerType`
  software layer, `setOffscreenPreRaster(false)`, scrollbars disabled via the
  WebView settings (not by hiding overflow), renderer priority lowered in
  `onPause` and restored in `onResume`, and `onTrimMemory` drops the caches.

## Limits

* jsdom has no real layout, compositor or paint, so these numbers measure React
  work and the image attributes emitted - **not** GPU paint, scroll
  compositing or first contentful paint on a device. No frame-rate claim is made
  for the phone.
* Timings come from a development or production React build running on the CI
  machine's CPU, not from the Snapdragon in a phone. They are meaningful as
  **before/after ratios** measured on the same machine with the same fixture.
* The 200-record library is generated in the harness. It reproduces the shape of
  a real catalogue (ids, posters, backdrops, categories) but it is not the
  user's data, and the database in this environment is empty.
