import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { admins, categories, movies, slides, watchlist } from "@/db/schema";
import { normalizeMovie, normalizeSlide, type MovieRow } from "@/db/rows";
import {
  CATALOG_CATEGORIES,
  HERO_SLIDE_SEEDS,
  OFFICIAL_EXTERNAL_CATALOG,
  UPCOMING_MOVIES_CATALOG,
  VERIFIED_PLAYABLE_CATALOG,
  type CatalogSeedMovie,
} from "@/lib/catalog-data";
import { verifyMovieSource } from "@/lib/verification";

function hashPassword(password: string): string {
  return Buffer.from(password + "_hashed_cinemax").toString("base64");
}

export type CatalogAuditReport = {
  inspectedMovies: number;
  duplicatesRemoved: number;
  brokenDemoRemoved: number;
  preservedWatchlistUnavailable: number;
  brokenSlidesRemoved: number;
  verifiedPlayableCount: number;
  officialExternalCount: number;
  upcomingCount: number;
  temporarilyUnavailableCount: number;
  verificationFailedCount: number;
  totalCatalogCount: number;
  categoriesCount: number;
  activeSlidesCount: number;
  auditedAt: string;
};

const DISALLOWED_CATEGORY_SLUGS = ["sports", "live-tv", "tv-channels", "broadcasting", "gaming", "games"];

function movieKey(title: string, year: number): string {
  return `${title.trim().toLowerCase()}::${year}`;
}

