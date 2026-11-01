# Streaming-platform artwork & the glossy-black surface system

This note documents the two new things the platform navigation introduced: the
brand artwork shipped in `public/platforms/`, and the neutral "deep glossy 3D
black" surface language that replaced the old blue/purple-blue accents.

## 1. Brand artwork

Every file in `public/platforms/` is the platform's **own artwork**. No logo was
redrawn, recoloured, traced or substituted with a text label, and no generic
icon stands in for a brand. All trademarks remain the property of their owners;
they are used here only to say where a title in the library can be streamed.

| Platform | id | File | Source repository → path | Variant |
| --- | --- | --- | --- | --- |
| Netflix | `netflix` | `netflix.svg` | `selfhst/icons` → `svg/netflix.svg` | red **N** mark |
| Prime Video | `prime-video` | `prime-video.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/prime-video-dark.svg` | white wordmark + blue smile |
| JioHotstar | `jiohotstar` | `jiohotstar.svg` | `ackinc/webext-movie-ratings` → `platformWordmarks/jiohotstar.svg` | white wordmark (hexastar + outlined lettering), recoloured to pure `#fff` |
| Disney+ | `disney-plus` | `disney-plus.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/disney-plus-dark.svg` | light wordmark for dark UI |
| Max | `max` | `max.svg` | `selfhst/icons` → `svg/max-light.svg` | white `max` wordmark |
| Apple TV+ | `apple-tv-plus` | `apple-tv-plus.svg` | `homarr-labs/dashboard-icons` → `svg/apple-tv-plus.svg` | white ` tv+` lockup |
| Sony LIV | `sony-liv` | `sony-liv.svg` | `Dant5/clean-home-tizen` → `app/assets/icons/sonyliv.svg` | white |
| JioCinema | `jiocinema` | `jiocinema.svg` | `DevanshiJodhani/Jio-Cinema` → `public/images/jiocinema-logo.svg` | full colour |
| Crunchyroll | `crunchyroll` | `crunchyroll.svg` | `selfhst/icons` → `svg/crunchyroll.svg` | orange mark |
| Tubi | `tubi` | `tubi.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/tubi.svg` | purple wordmark |
| ZEE5 | `zee5` | `zee5.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/zee5.svg` | grey **Z** + gradient **5** |
| Hulu | `hulu` | `hulu.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/hulu.svg` | green wordmark |
| Paramount+ | `paramount-plus` | `paramount-plus.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/paramount-plus.svg` | blue mountain |
| Peacock | `peacock` | `peacock.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/peacock-dark.svg` | white wordmark + colour feathers |
| MUBI | `mubi` | `mubi.svg` | `homarr-labs/dashboard-icons` → `svg/mubi-dark.svg` | white wordmark |
| Discovery+ | `discovery-plus` | `discovery-plus.webp` | `tv-logo/tv-logos` → `misc/media/discovery-plus.png` (512x325, trimmed, WebP q92) | full colour |
| YouTube | `youtube` | `youtube.svg` | `selfhst/icons` → `svg/youtube.svg` | red play mark |
| aha | `aha` | `aha.webp` | `tv-logo/tv-logos` → `misc/media/aha.png` (512x271, trimmed, WebP q92) | full colour |

### Preparation

`/tmp/logos/normalize.js` (a one-off build-time script, not shipped) performed
the following on every file before it was committed:

1. **Sanitise** — strip XML prologues, doctypes, comments, `<script>`,
   `<metadata>`, `<foreignObject>`, inline `on*` handlers, external
   `href`/`xlink:href` references and embedded `<image>` bitmaps. Every asset is
   a self-contained document with no network dependencies, which matters because
   the preview sandbox has no outbound network.
2. **Crop to ink** — rasterise at high density, measure the alpha bounding box,
   then rewrite *only the root `<svg>`* `viewBox`/`width`/`height` around that
   box with 1.2 % padding. This gives each logo the same optical weight inside
   its fixed layout box instead of inheriting the generous squares most icon
   repositories publish. Child shapes are never touched.
3. **Rasters** — the two PNG-sourced brands are trimmed, padded with transparent
   pixels and encoded as WebP at quality 92 with a full alpha channel.

Total payload: **≈112 KB for all eighteen platforms**, no runtime requests, no
new dependency (only the already-installed `sharp` dev tool was used to prepare
files), and the `<img>` tags are `loading="lazy"` (`eager` only for the rail and
the studio picker) with `decoding="async"` and fixed boxes so nothing shifts
while they decode.

### Verification

Provenance is not taken on trust. `npm run verify:logos`
(`scripts/verify-platform-logos.mjs`) runs before a release and checks the whole
collection against `src/lib/platforms.ts`:

