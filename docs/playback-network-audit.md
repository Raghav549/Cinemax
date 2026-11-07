# Playback network audit — external media isolation & latest-first slides

Scope: a targeted audit of the path from an admin-entered video URL to the
pixels inside Cinemax (web and the Android WebView shell), and of the homepage
slide ordering. Nothing outside the files listed below was changed.

## Pipeline, as found

1. The studio stores the admin's URL verbatim in `movies.video_url`.
2. `PlaybackOverlay` resolves it: known providers/embeds synchronously in the
   browser (`lib/providers`), unidentified web links through
   `/api/movies/:id/playback`, which inspects the page **once** on the server
   (`lib/playback/web-resolver.ts`) and returns a *plan* (JSON) — never bytes.
3. Playback then happens in the browser:
   - `embed` → the provider's own `<iframe>` player (`EmbedShell`);
   - `direct` → `<video>` / hls.js / dash.js in `VideoPlayer`, fetching the
     media URL itself.
4. No Cinemax route proxies third-party media. `/api/stream/:id` only exists
   for admin-authorized magnet sources behind an explicit gateway flag, and the
   service worker returns early for every cross-origin request, so media never
   passes through it.

## Root causes found

| # | Where | Problem | Effect |
|---|-------|---------|--------|
| 1 | `CinemaxWebViewClient.shouldOverrideUrlLoading` (Android) | Applied the *main-frame* policy ("third-party → open externally") to **sub-frame** navigations. Embedded players navigate their own frame constantly (host redirects such as `/e/{id}` → `/v/{id}`, CDN/consent hops, gesture reloads). | The in-frame navigation was cancelled and the system browser opened instead: in the app the provider looked down/buffering while the same page worked in Chrome. |
| 2 | `CinemaxChromeClient.onPermissionRequest` (Android) | Denied `PROTECTED_MEDIA_ID` to every non-Cinemax origin. | Provider players that need it (standard Widevine) failed inside the app only. |
| 3 | `VideoPlayer` | A fixed 12 s "preparing" timer flipped the player to the error state even while bytes were still arriving. | Slow-but-working sources were cut off by Cinemax itself and reported as "unavailable". |
| 4 | `VideoPlayer` | HLS network recovery = 3 retries within ~1.4 s; plain `<video>` errors went straight to the error surface. | A few seconds of connectivity loss ended playback; the generic message blamed "the connection" regardless of the real cause. |
| 5 | `web-resolver.ts` (server) | For a direct media link the browser was handed the URL the **server's** redirect chain ended on. | Edge/region/IP-bound CDN locations chosen for the server, not the viewer (throttled or rejected media). |
| 6 | `/api/slides`, `/api/admin/slides` | `ORDER BY sort_order` only; every new slide defaults to 0, so all tied and Postgres returned physical order. | Newest slide landed last (or anywhere), and could move between requests. |

## Fixes

- **Android** — sub-frame navigations stay in the frame for `http(s)`
  (`NavigationPolicy.decideForSubFrame`); dangerous or app-launching schemes
  inside a third-party frame are cancelled, never handed to the system.
  Secure third-party frames may obtain only the protected-media identifier.
  Renderer-crash recovery returns to the page the viewer was on.
- **Player** — a *progress-aware* source watchdog (15 s of total silence, reset
  on every `progress`/segment event) replaces the fixed timer; bounded,
  back-off reconnects (1 → 2 → 4 → 8 s, max 6) that keep the position; offline
  is detected via `navigator.onLine` and resumed on `online`; a pending
  reconnect fires on return to the foreground; provider refusals
  (401/403/404/410/451, decode errors) are **not** retried. Error copy now
  names the cause: offline / source not responding / source refused or format.
- **Resolver** — the browser receives the admin's original media URL and
  follows the provider's redirects from the viewer's own network.
- **Embed** — a `preconnect` to the provider origin at mount; the frame's
  requests themselves are untouched.
- **Slides** — one ordering everywhere (`db/slide-order.ts`, mirrored by
  `lib/slide-order.ts` in the hero): `created_at DESC NULLS LAST, sort_order
  ASC, id DESC`, an explicit `created_at` on insert, a matching index, and
  client-side de-duplication. Edits never touch `created_at`.

## Verification

`tests/network-isolation.spec.ts` answers a stand-in provider origin from the
browser and asserts: every media request hits the provider with the stored URL
and no Cinemax cookie; nothing crosses `/api/stream` or `/api/media`; a
13.5 s-slow source is not cut off; a mid-stream outage produces bounded
reconnects and resumes in place without a reload; a source down at start shows
the source error (not "offline"); a 403 shows the refusal with zero retries.

The slide ordering was verified against a real PostgreSQL 18 instance: three
consecutive adds → C > B > A on `/api/slides`, `/api/admin/slides` and in the
rendered hero (web and Android-WebView user agents); edit keeps position and
`created_at`; delete keeps the remaining order; a NULL-timestamp legacy row
sorts last without breaking anything; the order survives a server restart and
a fresh admin login.

## Limits that remain with the provider

Buffering caused by the provider's own CDN or the viewer's connection is not
eliminated — only Cinemax-introduced interference is. Providers that refuse
framing, require login, apply geo/DRM rules or expire signed URLs behave
exactly as they would in a browser; Cinemax reports the refusal honestly and
offers the original link.
