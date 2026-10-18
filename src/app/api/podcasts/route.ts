import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { podcastEpisodes, podcasts } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { fail } from "@/lib/miley-api";

export const dynamic = "force-dynamic";
export async function GET(_request: NextRequest) {
  try {
    const shows = await withDb((db) => db.select({ podcast: podcasts, episodeCount: sql<number>`count(${podcastEpisodes.id})` })
      .from(podcasts).leftJoin(podcastEpisodes, eq(podcastEpisodes.podcastId, podcasts.id))
      .where(and(eq(podcasts.distributionAuthorized, true), isNotNull(podcasts.rightsReviewedAt))).groupBy(podcasts.id).orderBy(desc(podcasts.importedAt)).limit(50));
    if (!shows.length) return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
    const ids = shows.map((item) => item.podcast.id);
    const recent = await withDb((db) => db.select({ episode: podcastEpisodes }).from(podcastEpisodes).where(inArray(podcastEpisodes.podcastId, ids)).orderBy(desc(podcastEpisodes.publishedAt)).limit(100));
    const latest = new Map<number, typeof recent[number]["episode"]>();
    for (const row of recent) if (!latest.has(row.episode.podcastId)) latest.set(row.episode.podcastId, row.episode);
    return NextResponse.json({ items: shows.map(({ podcast, episodeCount }) => ({
      id: podcast.id, title: podcast.title, description: podcast.description, artworkUrl: podcast.artworkUrl, language: podcast.language,
      rightsReviewedAt: podcast.rightsReviewedAt?.toISOString() ?? null, episodeCount: Number(episodeCount),
      latestEpisode: latest.get(podcast.id) ? { id: latest.get(podcast.id)!.id, title: latest.get(podcast.id)!.title, publishedAt: latest.get(podcast.id)!.publishedAt?.toISOString() ?? null, durationSeconds: latest.get(podcast.id)!.durationSeconds } : null,
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Authorized podcasts could not be loaded.", 503); }
}
