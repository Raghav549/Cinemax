import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { albums, albumTracks, channels, favorites, history, playlistTracks, playlists, tracks, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  try {
    const result = await withDb(async (db) => {
      const [trackRows, playlistRows, albumRows, favoriteRows, historyRows, channelRows] = await Promise.all([
        db.select({ track: tracks, channelName: channels.name, channelHandle: channels.handle }).from(tracks).innerJoin(channels, eq(tracks.channelId, channels.id)).where(eq(tracks.ownerId, user.id)).orderBy(desc(tracks.createdAt)).limit(500),
        db.select().from(playlists).where(eq(playlists.ownerId, user.id)).orderBy(desc(playlists.createdAt)).limit(200),
        db.select().from(albums).where(eq(albums.ownerId, user.id)).orderBy(desc(albums.createdAt)).limit(200),
        db.select({ track: tracks, channelName: channels.name, channelHandle: channels.handle }).from(favorites).innerJoin(tracks, eq(favorites.trackId, tracks.id)).innerJoin(channels, eq(tracks.channelId, channels.id)).where(eq(favorites.userId, user.id)).orderBy(desc(favorites.createdAt)).limit(200),
        user.historyEnabled ? db.select({ item: history, track: tracks, channelName: channels.name, channelHandle: channels.handle }).from(history).innerJoin(tracks, eq(history.trackId, tracks.id)).innerJoin(channels, eq(tracks.channelId, channels.id)).where(eq(history.userId, user.id)).orderBy(desc(history.playedAt)).limit(100) : Promise.resolve([]),
        db.select({ channel: channels, ownerUsername: users.username }).from(channels).innerJoin(users, eq(channels.ownerId, users.id)).where(eq(channels.ownerId, user.id)).limit(1),
      ]);
      return { trackRows, playlistRows, albumRows, favoriteRows, historyRows, channelRows };
    });
    const stripPrivate = (track: typeof tracks.$inferSelect) => ({ ...track, objectKey: undefined, sha256: undefined });
    const recentSeen = new Set<number>();
    const recentTracks = result.historyRows.filter((row) => !recentSeen.has(row.track.id) && (recentSeen.add(row.track.id), true))
      .map((row) => ({ ...stripPrivate(row.track), channelName: row.channelName, channelHandle: row.channelHandle, positionSeconds: row.item.positionSeconds, playedAt: row.item.playedAt.toISOString() }));
    return NextResponse.json({
      tracks: result.trackRows.map(({ track, channelName, channelHandle }) => ({ ...stripPrivate(track), channelName, channelHandle })),
      playlists: result.playlistRows,
      albums: result.albumRows,
      favorites: result.favoriteRows.map(({ track, channelName, channelHandle }) => ({ ...stripPrivate(track), channelName, channelHandle })),
      recentTracks,
      channel: result.channelRows[0]?.channel || null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[music:library] load failed:", error instanceof Error ? error.message : "unknown error");
    return fail("Your library could not be loaded. Check the database configuration.", 503);
  }
}
