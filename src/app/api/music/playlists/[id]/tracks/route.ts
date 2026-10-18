import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channels, playlistTracks, playlists, tracks } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser, parsePositiveId, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

async function ownedPlaylist(id: number, ownerId: number) {
  const rows = await withDb((db) => db.select({ id: playlists.id }).from(playlists).where(and(eq(playlists.id, id), eq(playlists.ownerId, ownerId))).limit(1));
  return rows.length > 0;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const playlistId = parsePositiveId((await params).id);
  if (!playlistId) return fail("Playlist not found.", 404);
  const body = await readBody(request);
  const trackIds = Array.isArray(body?.trackIds) ? body.trackIds.map(parsePositiveId).filter((id): id is number => id !== null).slice(0, 100) : [parsePositiveId(body?.trackId)].filter((id): id is number => id !== null);
  if (!trackIds.length) return fail("Choose at least one track.");
  try {
    if (!await ownedPlaylist(playlistId, user.id)) return fail("Playlist not found.", 404);
    const uniqueIds = [...new Set(trackIds)];
    const allowed = await withDb((db) => db.select({ id: tracks.id }).from(tracks).innerJoin(channels, eq(tracks.channelId, channels.id))
      .where(and(sql`${tracks.id} = ANY(${uniqueIds})`, sql`(${tracks.ownerId} = ${user.id} OR (${tracks.visibility} = 'public' AND ${tracks.rightsConfirmed} = true AND ${channels.visibility} = 'public'))`)));
    if (allowed.length !== uniqueIds.length) return fail("One or more tracks are unavailable to this account.", 403);
    await withDb(async (db) => {
      const last = await db.select({ position: playlistTracks.position }).from(playlistTracks).where(eq(playlistTracks.playlistId, playlistId)).orderBy(desc(playlistTracks.position)).limit(1);
      let position = (last[0]?.position ?? -1) + 1;
      for (const trackId of uniqueIds) {
        await db.insert(playlistTracks).values({ playlistId, trackId, position }).onConflictDoNothing();
        position += 1;
      }
      await db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, playlistId));
    });
    return NextResponse.json({ added: uniqueIds.length });
  } catch { return fail("Tracks could not be added to the playlist.", 503); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const playlistId = parsePositiveId((await params).id);
  if (!playlistId) return fail("Playlist not found.", 404);
  const body = await readBody(request);
  const order = Array.isArray(body?.trackIds) ? body.trackIds.map(parsePositiveId).filter((id): id is number => id !== null).slice(0, 500) : [];
  if (!order.length || new Set(order).size !== order.length) return fail("Provide a unique ordered list of track ids.");
  try {
    if (!await ownedPlaylist(playlistId, user.id)) return fail("Playlist not found.", 404);
    await withDb(async (db) => db.transaction(async (tx) => {
      const present = await tx.select({ trackId: playlistTracks.trackId }).from(playlistTracks).where(eq(playlistTracks.playlistId, playlistId));
      if (present.length !== order.length || order.some((id) => !present.some((row) => row.trackId === id))) throw new Error("Track list changed. Refresh and try again.");
      await tx.update(playlistTracks).set({ position: sql`${playlistTracks.position} + 1000000` }).where(eq(playlistTracks.playlistId, playlistId));
      for (let position = 0; position < order.length; position += 1) {
        await tx.update(playlistTracks).set({ position }).where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, order[position])));
      }
      await tx.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, playlistId));
    }));
    return NextResponse.json({ saved: true });
  } catch { return fail("The playlist order could not be saved.", 409); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const playlistId = parsePositiveId((await params).id);
  if (!playlistId) return fail("Playlist not found.", 404);
  const body = await readBody(request);
  const trackId = parsePositiveId(body?.trackId);
  if (!trackId) return fail("Choose a track to remove.");
  try {
    if (!await ownedPlaylist(playlistId, user.id)) return fail("Playlist not found.", 404);
    await withDb((db) => db.delete(playlistTracks).where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId))));
    await withDb((db) => db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, playlistId)));
    return NextResponse.json({ removed: true });
  } catch { return fail("The track could not be removed from the playlist.", 503); }
}
