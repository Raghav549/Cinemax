/**
 * Streaming-platform registry.
 *
 * Data model note (no schema change): the catalogue already stores a movie's
 * collections as a comma-separated token list in the existing
 * `movies.category` column, and `matchesCollection` already resolves any
 * token found in that list. A platform selection is therefore persisted as an
 * additional, namespaced token — `platform-netflix` — inside that same field:
 *
 *   category: "trending, hindi, platform-netflix, platform-prime-video"
 *
 * Nothing is added to the database: no table, column, migration or record is
 * created or modified. Rows that were catalogued before this feature carry no
 * such token; for those the platform is derived from the streaming URL /
 * attribution the record already stores (see `platformsForMovie`), so existing
 * data keeps filtering correctly without being rewritten.
 *
 * Brand logos live in /public/platforms and are the original brand artwork
 * sizes/proportions (see docs/platform-assets.md for sources and licences).
 *
 * CINEMAX is a streaming platform here like any other: it has its own entry, a
 * checkbox in the studio's platform picker, a disc in the home rail and its own
 * `platform-cinemax` token, and it uses the CINEMAX network's brand artwork —
 * deliberately NOT the app's own emblem (`/brand/cinemax-symbol.svg`), which
 * stays the application logo.
 */

export type PlatformId =
  | "netflix"
  | "prime-video"
  | "jiohotstar"
  | "disney-plus"
  | "max"
  | "apple-tv-plus"
  | "sony-liv"
  | "jiocinema"
  | "crunchyroll"
  | "tubi"
  | "zee5"
  | "hulu"
  | "paramount-plus"
  | "peacock"
  | "mubi"
  | "discovery-plus"
  | "youtube"
  | "aha"
  | "cinemax";

export interface StreamingPlatform {
  /** Stable slug; also the suffix of the persisted `platform-*` token. */
  id: PlatformId;
  name: string;
  /** Transparent brand artwork shipped with the app. */
  logo: string;
  /** Hostnames / brand words that identify this platform inside stored URLs. */
  matches: readonly string[];
}

export const PLATFORM_TAG_PREFIX = "platform-";

export const PLATFORMS: readonly StreamingPlatform[] = [
  {
    id: "netflix",
    name: "Netflix",
    logo: "/platforms/netflix.svg",
    matches: ["netflix.com", "netflix"],
  },
  {
    id: "prime-video",
    name: "Prime Video",
    logo: "/platforms/prime-video.svg",
    matches: ["primevideo.com", "amazon.com/gp/video", "amazon.co.uk/gp/video", "prime video", "primevideo"],
  },
  {
    id: "jiohotstar",
    name: "JioHotstar",
    logo: "/platforms/jiohotstar.svg",
    matches: ["jiohotstar.com", "hotstar.com", "jiohotstar", "hotstar"],
  },
  {
    id: "disney-plus",
    name: "Disney+",
    logo: "/platforms/disney-plus.svg",
    matches: ["disneyplus.com", "disneyplus", "disney+"],
  },
  {
    id: "max",
    name: "Max",
    logo: "/platforms/max.svg",
    matches: ["max.com", "hbomax.com", "hbo max", "hbomax"],
  },
  {
    id: "apple-tv-plus",
    name: "Apple TV+",
    logo: "/platforms/apple-tv-plus.svg",
    matches: ["tv.apple.com", "apple.co", "apple tv+", "apple tv"],
  },
  {
    id: "sony-liv",
    name: "Sony LIV",
    logo: "/platforms/sony-liv.svg",
    matches: ["sonyliv.com", "sony liv", "sonyliv"],
  },
  {
    id: "jiocinema",
    name: "JioCinema",
    logo: "/platforms/jiocinema.svg",
    matches: ["jiocinema.com", "jiocinema"],
  },
  {
    id: "crunchyroll",
    name: "Crunchyroll",
    logo: "/platforms/crunchyroll.svg",
    matches: ["crunchyroll.com", "crunchyroll"],
  },
  {
    id: "tubi",
    name: "Tubi",
    logo: "/platforms/tubi.svg",
    matches: ["tubitv.com", "tubi.tv", "tubi"],
  },
  {
    id: "zee5",
    name: "ZEE5",
    logo: "/platforms/zee5.svg",
    matches: ["zee5.com", "zee5"],
  },
  {
    id: "hulu",
    name: "Hulu",
    logo: "/platforms/hulu.svg",
    matches: ["hulu.com", "hulu"],
  },
  {
    id: "paramount-plus",
    name: "Paramount+",
    logo: "/platforms/paramount-plus.svg",
    matches: ["paramountplus.com", "paramountplus", "paramount+"],
  },
  {
    id: "peacock",
    name: "Peacock",
    logo: "/platforms/peacock.svg",
    matches: ["peacocktv.com", "peacock"],
  },
  {
    id: "mubi",
    name: "MUBI",
    logo: "/platforms/mubi.svg",
    matches: ["mubi.com", "mubi"],
  },
  {
    id: "discovery-plus",
    name: "Discovery+",
    logo: "/platforms/discovery-plus.webp",
    matches: ["discoveryplus.com", "discovery+", "discovery plus"],
  },
  {
    id: "youtube",
    name: "YouTube",
    logo: "/platforms/youtube.svg",
    matches: ["youtube.com", "youtu.be", "youtube"],
  },
  {
    id: "aha",
    name: "aha",
    logo: "/platforms/aha.webp",
    matches: ["aha.video", "aha.com", "aha"],
  },
  // Appended last so every existing platform keeps its position in the rail.
  {
    id: "cinemax",
    name: "CINEMAX",
    logo: "/platforms/cinemax.webp",
    matches: ["cinemax.com", "cinemax"],
  },
];

