/**
 * Normalizes records returned from Drizzle / pg and validates incoming payloads
 * so every API endpoint speaks the same camelCase shape.
 */

export type CatalogStatus =
  | "verified_playable"
  | "official_external_playback"
  | "upcoming"
  | "temporarily_unavailable"
  | "verification_failed";

export type SourceType =
  | "public_domain"
  | "open_license"
  | "independent"
  | "official_embed"
  | "direct"
  | "official_external"
  | "upcoming";

export const VALID_CATALOG_STATUSES: readonly CatalogStatus[] = [
  "verified_playable",
  "official_external_playback",
  "upcoming",
  "temporarily_unavailable",
  "verification_failed",
];

export const VALID_SOURCE_TYPES: readonly SourceType[] = [
  "public_domain",
  "open_license",
  "independent",
  "official_embed",
  "direct",
  "official_external",
  "upcoming",
];

export type MovieRow = {
  id: number;
  title: string;
  description: string;
  year: number;
  rating: string;
  duration: string;
  genre: string;
  language: string;
  type: string;
  director: string;
  cast: string;
  posterUrl: string;
  backdropUrl: string;
  videoUrl: string;
  subtitleUrl: string;
  subtitleLanguage: string;
  rightsConfirmed: boolean;
  catalogStatus: CatalogStatus;
  sourceType: SourceType;
  licenseInfo: string;
  sourceAttribution: string;
  ratingSource: string;
  releaseDate: string;
  trailerUrl: string;
  verificationResult: string;
  lastVerifiedAt: string | null;
  category: string;
  featured: boolean;
  createdAt: string | null;
};

export type SlideRow = {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  movieId: number | null;
  sortOrder: number;
  active: boolean;
  createdAt: string | null;
};

export type CategoryRow = {
  id: number;
  name: string;
  slug: string;
};

export type WatchlistRow = {
  id: number;
  sessionId: string;
  movieId: number | null;
  createdAt: string | null;
};

type AnyRecord = Record<string, unknown>;

