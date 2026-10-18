import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channels, history, tracks } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser, parsePositiveId, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  try {
    if (!user.historyEnabled) return NextResponse.json({ items: [], disabled: true });
    const rows = await withDb((db) => db.select({ item: history, track: tracks, channelName: channels.name, channelHandle: channels.handle })
      .from(history).innerJoin(tracks, eq(history.trackId, tracks.id)).innerJoin(channels, eq(tracks.channelId, channels.id))
      .where(eq(history.userId, user.id)).orderBy(desc(history.playedAt)).limit(100));
    const seen = new Set<number>();
    const items = rows.filter((row) => !seen.has(row.track.id) && (seen.add(row.track.id), true))
      .map(({ item, track, channelName, channelHandle }) => ({ ...track, channelName, channelHandle, positionSeconds: item.positionSeconds, playedAt: item.playedAt?.toISOString() ?? null, objectKey: undefined, sha256: undefined }));
    return NextResponse.json({ items, disabled: false }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Listening history could not be loaded.", 503); }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  if (!user.historyEnabled) return NextResponse.json({ saved: false, disabled: true });
  const body = await readBody(request);
  const trackId = parsePositiveId(body?.trackId);
  const positionSeconds = Number(body?.positionSeconds);
  if (!trackId || !Number.isFinite(positionSeconds) || positionSeconds < 0 || positionSeconds > 24 * 60 * 60) return fail("Playback progress was invalid.");
  try {
    const allowed = await withDb((db) => db.select({ ownerId: tracks.ownerId, visibility: tracks.visibility, rightsConfirmed: tracks.rightsConfirmed, channelVisibility: channels.visibility })
      .from(tracks).innerJoin(channels, eq(tracks.channelId, channels.id)).where(eq(tracks.id, trackId)).limit(1));
    const track = allowed[0];
    if (!track || (track.ownerId !== user.id && (track.visibility !== "public" || !track.rightsConfirmed || track.channelVisibility !== "public"))) return fail("Track not found.", 404);
    const existing = await withDb((db) => db.select({ id: history.id }).from(history).where(and(eq(history.userId, user.id), eq(history.trackId, trackId))).orderBy(desc(history.playedAt)).limit(1));
    if (existing.length) {
      await withDb((db) => db.update(history).set({ positionSeconds: Math.floor(positionSeconds), playedAt: new Date() }).where(eq(history.id, existing[0].id)));
    } else {
      await withDb((db) => db.insert(history).values({ userId: user.id, trackId, positionSeconds: Math.floor(positionSeconds) }));
    }
    return NextResponse.json({ saved: true });
  } catch { return fail("Playback progress could not be saved.", 503); }
}