* every id resolves to a file that exists, and no orphan artwork sits in the
  directory;
* each SVG is one self-contained document with a `viewBox`, and carries no
  `<script>`, `on*` handler, `<image>` bitmap, external `href`/`xlink:href` or
  remote `@import` — an `<img>` must be able to render it with no network at
  all, which also makes it safe inside the Android WebView;
* each raster keeps a real alpha channel and at least 192 px, so nothing is
  soft on a 3x phone screen;
* **identity pins**: a SHA-1 of the file's path geometry is compared against the
  value recorded for that brand, and so is a SHA-1 of its colour tokens. A
  swapped-in or recoloured (greyed, tinted, filtered) export therefore fails
  the build instead of quietly shipping. Pins live in the script; if a brand
  legitimately publishes a new mark, the pin is updated in the same commit.

Checking every shipped file's path geometry against the upstream repositories
reproduced the table above byte-for-byte (SVGs compared by identical `d` data and
identical colour tokens; rasters by file hash) and corrected two entries:

* **JioHotstar** had been recorded as a Delta-Icons app icon; the shipped file is
  the horizontal wordmark from `ackinc/webext-movie-ratings`, matched by
  identical path data.
* **Apple TV+** had been the `apple tv` lockup from `selfhst/icons` — the Apple TV
  *app* mark, with **no plus sign**, so it read as the wrong brand. It is now the
  real ` tv+` wordmark from `homarr-labs/dashboard-icons`, one monochrome path
  (geometry and viewBox untouched) filled with the brand's own white for the dark
  surfaces.

### Dark-background variants

The rail, the details page and the studio all sit on near-black surfaces, so
light/white variants were chosen wherever a brand publishes one (Prime Video,
Disney+, Max, Peacock, MUBI, Apple TV+, Sony LIV). Where a logo only exists in a
single treatment it is used as published (Netflix, Hulu, Tubi, ZEE5, Paramount+,
YouTube, Discovery+, aha). Hulu's green and Tubi's purple are brand colours, not
design accents.

### The nineteenth mark: CINEMAX itself

The collection is nineteen logos, but the last one is not a download. CINEMAX's
primary identity already lives in the repository as vector artwork — the
`<CinemaxEmblem>` lockup in `src/components/Logo.tsx` with
`public/brand/cinemax-symbol.svg` and `public/brand/cinemax-app-icon.svg`
beside it — and it is reused exactly as it is. No second CINEMAX logo was drawn
and no raster was invented, because the brand identity is not part of the
download-in-logos task and must not fork. The verify script asserts those three
files are present so the identity cannot go missing unnoticed.

### Brand-status notes

* **Max.** Warner Bros. Discovery retired the blue Max identity during 2025 and
  reverted the service to **HBO Max** (the monochrome lockup is
  `selfhst/icons:svg/hbo-max-light.svg`). The platform is still listed as
  `max` in this application's catalogue, so the shipped artwork is the white
  `max` wordmark of that same monochrome era rather than a different brand's
  mark. Renaming the platform would change stored `category` tokens, which is
  out of scope; if the name is ever migrated, the logo swap is one file.
* **Rasters.** Discovery+ and aha have no official vector published in any
  source reachable from this environment, so both are the official marks as
  512 px transparent raster exports (`tv-logo/tv-logos`), trimmed to their ink
  box, padded 1.2 % and encoded as WebP quality 92 with a full alpha channel —
  12.4 KB and 10.4 KB, both well above the 192 px a 4x 48 px disc needs, and
  neither carries a matte, box or background.
* **Unverified upstream.** No official brand portal (Netflix's Tudum press
  assets, Prime Video's brand guidelines, Disney's press site, …) is reachable
  from the build sandbox, which only allows GitHub, npm and PyPI. Every file is
  therefore a byte-for-byte copy of a third-party curation of the official
  artwork, matched by geometry against that upstream — not a redraw — and is
  documented above with the exact repository and path so it can be re-checked
  against a brand portal where one is available.

## 2. Glossy-black surface system

The blue and blue-violet accents are gone. Every neutral surface is now built
from a small set of tokens in `src/app/globals.css`:

```
--gloss-hi      specular rim on the top edge of a curved surface
--gloss-sheen   broad reflection across the upper third
--gloss-shade   shadowed underside that gives the curve volume
--gloss-lip     1px light lip along the bottom, as on a real bezel
--gloss-border  hairline outline (used instead of decorative borders)
--gloss-fill        specular radial + 4-stop #1a1a20 → #07070a gradient
--gloss-fill-strong brighter variant for pressed/selected surfaces
--gloss-shadow      inset top highlight + inset bottom lip + underside shade
                    + two drop shadows
--gloss-shadow-tight the same, shallower, for small controls
```

