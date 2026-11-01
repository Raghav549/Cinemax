# Round 7 — performance, sharing, domain, app download, Android build

Everything below was run in this checkout on Node 22.22.3. Numbers are what the
scripts printed; where something could not be measured here, it says so instead
of estimating.

---

## 1. Root causes (found before changing anything)

### 1.1 A title opened slowly inside CINEMAX and quickly on its own

Two independent causes, both in CINEMAX's own path:

**a. The server inspected the provider sequentially, with no overall budget.**
`src/lib/playback/web-resolver.ts` tried up to four `<iframe>` sources one after
another (6 s each) and then up to six media candidates one after another (8 s
each, `Range: bytes=0-65535`). A page whose frames refused framing, and whose
media URLs did not answer, paid **the sum of every timeout** before the player
was shown anything. Measured on a fixture provider built to behave that way:

```
6 candidates that never answer → 48,131 ms
```

That is the whole symptom: the embed alone is instant, the in-app path spent 48
seconds deciding to show the same embed.

**b. The plan was only requested after the player had already mounted.** The
overlay rendered a "Finding the stream…" state, then fetched
`/api/movies/:id/playback` with `cache: "no-store"`. So the viewer watched the
full server inspection in front of a spinner, and a second press or a re-open
repeated the whole thing.

Both were made worse by the transport: every probe opened its own `https`
request through a fresh agent and re-resolved DNS, and the page was fetched with
`Accept-Encoding: identity` — a provider's HTML arrived uncompressed.

### 1.2 The Share button copied a link instead of opening the share sheet

The clipboard fallback in `src/lib/share.ts` runs when `navigator.share` does not
exist — which is exactly what an Android WebView looks like when the
`CinemaxNative` bridge is not there. The bridge exists, but **the APK users could
install predates it**: the CI workflow builds a correct APK, then fails its own
verification gate (see 1.3) and never reaches the upload step. The installed app
is an older build whose Share button is the website's clipboard path.

There was a real defect alongside it: `ShareLauncher` downloaded the card image
(and sometimes a trailer, up to 24 MB) **before** opening the chooser, so even a
correct build spent seconds with no visible response after a press.

### 1.3 The Android build "failed"

`android/build.sh` builds, signs and verifies the release APK locally without
errors. The CI failure is the brand-artwork gate:
`scripts/verify-platform-logos.mjs` pinned `public/platforms/cinemax.webp` to the
artwork that was in the repository *before* the owner's upload in commit
`7b51975`. The upload is intentional, so the pin — not the artwork — was wrong.
Because `android/tests/run-tests.sh` includes that gate, the APK job failed at
"Verify the test evidence" and skipped "Upload the installable APK".

### 1.4 Shares carried a deployment hostname and two cards

`shareMessage()` returned

```
<title> (movie · 2024 · Genre) — watch it on CINEMAX
https://cinemax-orpin.vercel.app/share/42
Trailer: https://www.youtube.com/watch?v=…
```

and the payload attached the card image plus an mp4 trailer where one existed.
Receiving apps then showed a text bubble, a raw deployment URL and two media
items. `SHARE_SITE_URL` and the `metadataBase` fallback both still named the
Vercel host.

---

## 2. What was changed in the network pipeline

