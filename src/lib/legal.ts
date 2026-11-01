/**
 * Legal & attribution content for the CINEMAX website.
 *
 * Everything here is either (a) a fact about this repository, verifiable by
 * reading it, or (b) a fact about a third party, recorded with the date it was
 * checked and attributable to the third party's own public material. Nothing is
 * invented: there is no claim of partnership, licensing deal, approval or
 * endorsement anywhere in this file, because no such agreement exists.
 *
 * These routes are website-only. No Android screen, asset or bridge call
 * references any of them; the app's injected stylesheet hides the footer entry
 * point so the section is not surfaced inside the application.
 */
import type { PlatformId } from "@/lib/platforms";

/** Date the third-party ownership notes below were last checked. */
export const LEGAL_REVIEWED = "1 November 2026";

export const LEGAL_OWNER = {
  name: "CINEMAX",
  /** Neutral, factual statement about this project - no claim is made beyond it. */
  summary:
    "CINEMAX is an independent movie and series catalogue project. It is not operated by, licensed by, or affiliated with any of the streaming services listed on this page.",
  contact: "Use the studio contact details published with this deployment, or open an issue in the project repository.",
} as const;

export type LegalPageSlug = "license" | "copyright" | "attributions" | "disclaimer" | "privacy";

export interface LegalPageMeta {
  slug: LegalPageSlug;
  href: string;
  /** Footer / index label. */
  label: string;
  title: string;
  eyebrow: string;
  description: string;
  reviewed: string;
}

export const LEGAL_PAGES: readonly LegalPageMeta[] = [
  {
    slug: "license",
    href: "/license",
    label: "License",
    title: "Licensing & Attribution",
    eyebrow: "Website documentation",
    description:
      "How brand artwork, imagery, fonts, icons, video and third-party software are used on this website, who owns each one, and what their presence does and does not mean.",
    reviewed: LEGAL_REVIEWED,
  },
  {
    slug: "copyright",
    href: "/copyright",
    label: "Copyright",
    title: "Copyright & Intellectual Property",
    eyebrow: "Website documentation",
    description:
      "What is original to CINEMAX, what belongs to third parties, how to report a rights concern, and the notice-and-takedown procedure used for reported material.",
    reviewed: LEGAL_REVIEWED,
  },
  {
    slug: "attributions",
    href: "/attributions",
    label: "Attributions",
    title: "Third-Party Attributions",
    eyebrow: "Website documentation",
    description:
      "The complete list of third-party software, fonts, artwork sources and services this website uses, with the licence recorded for each one.",
    reviewed: LEGAL_REVIEWED,
  },
  {
    slug: "disclaimer",
    href: "/disclaimer",
    label: "Disclaimer",
    title: "Content & Trademark Disclaimer",
    eyebrow: "Website documentation",
    description:
      "Platform names and logos belong to their respective owners. Their display here is nominative use for identification only, and implies no affiliation, sponsorship, partnership or endorsement.",
    reviewed: LEGAL_REVIEWED,
  },
  {
    slug: "privacy",
    href: "/privacy",
    label: "Privacy",
    title: "Privacy & Content Usage",
    eyebrow: "Website documentation",
    description:
      "What this website stores in your browser, what it sends to its own API, what the Android application adds, and which third-party hosts your browser may contact.",
    reviewed: LEGAL_REVIEWED,
  },
];

/** Cross-links shown at the end of every legal page. */
export function siblingPages(slug: LegalPageSlug): readonly LegalPageMeta[] {
  return LEGAL_PAGES.filter((page) => page.slug !== slug);
}

/* ------------------------------------------------------------------ brands */

export interface PlatformBrandNotice {
  id: PlatformId;
  /** The service as it is named on this website. */
  service: string;
  /** The corporate owner of the service and its marks. */
  owner: string;
  /** Where the mark is used, in this project's own words. */
  use: string;
  /** Anything that is specifically worth stating plainly. */
  note?: string;
}

