/**
 * Single source of truth for how application camelCase properties map to
 * Postgres snake_case columns, plus legacy camelCase names that may exist on
 * databases created by earlier builds.
 */
export const TABLE_COLUMN_MAP = {
  movies: {
    posterUrl: { column: "poster_url", legacy: ["posterUrl", "poster"] },
    backdropUrl: { column: "backdrop_url", legacy: ["backdropUrl", "backdrop"] },
    videoUrl: { column: "video_url", legacy: ["videoUrl", "video"] },
    subtitleUrl: { column: "subtitle_url", legacy: ["subtitleUrl", "subtitles"] },
    subtitleLanguage: { column: "subtitle_language", legacy: ["subtitleLanguage"] },
    rightsConfirmed: { column: "rights_confirmed", legacy: ["rightsConfirmed"] },
    catalogStatus: { column: "catalog_status", legacy: ["catalogStatus", "status"] },
    sourceType: { column: "source_type", legacy: ["sourceType"] },
    licenseInfo: { column: "license_info", legacy: ["licenseInfo", "license"] },
    sourceAttribution: { column: "source_attribution", legacy: ["sourceAttribution", "attribution"] },
    ratingSource: { column: "rating_source", legacy: ["ratingSource"] },
    releaseDate: { column: "release_date", legacy: ["releaseDate"] },
    trailerUrl: { column: "trailer_url", legacy: ["trailerUrl", "trailer"] },
    verificationResult: { column: "verification_result", legacy: ["verificationResult"] },
    lastVerifiedAt: { column: "last_verified_at", legacy: ["lastVerifiedAt"] },
    createdAt: { column: "created_at", legacy: ["createdAt"] },
  },
  slides: {
    imageUrl: { column: "image_url", legacy: ["imageUrl", "image"] },
    movieId: { column: "movie_id", legacy: ["movieId"] },
    sortOrder: { column: "sort_order", legacy: ["sortOrder", "order"] },
    createdAt: { column: "created_at", legacy: ["createdAt"] },
  },
  categories: {},
  watchlist: {
    sessionId: { column: "session_id", legacy: ["sessionId"] },
    movieId: { column: "movie_id", legacy: ["movieId"] },
    createdAt: { column: "created_at", legacy: ["createdAt"] },
  },
  admins: {
    passwordHash: { column: "password_hash", legacy: ["passwordHash", "password"] },
  },
} as const;