| Where | Change | Why |
| ----- | ------ | --- |
| `web-resolver.ts` | `DEFAULT_DEADLINE_MS = 6000`; every probe's timeout is `min(cap, budget − elapsed)`, floored at 500 ms | the inspection can no longer exceed a browser-like wait; when it runs out the page itself is framed, which is what opening the link standalone does |
| `web-resolver.ts` | `firstInOrder()`: probes start two at a time in document order, the first usable answer wins | a dead candidate no longer costs a full timeout before the next one starts; a good first candidate still costs one probe |
| `web-resolver.ts` | frames are probed together (up to 4), all candidates have to be contacted anyway | three refusing frames used to cost three round trips before the fourth was tried |
| `safe-fetch.ts` | keep-alive `http`/`https` agents (`maxSockets: 8`) | one handshake for a burst of probes instead of one each |
| `safe-fetch.ts` | 30 s DNS cache with in-flight de-duplication, public-address validation preserved | every probe used to re-resolve the same hostname |
| `safe-fetch.ts` | `Accept-Encoding: gzip, br` + bounded decompression (4 MB cap) | a provider page crosses the wire compressed; the byte cap still guards against a decompression bomb |
| `plan-cache.ts` (new) | one shared promise per title, 60 s TTL, failures never cached | no duplicate requests, and a request started on intent is reused by the overlay |
| `movie/[id]/page.tsx` | warms the plan on `pointerenter` / `focus` / `touchstart` of the play button, and immediately for `?play=1` | the server inspects the provider while the viewer is still reaching for the button |
| `movie/[id]/page.tsx` | a title already in the catalogue feed no longer re-fetches `/api/movies/:id` | removed a duplicate request on every detail view |
| `api/movies/[id]/playback/route.ts` | successes answer `private, max-age=30, stale-while-revalidate=60`; failures stay `no-store` | repeat plays come from the browser cache without a shared cache ever holding a personalised plan |

Deliberately **not** changed: the catalogue feed keeps `cache: "no-store"`. Its
comment explains why — a deleted title must not be resurrected by an HTTP cache —
and that is a correctness rule, not a performance knob.

Android side: the WebView was audited and left as it is. It already sets
`LOAD_DEFAULT` caching, DOM storage, `setOffscreenPreRaster(false)`, no forced
layer type, `setMediaPlaybackRequiresUserGesture(false)`, foreground renderer
priority and no captured request interception, so there was nothing to remove
from the in-app network path. The one real change on that side is that the app
now loads the official domain (§6).

---

## 3. Measurements

### 3.1 Server resolver — same script, same fixture, before vs after

`npm run measure:playback` (`scripts/measure-playback.mjs`) compiles the real
resolver from source and runs it against a local fixture provider whose latency
is page 120 ms / frame 220 ms / media 300 ms.

| Case | Before | After | Change | Outbound requests |
| ---- | ------ | ----- | ------ | ----------------- |
| iframe player page | 355 ms | 355 ms | — | 2 → 2 |
| 3 blocked frames + 1 open | 1,010 ms | 349 ms | **−65 %** | 5 → 5 |
| 6 slow media candidates | 425 ms | 425 ms | — | 2 → 3 |
| 5 dead + 1 live candidate | 1,930 ms | 1,029 ms | **−47 %** | 7 → 7 |
| 6 candidates that never answer | 48,131 ms | 7,005 ms | **−85 %** | 7 → 7 |

The last row is the one that mattered: 48 s became 7 s, and it now ends by
showing the provider's own player instead of nothing. The look-ahead costs one
extra probe in the "all candidates answer quickly" case (3 instead of 2) and
nothing anywhere else.

TCP connections counted on the fixture for the iframe case: 1 (the warm agent
reuses it); before the change the first request also opened 1 and later probes
shared the default agent — so connection reuse was already partly working and is
now explicit rather than incidental.

### 3.2 Client — time from press to a player element

`npm run measure:player` renders the real `PlaybackOverlay` in jsdom against a
production React build, with the plan API stubbed at a fixed latency, and records
when the `<iframe>`/`<video>` element appears.

| Scenario | Plan latency | Wait after the press |
| -------- | ------------ | -------------------- |
| Press with nothing warmed (before, and after for a cold press) | 900 ms | **936 ms** |
| Press after the plan was warmed on intent, 600 ms earlier (after) | 900 ms | **310 ms (−67 %)** |
| Cold press, worst-case provider (after the resolver fix: 7,005 ms) | 7,005 ms | 7,047 ms |

The client itself adds ~35 ms (938 ms to the element with a 900 ms plan); the
whole wait is the server plan, which is why the fix is on the server side and why
warming on intent is the part the viewer actually feels.

### 3.3 First media request, first frame, buffering

