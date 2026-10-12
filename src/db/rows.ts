/**
 * Mapping between what is stored in Postgres / sent by the admin panel and the
 * field names the app renders.
 *
 * Reads are normalised so a row always leaves the API with the same shape the
 * UI expects (camelCase, correct JS types), even when the value was stored as
 * text or came from a column that predates the current mapping.
 * Writes are validated and coerced before they reach Drizzle, so a bad payload
 * becomes a 400 with a readable message instead of a 500 the panel cannot
 * explain.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/* ───────────────────────────── primitives ───────────────────────────── */

type Row = Record<string, unknown>;

/** First present value among `keys` — tolerates camelCase, snake_case and legacy names. */
function pick(row: Row, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function asText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return fallback;
}

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Postgres booleans can arrive as true/false, "t"/"f", 1/0 or NULL. */
function asBoolean(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (["t", "true", "y", "yes", "1", "on"].includes(text)) return true;
  if (["f", "false", "n", "no", "0", "off"].includes(text)) return false;
  return fallback;
}

function asDateText(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return asText(value) || null;
}

/* ─────────────────────────────── movies ─────────────────────────────── */

export interface MovieRow {
  id: number;
  title: string;
  description: string;
  year: number | null;
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
  category: string;
  featured: boolean;
  createdAt: string | null;
}

export function normalizeMovie(row: Row): MovieRow {
  return {
    id: asNumberOrNull(pick(row, "id")) ?? 0,
    title: asText(pick(row, "title")),
    description: asText(pick(row, "description", "desc", "synopsis", "summary")),
    year: asNumberOrNull(pick(row, "year", "release_year")),
    rating: asText(pick(row, "rating", "score")),
    duration: asText(pick(row, "duration", "runtime")),
    genre: asText(pick(row, "genre", "genres")),
    language: asText(pick(row, "language", "lang")),
    type: asText(pick(row, "type"), "Movie"),
    director: asText(pick(row, "director")),
    cast: asText(pick(row, "cast", "casts", "actors", "starring")),
    posterUrl: asText(pick(row, "posterUrl", "poster_url", "poster", "thumbnail")),
    backdropUrl: asText(pick(row, "backdropUrl", "backdrop_url", "backdrop", "banner")),
    videoUrl: asText(pick(row, "videoUrl", "video_url", "video", "stream_url")),
    subtitleUrl: asText(pick(row, "subtitleUrl", "subtitle_url", "captions_url", "captions")),
    subtitleLanguage: asText(pick(row, "subtitleLanguage", "subtitle_language", "caption_language")),
    rightsConfirmed: asBoolean(pick(row, "rightsConfirmed", "rights_confirmed", "distribution_authorized")),
    category: asText(pick(row, "category", "categories", "section"), "trending"),
    featured: asBoolean(pick(row, "featured", "is_featured")),
    createdAt: asDateText(pick(row, "createdAt", "created_at")),
  };
}

export function isHttpOrLocalUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/[\x00-\x1f]/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Accept v1 info hashes (hex/base32) and v2 multihashes, not arbitrary magnet payloads. */
export function isValidMagnetUri(value: string): boolean {
  if (!/^[\x20-\x7e]+$/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "magnet:") return false;
    return url.searchParams.getAll("xt").some((xt) =>
      /^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(xt) ||
      /^urn:btmh:1220[a-f0-9]{64}$/i.test(xt)
    );
  } catch {
    return false;
  }
}

export type MovieInput = Omit<MovieRow, "id" | "createdAt">;

/** Validate + coerce an admin payload for `movies`. */
export function movieInput(
  body: Row,
  options: { partial?: boolean; requireTitle?: boolean } = {}
): MovieInput {
  const text = (key: string, fallback: string, max?: number): string => {
    const raw = body[key];
    if (raw === undefined) return fallback;
    const value = asText(raw).trim();
    if (max && value.length > max) {
      throw new ValidationError(`${key} must be ${max} characters or fewer`);
    }
    return value;
  };

  const title = text("title", "");
  if (!title && options.requireTitle !== false) throw new ValidationError("title is required");

  const yearRaw = body.year;
  let year: number | null = asNumberOrNull(yearRaw);
  if (year === null && yearRaw !== undefined && yearRaw !== "") {
    throw new ValidationError("year must be a number");
  }
  if (year !== null && (year < 1800 || year > 2200)) {
    throw new ValidationError("year must be between 1800 and 2200");
  }

  const rawVideoUrl = text("videoUrl", "", 4096);
  const videoUrl = rawVideoUrl.replace(/^magnet:/i, "magnet:");
  const rightsConfirmed = asBoolean(body.rightsConfirmed);
  if (videoUrl.startsWith("magnet:")) {
    if (!isValidMagnetUri(videoUrl)) throw new ValidationError("videoUrl must be a valid BitTorrent magnet URI");
    if (!rightsConfirmed) throw new ValidationError("Confirm distribution rights before adding a magnet stream");
  } else if (videoUrl && !isHttpOrLocalUrl(videoUrl)) {
    throw new ValidationError("videoUrl must use http(s), a local path, or an authorized magnet URI");
  }

  const subtitleUrl = text("subtitleUrl", "", 2048);
  if (subtitleUrl && !isHttpOrLocalUrl(subtitleUrl)) {
    throw new ValidationError("subtitleUrl must use http(s) or a local path");
  }

  return {
    title,
    description: text("description", ""),
    year,
    rating: text("rating", "8.0", 10),
    duration: text("duration", "2h 0m", 50),
    genre: text("genre", "", 500),
    language: text("language", "English", 200),
    type: text("type", "Movie", 50),
    director: text("director", "", 200),
    cast: text("cast", ""),
    posterUrl: text("posterUrl", ""),
    backdropUrl: text("backdropUrl", ""),
    videoUrl,
    subtitleUrl,
    subtitleLanguage: text("subtitleLanguage", "", 100),
    rightsConfirmed,
    category: text("category", "trending", 100),
    featured: asBoolean(body.featured),
  };
}

