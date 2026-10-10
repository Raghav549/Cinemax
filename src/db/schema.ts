import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";

export const movies = pgTable("movies", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").default(""),
  year: integer("year").default(2024),
  rating: varchar("rating", { length: 10 }).default("8.0"),
  duration: varchar("duration", { length: 50 }).default("2h 0m"),
  genre: varchar("genre", { length: 500 }).default(""),
  language: varchar("language", { length: 200 }).default("English"),
  type: varchar("type", { length: 50 }).default("Movie"), // Movie, Series, Anime, etc.
  director: varchar("director", { length: 200 }).default(""),
  cast: text("cast").default(""),
  posterUrl: text("poster_url").default(""),
  backdropUrl: text("backdrop_url").default(""),
  videoUrl: text("video_url").default(""),
  category: varchar("category", { length: 100 }).default("trending"),
  featured: boolean("featured").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const slides = pgTable("slides", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  subtitle: varchar("subtitle", { length: 500 }).default(""),
  imageUrl: text("image_url").default(""),
  movieId: integer("movie_id"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const watchlist = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  movieId: integer("movie_id").notNull(),
  sessionId: varchar("session_id", { length: 200 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