/**
 * Ownership notes for the nineteen platforms in the catalogue.
 *
 * Each entry records the owner of the mark and the fact that the artwork is
 * used nominatively - to say where a title in the library can be watched.
 * Where a service has changed hands or been merged, the date is given, because
 * "who owns this brand" is the one part of this page that genuinely moves.
 */
export const PLATFORM_BRAND_NOTICES: readonly PlatformBrandNotice[] = [
  {
    id: "netflix",
    service: "Netflix",
    owner: "Netflix, Inc.",
    use: "Official Netflix mark in the platform rail, the studio picker and title availability rows.",
  },
  {
    id: "prime-video",
    service: "Prime Video",
    owner: "Amazon.com, Inc. (Amazon Prime Video / Amazon MGM Studios)",
    use: "Official Prime Video lockup, same placements as every other platform.",
  },
  {
    id: "jiohotstar",
    service: "JioHotstar",
    owner: "JioStar, a joint venture of Reliance Industries Limited and The Walt Disney Company",
    use: "Official JioHotstar wordmark.",
    note: "JioHotstar launched on 14 February 2025, when JioCinema and Disney+ Hotstar were merged into the JioStar joint venture.",
  },
  {
    id: "disney-plus",
    service: "Disney+",
    owner: "The Walt Disney Company (Disney Entertainment)",
    use: "Official Disney+ wordmark.",
  },
  {
    id: "max",
    service: "Max",
    owner: "Warner Bros. Discovery, Inc. (Home Box Office, Inc.)",
    use: "The monochrome “max” wordmark.",
    note: "Warner Bros. Discovery reverted its flagship service from “Max” back to HBO Max in July 2025. The catalogue still names this platform “Max”, so its existing brand artwork is kept rather than swapped for a different service's mark.",
  },
  {
    id: "apple-tv-plus",
    service: "Apple TV+",
    owner: "Apple Inc.",
    use: "Official Apple TV+ lockup (the “ tv+” wordmark).",
  },
  {
    id: "sony-liv",
    service: "SonyLIV",
    owner: "Sony Pictures Networks India (Culver Max Entertainment Private Limited), a Sony Pictures Entertainment group company",
    use: "Official SonyLIV mark.",
  },
  {
    id: "jiocinema",
    service: "JioCinema",
    owner: "Viacom18 Media Private Limited (JioStar)",
    use: "Official JioCinema mark.",
    note: "JioCinema ceased to operate as a separate service on 14 February 2025 and its subscribers were moved to JioHotstar. The platform entry is kept because existing catalogue records still reference it.",
  },
  {
    id: "crunchyroll",
    service: "Crunchyroll",
    owner: "Crunchyroll, LLC (Sony Pictures Entertainment)",
    use: "Official Crunchyroll mark.",
  },
  {
    id: "tubi",
    service: "Tubi",
    owner: "Tubi, Inc. (Fox Corporation)",
    use: "Official Tubi wordmark.",
  },
  {
    id: "zee5",
    service: "ZEE5",
    owner: "Zee Entertainment Enterprises Limited",
    use: "Official ZEE5 mark.",
  },
  {
    id: "hulu",
    service: "Hulu",
    owner: "Hulu, LLC (The Walt Disney Company)",
    use: "Official Hulu wordmark.",
  },
  {
    id: "paramount-plus",
    service: "Paramount+",
    owner: "Paramount Global, part of Paramount Skydance Corporation",
    use: "Official Paramount+ mark.",
    note: "The Skydance–Paramount merger completed in August 2025; Skydance's acquisition of Warner Bros. Discovery, reported completed in October 2026, places HBO Max under the same corporate owner. No change to either service's name has been announced, and this page records ownership only.",
  },
  {
    id: "peacock",
    service: "Peacock",
    owner: "Peacock TV LLC (NBCUniversal Media, LLC, a Comcast Corporation company)",
    use: "Official Peacock wordmark with its colour feathers.",
  },
  {
    id: "mubi",
    service: "MUBI",
    owner: "MUBI, Inc.",
    use: "Official MUBI wordmark.",
  },
  {
    id: "discovery-plus",
    service: "Discovery+",
    owner: "Warner Bros. Discovery, Inc.",
    use: "Official Discovery+ mark.",
    note: "Discovery+ content was folded into Max (now HBO Max) in the United States in 2023; the standalone service continues in several international markets and existing catalogue records still reference it.",
  },
  {
    id: "youtube",
    service: "YouTube",
    owner: "Google LLC / YouTube, LLC (Alphabet Inc.)",
    use: "Official YouTube play mark.",
  },
  {
    id: "aha",
    service: "aha",
    owner: "Arha Media & Broadcasting Private Limited",
    use: "Official aha mark.",
  },
  {
    id: "cinemax",
    service: "CINEMAX",
    owner: "Home Box Office, Inc. (Warner Bros. Discovery, Inc.)",
    use: "Official Cinemax brand artwork, used nominatively to label titles available on the Cinemax network.",
    note: "This is a third-party mark and is treated as one. It is deliberately different from this project's own CINEMAX identity: the application's emblem, wordmark and app icon are original artwork belonging to this project (see /copyright) and are not the Cinemax network's logo. Warner Bros. Discovery revived the Cinemax brand for its linear channels in September 2025.",
  },
];

