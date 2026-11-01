import type { Metadata } from "next";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { movies } from "@/db/schema";
import { withDb } from "@/db/with-db";
import { publicMovie } from "@/lib/movies";
import { shareDescription, shareSubject } from "@/lib/share";
import { parseId } from "@/lib/api";

/**
 * Server-side half of sharing: read one title and turn it into the metadata a
 * social crawler needs.
 *
 * The page itself is unchanged — this only fills in og:/twitter: tags, so a
 * pasted CINEMAX link shows the title's own poster, name, year and genre rather
 * than a bare URL. When the database is unavailable the metadata degrades to the
 * site defaults instead of failing the page.
 */
export interface SharedTitle {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  type: string | null;
  description: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  trailerUrl: string | null;
}

export const loadTitleForShare = cache(async function loadTitleForShare(
  rawId: string | number
): Promise<SharedTitle | null> {
  const id = typeof rawId === "number" ? rawId : parseId(rawId);
  if (id === null) return null;
  try {
    const rows = await withDb((db) => db.select().from(movies).where(eq(movies.id, id)));
    if (!rows.length) return null;
    const movie = publicMovie(rows[0] as Record<string, unknown>);
    return {
      id: movie.id,
      title: movie.title,
      year: movie.year || null,
      genre: blankToNull(movie.genre),
      type: blankToNull(movie.type),
      description: blankToNull(movie.description),
      posterUrl: blankToNull(movie.posterUrl),
      backdropUrl: blankToNull(movie.backdropUrl),
      trailerUrl: blankToNull(movie.trailerUrl),
    };
  } catch {
    return null;
  }
});

/** An empty database column must never be rendered as a value. */
function blankToNull(value: string | null | undefined): string | null {
  const clean = (value ?? "").trim();
  return clean ? clean : null;
}

/** Path (not URL) of the generated card, resolved against `metadataBase`. */
export function shareCardPath(id: number): string {
  return `/api/share/card/${id}`;
}

/** Path of the share landing page. */
export function sharePagePath(id: number): string {
  return `/share/${id}`;
}

/**
 * Open Graph + Twitter metadata for one title.
 *
 * Relative paths are used deliberately: Next resolves them against
 * `metadataBase`, so the tags are correct on the production host and on a
 * preview deployment alike.
 */
export function titleMetadata(
  title: SharedTitle | null,
  fallback: { title: string },
  landingPath: string
): Metadata {
  if (!title) {
    return { title: fallback.title, alternates: { canonical: landingPath } };
  }
  const description = shareDescription(title);
  const image = shareCardPath(title.id);
  return {
    title: title.title,
    description,
    alternates: { canonical: landingPath },
    openGraph: {
      type: "video.other",
      title: shareSubject(title),
      description,
      url: landingPath,
      images: [{ url: image, width: 1200, height: 630, alt: `${title.title} on CINEMAX` }],
    },
    twitter: {
      card: "summary_large_image",
      title: shareSubject(title),
      description,
      images: [image],
    },
    other: { "cinemax:title-id": String(title.id) },
  };
}
