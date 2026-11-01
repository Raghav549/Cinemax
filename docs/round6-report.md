# CINEMAX - complete warning fix, Android build repair, performance pass and logo integration

Round 6 report. Everything below was executed in this repository on
2026-11-01 and is reproducible with the commands quoted. Where something could
not be verified in this environment, it says so instead of claiming success.

Toolchain used for every number: Node **v22.22.3**, npm **10.9.8**, Python
3.11.2, JDK/aapt2/d8/apksigner from `android/.toolchain` (pinned and
checksum-verified by `android/tools/fetch-toolchain.sh`).

---

## 1. Warnings and errors - what was found, why, and the fix

| # | Warning / error | Root cause | Fix (at source) |
| --- | --- | --- | --- |
| 1 | CI job `apk` failed on every run: *"expected a JVM, a DOM, a brand-artwork and an APK check summary - found 3"* | the workflow still asserted the old 3-layer test suite; the suite had grown a 4th layer (`verify-platform-logos.mjs`) | `.github/workflows/android.yml` counts 4 summaries, and now names each layer it expects (`PASS unit checks`, `PASS DOM behaviour`, `PASS brand artwork`, `PASS APK structure`) instead of trusting a count |
| 2 | The same gate would have passed a *failing* run | `failures=$(grep -vc ...)` style counting: `grep -c` prints `0` **and** exits 1 on no match, so the check aborted instead of comparing | replaced with `grep -qE "failures: [1-9]"` |
| 3 | **Latent CI break found this round:** the evidence gate greps `"All Android checks passed."` and `"PASS <layer>"`, but `run-tests.sh` printed those words wrapped in ANSI colour codes, so the greps could never match a piped log | colours were emitted unconditionally | `android/tests/run-tests.sh` now emits colour only when stdout is a terminal (and honours `NO_COLOR`). Logs are byte-clean; the gate was **not** weakened. Verified by replaying every CI condition against a freshly generated log |
| 4 | 3 x TypeScript `TS6133` (declared but never read): unused `Artwork` import in `src/app/movie/[id]/page.tsx`, unused `playingKey`/`isPlaying` state in `src/components/DetailTrailerBackdrop.tsx`, unused `catalogue` in `tests/redesign.spec.ts` | dead code left behind by earlier refactors | removed. No `eslint-disable`, no `@ts-ignore` |
| 5 | `tsconfig.json` could not catch that class of warning again | the flags were off | `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride` enabled under the existing `strict`; `npm run typecheck` is clean with them on |
| 6 | ESLint reported 4 errors + 1 warning in `.perf/.bundle.cjs` | the new measurement harness writes an esbuild bundle next to its source | `eslint.config.mjs` ignores `.perf/**` (generated third-party output, not app source) and `.gitignore` excludes the generated files. `eslint . --max-warnings 0` is clean |
| 7 | 4 x `@next/next/no-img-element` warnings | suppressed with a one-line justification | **kept**, because each is technically required, and each now carries the concrete reason (see §4). The one that could genuinely be improved - the oEmbed thumbnail in `ProviderLanding` - gained `loading="lazy"` and `decoding="async"` |
| 8 | React runtime warnings | - | the harness captures `console.error`/`console.warn` while mounting 200 cards, 18 platform marks and both providers under the **development** React build: **0 warnings** (no missing keys, no `act()`, no invalid props) |
| 9 | 3 npm deprecation warnings on a clean install | see §2 | 1 resolved by upgrade path is **not** available without breaking peer ranges; documented, not hidden |

`npm run build` now prints no warnings, `next telemetry` is disabled in CI, and
the production build compiles clean.

---

## 2. Node overrides and dependency warnings

**Environment:** Node v22.22.3, npm 10.9.8. `package.json` declares
`"engines": { "node": ">=20.9.0" }`, which this satisfies - the Node version was
not changed.

**Overrides / resolutions:** there are **none** in `package.json` (no
`overrides`, no `resolutions`, no `.npmrc` that would force a resolution), so
there is no override to remove. Nothing forces a conflicting engine: `npm ci`
prints no `EBADENGINE`, no `ERESOLVE`, no peer warnings.

**Upgraded this round** (upgrades only, never downgrades):

| package | before | after | why |
| --- | --- | --- | --- |
| `next` | 16.4.0 | **16.4.3** | patch release with warning/security fixes; matches `eslint-config-next` |
| `eslint-config-next` | 16.4.0 | **16.4.3** | must move with `next` |
| `eslint` | 9.39.4 | **9.39.5** | patch; peer-compatible |

