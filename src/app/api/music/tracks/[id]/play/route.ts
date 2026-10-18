import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channels, tracks, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { getSessionUser } from "@/lib/miley-auth";
import { fail, parsePositiveId } from "@/lib/miley-api";
import { objectStorageConfig, presignObject } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parsePositiveId((await params).id);
  if (!id) return fail("Track not found.", 404);
  try {
    const viewer = await getSessionUser(request).catch(() => null);
    const rows = await withDb((db) => db.select({
      track: tracks, channelVisibility: channels.visibility, ownerDeletedAt: users.deletedAt,
    }).from(tracks).innerJoin(channels, eq(tracks.channelId, channels.id)).innerJoin(users, eq(tracks.ownerId, users.id))
      .where(and(eq(tracks.id, id), isNull(users.deletedAt))).limit(1));
    const row = rows[0];
    if (!row) return fail("Track not found.", 404);
    const ownerAccess = viewer?.id === row.track.ownerId;
    const publicAccess = row.track.visibility === "public" && row.track.rightsConfirmed && row.channelVisibility === "public";
    if (!ownerAccess && !publicAccess) return fail("This track is private or not cleared for public playback.", 403);
    const storage = objectStorageConfig();
    if (!storage) return fail("Music storage is not configured on this server.", 503);
    const playbackUrl = presignObject(storage, "GET", row.track.objectKey, 3600);
    return NextResponse.json({
      playbackUrl,
      expiresInSeconds: 3600,
      track: { id: row.track.id, title: row.track.title, artist: row.track.artist, artworkUrl: row.track.artworkUrl, durationSeconds: row.track.durationSeconds },
    }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("[music:play] authorization failed:", error instanceof Error ? error.message : "unknown error");
    return fail("Playback could not be prepared. Try again in a moment.", 503);
  }
}
