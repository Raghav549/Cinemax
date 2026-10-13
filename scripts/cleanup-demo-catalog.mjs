#!/usr/bin/env node
/**
 * Safe cleanup for the broken demo catalog — dry-run by default.
 *
 * What this does, and what it refuses to do:
 *
 *  - It NEVER wipes a table, truncates anything, or deletes a row just because
 *    it "looks" like a demo. A movie is only a cleanup candidate when BOTH:
 *      1. its (title, year) exactly matches an entry in
 *         `scripts/demo-catalog-manifest.json` (the hardcoded catalog removed
 *         from `src/lib/catalog-data.ts`), AND
 *      2. its stored videoUrl OR posterUrl exactly matches that entry's
 *         seeded value (so an admin's own film that happens to share a title
 *         with a seeded title, but has a different source/poster, is kept).
 *    A slide is only a candidate when its title AND imageUrl exactly match a
 *    seeded slide, or it points at a movie that is itself a candidate.
 *
 *  - Before any deletion in --apply mode it writes a full JSON backup of the
 *    movies, slides and categories tables to the backup file and prints its
 *    path. If the backup cannot be written, nothing is deleted.
 *
 *  - Slides/watchlist rows referencing a deleted movie are handled by the
 *    database's existing foreign keys (slides.movie_id ON DELETE SET NULL,
 *    watchlist.movie_id ON DELETE CASCADE). Slides that reference a candidate
 *    movie are deleted explicitly first so no orphan hero slide survives.
 *    Their full contents are in the backup file.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/cleanup-demo-catalog.mjs            # dry run, changes nothing
 *   DATABASE_URL=... node scripts/cleanup-demo-catalog.mjs --apply    # backup, then delete candidates
 *   DATABASE_URL=... node scripts/cleanup-demo-catalog.mjs --apply --backup=./backups/before.json
 *
 * Production credentials are never read from the repo; supply DATABASE_URL
 * (or POSTGRES_URL) in the environment of the machine you run this on.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(here, "demo-catalog-manifest.json");
const apply = process.argv.includes("--apply");
const backupArg = process.argv.find((arg) => arg.startsWith("--backup="));
const backupPath = backupArg
  ? path.resolve(backupArg.slice("--backup=".length))
  : path.resolve(`backups/cinemax-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  console.error("DATABASE_URL is not set. Refusing to do anything — no database was touched.");
  process.exit(2);
}

const needsSsl = (url) => {
  if (/sslmode=disable/i.test(url)) return false;
  if (/sslmode=/i.test(url)) return true;
  return !/@(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/)/.test(url);
};

function describeTarget(url) {
  try {
    const parsed = new URL(url);
    // Host/database only — credentials are never printed.
    return `${parsed.hostname}:${Number(parsed.port) || 5432}/${parsed.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const seededMovies = new Map(
  (manifest.movies ?? []).map((movie) => [`${String(movie.title).trim().toLowerCase()}::${movie.year}`, movie]),
);
const seededSlides = manifest.slides ?? [];

const pool = new pg.Pool({
  connectionString,
  ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  max: 1,
});

try {
  console.log(`Target database: ${describeTarget(connectionString)}`);
  console.log(`Mode: ${apply ? "APPLY (backup first, then delete candidates)" : "DRY RUN (nothing will change)"}`);

  // Sequential reads: safest against single-connection/proxied databases.
  const movies = await pool.query('SELECT * FROM "movies" ORDER BY "id"');
  const slides = await pool.query('SELECT * FROM "slides" ORDER BY "id"');
  const categories = await pool.query('SELECT * FROM "categories" ORDER BY "id"').catch(() => ({ rows: [] }));

  const pick = (row, ...names) => {
    for (const name of names) if (row[name] !== undefined) return row[name];
    return undefined;
  };

  const movieCandidates = movies.rows.filter((row) => {
    const key = `${String(row.title ?? "").trim().toLowerCase()}::${row.year}`;
    const seed = seededMovies.get(key);
    if (!seed) return false;
    const videoUrl = String(pick(row, "video_url", "videoUrl") ?? "");
    const posterUrl = String(pick(row, "poster_url", "posterUrl") ?? "");
    return (seed.videoUrl && videoUrl === seed.videoUrl) || (seed.posterUrl && posterUrl === seed.posterUrl);
  });
  const candidateIds = new Set(movieCandidates.map((row) => row.id));

  const slideCandidates = slides.rows.filter((row) => {
    const movieId = pick(row, "movie_id", "movieId");
    if (movieId !== null && movieId !== undefined && candidateIds.has(movieId)) return true;
    const imageUrl = String(pick(row, "image_url", "imageUrl") ?? "");
    return seededSlides.some(
      (seed) => seed.title.toLowerCase() === String(row.title ?? "").trim().toLowerCase() && seed.imageUrl === imageUrl,
    );
  });

  const keptMovies = movies.rows.length - movieCandidates.length;
  console.log(`Movies in database: ${movies.rows.length} — cleanup candidates: ${movieCandidates.length}, preserved: ${keptMovies}`);
  for (const row of movieCandidates) console.log(`  movie  #${row.id} "${row.title}" (${row.year})`);
  console.log(`Slides in database: ${slides.rows.length} — cleanup candidates: ${slideCandidates.length}, preserved: ${slides.rows.length - slideCandidates.length}`);
  for (const row of slideCandidates) console.log(`  slide  #${row.id} "${row.title}"`);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to back up and delete exactly the candidates above.");
    process.exitCode = 0;
  } else {
    if (movieCandidates.length === 0 && slideCandidates.length === 0) {
      console.log("\nNo candidates found. Nothing was deleted and no backup was needed.");
      process.exitCode = 0;
    } else {
      await mkdir(path.dirname(backupPath), { recursive: true });
      const backup = {
        createdAt: new Date().toISOString(),
        target: describeTarget(connectionString),
        movies: movies.rows,
        slides: slides.rows,
        categories: categories.rows,
      };
      await writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { flag: "wx" });
      console.log(`\nBackup written: ${backupPath}`);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (slideCandidates.length) {
          await client.query('DELETE FROM "slides" WHERE "id" = ANY($1::int[])', [slideCandidates.map((row) => row.id)]);
        }
        if (movieCandidates.length) {
          await client.query('DELETE FROM "movies" WHERE "id" = ANY($1::int[])', [movieCandidates.map((row) => row.id)]);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      console.log(`Deleted ${slideCandidates.length} slide(s) and ${movieCandidates.length} movie(s). Backup: ${backupPath}`);
    }
  }
} finally {
  await pool.end();
}