All three are pinned exactly. `package-lock.json` was regenerated and proven:

```
rm -rf node_modules && npm ci     # clean install from the lockfile
```

Clean-install output: no engine warnings, no peer conflicts, 3 deprecation
notes (below), `npm ls next eslint eslint-config-next react typescript` shows
one deduped tree.

**Deprecation notes that remain, and why they are not fixed by a change I can
honestly make:**

1. `@esbuild-kit/esm-loader@2.6.5` and `@esbuild-kit/core-utils@3.3.2` -
   transitive dependencies of `drizzle-kit@0.31.11` (the latest published
   version). npm's suggested "fix" is `drizzle-kit@0.18.1`, a **major
   downgrade** that would break the migration tooling. Upstream issue; the
   packages are dev-only and never shipped.
2. `eslint@9.39.5` - deprecated in favour of ESLint 10. ESLint 10.14.0 was
   installed and evaluated: it *runs* (`eslint .` clean), but `npm ls` then
   reports the copies of `eslint-plugin-import@2.32.0`,
   `eslint-plugin-jsx-a11y@6.10.2` and `eslint-plugin-react` vendored by
   `eslint-config-next@16.4.3` as **invalid** - their peer ranges cap at `^9`
   (`eslint-config-next` itself allows `>=9.0.0`). That is a forced, unsupported
   combination, so the upgrade was reverted. It resolves when Next ships plugins
   with ESLint 10 peer ranges.

**Security:** `npm audit --omit=dev` = **0 vulnerabilities**. Full audit = 20
moderate, all in the development toolchain (`esbuild <= 0.24.2` under
`drizzle-kit`, `minimatch < 11` under the ESLint plugins). Every "fix" npm
offers is a semver-major *downgrade* (`eslint@4`, `eslint-config-next@0.2.4`,
`drizzle-kit@0.18.1`), so none was applied and `npm audit fix --force` was never
run.

---

## 3. Android build

The app is a **deliberately Gradle-free** native shell (`android/README.md`):
there is no `gradlew`, no AGP, no Kotlin/Metro/Expo layer to repair, and the
build is driven by `android/build.sh` (aapt2 -> ECJ -> D8 -> zip -> zipalign ->
apksigner) with the toolchain pinned by `android/tools/fetch-toolchain.sh`. The
Gradle/AGP/Kotlin items in the brief are therefore not applicable to this tree;
what *was* broken was the CI gate and the missing debug variant (below).

**Debug and release both build now.** `android/build.sh` gained a documented
`--debug` flag (the build system it already had, extended - not replaced):

```bash
bash android/build.sh            # release
bash android/build.sh --debug    # debuggable, separate debug key
```

| | release | debug |
| --- | --- | --- |
| command | `bash android/build.sh` | `bash android/build.sh --debug` |
| artefact | `android/dist/Cinemax-1.1.0.apk` | `android/dist/Cinemax-1.1.0-debug.apk` |
| size | 211 830 bytes | 211 832 bytes |
| sha256 (example run) | `a0deab8f59ec041a85f6ae5b1a37aa39341c157064d8d2dfb6a7d2f416ba1d04` | `2677890667ce2886564532c45282f13a91f486a78f9cdb69d1bc37c45b816362` |
| package / version | `com.cinemax.app` vc `2`, vn `1.1.0` | identical |
| minSdk / targetSdk | 24 / 34 | 24 / 34 |
| `android:debuggable` | absent | **present** (aapt2 `--debug-mode`) |
| signing | committed release keystore, v1+v2+v3 | generated debug keystore (git-ignored), v1+v2+v3 |
| alignment | 4-byte verified, 36 entries | 4-byte verified, 36 entries |
| assets | `app-shell.js`, `app-theme.css`, Outfit font + licence | identical |

Identity is preserved: application id `com.cinemax.app`, version code/name,
launcher activity `com.cinemax.app.MainActivity`, the two `uses-permission`
entries (`INTERNET`, `ACCESS_NETWORK_STATE`), the deep-link host
`cinemax-orpin.vercel.app`, the icons and the theme are byte-for-byte unchanged
between the two variants - only `debuggable` and the signing key differ.

No AAB is produced: this build system packages an APK only, and the brief asks
for APK **or** AAB.

Build hashes are not reproducible across runs (zip entry timestamps), which is
why the SHA changes build to build; sizes and entry counts do not.

---

## 4. Extreme Android + web performance

Full methodology, fixtures and caveats: **[`docs/performance.md`](performance.md)**.

### How it was measured