export async function auditAndSyncCatalog(options: { baseUrl?: string } = {}): Promise<CatalogAuditReport> {
  const db = getDb();
  const auditedAt = new Date().toISOString();

  // 1. Ensure default admin account exists
  const adminEmail = process.env.ADMIN_EMAIL || "admin@cinemax.com";
  const adminPass = process.env.ADMIN_PASSWORD || "Admin@123";
  const existingAdmins = await db.select().from(admins).where(eq(admins.email, adminEmail));
  if (existingAdmins.length === 0) {
    await db.insert(admins).values({
      email: adminEmail,
      passwordHash: hashPassword(adminPass),
    });
  }

  // 2. Inspect existing watchlist and slides to protect foreign-key relationships
  const existingWatchlist = await db.select().from(watchlist);
  const watchlistedMovieIds = new Set<number>(
    existingWatchlist.map((w) => w.movieId).filter((id): id is number => typeof id === "number" && id > 0),
  );
  const existingSlides = (await db.select().from(slides)).map(normalizeSlide);

  // 3. Inspect all existing movies
  const existingRows = (await db.select().from(movies)).map(normalizeMovie);
  const inspectedMovies = existingRows.length;

  let duplicatesRemoved = 0;
  let brokenDemoRemoved = 0;
  let preservedWatchlistUnavailable = 0;
  let brokenSlidesRemoved = 0;

  // 3a. Deduplicate exact title+year duplicates safely
  const byKey = new Map<string, MovieRow[]>();
  for (const row of existingRows) {
    const key = movieKey(row.title, row.year);
    const group = byKey.get(key) ?? [];
    group.push(row);
    byKey.set(key, group);
  }

  const survivingRows: MovieRow[] = [];
  for (const [, group] of byKey.entries()) {
    // Prefer the row with a non-empty videoUrl and lowest ID
    group.sort((a, b) => {
      const aHasVideo = a.videoUrl.trim() ? 0 : 1;
      const bHasVideo = b.videoUrl.trim() ? 0 : 1;
      if (aHasVideo !== bHasVideo) return aHasVideo - bHasVideo;
      return a.id - b.id;
    });
    const primary = group[0];
    survivingRows.push(primary);

    for (let i = 1; i < group.length; i++) {
      const dup = group[i];
      // Reassign watchlist references from dup.id -> primary.id
      if (watchlistedMovieIds.has(dup.id)) {
        await db.update(watchlist).set({ movieId: primary.id }).where(eq(watchlist.movieId, dup.id));
        watchlistedMovieIds.delete(dup.id);
        watchlistedMovieIds.add(primary.id);
      }
      // Reassign slide references from dup.id -> primary.id
      await db.update(slides).set({ movieId: primary.id }).where(eq(slides.movieId, dup.id));
      await db.delete(movies).where(eq(movies.id, dup.id));
      duplicatesRemoved += 1;
    }
  }

  // 3b. Build map of curated target catalog by title::year
  const allCuratedSeeds: readonly CatalogSeedMovie[] = [
    ...VERIFIED_PLAYABLE_CATALOG,
    ...OFFICIAL_EXTERNAL_CATALOG,
    ...UPCOMING_MOVIES_CATALOG,
  ];
  const curatedMap = new Map<string, CatalogSeedMovie>();
  for (const seed of allCuratedSeeds) {
    curatedMap.set(movieKey(seed.title, seed.year), seed);
  }

  // 3c. Audit surviving rows that are not part of the curated catalog
  for (const row of survivingRows) {
    const key = movieKey(row.title, row.year);
    if (curatedMap.has(key)) continue;

    // Skip active automated test fixture rows created during E2E test runs
    if (row.title.startsWith("Prism playback verification") || row.videoUrl.startsWith("/__e2e__/")) {
      continue;
    }

    // Check if this is an unverified legacy demo record (empty videoUrl, no licenseInfo, year <= 2025)
    const isLegacyUnplayableDemo =
      (!row.videoUrl.trim() && !row.licenseInfo.trim() && row.year <= 2025) ||
      row.videoUrl.includes("example.invalid") ||
      row.videoUrl.includes("example.com");

    if (isLegacyUnplayableDemo) {
      if (watchlistedMovieIds.has(row.id)) {
        // Preserve user watchlist integrity by marking temporarily_unavailable and removing from featured
        await db
          .update(movies)
          .set({
            catalogStatus: "temporarily_unavailable",
            featured: false,
            verificationResult: JSON.stringify({
              verified: false,
              catalogStatus: "temporarily_unavailable",
              reason: "Legacy unverified entry without playable stream; preserved for user watchlist integrity",
              checkedAt: auditedAt,
            }),
            lastVerifiedAt: new Date(auditedAt),
          })
          .where(eq(movies.id, row.id));
        preservedWatchlistUnavailable += 1;
      } else {
        // Remove slides pointing to this unplayable demo record
        const matchingSlides = existingSlides.filter((s) => s.movieId === row.id);
        for (const s of matchingSlides) {
          await db.delete(slides).where(eq(slides.id, s.id));
          brokenSlidesRemoved += 1;
        }
        await db.delete(movies).where(eq(movies.id, row.id));
        brokenDemoRemoved += 1;
      }
      continue;
    }

    // For any other custom admin-added row, run real source verification
    const report = await verifyMovieSource(row, options);
    await db
      .update(movies)
      .set({
        catalogStatus: report.catalogStatus,
        sourceType: report.sourceType,
        verificationResult: JSON.stringify(report),
        lastVerifiedAt: new Date(report.checkedAt),
        ...(report.catalogStatus !== "verified_playable" && row.featured ? { featured: false } : {}),
      })
      .where(eq(movies.id, row.id));
  }

  // 4. Clean disallowed categories and idempotently upsert all valid categories
  await db.delete(categories).where(inArray(categories.slug, [...DISALLOWED_CATEGORY_SLUGS]));
  const currentCategories = await db.select().from(categories);
  const categoryBySlug = new Map(currentCategories.map((c) => [c.slug, c]));

  for (const cat of CATALOG_CATEGORIES) {
    const existing = categoryBySlug.get(cat.slug);
    if (!existing) {
      await db.insert(categories).values({ name: cat.name, slug: cat.slug });
    } else if (existing.name !== cat.name) {
      await db.update(categories).set({ name: cat.name }).where(eq(categories.id, existing.id));
    }
  }

  // 5. Idempotently upsert & verify all curated catalog entries
  const refreshedRows = (await db.select().from(movies)).map(normalizeMovie);
  const existingByKey = new Map<string, MovieRow>();
  for (const row of refreshedRows) {
    existingByKey.set(movieKey(row.title, row.year), row);
  }

  const slugToMovieId = new Map<string, number>();

  for (const seed of allCuratedSeeds) {
    const report = await verifyMovieSource(seed, options);
    const key = movieKey(seed.title, seed.year);
    const existing = existingByKey.get(key);

    const payload = {
      title: seed.title,
      description: seed.description,
      year: seed.year,
      rating: seed.rating,
      ratingSource: seed.ratingSource,
      duration: seed.duration,
      genre: seed.genre,
      language: seed.language,
      type: seed.type,
      director: seed.director,
      cast: seed.cast,
      posterUrl: seed.posterUrl,
      backdropUrl: seed.backdropUrl,
      videoUrl: seed.videoUrl,
      subtitleUrl: seed.subtitleUrl,
      subtitleLanguage: seed.subtitleLanguage,
      rightsConfirmed: seed.rightsConfirmed,
      catalogStatus: report.catalogStatus,
      sourceType: report.sourceType,
      licenseInfo: seed.licenseInfo,
      sourceAttribution: seed.sourceAttribution,
      releaseDate: seed.releaseDate,
      trailerUrl: seed.trailerUrl,
      verificationResult: JSON.stringify(report),
      lastVerifiedAt: new Date(report.checkedAt),
      category: seed.category,
      featured: report.catalogStatus === "verified_playable" ? seed.featured : false,
    };

    if (existing) {
      await db.update(movies).set(payload).where(eq(movies.id, existing.id));
      slugToMovieId.set(seed.slug, existing.id);
    } else {
      const [inserted] = await db.insert(movies).values(payload).returning();
      const normalized = normalizeMovie(inserted as Record<string, unknown>);
      slugToMovieId.set(seed.slug, normalized.id);
    }
  }

  // 6. Audit & reconcile hero slides so every active slide points to a verified playable movie
  const allMoviesNow = (await db.select().from(movies)).map(normalizeMovie);
  const playableById = new Map<number, MovieRow>(
    allMoviesNow.filter((m) => m.catalogStatus === "verified_playable").map((m) => [m.id, m]),
  );

  const currentSlides = (await db.select().from(slides)).map(normalizeSlide);
  for (const slide of currentSlides) {
    if (!slide.movieId || !playableById.has(slide.movieId)) {
      await db.delete(slides).where(eq(slides.id, slide.id));
      brokenSlidesRemoved += 1;
    }
  }

  const remainingSlides = (await db.select().from(slides)).map(normalizeSlide);
  const slideByTitle = new Map(remainingSlides.map((s) => [s.title.toLowerCase(), s]));

  for (const seedSlide of HERO_SLIDE_SEEDS) {
    const movieId = slugToMovieId.get(seedSlide.movieSlug);
    if (!movieId || !playableById.has(movieId)) continue;
    const existingSlide = slideByTitle.get(seedSlide.title.toLowerCase());
    if (existingSlide) {
      await db
        .update(slides)
        .set({
          title: seedSlide.title,
          subtitle: seedSlide.subtitle,
          imageUrl: seedSlide.imageUrl,
          movieId,
          sortOrder: seedSlide.sortOrder,
          active: seedSlide.active,
        })
        .where(eq(slides.id, existingSlide.id));
    } else {
      await db.insert(slides).values({
        title: seedSlide.title,
        subtitle: seedSlide.subtitle,
        imageUrl: seedSlide.imageUrl,
        movieId,
        sortOrder: seedSlide.sortOrder,
        active: seedSlide.active,
      });
    }
  }

  // 7. Compute final verified counts
  const finalMovies = (await db.select().from(movies)).map(normalizeMovie);
  const finalCategories = await db.select().from(categories);
  const finalSlides = (await db.select().from(slides)).map(normalizeSlide).filter((s) => s.active);

  return {
    inspectedMovies,
    duplicatesRemoved,
    brokenDemoRemoved,
    preservedWatchlistUnavailable,
    brokenSlidesRemoved,
    verifiedPlayableCount: finalMovies.filter((m) => m.catalogStatus === "verified_playable").length,
    officialExternalCount: finalMovies.filter((m) => m.catalogStatus === "official_external_playback").length,
    upcomingCount: finalMovies.filter((m) => m.catalogStatus === "upcoming").length,
    temporarilyUnavailableCount: finalMovies.filter((m) => m.catalogStatus === "temporarily_unavailable").length,
    verificationFailedCount: finalMovies.filter((m) => m.catalogStatus === "verification_failed").length,
    totalCatalogCount: finalMovies.length,
    categoriesCount: finalCategories.length,
    activeSlidesCount: finalSlides.length,
    auditedAt,
  };
}