Not measured here. Both need a real provider stream and a real device/GPU: the
first media request is issued by the provider's own player inside the embed
frame (third-party JavaScript, by design — CINEMAX does not proxy or rewrite it),
and first-frame/buffering numbers cannot be produced by jsdom. What was measured
instead is the interval that CINEMAX controls: press → player element, above. The
player itself was already using `preload="metadata"`, `autoPlay`, `playsInline`,
a `preconnect` to the media origin, and a dynamic `hls.js`/`dashjs` import; those
were audited and left unchanged.

### 3.4 Download route — real HTTP, this build

```
GET /download/android
HTTP/1.1 200 OK                     (no redirect)
content-type: application/vnd.android.package-archive
content-disposition: attachment; filename="Cinemax-1.1.0.apk"
content-length: 220028
cache-control: public, max-age=300, stale-while-revalidate=3600
sha256(downloaded) = 8c703eedd1060a80b9e59fb5d075eb2be2a13afb900356f59582a6f351682134
sha256(committed)  = 8c703eedd1060a80b9e59fb5d075eb2be2a13afb900356f59582a6f351682134
```

---

## 4. Android native share

* `ShareLauncher.share()` no longer lets the network hold the sheet. A card that
  is already in the cache is attached instantly; a card that must still be
  downloaded gets a **1.5 s** budget inside a background thread (the bridge call
  has already returned, so the page is never blocked) and the chooser then opens
  with what is ready. The download keeps running and is attached on the next
  share of the same title, because the cache file is now named from the URL
  instead of a random temp name.
* The sheet is Android's own `Intent.createChooser` over
  `ACTION_SEND`/`ACTION_SEND_MULTIPLE`; attachments are `content://` URIs from
  `ShareFileProvider` with `FLAG_GRANT_READ_URI_PERMISSION` and `setClipData`.
  There is still no list of target apps anywhere in the app.
* The clipboard is no longer reachable from a working bridge: if the bridge
  throws (or is absent), the flow falls through to `navigator.share`, and only
  then to the clipboard — which now copies **description + link**, not a
  description on its own.
* The share no longer attaches a trailer, so the recipient gets one card.

Static + unit verification is in `android/tests` (§13). A real device tap on a
WhatsApp target could not be exercised here (no device, no emulator) — see §14.

---

## 5. Rich sharing

| Rule | Implementation |
| ---- | -------------- |
| One card | the only URL in a share is the destination page; its `og:`/`twitter:` tags produce the card. At most one file (the generated card) is attached |
| Branding, poster, title, year, genre, description | `titleMetadata()` → `og:title`, `og:description`, `og:image` (`/api/share/card/<id>`, 1200×630, cached `max-age=3600, s-maxage=86400`), `twitter:card=summary_large_image` |
| No raw deployment URL | `shareMessage()` is the description only; `currentOrigin()` rewrites any `*.vercel.app`/localhost origin to the official domain |
| No separate title message | the text no longer starts with `Title (year · genre)` |
| No trailer URL | the `Trailer:` line is gone; a trailer stays on the page it belongs to |
| No duplicate cards | no attached trailer, no repeated title, one URL |
| Clickable | the link *is* the destination (`/share/<id>`), which carries `og:url` and a "Watch on CINEMAX" action |
| Image pipeline | the existing `next/og` card is reused, not duplicated: same route for `og:image`, `twitter:image` and the page's own card |

`npm run verify:share` → **64 checks, 0 failures**, including "the payload names
exactly one destination and one card image", "the message contains no raw URL",
"a share made from a deployment hostname still points at the official domain".

Platform rendering is still the platform's decision: WhatsApp, Telegram and
Slack choose whether and when to unfurl, and cache a card for their own period.

---

## 6. The official domain

`cinemaxtv.space` was checked live before being adopted: `https://cinemaxtv.space/`
and `https://www.cinemaxtv.space/share/757` both serve the production app (hero,
19 platform tiles, the "Jailer-2 · Cinemax" share page with poster, description,
watch action and the generated `/api/share/card/757`).

