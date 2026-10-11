import { is, SQL } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import { categories, movies, slides, watchlist } from "./schema";

/**
 * A physical description of a table, derived from the Drizzle schema in
 * ./schema.ts so the two can never drift apart.
 */
export interface ColumnSpec {
  /** physical column name, e.g. "poster_url" */
  name: string;
  /** matching app-level field name, e.g. "posterUrl" */
  field: string;
  /** SQL type used when the column has to be created, e.g. "varchar(500)" */
  sqlType: string;
  notNull: boolean;
  primary: boolean;
  /** rendered DEFAULT clause, when the schema declares one */
  defaultSql?: string;
}

export interface TableSpec {
  name: string;
  columns: ColumnSpec[];
  column(name: string): ColumnSpec | undefined;
}

/** Drizzle columns expose getSQLType()/default, but they are not on the public type. */
type ColumnInternals = PgColumn & {
  default?: unknown;
  primary?: boolean;
  getSQLType(): string;
};

function renderDefault(column: ColumnInternals): string | undefined {
  const value = column.default;
  if (value === undefined || value === null) return undefined;
  // The only SQL-wrapped default used by this schema is `.defaultNow()`.
  if (is(value, SQL)) return "now()";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function describe(table: PgTable): TableSpec {
  const config = getTableConfig(table);
  const columns: ColumnSpec[] = config.columns.map((raw) => {
    const column = raw as ColumnInternals;
    return {
      name: column.name,
      field: column.name,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      primary: Boolean(column.primary),
      defaultSql: renderDefault(column),
    };
  });
  return {
    name: config.name,
    columns,
    column(name: string) {
      return columns.find((c) => c.name === name);
    },
  };
}

export const MOVIES = describe(movies);
export const SLIDES = describe(slides);
export const CATEGORIES = describe(categories);
export const WATCHLIST = describe(watchlist);

export const TABLES: TableSpec[] = [MOVIES, SLIDES, CATEGORIES, WATCHLIST];

/**
 * Column names used by older revisions of this app (and by data that was
 * imported straight into Neon). When one of these exists but the column the
 * current mapping expects does not, the data is carried over instead of being
 * orphaned — that is what made the admin panel show an empty library while
 * `select count(*) from movies` still reported rows.
 *
 * Keyed by "<table>.<column>".
 */
const LEGACY_ALIASES: Record<string, string[]> = {
  "movies.poster_url": ["poster", "posterurl", "poster_image", "poster_image_url", "poster_link", "thumbnail", "thumb", "cover", "cover_url", "image_url"],
  "movies.backdrop_url": ["backdrop", "backdropurl", "backdrop_image", "banner", "banner_url", "background", "bg", "cover"],
  "movies.video_url": ["video", "videourl", "video_link", "video_source", "stream_url", "trailer_url", "url", "src"],
  "movies.cast": ["casts", "actors", "starring", "star_cast"],
  "movies.description": ["desc", "synopsis", "summary", "overview"],
  "movies.duration": ["runtime", "length"],
  "movies.rating": ["score", "imdb", "imdb_rating"],
  "movies.language": ["lang", "languages"],
  "movies.director": ["directed_by"],
  "movies.category": ["categories", "list", "section", "row"],
  "movies.featured": ["is_featured", "featured_flag", "hero", "is_hero"],
  "movies.created_at": ["createdat", "created", "date_added", "added_at"],
  "slides.image_url": ["image", "imageurl", "img", "background", "bg", "poster", "banner", "url"],
  "slides.movie_id": ["movieid", "movie"],
  "slides.sort_order": ["order", "sortorder", "position", "seq", "sort"],
  "slides.active": ["is_active", "enabled", "visible"],
  "slides.created_at": ["createdat", "created"],
  "categories.sort_order": ["order", "sortorder", "position", "seq", "sort"],
  "categories.created_at": ["createdat", "created"],
  "watchlist.movie_id": ["movieid", "movie"],
  "watchlist.session_id": ["sessionid", "session", "user_id", "userid", "visitor_id"],
  "watchlist.created_at": ["createdat", "created", "added_at"],
};

export function legacyAliasesFor(table: string, column: string): string[] {
  return LEGACY_ALIASES[`${table}.${column}`] ?? [];
}

/** SQL type family, used to decide how a legacy value can be carried over. */
export function isTextType(sqlType: string): boolean {
  return /char|text|uuid|json/i.test(sqlType);
}

/** Quote a Postgres identifier. `cast`, `type`, `year` and `order` are reserved. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