There is no emulator, device or headless browser in this environment, so a
harness was built instead of guessing: `.perf/run.mjs` bundles `.perf/harness.tsx`
with esbuild and mounts the **real** `CatalogueProvider`, `WatchlistProvider`,
`MovieRow` (200 cards) and `PlatformRail` (18 marks) in jsdom against a
**production** React build. It replays mount, 60 scroll events, a revalidation
with an unchanged library (what a phone does when the app is resumed) and a
revalidation with one edited title. `--dev` swaps in the development React build
to read `<Profiler>` commit durations.

### What was fixed

**a) A revalidation re-rendered the entire library.**
`CatalogueProvider` re-read the catalogue on focus/visibility after 30 s and
replaced its state with freshly decoded objects, so every consumer - and every
`MovieCard`, because their props changed identity - re-rendered although nothing
had changed. `reconcile()` now reuses previous record objects for records that
came back identical, returns the previous array when everything is identical,
and `setCatalogue` keeps the previous state object when nothing changed, so the
context value keeps its identity.

**b) A revalidation re-rendered every save button.**
`WatchlistProvider.toggle` depended on `catalogue` only to look up a title when
appending a newly saved movie, which changed the context value - and therefore
re-rendered every component calling `useWatchlist()` - on every catalogue
refresh. The catalogue is now read through a ref kept in sync by an effect;
`toggle` is stable, and the value changes only when the watchlist does.

### Measured result (200 cards, median of 3 runs, development React build)

| commit | before | after |
| --- | --- | --- |
| initial load (skeleton -> 200 cards) | 417.21 ms | 423.45 ms (noise) |
| revalidation, library unchanged | **110.62 ms** | **8.07 ms** (-93 %) |
| revalidation, one title edited | 93.78 ms | **7.92 ms** (-92 %) |

Production React build: **mount 29.8 ms**, **60 scroll events = 3.9 ms**,
**0 component re-renders on an unchanged revalidation**, **0 React warnings**.
The edited title still appears (`editedTitleShown: true`), so the optimisation
cannot mask an admin edit: with per-record identity preserved, editing one title
re-renders one card instead of two hundred.

### Images

218 `<img>` elements emitted in the harness: 212 `loading="lazy"`, 6 eager
(above the fold), 218 `decoding="async"`, 200/200 posters with intrinsic
`width`/`height` (the 18 marks are boxed by CSS), posters served from
`w500`/`w1280` `srcSet` with `sizes`, never an original. `ProviderLanding`'s
oEmbed thumbnail gained the lazy/async attributes it was missing.

### What was already right - verified, left alone

`MovieRow` coalesces scroll into one `requestAnimationFrame` and only sets state
when an arrow's disabled state changes; `MovieCard` preview is hover-gated,
debounced, `IntersectionObserver`-stopped, `hls.js`-destroyed on unmount, and
single-instance; `VideoPlayer` coalesces `timeupdate` into a frame and writes
resume progress at most every 5 s; `BottomNav` already defers its
O(collections x titles) pass to when the More sheet opens; `dashjs` (818 KB) and
`hls.js` (566 KB) are `import()`ed only when a title is actually played; CSS
already uses `content-visibility: auto` + `contain-intrinsic-size` on rows and
`contain: paint` on posters, with only two `backdrop-filter` rules in the sheet;
the WebView has no `setLayerType` software layer, no `shouldInterceptRequest`,
`setOffscreenPreRaster(false)`, renderer priority lowered on pause, caches
dropped in `onTrimMemory`.

### Honest limits

jsdom has no layout, compositor or paint: these numbers measure React work and
the image attributes emitted, **not** GPU frames on a phone. They are valid as
before/after ratios on one machine with one fixture - no zero-lag claim is made.

---

## 5. CINEMAX logo

The mark was already the project's own (`/brand/cinemax-symbol.svg`, drawn in
`src/components/Logo.tsx`, mirrored natively in
`android/app/src/main/res/drawable/cinemax_emblem.xml`) and was integrated in the
previous round as the 19th member of the local collection
(`public/platforms/cinemax.svg`, byte-identical to the brand symbol). Nothing was
redrawn, recoloured or regenerated.

This round hardened the integration and the guarantees around it:

* the artwork gate (`npm run verify:logos`) now asserts the CINEMAX entry is a
  standalone SVG with no external `href`, that it cannot drift from
  `/brand/cinemax-symbol.svg`, that it is **not** listed as a streaming platform
  in `src/lib/platforms.ts`, and that its geometry matches the React component
  and the native emblem - **303 checks, 0 failures, 19 logos (18 platforms + the
  CINEMAX mark), 71.5 KB payload**;
