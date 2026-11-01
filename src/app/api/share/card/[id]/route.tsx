import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { movies } from "@/db/schema";
import { withDb } from "@/db/with-db";
import { publicMovie } from "@/lib/movies";
import { parseId } from "@/lib/api";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  ShareCard,
  loadCardAssets,
  shareCardFont,
  type CardTitle,
} from "@/lib/share-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The share/Open Graph image for one title.
 *
 *   /api/share/card/<id>   → 1200x630 JPEG-friendly PNG
 *
 * Used by og:image, twitter:image, the website share sheet (the browser attaches
 * it as a real image file) and the Android shell (which downloads it into the
 * app cache and hands it to the share sheet as a content URI).
 *
 * If the title cannot be read — database unavailable, id unknown — a generic
 * CINEMAX card is rendered instead of a broken image. It never invents a title,
 * a poster, a score or a platform badge.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);

  let title: CardTitle | null = null;
  if (id !== null) {
    try {
      const rows = await withDb((db) => db.select().from(movies).where(eq(movies.id, id)));
      if (rows.length) title = publicMovie(rows[0] as Record<string, unknown>) as unknown as CardTitle;
    } catch {
      // A card is still better than a broken preview when the database is down.
      title = null;
    }
  }

  const [assets, font] = await Promise.all([loadCardAssets(title), shareCardFont()]);

  return new ImageResponse(<ShareCard title={title} assets={assets} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: font ? [{ name: "Outfit", data: font, weight: 600, style: "normal" }] : undefined,
    headers: {
      // Long-lived for crawlers and share sheets; the card is derived from the
      // title record, and a changed record produces a new URL only after a
      // re-scrape, which is the behaviour every social platform expects.
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
