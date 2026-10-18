import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channels, favorites, tracks } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser, parsePositiveId, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  try {
    const rows = await withDb((db) => db.select({ track: tracks, channelName: channels.name, channelHandle: channels.handle })
      .from(favorites).innerJoin(tracks, eq(favorites.trackId, tracks.id)).innerJoin(channels, eq(tracks.channelId, channels.id))
      .where(eq(favorites.userId, user.id)).orderBy(desc(favorites.createdAt)).limit(200));
    return NextResponse.json(rows.map(({ track, channelName, channelHandle }) => ({ ...track, channelName, channelHandle, objectKey: undefined, sha256: undefined })), { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Favorites could not be loaded.", 503); }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  const trackId = parsePositiveId(body?.trackId);
  if (!trackId) return fail("Choose a valid track.");
  const favorite = body?.favorite !== false;
  try {
    const trackRows = await withDb((db) => db.select({ ownerId: tracks.ownerId, visibility: tracks.visibility, rightsConfirmed: tracks.rightsConfirmed, channelVisibility: channels.visibility })
      .from(tracks).innerJoin(channels, eq(tracks.channelId, channels.id)).where(eq(tracks.id, trackId)).limit(1));
    const track = trackRows[0];
    if (!track || (track.ownerId !== user.id && (track.visibility !== "public" || track.channelVisibility !== "public" || !track.rightsConfirmed))) return fail("Track not found.", 404);
    if (favorite) await withDb((db) => db.insert(favorites).values({ userId: user.id, trackId }).onConflictDoNothing());
    else await withDb((db) => db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.trackId, trackId))));
    return NextResponse.json({ favorite });
  } catch { return fail("Favorite could not be updated.", 503); }
}
