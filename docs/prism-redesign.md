# Cinemax / Prism redesign

Implemented 12 October 2026. The app is still Next.js 16, React 19, PostgreSQL,
Drizzle, and the existing authenticated studio/API. No backend route, database
mapping, authorization rule, or seed movie record was replaced.

## Visual and interaction changes

- **Original identity:** a folded, two-ribbon cinematic aperture/C emblem, an
  original Cinemax wordmark, matching SVG favicon and 192/512px PWA icons.
- **Prism palette:** near-black midnight foundation, sapphire blue, violet,
  magenta and restrained cyan. Self-hosted Manrope and Outfit variable fonts.
- **First-home intro:** staggered emblem reveal, travelling light streaks,
  expanding rings, spectral lighting, soft reflection and a clean exit. The
  short intro runs once per session, never on deep links or studio routes.
  Skip works without replaying it; reduced motion gets an almost immediate,
  non-animated entry. The background app is inert during the intro.
- **Flowing controls:** a thin, continuously animated SVG dash follows the
  exact rounded button perimeter. `pathLength=100` and a linear 0 → −100
  offset make the loop seamless. The small paint region is isolated rather
  than using a JavaScript animation loop or animating a viewport-sized blur.
- **Persistent navigation:** logo/search/watchlist header; compact, curved
  mobile navigation with a single translating light indicator, consistent
  original icons, active-state lighting, comfortable hit targets and safe-area
  spacing. Navigation and library state stay mounted across App Router changes.
- **Cinema-first home:** full-width actual slide/movie artwork, readable
  gradients, title/year/genres, Watch Now and More Details. Introductory slogans
  were removed. Features crossfade, support horizontal gestures and scoped
  keyboard controls, pause on interaction/backgrounding, and have a pause
  control. No automatic rotation under reduced motion.
- **Poster rails:** consistent 2:3 images, quiet metadata/rating, touch scrolling,
  keyboard browsing, working arrow boundaries, subtle focus/hover effects,
  quick save controls, and existing continue-watching progress.
- **Unified sections:** debounced search with cancellation and real API results;
  type/genre filters; artwork-backed Explore collections; sortable collections;
  polished saved cards and watchlist empty/error states; redesigned details,
  synopsis, credits, share/save/play actions and recommendations.
- **Studio/PWA:** existing management flows retained; new brand, matching fields
  and accents; branded offline screen, install icons, manifest and cache version.

## Functionality and reliability

- Existing movie, slide, category, watchlist, auth, health, seed, stream and studio
  APIs are unchanged. There is **no frontend demo catalogue** or alternative DB.
- Shared providers avoid reloading the entire index on each tab. Collection-
  scoped and related-title API reads still work for records outside the home
  index's existing API limit.
- Searches abort superseded requests and cannot publish stale results.
- Watchlist updates wait for the anonymous session and API confirmation. Duplicate
  taps are guarded; different saves are serialized to avoid stale follow-up
  reads. Failed removals keep the saved card. Visiting the list reconciles studio
  and other-tab changes with the real API.
- Watch Now now launches playback rather than just opening the details page.
  Direct media, HLS/hls.js, native-HLS fallback, YouTube/Vimeo embeds, subtitles,
  speed/quality controls, resume, share, and authorized gateway paths remain.
- The player is portalled above navigation, locks background scroll/focus, traps
  keyboard focus and restores focus on close. Playback errors are recoverable.
- Artwork uses responsive TMDB sizes, lazy posters and eager featured images.
  Arbitrary studio-supplied licensed image hosts are still supported. Image
  failures display designed placeholders/atmosphere, never fictional titles.
- Reduced motion disables loops/transitions. Static radial lighting is not
  animated; short reveals use transform/opacity. Fonts and the 73KB WebP
  fallback atmosphere are local. Test tools/databases/reports are ignored.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | Pass, no warnings |
| `npm run typecheck` | Pass |
| `npm run build` | Pass, all existing routes built |
| `npm run verify:api` | 45 passed, 0 failed |
| `npm run test:ui` | 56 passed, 0 failed |
| Final motion/home/studio regression after paint isolation | 12 passed, 0 failed |
| `git diff --check` | Pass |
| `npm audit --omit=dev` | 0 vulnerabilities |

Playwright covers Chromium desktop (1440×1000), mobile (390×844), small mobile
(320×568), and reduced-motion mobile (375×812). Checks include layout overflow,
poster ratios/clipping, hit targets, persistent navigation, filtering, stale
searches, watchlist persistence and failure recovery, intro/session behavior,
4× CPU-throttled browsing, automated WCAG A/AA scans of the public screens,
direct playback, HLS quality, WebVTT subtitles, playback speed, local resume,
provider embeds, playback errors/focus restoration, and studio authentication
and management tabs.

API and UI checks used an **isolated local PostgreSQL-compatible PGlite instance**
through the normal `pg`/Drizzle connection, with the repository's unchanged seed
records. Playback tests create temporary records through the real admin API,
use tiny original synthetic clips only inside test-intercepted media requests,
and delete their records afterward. Final local catalogue counts remain
32 movies, 3 slides and 12 categories. Nothing was written to a production DB.

### Running browser checks

Use a populated, disposable test database and start the app. Provide the normal
studio credentials through environment variables, never in committed files:

```bash
npm ci
npx playwright install chromium
npm run build
npm run start
# in another terminal, with BASE_URL/ADMIN_EMAIL/ADMIN_PASSWORD set as needed:
npm run verify:api
npm run test:ui
npm run test:ui:report
```

`BASE_URL` defaults to `http://localhost:3000`. For managed environments,
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and `PLAYWRIGHT_CHROMIUM_ARGS` can select an
existing Chromium. Tests intentionally simulate CDN failure so third-party
artwork uptime does not affect regressions; movie/API data is not mocked.

## Remaining environment/deployment checks

1. No production `DATABASE_URL` was supplied in this checkout. Use the existing
   deployment database and credentials as documented in the main README. The
   temporary local database/environment are ignored and are not a new backend.
2. The sandbox cannot reach `image.tmdb.org`. Original catalogue URLs are
   retained; fallbacks were verified. Check production image URLs/CDN access
   when deploying. No unrelated poster was substituted as a movie's artwork.
3. Existing seed records do not supply licensed video sources. They correctly
   remain Coming soon. Playback was verified using isolated synthetic test clips,
   not by adding sample streams to your production films.
4. Real-device Safari/native HLS, production licensed sources, third-party
   provider policies and an operated authorized torrent gateway still need
   deployment/device verification; mobile tests here use Chromium emulation.
5. The original dev-toolchain audit still reports 9 findings (4 moderate,
   5 high), under Drizzle Kit/ESBuild and Next's ESLint tooling. Runtime audit
   is clean. Suggested automatic fixes downgrade pinned major tool versions;
   no breaking `npm audit fix --force` was applied as part of a UI redesign.