export const BRAND_NOTICE_SUMMARY =
  "All product names, logos, service names and brands shown on this website are the property of their respective owners. They are used only to identify where a title in this catalogue can be streamed, and their use does not imply any affiliation with, sponsorship by, partnership with, or endorsement by those owners.";

/* -------------------------------------------------------------- the notices */

export interface AttributionRecord {
  name: string;
  version?: string;
  licence: string;
  /** What it is used for on this website. */
  use: string;
  url?: string;
}

/**
 * Software shipped to the browser or run by this deployment. Versions and
 * licence identifiers are read from each package's own metadata (SPDX field),
 * not from memory.
 */
export const SOFTWARE_ATTRIBUTIONS: readonly AttributionRecord[] = [
  {
    name: "Next.js",
    version: "16.4.3",
    licence: "MIT",
    use: "Application framework: routing, server rendering, image and font pipeline, build.",
    url: "https://nextjs.org",
  },
  {
    name: "React",
    version: "19.2.6",
    licence: "MIT",
    use: "User interface runtime for every screen.",
    url: "https://react.dev",
  },
  {
    name: "React DOM",
    version: "19.2.6",
    licence: "MIT",
    use: "Browser renderer for React.",
    url: "https://react.dev",
  },
  {
    name: "hls.js",
    version: "1.7.3",
    licence: "Apache-2.0",
    use: "HTTP Live Streaming playback where the browser has no native HLS support. Loaded only when a title with an HLS source is played.",
    url: "https://github.com/video-dev/hls.js",
  },
  {
    name: "dash.js",
    version: "5.2.1",
    licence: "BSD-3-Clause",
    use: "MPEG-DASH playback. Loaded only when a title with a DASH manifest is played.",
    url: "https://github.com/Dash-Industry-Forum/dash.js",
  },
  {
    name: "jose",
    version: "6.2.12",
    licence: "MIT",
    use: "Server-side verification of the studio's signed session tokens.",
    url: "https://github.com/panva/jose",
  },
  {
    name: "drizzle-orm",
    version: "0.45.2",
    licence: "Apache-2.0",
    use: "Typed SQL access for the catalogue database (server only).",
    url: "https://orm.drizzle.team",
  },
  {
    name: "drizzle-kit",
    version: "0.31.11",
    licence: "MIT",
    use: "Database schema migration tooling (development only; not shipped).",
    url: "https://orm.drizzle.team",
  },
  {
    name: "node-postgres (pg)",
    version: "8.20.0",
    licence: "MIT",
    use: "PostgreSQL client used by the server (not shipped to the browser).",
    url: "https://node-postgres.com",
  },
  {
    name: "bcryptjs",
    version: "3.0.3",
    licence: "BSD-3-Clause",
    use: "Password hashing for studio administrator credentials (server only).",
    url: "https://github.com/dcodeIO/bcrypt.js",
  },
  {
    name: "uuid",
    version: "14.0.3",
    licence: "MIT",
    use: "Identifier generation for the anonymous watchlist session.",
    url: "https://github.com/uuidjs/uuid",
  },
  {
    name: "Tailwind CSS",
    version: "4.1.17",
    licence: "MIT",
    use: "Utility layer compiled into the site stylesheet at build time.",
    url: "https://tailwindcss.com",
  },
  {
    name: "TypeScript",
    version: "5.9.3",
    licence: "Apache-2.0",
    use: "Type checking at build time (development only; not shipped).",
    url: "https://www.typescriptlang.org",
  },
  {
    name: "ESLint",
    version: "9.39.5",
    licence: "MIT",
    use: "Static analysis at build time (development only; not shipped).",
    url: "https://eslint.org",
  },
  {
    name: "PostgreSQL",
    licence: "PostgreSQL License (permissive, BSD-style)",
    use: "The database server this deployment connects to. Provided as a service; no PostgreSQL code is redistributed by this website.",
    url: "https://www.postgresql.org/about/licence/",
  },
];