export function isHttpOrLocalUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("/")) return true;
  try {
    const parsed = new URL(v);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function str(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function int(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = int(value, Number.NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
  }
  return fallback;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function pick(row: AnyRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in row && row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return undefined;
}

function isExternalOttUrl(videoUrl: string): boolean {
  const lower = videoUrl.toLowerCase();
  return (
    lower.includes("netflix.com") ||
    lower.includes("primevideo.com") ||
    lower.includes("amazon.com/gp/video") ||
    lower.includes("hotstar.com") ||
    lower.includes("disneyplus.com") ||
    lower.includes("tv.apple.com") ||
    lower.includes("zee5.com") ||
    lower.includes("sonyliv.com") ||
    lower.includes("jiocinema.com") ||
    lower.includes("mxplayer.")
  );
}

export function normalizeCatalogStatus(rawStatus: unknown, videoUrl = ""): CatalogStatus {
  const s = str(rawStatus, "").trim() as CatalogStatus;
  if (VALID_CATALOG_STATUSES.includes(s)) return s;
  if (!videoUrl.trim()) return "upcoming";
  if (isExternalOttUrl(videoUrl)) return "official_external_playback";
  return "verified_playable";
}

export function normalizeSourceType(rawSourceType: unknown, videoUrl = "", status?: CatalogStatus): SourceType {
  const s = str(rawSourceType, "").trim() as SourceType;
  if (VALID_SOURCE_TYPES.includes(s)) return s;
  if (status === "upcoming" || !videoUrl.trim()) return "upcoming";
  if (status === "official_external_playback" || isExternalOttUrl(videoUrl)) return "official_external";
  if (videoUrl.includes("/embed/")) return "official_embed";
  return "direct";
}

export function normalizeMovie(row: AnyRecord): MovieRow {
  const videoUrl = str(pick(row, "videoUrl", "video_url", "video"), "");
  const catalogStatus = normalizeCatalogStatus(pick(row, "catalogStatus", "catalog_status", "status"), videoUrl);
  const sourceType = normalizeSourceType(pick(row, "sourceType", "source_type"), videoUrl, catalogStatus);

  return {
    id: int(row.id, 0),
    title: str(row.title, "Untitled"),
    description: str(row.description, ""),
    year: int(row.year, 2024),
    rating: str(row.rating, "8.0"),
    duration: str(row.duration, "2h 0m"),
    genre: str(row.genre, ""),
    language: str(row.language, "English"),
    type: str(row.type, "Movie"),
    director: str(row.director, ""),
    cast: str(row.cast, ""),
    posterUrl: str(pick(row, "posterUrl", "poster_url", "poster"), ""),
    backdropUrl: str(pick(row, "backdropUrl", "backdrop_url", "backdrop"), ""),
    videoUrl,
    subtitleUrl: str(pick(row, "subtitleUrl", "subtitle_url", "subtitles"), ""),
    subtitleLanguage: str(pick(row, "subtitleLanguage", "subtitle_language"), ""),
    rightsConfirmed: bool(pick(row, "rightsConfirmed", "rights_confirmed"), false),
    catalogStatus,
    sourceType,
    licenseInfo: str(pick(row, "licenseInfo", "license_info", "license"), ""),
    sourceAttribution: str(pick(row, "sourceAttribution", "source_attribution", "attribution"), ""),
    ratingSource: str(pick(row, "ratingSource", "rating_source"), ""),
    releaseDate: str(pick(row, "releaseDate", "release_date"), ""),
    trailerUrl: str(pick(row, "trailerUrl", "trailer_url", "trailer"), ""),
    verificationResult: str(pick(row, "verificationResult", "verification_result"), ""),
    lastVerifiedAt: iso(pick(row, "lastVerifiedAt", "last_verified_at")),
    category: str(row.category, "trending"),
    featured: bool(row.featured, false),
    createdAt: iso(pick(row, "createdAt", "created_at")),
  };
}

export function normalizeSlide(row: AnyRecord): SlideRow {
  return {
    id: int(row.id, 0),
    title: str(row.title, ""),
    subtitle: str(row.subtitle, ""),
    imageUrl: str(pick(row, "imageUrl", "image_url", "image"), ""),
    movieId: nullableInt(pick(row, "movieId", "movie_id")),
    sortOrder: int(pick(row, "sortOrder", "sort_order", "order"), 0),
    active: bool(row.active, true),
    createdAt: iso(pick(row, "createdAt", "created_at")),
  };
}

export function normalizeCategory(row: AnyRecord): CategoryRow {
  return {
    id: int(row.id, 0),
    name: str(row.name, ""),
    slug: str(row.slug, ""),
  };
}

export function normalizeWatchlist(row: AnyRecord): WatchlistRow {
  return {
    id: int(row.id, 0),
    sessionId: str(pick(row, "sessionId", "session_id"), ""),
    movieId: nullableInt(pick(row, "movieId", "movie_id")),
    createdAt: iso(pick(row, "createdAt", "created_at")),
  };
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function movieInput(raw: AnyRecord) {
  const title = str(raw.title).trim();
  if (!title) throw new ValidationError("Title is required");
  const year = int(raw.year, 2024);
  if (year < 1888 || year > 2100) throw new ValidationError("Year must be between 1888 and 2100");
  const videoUrl = str(pick(raw, "videoUrl", "video_url", "video")).trim();
  const catalogStatus = normalizeCatalogStatus(pick(raw, "catalogStatus", "catalog_status", "status"), videoUrl);
  const sourceType = normalizeSourceType(pick(raw, "sourceType", "source_type"), videoUrl, catalogStatus);
  const rawVerifiedAt = pick(raw, "lastVerifiedAt", "last_verified_at");
  const lastVerifiedAt =
    rawVerifiedAt instanceof Date
      ? rawVerifiedAt
      : typeof rawVerifiedAt === "string" && rawVerifiedAt.trim()
        ? new Date(rawVerifiedAt)
        : videoUrl
          ? new Date()
          : null;

  return {
    title,
    description: str(raw.description),
    year,
    rating: str(raw.rating, "8.0").slice(0, 10) || "8.0",
    duration: str(raw.duration, "2h 0m").slice(0, 50) || "2h 0m",
    genre: str(raw.genre).slice(0, 500),
    language: str(raw.language, "English").slice(0, 200) || "English",
    type: str(raw.type, "Movie").slice(0, 50) || "Movie",
    director: str(raw.director).slice(0, 200),
    cast: str(raw.cast),
    posterUrl: str(pick(raw, "posterUrl", "poster_url", "poster")).trim(),
    backdropUrl: str(pick(raw, "backdropUrl", "backdrop_url", "backdrop")).trim(),
    videoUrl,
    subtitleUrl: str(pick(raw, "subtitleUrl", "subtitle_url", "subtitles")).trim(),
    subtitleLanguage: str(pick(raw, "subtitleLanguage", "subtitle_language")).trim().slice(0, 100),
    rightsConfirmed: bool(pick(raw, "rightsConfirmed", "rights_confirmed"), false),
    catalogStatus,
    sourceType,
    licenseInfo: str(pick(raw, "licenseInfo", "license_info", "license")).trim().slice(0, 300),
    sourceAttribution: str(pick(raw, "sourceAttribution", "source_attribution", "attribution")).trim().slice(0, 500),
    ratingSource: str(pick(raw, "ratingSource", "rating_source")).trim().slice(0, 100),
    releaseDate: str(pick(raw, "releaseDate", "release_date")).trim().slice(0, 64),
    trailerUrl: str(pick(raw, "trailerUrl", "trailer_url", "trailer")).trim(),
    verificationResult: str(pick(raw, "verificationResult", "verification_result")).trim(),
    lastVerifiedAt,
    category: str(raw.category, "trending").trim().slice(0, 500) || "trending",
    featured: bool(raw.featured, false),
  };
}

export function moviePatch(raw: AnyRecord) {
  const patch: Record<string, unknown> = {};
  if ("title" in raw) {
    const title = str(raw.title).trim();
    if (!title) throw new ValidationError("Title cannot be empty");
    patch.title = title;
  }
  if ("description" in raw) patch.description = str(raw.description);
  if ("year" in raw) {
    const year = int(raw.year, Number.NaN);
    if (!Number.isFinite(year) || year < 1888 || year > 2100) {
      throw new ValidationError("Year must be between 1888 and 2100");
    }
    patch.year = year;
  }
  if ("rating" in raw) patch.rating = str(raw.rating, "8.0").slice(0, 10) || "8.0";
  if ("duration" in raw) patch.duration = str(raw.duration, "2h 0m").slice(0, 50) || "2h 0m";
  if ("genre" in raw) patch.genre = str(raw.genre).slice(0, 500);
  if ("language" in raw) patch.language = str(raw.language, "English").slice(0, 200) || "English";
  if ("type" in raw) patch.type = str(raw.type, "Movie").slice(0, 50) || "Movie";
  if ("director" in raw) patch.director = str(raw.director).slice(0, 200);
  if ("cast" in raw) patch.cast = str(raw.cast);
  if ("posterUrl" in raw || "poster_url" in raw || "poster" in raw) {
    patch.posterUrl = str(pick(raw, "posterUrl", "poster_url", "poster")).trim();
  }
  if ("backdropUrl" in raw || "backdrop_url" in raw || "backdrop" in raw) {
    patch.backdropUrl = str(pick(raw, "backdropUrl", "backdrop_url", "backdrop")).trim();
  }
  if ("videoUrl" in raw || "video_url" in raw || "video" in raw) {
    patch.videoUrl = str(pick(raw, "videoUrl", "video_url", "video")).trim();
  }
  if ("subtitleUrl" in raw || "subtitle_url" in raw || "subtitles" in raw) {
    patch.subtitleUrl = str(pick(raw, "subtitleUrl", "subtitle_url", "subtitles")).trim();
  }
  if ("subtitleLanguage" in raw || "subtitle_language" in raw) {
    patch.subtitleLanguage = str(pick(raw, "subtitleLanguage", "subtitle_language")).trim().slice(0, 100);
  }
  if ("rightsConfirmed" in raw || "rights_confirmed" in raw) {
    patch.rightsConfirmed = bool(pick(raw, "rightsConfirmed", "rights_confirmed"), false);
  }
  if ("catalogStatus" in raw || "catalog_status" in raw || "status" in raw) {
    const fallbackVideo = typeof patch.videoUrl === "string" ? patch.videoUrl : "";
    patch.catalogStatus = normalizeCatalogStatus(pick(raw, "catalogStatus", "catalog_status", "status"), fallbackVideo);
  }
  if ("sourceType" in raw || "source_type" in raw) {
    patch.sourceType = normalizeSourceType(pick(raw, "sourceType", "source_type"));
  }
  if ("licenseInfo" in raw || "license_info" in raw || "license" in raw) {
    patch.licenseInfo = str(pick(raw, "licenseInfo", "license_info", "license")).trim().slice(0, 300);
  }
  if ("sourceAttribution" in raw || "source_attribution" in raw || "attribution" in raw) {
    patch.sourceAttribution = str(pick(raw, "sourceAttribution", "source_attribution", "attribution")).trim().slice(0, 500);
  }
  if ("ratingSource" in raw || "rating_source" in raw) {
    patch.ratingSource = str(pick(raw, "ratingSource", "rating_source")).trim().slice(0, 100);
  }
  if ("releaseDate" in raw || "release_date" in raw) {
    patch.releaseDate = str(pick(raw, "releaseDate", "release_date")).trim().slice(0, 64);
  }
  if ("trailerUrl" in raw || "trailer_url" in raw || "trailer" in raw) {
    patch.trailerUrl = str(pick(raw, "trailerUrl", "trailer_url", "trailer")).trim();
  }
  if ("verificationResult" in raw || "verification_result" in raw) {
    patch.verificationResult = str(pick(raw, "verificationResult", "verification_result")).trim();
  }
  if ("lastVerifiedAt" in raw || "last_verified_at" in raw) {
    const val = pick(raw, "lastVerifiedAt", "last_verified_at");
    patch.lastVerifiedAt = val instanceof Date ? val : typeof val === "string" && val.trim() ? new Date(val) : null;
  }
  if ("category" in raw) {
    patch.category = str(raw.category, "trending").trim().slice(0, 500) || "trending";
  }
  if ("featured" in raw) patch.featured = bool(raw.featured, false);
  return patch;
}

export function slideInput(raw: AnyRecord) {
  const title = str(raw.title).trim();
  if (!title) throw new ValidationError("Slide title is required");
  return {
    title,
    subtitle: str(raw.subtitle),
    imageUrl: str(pick(raw, "imageUrl", "image_url", "image")).trim(),
    movieId: nullableInt(pick(raw, "movieId", "movie_id")),
    sortOrder: int(pick(raw, "sortOrder", "sort_order", "order"), 0),
    active: bool(rowActive(raw), true),
  };
}

export function slidePatch(raw: AnyRecord) {
  const patch: Record<string, unknown> = {};
  if ("title" in raw) {
    const title = str(raw.title).trim();
    if (!title) throw new ValidationError("Slide title cannot be empty");
    patch.title = title;
  }
  if ("subtitle" in raw) patch.subtitle = str(raw.subtitle);
  if ("imageUrl" in raw || "image_url" in raw || "image" in raw) {
    patch.imageUrl = str(pick(raw, "imageUrl", "image_url", "image")).trim();
  }
  if ("movieId" in raw || "movie_id" in raw) {
    patch.movieId = nullableInt(pick(raw, "movieId", "movie_id"));
  }
  if ("sortOrder" in raw || "sort_order" in raw || "order" in raw) {
    patch.sortOrder = int(pick(raw, "sortOrder", "sort_order", "order"), 0);
  }
  if ("active" in raw) patch.active = bool(raw.active, true);
  return patch;
}

function rowActive(raw: AnyRecord): unknown {
  return "active" in raw ? raw.active : true;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type CategoryInput = {
  name: string;
  slug: string;
  sortOrder?: number;
};

export function categoryInput(raw: AnyRecord): CategoryInput {
  const name = str(raw.name).trim();
  if (!name) throw new ValidationError("Category name is required");
  const slug = slugify(str(raw.slug).trim() || name);
  if (!slug) throw new ValidationError("Category slug cannot be empty");
  return { name: name.slice(0, 100), slug: slug.slice(0, 100) };
}
