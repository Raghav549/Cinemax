import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Creates the tables defined in ./schema.ts if they don't exist yet.
 * This lets a brand-new database (e.g. a fresh Neon / Vercel Postgres DB)
 * work without having to run `drizzle-kit push` manually first.
 *
 * Keep this in sync with ./schema.ts.
 */
let ensured: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ensured) {
    ensured = createTables().catch((err) => {
      ensured = null; // allow a retry on the next request
      throw err;
    });
  }
  return ensured;
}

async function createTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "movies" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar(500) NOT NULL,
      "description" text DEFAULT '',
      "year" integer DEFAULT 2024,
      "rating" varchar(10) DEFAULT '8.0',
      "duration" varchar(50) DEFAULT '2h 0m',
      "genre" varchar(500) DEFAULT '',
      "language" varchar(200) DEFAULT 'English',
      "type" varchar(50) DEFAULT 'Movie',
      "director" varchar(200) DEFAULT '',
      "cast" text DEFAULT '',
      "poster_url" text DEFAULT '',
      "backdrop_url" text DEFAULT '',
      "video_url" text DEFAULT '',
      "category" varchar(100) DEFAULT 'trending',
      "featured" boolean DEFAULT false,
      "created_at" timestamp DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "slides" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar(500) NOT NULL,
      "subtitle" varchar(500) DEFAULT '',
      "image_url" text DEFAULT '',
      "movie_id" integer,
      "sort_order" integer DEFAULT 0,
      "active" boolean DEFAULT true,
      "created_at" timestamp DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "categories" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar(200) NOT NULL,
      "slug" varchar(200) NOT NULL,
      "sort_order" integer DEFAULT 0,
      "created_at" timestamp DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "watchlist" (
      "id" serial PRIMARY KEY NOT NULL,
      "movie_id" integer NOT NULL,
      "session_id" varchar(200) NOT NULL,
      "created_at" timestamp DEFAULT now()
    )
  `);
}