export interface FontAttribution {
  family: string;
  designer: string;
  licence: string;
  licenceUrl: string;
  /** Where the licence text ships in this repository. */
  file: string;
  use: string;
}

export const FONT_ATTRIBUTIONS: readonly FontAttribution[] = [
  {
    family: "Outfit",
    designer: "The Outfit Project Authors",
    licence: "SIL Open Font License 1.1",
    licenceUrl: "https://openfontlicense.org",
    file: "src/app/fonts/OUTFIT-LICENSE.txt (also packaged in the Android app at assets/cinemax/fonts/)",
    use: "Display face: headings, the CINEMAX wordmark and the native splash wordmark.",
  },
  {
    family: "Manrope",
    designer: "The Manrope Project Authors",
    licence: "SIL Open Font License 1.1",
    licenceUrl: "https://openfontlicense.org",
    file: "src/app/fonts/MANROPE-LICENSE.txt",
    use: "Text face: body copy, labels and interface text.",
  },
];

export const IMAGE_NOTES = [
  "Poster and backdrop artwork for catalogue titles is supplied by the studio that adds the title, or referenced from an image host that the studio is licensed to use. CINEMAX does not claim ownership of that artwork.",
  "Where a title uses artwork hosted by The Movie Database (image.tmdb.org), it is displayed at a reduced size through TMDB's public image service and remains the property of the film's rights holders, as listed by TMDB. TMDB's own terms apply to that service; this website is not endorsed or certified by TMDB.",
  "Artwork is requested lazily, at a size appropriate for the container, and is never modified, recoloured, cropped into a different aspect ratio, or overlayed with a filter. The one exception is the small number of brand logos documented above, which are scaled only.",
  "The platform marks in public/platforms are the platforms' own artwork, sourced from the third-party brand libraries recorded on /attributions. They are not redrawn, recoloured or substituted with text.",
  "The CINEMAX emblem, wordmark lockup and app icon are original vector artwork created for this project and are used under this project's own copyright.",
  "The Android application icon, splash artwork and system notification assets are generated from that same original emblem.",
] as const;

export const ICON_NOTES = [
  "Every interface icon (search, play, bookmark, share, chevrons, category marks and the motion logo) is inline SVG drawn for this project in src/components/Icon.tsx and src/components/MoreIcon.tsx. No third-party icon font or icon set is bundled.",
  "They are published as code in the project repository rather than as a separate licensed asset, so they carry no separate attribution requirement.",
] as const;

export const VIDEO_NOTES = [
  "CINEMAX does not sell, host or redistribute commercial titles. Playback happens in one of two ways: a source the studio has recorded as licensed or public domain, or an official external player belonging to the platform that holds the rights.",
  "Trailers are only ever the ones the studio has attached to a title. They may be a direct video file, an HLS or DASH stream, or an official YouTube or Vimeo embed played through that provider's own player.",
  "Where a title is available on an external platform, the app hand off to that platform's own player and page; the stream itself never passes through CINEMAX.",
  "If you believe a title, trailer or image in the catalogue infringes your rights, see /copyright for the reporting route.",
] as const;
