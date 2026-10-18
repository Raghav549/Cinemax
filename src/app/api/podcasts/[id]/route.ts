import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { podcastEpisodes, podcasts, podcastSubscriptions } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { getSessionUser } from "@/lib/miley-auth";
import { fail, parsePositiveId } from "@/lib/miley-api";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = parsePositiveId((await context.params).id);
  if (!id) return fail("Podcast not found.", 404);
  try {
    const viewer = await getSessionUser(request).catch(() => null);
    const rows = await withDb((db) => db.select().from(podcasts).where(and(eq(podcasts.id, id), eq(podcasts.distributionAuthorized, true), isNotNull(podcasts.rightsReviewedAt))).limit(1));
    if (!rows.length) return fail("Podcast not found.", 404);
    const [episodes, subscriptions] = await withDb(async (db) => Promise.all([
      db.select().from(podcastEpisodes).where(eq(podcastEpisodes.podcastId, id)).orderBy(desc(podcastEpisodes.publishedAt)).limit(500),
      viewer ? db.select({ id: podcastSubscriptions.podcastId }).from(podcastSubscriptions).where(and(eq(podcastSubscriptions.podcastId, id), eq(podcastSubscriptions.userId, viewer.id))).limit(1) : Promise.resolve([]),
    ]));
    const safeEpisodes = episodes.map((item) => {
      let audioUrl = "";
      try { const parsed = new URL(item.audioUrl); if (parsed.protocol === "https:" && !parsed.username && !parsed.password) audioUrl = parsed.toString(); } catch { /* skip untrusted source URLs */ }
      return { id: item.id, title: item.title, description: item.description, audioUrl, artworkUrl: item.artworkUrl, durationSeconds: item.durationSeconds, publishedAt: item.publishedAt?.toISOString() ?? null };
    });
    return NextResponse.json({ podcast: { id: rows[0].id, title: rows[0].title, description: rows[0].description, artworkUrl: rows[0].artworkUrl, language: rows[0].language, rightsReviewedAt: rows[0].rightsReviewedAt?.toISOString() ?? null, subscribed: subscriptions.length > 0 }, episodes: safeEpisodes }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Podcast could not be loaded.", 503); }
}