* the JVM stage gained five brand-parity checks (emblem anchors
  `42.2/5.8/12.8/22.5/41.5/58.2/51.8/46.9/25.7/32/17.1`, collection == brand
  symbol, web component geometry, gradient colours `#70e0ff`/`#be65f7`/`#ff65ae`,
  and "is not the HBO Cinemax logo"), taking that layer to 179 checks;
* the CI workflow now requires the artwork layer by name.

Where the mark displays: web favicon (`/brand/cinemax-symbol.svg`), the nav mark
in `BottomNav`, the `CinemaxEmblem` used across the UI and as the artwork
fallback, the Android splash (`CinemaxSplashView` + `cinemax_emblem.xml`), and
the app icon resources. All local assets; no remote URLs, no filtering, no
overlay, no opacity change on any logo.

---

## 6. Preservation

Nothing was redesigned. Concretely, this round did not touch: the theme,
tokens, layout, navigation, branding, button design, hero treatment, platform
container styling, the database schema or any record, the backend/API routes,
authentication, the admin panel, catalogue business logic, or any page unrelated
to the items above. The only source files changed outside the perf/warning work
are `android/build.sh`, `android/tests/run-tests.sh`,
`.github/workflows/android.yml`, `.gitignore`, `eslint.config.mjs`,
`tsconfig.json`, `package.json`/`package-lock.json`, the four `<img>` comments, the
two providers, and the new `.perf/` + docs. No new runtime dependency was added
(the harness uses `esbuild`/`jsdom` from the existing Android test toolchain).

---

## 7. Testing performed

| test | command | result |
| --- | --- | --- |
| clean install | `rm -rf node_modules && npm ci` | pass, no engine/peer warnings |
| typecheck | `npm run typecheck` | pass, 0 errors (`strict` + `noUnused*`) |
| lint | `npx eslint . --max-warnings 0` | pass, 0 errors, 0 warnings |
| artwork gate | `npm run verify:logos` | 303 checks, 0 failures |
| production web build | `npm run build` | pass, no warnings, 21 client chunks / 2 212 KB on disk |
| debug APK | `bash android/build.sh --debug` | 211 832 B, debuggable, same id/version, v1+v2+v3 signed |
| release APK | `bash android/build.sh` | 211 830 B, signed, aligned, verified |
| Android test suite | `bash android/tests/run-tests.sh` | JVM 179 / JS 3 files / DOM 73 / artwork 303 / APK 102 - all pass |
| CI evidence replay | exact shell conditions from the workflow | pass (4 named layers, 0 failures) |
| CI YAML | parsed with `js-yaml` | valid, jobs `apk` (13 steps) + `web` (8 steps) |
| render-cost harness | `node .perf/run.mjs` and `--dev` | see §4 |
| runtime warnings | harness captures `console.error`/`warn` | 0 |

Exercising screens, navigation, scrolling, playback and the 19 logos was done at
the DOM level (jsdom suite + harness: 73 DOM behaviour checks, 18 platform marks
rendered per rail, poster rails scrolling, provider lifecycles) and at the
artefact level (APK structure/dex/manifest/signature checks). **What could not be
done here:** no emulator, device or headless browser exists in this environment,
and the database is empty, so no human-visible screenshot of a running screen and
no real-device frame timing could be produced. That limitation is stated rather
than papered over.

---

## 8. Remaining issues

1. **No device/emulator verification.** Nothing above proves on-screen pixels on
   a real phone or a real browser. Frame rate claims are deliberately absent.
2. **`eslint@9.39.5` deprecation warning** cannot be resolved without violating
   peer ranges (`eslint-config-next@16.4.3`'s plugins cap at `^9`); it will
   disappear when Next ships ESLint 10-compatible plugins.
3. **`@esbuild-kit/*` deprecation notes** come from `drizzle-kit@0.31.11`, the
   latest release; the only "fix" npm offers is a major downgrade.
4. **20 moderate dev-only advisories** (`esbuild` under `drizzle-kit`, `minimatch`
   under the ESLint plugins) remain, all with major-downgrade-only fixes.
5. **APK builds are not bit-reproducible** (zip timestamps); sizes and structure
   are stable.
6. **No AAB** is produced by this APK-only build system.
7. The Gradle/AGP/Kotlin/Expo/Metro items in the brief have no counterpart in
   this repository; the equivalent work was done on `android/build.sh`, and the
   CI gate that was actually failing is fixed.
8. `.perf` is a development tool: it depends on `android/.toolchain` (esbuild and
   jsdom) and is not part of the shipped bundle. It is intended for regression
   comparisons, not as a substitute for device profiling.
