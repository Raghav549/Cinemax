import { pgTable, serial, text, integer, timestamp, boolean, varchar } from "drizzle-orm/pg-core";

export const movies = pgTable("movies", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").default(""),
  year: integer("year").default(2024),
  rating: varchar("rating", { length: 10 }).default("8.0"),
  duration: varchar("duration", { length: 50 }).default("2h 0m"),
  genre: varchar("genre", { length: 500 }).default(""),
  language: varchar("language", { length: 200 }).default("English"),
  type: varchar("type", { length: 50 }).default("Movie"),
  director: varchar("director", { length: 200 }).default(""),
  cast: text("cast").default(""),
  posterUrl: text("poster_url").default(""),
  backdropUrl: text("backdrop_url").default(""),
  videoUrl: text("video_url").default(""),
  subtitleUrl: text("subtitle_url").default(""),
  subtitleLanguage: varchar("subtitle_language", { length: 100 }).default(""),
  rightsConfirmed: boolean("rights_confirmed").default(false),
  catalogStatus: varchar("catalog_status", { length: 64 }).default("verified_playable"),
  sourceType: varchar("source_type", { length: 64 }).default("direct"),
  licenseInfo: varchar("license_info", { length: 300 }).default(""),
  sourceAttribution: varchar("source_attribution", { length: 500 }).default(""),
  ratingSource: varchar("rating_source", { length: 100 }).default(""),
  releaseDate: varchar("release_date", { length: 64 }).default(""),
  trailerUrl: text("trailer_url").default(""),
  verificationResult: text("verification_result").default(""),
  lastVerifiedAt: timestamp("last_verified_at"),
  category: varchar("category", { length: 500 }).default("trending"),
  featured: boolean("featured").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const slides = pgTable("slides", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  subtitle: text("subtitle").default(""),
  imageUrl: text("image_url").default(""),
  movieId: integer("movie_id").references(() => movies.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
});

export const watchlist = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 200 }).notNull(),
  movieId: integer("movie_id").references(() => movies.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 200 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});