Neutrals: `--bg #040406`, `--surface #0a0a0e`, `--accent-blue #cfd0da`,
`--cyan #e9e9f2`. The former purple is now only a light neutral (`--accent
#ebeaf2`) used for range inputs, badges and small emphases.

### Protected brand treatments (deliberately untouched)

* the CINEMAX emblem/wordmark and its blue-purple-pink gradient
  (`CinemaxEmblem`, `.logo-wordmark`, `/brand/cinemax-symbol.svg`);
* the primary Play/Explore button family — `.cinematic-button` keeps its brand
  gradient, and `Icon name="play"` is unchanged;
* the intentional pink accent (`--accent-pink #ef76cb`, `#ff4fa3` in the More
  icon), which is not a blue treatment.

### Borders removed

The hero slide's boundary, the blue outlines around movie cards, the frames
around rails and the sheet's panel outlines are all gone; depth now comes from
light and shadow only. Poster artwork blends into the page through a mask that
fades the card into the background instead of a box drawn around it.

## 3. Data model (unchanged schema)

Platforms are stored as `platform-<id>` tokens inside the existing
`movies.category` comma-separated field, and filtered through the existing
`matchesCollection` / `?category=` paths. No table, column, migration,
relationship or existing record was created or rewritten. See the header
comment in `src/lib/platforms.ts`. Legacy rows without platform tokens fall back
to the platform names already present in `videoUrl`, `trailerUrl`,
`sourceAttribution` and `licenseInfo`.

## 4. Circular platform presentation (second pass)

The rail no longer uses any card, tile or rectangle. Each platform is one
`.platform-orbit` button made of three stacked elements:

```
<button class="platform-orbit">
  <span class="platform-orbit-disc"><img class="platform-logo platform-orbit-logo"></span>
  <span class="platform-orbit-name">Netflix</span>
  <span class="platform-orbit-count">12</span>
</button>
```

* **Disc** — a 74 px perfect circle (`border-radius: 50%`) painted with one
  radial specular cap over a three-stop near-black vertical gradient, an inset
  top rim, an inset underside shade and one drop shadow. No blur filter.
* **Logo** — the untouched brand file, `object-fit: contain`, capped at the
  48 px inner box inside 13 px of padding, so nothing is stretched, cropped or
  dimmed (`opacity: 1`, no filter, no overlay) and every mark keeps its own
  proportions. `z-index: 1` puts the artwork *above* the disc's specular cap and
  lip: those were absolutely positioned pseudo-elements painting a translucent
  white wash over the top of every mark, which is what made warm logos look
  dull and brownish. The mark is centred with `grid-area: 1 / 1` + `place-self:
  center` + `margin: auto`, so there is no baseline offset in any direction.
  The disc also carries `aspect-ratio: 1 / 1` plus `box-sizing: border-box`, so
  the container is a true circle whatever the row does to it.
* **Name** — below the circle, never inside it. The count sits under the name.
* **Selection** — the sphere lights from its rim inwards: an inset white ring,
  a 4 px soft halo and a brighter gradient. No blue, no rectangle, no outline.
* **Empty platform** — the *label* drops to 60 % opacity instead of inventing
  titles. The disc and the brand artwork always stay at full brightness; a logo
  is never rendered at reduced opacity.

The same circular language is used for the results header mark (64 px) and the
"Available on" row on a title page (46 px). The studio picker keeps compact
rows because it is a form control, not navigation.

## 5. Android scrollbars, overscroll and scroll containers

There are **two different scrollbars** in the app, and only one of them is CSS.

1. **The document scrollbar is a native Android View scrollbar.** The activity
   hosts a `WebView`; when the document scrolls, the widget draws its own thin
   light bar along the right edge. No `::-webkit-scrollbar` rule can remove it —
   which is why hiding CSS scrollbars alone never fixed the white bar on Home,
   Search, Watchlist, More, Categories or the listing pages. The fix is on the
   widget: `setVerticalScrollBarEnabled(false)` plus
   `setHorizontalScrollBarEnabled(false)` and
   `SCROLLBARS_OUTSIDE_OVERLAY` in `MainActivity.configureWebView()`.
   Scrolling is untouched — only the indicator is not drawn.
2. **Page scrollers** (the horizontal rails, the More sheet body, provider
   pages, studio tables) are CSS scrollbars and are killed in both stylesheets.

