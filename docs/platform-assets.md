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
| JioHotstar | `jiohotstar` | `jiohotstar.svg` | `Delta-Icons/android` → `resources/vectors/jio_hotstar.svg` | app icon |
| Disney+ | `disney-plus` | `disney-plus.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/disney-plus-dark.svg` | light wordmark for dark UI |
| Max | `max` | `max.svg` | `selfhst/icons` → `svg/max-light.svg` | white `max` wordmark |
| Apple TV+ | `apple-tv-plus` | `apple-tv-plus.svg` | `selfhst/icons` → `svg/apple-tv-light.svg` | light |
| Sony LIV | `sony-liv` | `sony-liv.svg` | `Dant5/clean-home-tizen` → `app/assets/icons/sonyliv.svg` | white |
| JioCinema | `jiocinema` | `jiocinema.svg` | `DevanshiJodhani/Jio-Cinema` → `public/images/jiocinema-logo.svg` | full colour |
| Crunchyroll | `crunchyroll` | `crunchyroll.svg` | `selfhst/icons` → `svg/crunchyroll.svg` | orange mark |
| Tubi | `tubi` | `tubi.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/tubi.svg` | purple wordmark |
| ZEE5 | `zee5` | `zee5.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/zee5.svg` | grey **Z** + gradient **5** |
| Hulu | `hulu` | `hulu.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/hulu.svg` | green wordmark |
| Paramount+ | `paramount-plus` | `paramount-plus.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/paramount-plus.svg` | blue mountain |
| Peacock | `peacock` | `peacock.svg` | `CarlesRojas/ha-diorama` → `src/tiles/apps/peacock-dark.svg` | white wordmark + colour feathers |
| MUBI | `mubi` | `mubi.svg` | `homarr-labs/dashboard-icons` → `svg/mubi-dark.svg` | white wordmark |
| Discovery+ | `discovery-plus` | `discovery-plus.webp` | `tv-logo/tv-logos` → `misc/media/discovery-plus.png` (converted) | full colour |
| YouTube | `youtube` | `youtube.svg` | `selfhst/icons` → `svg/youtube.svg` | red play mark |
| aha | `aha` | `aha.webp` | `tv-logo/tv-logos` → `misc/media/aha.png` (converted) | full colour |

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

### Dark-background variants

The rail, the details page and the studio all sit on near-black surfaces, so
light/white variants were chosen wherever a brand publishes one (Prime Video,
Disney+, Max, Peacock, MUBI, Apple TV+, Sony LIV). Where a logo only exists in a
single treatment it is used as published (Netflix, Hulu, Tubi, ZEE5, Paramount+,
YouTube, Discovery+, aha). Hulu's green and Tubi's purple are brand colours, not
design accents.

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