/**
 * Same validation as {@link movieInput}, but only the fields the caller actually
 * sent are returned, so an edit never blanks out columns the form did not show.
 */
export function moviePatch(body: Row): Partial<MovieInput> {
  const full = movieInput(body, { partial: true, requireTitle: false });
  const patch = onlyProvided(full, body);
  if (Object.keys(patch).length === 0) throw new ValidationError("No fields to update");
  return patch;
}

/** Keep only the keys the request body actually carried. */
function onlyProvided<T extends object>(full: T, body: Row): Partial<T> {
  const patch: Partial<T> = {};
  for (const key of Object.keys(full) as (keyof T)[]) {
    if (body[key as string] !== undefined) patch[key] = full[key];
  }
  return patch;
}

/* ─────────────────────────────── slides ─────────────────────────────── */

export interface SlideRow {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  movieId: number | null;
  sortOrder: number;
  active: boolean;
  createdAt: string | null;
}

export function normalizeSlide(row: Row): SlideRow {
  return {
    id: asNumberOrNull(pick(row, "id")) ?? 0,
    title: asText(pick(row, "title")),
    subtitle: asText(pick(row, "subtitle")),
    imageUrl: asText(pick(row, "imageUrl", "image_url", "image", "img")),
    movieId: asNumberOrNull(pick(row, "movieId", "movie_id")),
    sortOrder: asNumberOrNull(pick(row, "sortOrder", "sort_order")) ?? 0,
    // Rows written straight into Postgres often leave `active` NULL — treat that
    // as visible rather than hiding the slide from the hero carousel.
    active: asBoolean(pick(row, "active", "is_active"), true),
    createdAt: asDateText(pick(row, "createdAt", "created_at")),
  };
}

export type SlideInput = Omit<SlideRow, "id" | "createdAt">;

export function slideInput(body: Row, options: { requireTitle?: boolean } = {}): SlideInput {
  const title = asText(body.title).trim();
  if (!title && options.requireTitle !== false) throw new ValidationError("title is required");
  if (title.length > 500) throw new ValidationError("title must be 500 characters or fewer");
  const subtitle = asText(body.subtitle).trim();
  if (subtitle.length > 500) throw new ValidationError("subtitle must be 500 characters or fewer");
  const movieId = body.movieId === "" || body.movieId === null ? null : asNumberOrNull(body.movieId);
  return {
    title,
    subtitle,
    imageUrl: asText(body.imageUrl).trim(),
    movieId,
    sortOrder: asNumberOrNull(body.sortOrder) ?? 0,
    active: asBoolean(body.active, true),
  };
}

export function slidePatch(body: Row): Partial<SlideInput> {
  const patch = onlyProvided(slideInput(body, { requireTitle: false }), body);
  if (Object.keys(patch).length === 0) throw new ValidationError("No fields to update");
  return patch;
}

/* ────────────────────────────── categories ──────────────────────────── */

export interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
  createdAt: string | null;
}

export function normalizeCategory(row: Row): CategoryRow {
  return {
    id: asNumberOrNull(pick(row, "id")) ?? 0,
    name: asText(pick(row, "name")),
    slug: asText(pick(row, "slug")),
    sortOrder: asNumberOrNull(pick(row, "sortOrder", "sort_order")) ?? 0,
    createdAt: asDateText(pick(row, "createdAt", "created_at")),
  };
}

export type CategoryInput = Omit<CategoryRow, "id" | "createdAt">;

/** `My Favourite List` → `my-favourite-list` */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

export function categoryInput(body: Row): CategoryInput {
  const name = asText(body.name).trim();
  if (!name) throw new ValidationError("name is required");
  if (name.length > 200) throw new ValidationError("name must be 200 characters or fewer");
  const slug = slugify(asText(body.slug).trim() || name);
  if (!slug) throw new ValidationError("slug could not be generated from that name");
  return { name, slug, sortOrder: asNumberOrNull(body.sortOrder) ?? 0 };
}

/* ────────────────────────────── watchlist ───────────────────────────── */

export interface WatchlistRow {
  id: number;
  movieId: number;
  sessionId: string;
  createdAt: string | null;
  movie?: MovieRow | null;
}

export function normalizeWatchlist(row: Row): WatchlistRow {
  const nested = row.movie;
  return {
    id: asNumberOrNull(pick(row, "id", "watchlistId", "watchlist_id")) ?? 0,
    movieId: asNumberOrNull(pick(row, "movieId", "movie_id")) ?? 0,
    sessionId: asText(pick(row, "sessionId", "session_id")),
    createdAt: asDateText(pick(row, "createdAt", "created_at")),
    movie: nested && typeof nested === "object" ? normalizeMovie(nested as Row) : null,
  };
}