| Place | Before | After |
| ----- | ------ | ----- |
| `src/lib/share.ts` | `SHARE_SITE_URL = https://cinemax-orpin.vercel.app` | `https://cinemaxtv.space` |
| `src/lib/share.ts` | `currentOrigin()` = whatever host the page is on | official domain substituted for `*.vercel.app` / localhost |
| `src/app/layout.tsx` | `metadataBase` fallback = Vercel host | `https://cinemaxtv.space`, and an env value that is a `*.vercel.app` host is ignored |
| `NavigationPolicy.PRODUCTION_HOST` | `cinemax-orpin.vercel.app` | `cinemaxtv.space` (+ `www.`; the old host is still handled in-app so previously shared links keep working) |
| `AndroidManifest.xml` App Links | Vercel host | `cinemaxtv.space`, `www.cinemaxtv.space` |
| `scripts/verify-share.mjs` | Vercel origin fixture | official origin, plus a preview-origin rewrite check |

No deployment configuration was rewritten: `NEXT_PUBLIC_SITE_URL` still wins
unless it is a deployment preview hostname, and no Vercel project setting, route
or environment variable was touched.

---

## 7. First-visit app promotion

* `src/lib/app-promo.ts` — pure rules: package/version constants, the download
  path, the storage/cookie keys, `promoDecision()`, `readPromoDismissed()`,
  `rememberPromoDismissed()`, `isAndroidUserAgent()`, `availabilityMessage()`.
* `src/components/AppPromo.tsx` — a `role="complementary"` card in the corner,
  mounted once in `src/app/layout.tsx`: "Get this app & enjoy it", one benefit
  sentence, a prominent **Download Android app** link, and **Continue on
  website** plus a close button. It has no backdrop, no focus trap and no scroll
  lock, so the site underneath stays usable; it appears 1.8 s after load, only on
  a first visit, only when the tab is visible, and never inside the Android app.
* Dismissal is device-side only: `localStorage["cinemax:app-promo:v1"]` **and** a
  180-day cookie (so it survives a storage-clearing mode that blocks
  localStorage). No database table, column, migration or record is involved.
* Android gets the download; desktop and unsupported devices get an honest
  availability message instead of a file they cannot install. Nothing downloads
  without a press.
* Animation: two composited properties (`transform`, `opacity`) plus one slow
  opacity/transform drift on a decorative glow; `prefers-reduced-motion: reduce`
  removes both.

---

## 8. The APK that is handed out

* File: `public/downloads/Cinemax-1.1.0.apk` (committed, 220,028 bytes)
* URL: `/download/android` → the file itself, `attachment; filename="Cinemax-1.1.0.apk"`
* Package `com.cinemax.app`, versionName **1.1.0**, versionCode **2**, minSdk 24,
  target 34, signed by the CINEMAX release key (`META-INF/CINEMAX.RSA`/`.SF`)
* sha256 `8c703eedd1060a80b9e59fb5d075eb2be2a13afb900356f59582a6f351682134`
* `npm run verify:promo` reads these properties out of the APK itself and refuses
  to pass if the file, the package id or the version disagrees with the site.

It is the same artifact `android/build.sh` produced in this round, not a
placeholder and not a second app.

---

## 9. Android build

`bash android/build.sh` → **passes**: debug and release variants compile, sign
and verify; `android/dist/Cinemax-1.1.0.apk` is produced.

The CI failure was the verification gate, not the build (§1.3). The gate now
records the artwork that is actually in the repository (a new pin, with the
provenance note rewritten to describe the uploaded file), so
`npm run verify:logos`, `android/tests/run-tests.sh` and the workflow's
"Verify the test evidence" step all pass. With that step green, the workflow
reaches "Upload the installable APK" again, which is how the fixed build reaches
users.

---

## 10. Logo preservation

`public/platforms/cinemax.webp` is byte-for-byte the file from commit `7b51975`
(1080×1080, 24.1 KB, WebP with alpha, sha256 `94a447d9cd42869a…`). Nothing was
restored, reverted, re-encoded or replaced; the verification pin, the provenance
table and `docs/platform-assets.md` were updated to match it. No other asset was
touched.

---

## 11. Database

