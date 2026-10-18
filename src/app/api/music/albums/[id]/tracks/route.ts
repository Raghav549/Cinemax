import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { albumTracks, albums, channels, tracks } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser, parsePositiveId, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

async function canEdit(albumId: number, ownerId: number) {
  const rows = await withDb((db) => db.select({ id: albums.id }).from(albums).where(and(eq(albums.id, albumId), eq(albums.ownerId, ownerId))).limit(1));
  return rows.length > 0;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const albumId = parsePositiveId((await params).id);
  if (!albumId) return fail("Album not found.", 404);
  const body = await readBody(request);
  const ids = Array.isArray(body?.trackIds) ? body.trackIds.map(parsePositiveId).filter((id): id is number => id !== null).slice(0, 100) : [parsePositiveId(body?.trackId)].filter((id): id is number => id !== null);
  if (!ids.length) return fail("Choose tracks to add.");
  try {
    if (!await canEdit(albumId, user.id)) return fail("Album not found.", 404);
    const uniqueIds = [...new Set(ids)];
    const accessible = await withDb((db) => db.select({ id: tracks.id }).from(tracks).innerJoin(channels, eq(tracks.channelId, channels.id))
      .where(and(inArray(tracks.id, uniqueIds), or(eq(tracks.ownerId, user.id), and(eq(tracks.visibility, "public"), eq(tracks.rightsConfirmed, true), eq(channels.visibility, "public"))))));
    if (accessible.length !== uniqueIds.length) return fail("One or more tracks cannot be added to this album.", 403);
    await withDb(async (db) => {
      const last = await db.select({ position: albumTracks.position }).from(albumTracks).where(eq(albumTracks.albumId, albumId)).orderBy(desc(albumTracks.position)).limit(1);
      let position = (last[0]?.position ?? -1) + 1;
      for (const trackId of uniqueIds) { await db.insert(albumTracks).values({ albumId, trackId, position }).onConflictDoNothing(); position += 1; }
      await db.update(albums).set({ updatedAt: new Date() }).where(eq(albums.id, albumId));
    });
    return NextResponse.json({ added: uniqueIds.length });
  } catch { return fail("Tracks could not be added to the album.", 503); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const albumId = parsePositiveId((await params).id);
  const body = await readBody(request);
  const order = Array.isArray(body?.trackIds) ? body.trackIds.map(parsePositiveId).filter((id): id is number => id !== null).slice(0, 500) : [];
  if (!albumId || !order.length || new Set(order).size !== order.length) return fail("Provide a unique ordered list of track ids.");
  try {
    if (!await canEdit(albumId, user.id)) return fail("Album not found.", 404);
    await withDb(async (db) => db.transaction(async (tx) => {
      const present = await tx.select({ trackId: albumTracks.trackId }).from(albumTracks).where(eq(albumTracks.albumId, albumId));
      if (present.length !== order.length || order.some((id) => !present.some((row) => row.trackId === id))) throw new Error("Album track list changed.");
      await tx.update(albumTracks).set({ position: sql`${albumTracks.position} + 1000000` }).where(eq(albumTracks.albumId, albumId));
      for (let position = 0; position < order.length; position += 1) await tx.update(albumTracks).set({ position }).where(and(eq(albumTracks.albumId, albumId), eq(albumTracks.trackId, order[position])));
      await tx.update(albums).set({ updatedAt: new Date() }).where(eq(albums.id, albumId));
    }));
    return NextResponse.json({ saved: true });
  } catch { return fail("The album track order could not be saved.", 409); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const albumId = parsePositiveId((await params).id);
  const body = await readBody(request);
  const trackId = parsePositiveId(body?.trackId);
  if (!albumId || !trackId) return fail("Choose a track to remove.");
  try {
    if (!await canEdit(albumId, user.id)) return fail("Album not found.", 404);
    await withDb((db) => db.delete(albumTracks).where(and(eq(albumTracks.albumId, albumId), eq(albumTracks.trackId, trackId))));
    return NextResponse.json({ removed: true });
  } catch { return fail("The track could not be removed from the album.", 503); }
}