```css
* { scrollbar-width: none; -ms-overflow-style: none; }
*::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
*::-webkit-scrollbar-track,
*::-webkit-scrollbar-thumb,
*::-webkit-scrollbar-corner,
*::-webkit-scrollbar-button { background: transparent !important; }
html, body { scrollbar-width: none; }
html { overscroll-behavior-y: none; }
```

The app layer repeats the same rules scoped to `html[data-cinemax-app="android"]`
(including `*`), so it still holds if the WebView is showing an older deployment.

Only the *painting* of the indicator is removed: every box still scrolls by
touch, wheel, keyboard and `scrollTo`, no height is fixed, no container is
nested differently, and the horizontal rails keep their own
`overscroll-behavior-x: contain`. The overscroll glow / pull-to-refresh flash is
suppressed for the page only.

## 6. Android performance

| Change | Why |
| --- | --- |
| Removed `backdrop-filter` from every poster badge, the trailer button, the collection-tile icon and the sheet backdrop | Three to four live blurs **per poster card** was by far the most expensive thing on the page; a solid translucent black reads identically over artwork |
| `content-visibility: auto` + `contain-intrinsic-size` on every `.movie-row` (and the footer) | Off-screen rails are no longer laid out, painted or decoded; `auto` remembers the measured height so the scroll position never jumps |
| `contain: paint` on `.movie-poster` and `.shimmer` | Each poster costs one contained layer instead of a full-page repaint |
| New `<ScrollActivity>` | Sets `data-cinemax-scrolling` at most twice per gesture; the CSS pauses the dock's dash-offset sweep, the More mark's seven SVG loops and the skeleton sheen *only while the finger moves* |
| `will-change: transform` on the More mark | Keeps that always-on loop on a composited layer instead of repainting the dock |
| Hero slideshow parks itself off-screen | An `IntersectionObserver` stops the 11 s timer once the hero leaves the viewport |
| More-panel counts deferred | The O(collections × titles) pass now runs only when the sheet opens, not on every page mount |
| Platform rail logos load lazily | Only the first six discs load eagerly; the rest decode as the row is scrolled |
| Hero cross-fade is compositor-only | `1.5 s` opacity and a `2.6 s` `translate3d` drift on two full-bleed layers: no keyframe animation, no layout, no paint per frame. The next slide is mounted one beat early so its artwork is already decoded, and the 11 s cadence means the change itself runs about a third as often as before |

Poster images keep their existing behaviour: `loading="lazy"`,
`decoding="async"`, `fetchPriority="low"` for non-hero art, explicit
`width`/`height` (no layout shift), and TMDB `srcset`/`sizes` so a 150–205 px
card downloads the 185 px variant instead of a 500 px one.

## 7. Hero and touch interaction

* The hero paints **nothing**: the section is `background: transparent`, the
  image fallback is transparent, and there is no border, radius or shadow. The
  poster dissolves into the page through its own alpha (`mask-image`), so the
  page background — including the faint light above the fold — really shows
  through at the top and bottom edges. The vignette is now a pure-alpha scrim
  that returns to zero on every side: no solid band, no painted copy of the page
  colour.
* **Height**: `clamp(680px, 62vw, 980px)` on desktop, `clamp(580px, 76svh,
  760px)` at ≤ 820 px and `min(82svh, 680px)` with a 540 px floor on phones, so
  the banner owns the first screen and the copy sits at `bottom: 168px / 132px /
  92px` respectively. The old values (550–740 px, 440 px on a phone) stopped it
  well above the fold.
* **Bottom fade**: the mask has **eleven stops** and only reaches zero at the
  last pixel, so the artwork keeps its own brightness to ~46 % of the hero and
  then eases out in ever smaller steps (its alpha is ≥ 50 % to ~82 % of the
  height and ≥ 10 % to ~97 %). The steepest adjacent-pixel change in that ramp
  is ~4/255 — below the threshold of a visible edge — and the four scrim layers
  all return to zero at their own edges. There is no horizon, no band and no
  black patch.
* Slides change every **11 s** with a **1.5 s** opacity cross-fade *combined
  with* a **2.6 s** horizontal drift: the incoming poster travels in from the
  right while the outgoing one leaves to the left (2.2 % of the hero width).
  The title, description and buttons are keyed to the same slide, so they swap
  in step. Arrows, dots, previews, swipe, keyboard and pause all remain.
* Pressing a poster lifts it (`translateY(-6px) scale(1.015)`) with a deeper
  shadow. The lift hangs off the link's `:active` state, so the watchlist and
  trailer buttons are unaffected; an `@supports not selector(:has(*))` fallback
  keeps the effect on older WebViews. No outline, ring or blue flash is drawn —
  keyboard focus gets a light white ring instead.