Untouched. No migration, schema, seed, cleanup, config or record command was run
in this round; no `db:push`, no `/api/seed`, no SQL against the project database.
The only database reads are the ones the app already made at runtime, and no
write was added: the promotion's dismissal is device-side and the share features
read the same rows as before.

---

## 12. Files changed

```
src/lib/playback/web-resolver.ts        deadline, look-ahead probing, parallel frames
src/lib/playback/safe-fetch.ts          keep-alive agents, DNS cache, compression
src/lib/playback/plan-cache.ts          new — one shared plan per title
src/components/PlaybackOverlay.tsx      plan from the shared cache
src/app/movie/[id]/page.tsx             intent prefetch, catalogue de-duplication
src/app/api/movies/[id]/playback/route.ts   short private cache for successes
src/lib/share.ts                        description-only text, official origin, no attachments
src/app/layout.tsx                      official metadataBase + <AppPromo />
src/lib/app-promo.ts                    new — promotion rules
src/components/AppPromo.tsx             new — the promotion
src/app/download/android/route.ts       new — the APK download
src/app/globals.css                     promotion styles
public/downloads/Cinemax-1.1.0.apk      the verified artifact
android/…/NavigationPolicy.java         official host, www, legacy alias
android/…/ShareLauncher.java            instant sheet, cached card, bounded download
android/app/src/main/AndroidManifest.xml   App Links on the official host
android/tests/apk_check.py              deep-link host assertion
android/tests/apk_summary.py            new — artifact summary for the web gate
android/tests/java/CinemaxAppTest.java   host fixtures
scripts/measure-playback.mjs            new — resolver before/after harness
scripts/verify-share.mjs                64 checks for the new rules
scripts/verify-app-promo.mjs            new — 63 checks for the promotion + APK
scripts/verify-platform-logos.mjs       the corrected pin
.perf/playback.tsx, .perf/playback-run.mjs   new — press-to-player harness
package.json, .github/workflows/android.yml, .gitignore, docs/*
```

---

## 13. Verification matrix (all run in this checkout)

| Command | Result |
| ------- | ------ |
| `npm run typecheck` | 0 errors |
| `npm run lint -- --max-warnings 0` | 0 errors, 0 warnings |
| `npm run build` | ok (34 routes, `/download/android` dynamic) |
| `npm run verify:logos` | **317 checks, 0 failures** |
| `npm run verify:platforms` | 42 checks, 0 failures |
| `npm run verify:share` | **64 checks, 0 failures** |
| `npm run verify:legal` | 140 checks, 0 failures |
| `npm run verify:promo` | **63 checks, 0 failures** |
| `bash android/tests/run-tests.sh` | 218 / 73 / 317 / **109** checks, 0 failures |
| `bash android/build.sh` | release APK built, signed, verified |
| `npm run measure:playback` | table in §3.1 |
| `npm run measure:player` | table in §3.2 |
| `GET /download/android` against `next start` | 200, correct headers, byte-identical APK |

---

## 14. What could not be verified here

* **A real tap on the installed app.** There is no Android device or emulator in
  this environment. The native share path is covered statically (source and
  manifest assertions in `android/tests`) and by unit checks, and the APK is
  built and signed — but "the chooser appeared and WhatsApp showed the card" is
  a device observation that cannot be made here. Same for installing the APK and
  navigating the app.
* **First media request / first frame / buffering** inside a real player (§3.3).
  Those need a real stream, a real network and a GPU; the embed's own player
  issues them, and CINEMAX deliberately does not proxy third-party media.
* **Live post-deploy metadata.** The new canonical host and the new share text
  are in the build, but this checkout is not deployed, so the `og:` tags on
  `cinemaxtv.space` still describe the previous build until it ships. The domain
  itself was verified live (§6).
* **TLS/DNS timing on the production network.** `curl` from this sandbox cannot
  reach `cinemaxtv.space` (SSL connect error), so production round-trip times
  were not measured; all timings above are from the fixture provider and the
  local production build, which is where the regressions lived.
* **Playwright suite.** `npm run test:ui` needs a Chromium download, which is
  blocked here; it is not part of the CI web job either.
