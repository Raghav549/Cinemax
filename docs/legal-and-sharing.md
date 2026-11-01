# Legal documents & sharing

This note covers the two things this change adds: the website-only legal
documents, and the sharing system that both the website and the Android app use.

Nothing about the existing design changed. No screen was redesigned, no button
moved, no colour or brand mark was altered, no table changed, no API route was
removed and no feature was taken away.

---

## 1. The legal documents (website only)

### Routes and content

| Route | Document | Sections |
| ----- | -------- | -------- |
| `/license` | Licensing & attribution | 13 |
| `/copyright` | Copyright & intellectual property | 8 |
| `/attributions` | Third-party attributions | 8 |
| `/disclaimer` | Content & trademark disclaimer | 8 |
| `/privacy` | Privacy and content usage | 11 |

* `src/lib/legal.ts` is the single source of truth: page metadata, the nineteen
  platform brand notices (owner, note, whether the mark is this project's own),
  software attributions, fonts, image, icon and video notes, and the review date.
* `src/components/LegalDocument.tsx` is the shared chrome: breadcrumbs, hero,
  sticky table of contents, sections, callouts, fact lists, the brand table and
  the sibling footer. All server components.
* `src/app/globals.css` gained one `.legal-*` block (layout only; it reuses the
  existing tokens, surfaces and type scale). It collapses to one column at
  980 px and 640 px.
* Entry points: the footer of the home page (a second, quieter row inside the
  existing `site-footer`) and the sibling footer at the bottom of every document.

### What the documents claim, and where it comes from

Only verifiable statements are made. Ownership notes were checked against public
reporting before being written down:

* **JioHotstar** — JioStar (Reliance × Walt Disney JV), launched 14 February 2025
  when JioCinema and Disney+ Hotstar merged.
* **Max** — Warner Bros. Discovery; the service was renamed HBO Max in July 2025.
* **Paramount+** — Paramount Skydance (the merger completed 7 August 2025); the
  Warner Bros. Discovery acquisition closed 6 October 2026.
* **The Cinemax network** — Home Box Office, Inc. / Warner Bros. Discovery (the
  brand was revived for linear channels in September 2025). This is a *different*
  thing from this project's own CINEMAX name, and the licensing page says so in
  as many words.
* Netflix, Prime Video, Disney+/Hulu, Apple TV+, SonyLIV, Crunchyroll, Tubi,
  ZEE5, Peacock, MUBI, Discovery+, YouTube and aha are described by their owning
  company only — no partnership, sponsorship, approval or licence is claimed
  anywhere, and every document states that none exists.
* Software licences were read from the installed packages, not assumed:
  MIT (next, react, react-dom, jose, uuid, drizzle-kit, tailwind, eslint, pg),
  Apache-2.0 (drizzle-orm, hls.js, typescript), BSD-3-Clause (bcryptjs, dashjs),
  plus the notice-bearing packages that are also in the tree (MPL-2.0
  lightningcss and axe-core, LGPL-3.0-or-later libvips behind the image
  pipeline, CC-BY-4.0 caniuse-lite, BlueOak-1.0.0 minimatch). `npm run licenses`
  regenerates that list from `node_modules`.
* The fonts (Outfit, Manrope) are SIL Open Font License 1.1, with the licence
  files shipped in `src/app/fonts/`.
* The privacy document lists the storage that exists in the code:
  `cinemax:playback:<id>` (localStorage), `cinemax:prism-intro:v1` and the
  removal of `cinemax:catalogue:v1` (sessionStorage), the `session_id` cookie
  (one year, anonymous watchlist), the `admin_token` cookie (httpOnly JWT, 24 h),
  the service-worker cache, the third-party image and trailer hosts, and the
  Android app's `INTERNET` / `ACCESS_NETWORK_STATE` permissions and its
  content-provider share path.

### Absent from the app

Three independent layers keep the legal section out of the Android app:

1. `NavigationPolicy.isWebsiteOnlyPath("/license" | "/copyright" |
   "/attributions" | "/disclaimer" | "/privacy")` — matched per path segment,
   case-insensitive, trailing-slash and query-string tolerant.
2. `CinemaxWebViewClient` cancels that navigation (no in-app render, no browser
   hand-off) and `MainActivity.initialUrl` sends a deep link straight to the home
   surface.
3. `app-theme.css` removes `.site-footer-legal` and hides `.legal-page` inside
   the app, so the entry point never appears either.

The JVM test suite asserts all three, plus that no app source or shell asset links
to those routes.

---

## 2. Sharing

### One code path

`src/lib/share.ts` is isomorphic and owns every rule:

| Concern | Behaviour |
| ------- | --------- |
| Link | `/share/<id>` — a page that actually shows what was shared |
| Image | `/api/share/card/<id>` — the generated 1200×630 card, attached as a real file |
| Text | `Title (movie · 2024 · Science-Fiction) — watch it on CINEMAX` + the link |
| Video | attached **only** when the record points at a real video file |
| YouTube / Vimeo | kept as a link (plus the host's own still as a still) — never claimed as a video |
| HLS / DASH | a link; adaptive streams cannot be attached to a share |
| No Web Share | the link is copied to the clipboard and the visitor is told |

`src/lib/share-card.tsx` draws the card (poster, backdrop, CINEMAX emblem and
wordmark, title, type · year · genre, synopsis, "Watch on CINEMAX"), and
`src/app/api/share/card/[id]/route.tsx` serves it. Artwork is fetched from the
title's own record and inlined; a WebP cannot be decoded by the renderer, so it
is transcoded to JPEG with the image library that ships with the framework's
image pipeline, and if that is unavailable the image is simply left out — never
a broken frame, never invented artwork.

`src/app/share/[id]/page.tsx` is the landing page, and `src/app/movie/[id]/layout.tsx`
adds `og:`/`twitter:` metadata to the existing title screen. Both read the record
once per request (React `cache`), and both degrade to site defaults if the
database is unavailable.

### The Android share sheet

The Share button is unchanged. Its handler now calls `shareTitle()`, which uses
the bridge when it exists:

```
page  →  window.CinemaxNative.share(title, text, url, imageUrl, videoUrl)
      →  MainActivity.shareTitle → ShareLauncher.share
      →  download card (+ trailer) into cache/share on a background thread
      →  ShareFileProvider content:// URIs with a read grant
      →  Intent.ACTION_SEND / ACTION_SEND_MULTIPLE + Intent.createChooser
```

`ShareFileProvider` is a small platform `ContentProvider` (this build links
against the platform SDK only, so AndroidX's FileProvider is not available). It
serves one directory, refuses any canonical path outside it, is not exported, is
read-only, and hands out `content://` URIs — Android 7+ forbids `file://`
between apps. Android chooses the receiving apps; there is no list of targets in
the app. A failed or oversized download never blocks the share: the text and the
link still go out and the sheet still opens.

---

## 3. Verification

### Web

```
npm run typecheck      → 0 errors
npm run lint           → 0 errors, 0 warnings (--max-warnings 0)
npm run build          → ok; /license, /copyright, /attributions, /disclaimer,
                         /privacy prerendered static; /share/[id] and
                         /api/share/card/[id] dynamic
npm run verify:legal   → checks: 140, failures: 0
npm run verify:share   → checks: 49, failures: 0
npm run verify:logos   → checks: 317, failures: 0
npm run verify:platforms → checks: 42, failures: 0
node .perf/run.mjs     → 0 re-renders on a no-op refetch, 200 cards, 19 platform
                         discs, 213 lazy / 25 eager images, all with dimensions
                         and `decoding="async"`, no console issues
```

`verify:legal` reads the rendered HTML the build emits (`.next/server/app/*.html`):
title, description, canonical, heading structure, no duplicate ids, every table-of-
contents anchor resolves, all nineteen platform names and their image files, the
sibling cross-links, the "no affiliation" sentence, and the real storage keys on
the privacy page.

`verify:share` compiles `src/lib/share.ts` with the project's own TypeScript and
runs it in a sandbox with a fake window/navigator/fetch: trailer classification,
the payload, the native bridge taking precedence, Web Share with the card attached
as a `File`, cancellation, and the clipboard fallback.

### Live render (production build, temporary local Postgres)

A throwaway PGlite database was pointed at the production build to exercise the
database-backed paths; nothing was added to the repository and the records were
test-only.

| Request | Result |
| ------- | ------ |
| `GET /license` | 200, 108 959 B, 13 sections, 19 brand cards, 3 tables |
| `GET /privacy` | 200, 54 076 B, 11 sections |
| `GET /share/1` | 200, 32 756 B; `og:image` → `/api/share/card/1`, `og:type` `video.other` |
| `GET /share/2` | 200; `<video controls src=…webm poster=…>` (real file) — no fake still |
| `GET /movie/1` | 200; `og:title`, `og:description`, `og:url`, `og:image` (1200×630), `twitter:summary_large_image` |
| `GET /api/share/card/1` | 200, 641 653 B PNG, correct 1200×630 render |

The rendered card was inspected as an image and checked against the record:
poster on the left, the title's own backdrop behind, emblem + wordmark, title,
`Movie · 2024 · Science Fiction`, synopsis, "Watch on CINEMAX", and the
"names and logos belong to their respective owners" footer. A second render used
a WebP poster to prove the transcode path.

### Android

```
bash android/build.sh --debug → Cinemax-1.1.0-debug.apk 220 030 B
                                sha256 5e83f7f7f8a7e14b…
bash android/build.sh         → Cinemax-1.1.0.apk       220 022 B
                                sha256 60e92cd00ed1d285…
bash android/tests/run-tests.sh
  JVM unit checks      216 checks, 0 failures
  DOM behaviour         73 checks, 0 failures
  brand artwork        317 checks, 0 failures
  APK structure        108 checks, 0 failures
```

The APK checks now also assert that `ShareLauncher` and `ShareFileProvider` are
in `classes.dex`, that the share intents are `ACTION_SEND` /
`ACTION_SEND_MULTIPLE` with `EXTRA_STREAM`, that the provider authority is
present, and that no `file://` URI is built. The manifest keeps the same
application id, version, permissions, launcher activity and deep-link host.

### Brand artwork: one pre-existing regression, repaired

While running the suite on this branch, `verify:logos` failed on `cinemax.webp`
(`cinemax: file is the pinned original`). The file in the upload commit
`724dc8a` was a 1080×1080 square of **this application's own emblem** — not the
Cinemax network's mark that `docs/platform-assets.md` documents. That is exactly
what the check exists to catch, and it also made the licensing page attribute the
wrong artwork.

The file was restored from its documented upstream source
(`tv-logo/tv-logos@main:countries/united-states/cinemax-us.png`, blob
`16cdc813a8ee6af5bc8ab5ad36bb76cb212f3bcf`, the black wordmark on the amber
field), trimmed and re-encoded to 524 px wide WebP q92 with the same pipeline the
other raster logos use. The identity pin was re-computed (the bytes cannot match
the old WebP because they were produced fresh) and the reason is recorded next to
the pin. The application's own logo — emblem, wordmark, app icon, splash, theme —
is untouched.

---

## 4. What could not be verified here

* **No browser is available in this environment.** Every Playwright/Chromium
  download is blocked and the Lambda chromium build needs `libnss3`/`libnspr4`,
  which are not installed and cannot be fetched. The legal pages were therefore
  verified as rendered HTML (structure, anchors, text, artwork references) and
  the share card as an actual image, but their *visual* appearance on desktop,
  tablet and mobile was not seen. The responsive rules exist and are exercised
  only by reading the CSS.
* **No Android device or emulator.** The share sheet could not be opened against
  real installed apps. What is verified is the compiled intent path (dex,
  manifest, provider, `ACTION_SEND`/`createChooser`, read grants, no `file://`),
  not a tap on a phone.
* **Transfer sizes on a slow link.** The video attachment is capped at 24 MB and
  skipped when it is larger; that choice is untested on a real mobile network.
* The temporary Postgres used for the live checks is not the production database,
  and the production catalogue still needs its own titles to render real cards.