export const PLATFORM_BY_ID: ReadonlyMap<string, StreamingPlatform> = new Map(
  PLATFORMS.map((platform) => [platform.id, platform])
);

/** The token written into the existing `category` column for a platform. */
export function platformTag(id: string): string {
  return `${PLATFORM_TAG_PREFIX}${id}`;
}

/** A stored platform slug, or null for any normal catalogue token. */
export function platformIdFromTag(token: string | null | undefined): PlatformId | null {
  if (!token) return null;
  const value = token.trim().toLowerCase();
  if (!value.startsWith(PLATFORM_TAG_PREFIX)) return null;
  const id = value.slice(PLATFORM_TAG_PREFIX.length);
  return PLATFORM_BY_ID.has(id) ? (id as PlatformId) : null;
}

export function isPlatformTag(token: string | null | undefined): boolean {
  return platformIdFromTag(token) !== null;
}

/** Normalises accepted platform identifiers or brand names. */
export function normalizePlatformId(value: unknown): PlatformId | null {
  if (typeof value !== "string") return null;
  const direct = platformIdFromTag(value) ?? (PLATFORM_BY_ID.has(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null);
  if (direct) return direct as PlatformId;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  const found = PLATFORMS.find(
    (platform) => platform.name.toLowerCase() === needle || platform.matches.includes(needle)
  );
  return found ? found.id : null;
}

/** Platform slugs already stored on a record (order preserved, de-duplicated). */
export function platformsFromTags(category: string | null | undefined): PlatformId[] {
  if (!category) return [];
  const ids: PlatformId[] = [];
  for (const token of category.split(",")) {
    const id = platformIdFromTag(token);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Catalogue tokens with the platform tokens removed. */
export function catalogueTokens(category: string | null | undefined): string[] {
  if (!category) return [];
  return category
    .split(",")
    .map((token) => token.trim())
    .filter((token) => Boolean(token) && !isPlatformTag(token));
}

/** A platform identified anywhere in arbitrary stored text (URLs, credits). */
export function platformsFromText(text: string | null | undefined): PlatformId[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  const ids: PlatformId[] = [];
  for (const platform of PLATFORMS) {
    if (platform.id === "aha") continue; // "aha" is too short to match safely.
    if (platform.matches.some((needle) => haystack.includes(needle))) ids.push(platform.id);
  }
  return ids;
}

export interface PlatformBearingMovie {
  category?: string | null;
  videoUrl?: string | null;
  trailerUrl?: string | null;
  sourceAttribution?: string | null;
  licenseInfo?: string | null;
}

/**
 * Every platform a title is available on: the admin's explicit selection when
 * it exists, otherwise (legacy rows) what the stored streaming metadata says.
 */
export function platformsForMovie(movie: PlatformBearingMovie | null | undefined): PlatformId[] {
  if (!movie) return [];
  const explicit = platformsFromTags(movie.category);
  if (explicit.length) return explicit;
  const detected: PlatformId[] = [];
  for (const id of [
    ...platformsFromText(movie.videoUrl),
    ...platformsFromText(movie.trailerUrl),
    ...platformsFromText(movie.sourceAttribution),
    ...platformsFromText(movie.licenseInfo),
  ]) {
    if (!detected.includes(id)) detected.push(id);
  }
  return detected;
}

export function movieIsOnPlatform(movie: PlatformBearingMovie | null | undefined, id: PlatformId): boolean {
  return platformsForMovie(movie).includes(id);
}

/**
 * Rewrites only the platform tokens of a `category` value, keeping every other
 * token and its order exactly as the admin had it.
 */
export function withPlatformTags(category: string | null | undefined, ids: readonly string[]): string {
  const kept = (category ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter((token) => Boolean(token) && !isPlatformTag(token));
  const wanted: string[] = [];
  for (const raw of ids) {
    const id = normalizePlatformId(raw);
    if (id && !wanted.includes(platformTag(id))) wanted.push(platformTag(id));
  }
  const tokens = [...kept, ...wanted];
  return tokens.length ? tokens.join(",") : "trending";
}

/** "/category/platform-netflix" -> "netflix" (null for ordinary collections). */
export function platformIdFromSlug(slug: string | null | undefined): PlatformId | null {
  if (!slug) return null;
  return platformIdFromTag(slug.trim().toLowerCase());
}
