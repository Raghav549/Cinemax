import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { albums, channels, playlists, tracks, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { fail } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  if (query.length < 2) return NextResponse.json({ tracks: [], albums: [], channels: [], playlists: [] });
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  try {
    const result = await withDb(async (db) => Promise.all([
      db.select({ track: tracks, channelName: channels.name, channelHandle: channels.handle, ownerUsername: users.username })
        .from(tracks).innerJoin(channels, eq(tracks.channelId, channels.id)).innerJoin(users, eq(tracks.ownerId, users.id))
        .where(and(eq(tracks.visibility, "public"), eq(tracks.rightsConfirmed, true), eq(channels.visibility, "public"), sql`${users.deletedAt} IS NULL`, or(ilike(tracks.title, pattern), ilike(tracks.artist, pattern), ilike(tracks.albumTitle, pattern), ilike(channels.name, pattern))))
        .orderBy(desc(tracks.createdAt)).limit(20),
      db.select({ album: albums, channelName: channels.name, channelHandle: channels.handle })
        .from(albums).innerJoin(channels, eq(albums.channelId, channels.id))
        .where(and(eq(albums.visibility, "public"), eq(channels.visibility, "public"), or(ilike(albums.title, pattern), ilike(channels.name, pattern)))).orderBy(desc(albums.createdAt)).limit(12),
      db.select({ channel: channels, username: users.username })
        .from(channels).innerJoin(users, eq(channels.ownerId, users.id))
        .where(and(eq(channels.visibility, "public"), sql`${users.deletedAt} IS NULL`, or(ilike(channels.name, pattern), ilike(channels.handle, pattern), ilike(users.displayName, pattern)))).orderBy(channels.name).limit(12),
      db.select({ playlist: playlists, username: users.username })
        .from(playlists).innerJoin(users, eq(playlists.ownerId, users.id))
        .where(and(eq(playlists.visibility, "public"), sql`${users.deletedAt} IS NULL`, or(ilike(playlists.title, pattern), ilike(playlists.description, pattern)))).orderBy(desc(playlists.createdAt)).limit(12),
    ]));
    return NextResponse.json({
      tracks: result[0].map(({ track, channelName, channelHandle, ownerUsername }) => ({ ...track, objectKey: undefined, sha256: undefined, channelName, channelHandle, ownerUsername })),
      albums: result[1].map(({ album, channelName, channelHandle }) => ({ ...album, channelName, channelHandle })),
      channels: result[2].map(({ channel, username }) => ({ ...channel, ownerUsername: username })),
      playlists: result[3].map(({ playlist, username }) => ({ ...playlist, ownerUsername: username })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Search is temporarily unavailable.", 503); }
}
