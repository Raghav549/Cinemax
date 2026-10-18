import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { albumTracks, albums, channels, tracks } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { getSessionUser } from "@/lib/miley-auth";
import { authenticatedUser, asString, fail, isSafeUser, parseVisibility, parsePositiveId, readBody } from "@/lib/miley-api";
import { ownedImageUrl } from "@/lib/miley-images";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parsePositiveId((await params).id);
  if (!id) return fail("Album not found.", 404);
  try {
    const viewer = await getSessionUser(request).catch(() => null);
    const result = await withDb((db) => db.select({ album: albums, channelVisibility: channels.visibility, channelName: channels.name, channelHandle: channels.handle })
      .from(albums).innerJoin(channels, eq(albums.channelId, channels.id)).where(eq(albums.id, id)).limit(1));
    const item = result[0];
    if (!item || (item.album.visibility !== "public" && viewer?.id !== item.album.ownerId) || (item.channelVisibility !== "public" && viewer?.id !== item.album.ownerId)) return fail("Album not found.", 404);
    const ownerView = viewer?.id === item.album.ownerId;
    const songs = await withDb((db) => db.select({ track: tracks, membership: albumTracks })
      .from(albumTracks).innerJoin(tracks, eq(albumTracks.trackId, tracks.id)).where(and(eq(albumTracks.albumId, id), ownerView ? undefined : and(eq(tracks.visibility, "public"), eq(tracks.rightsConfirmed, true)))).orderBy(albumTracks.position, desc(albumTracks.addedAt)).limit(500));
    return NextResponse.json({ album: { ...item.album, channelName: item.channelName, channelHandle: item.channelHandle }, tracks: songs.map(({ track, membership }) => ({ ...track, objectKey: undefined, sha256: undefined, position: membership.position })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Album could not be loaded.", 503); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const id = parsePositiveId((await params).id);
  if (!id) return fail("Album not found.", 404);
  const body = await readBody(request);
  const patch: Partial<typeof albums.$inferInsert> = { updatedAt: new Date() };
  if (typeof body?.title === "string") { const title = asString(body.title, 200); if (!title) return fail("Album title cannot be empty."); patch.title = title; }
  if (typeof body?.description === "string") patch.description = asString(body.description, 1000);

  if (typeof body?.genre === "string") patch.genre = asString(body.genre, 80);
  if (typeof body?.language === "string") patch.language = asString(body.language, 80);
  if (body?.visibility !== undefined) { const visibility = parseVisibility(body.visibility); if (!visibility) return fail("Visibility must be public or private."); patch.visibility = visibility; }
  if (typeof body?.releaseDate === "string") { if (body.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.releaseDate)) return fail("Enter a valid release date."); patch.releaseDate = body.releaseDate || null; }
  try {
    if (typeof body?.artworkUrl === "string") { const artworkUrl = await ownedImageUrl(body.artworkUrl, user.id); if (artworkUrl === null) return fail("Album artwork must be your own MiLey image or a secure HTTPS link."); patch.artworkUrl = artworkUrl; }
    const rows = await withDb((db) => db.update(albums).set(patch).where(and(eq(albums.id, id), eq(albums.ownerId, user.id))).returning());
    if (!rows.length) return fail("Album not found.", 404);
    return NextResponse.json(rows[0]);
  } catch { return fail("Album could not be saved.", 503); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const id = parsePositiveId((await params).id);
  if (!id) return fail("Album not found.", 404);
  try {
    const deleted = await withDb((db) => db.delete(albums).where(and(eq(albums.id, id), eq(albums.ownerId, user.id))).returning({ id: albums.id }));
    if (!deleted.length) return fail("Album not found.", 404);
    return NextResponse.json({ deleted: true, id });
  } catch { return fail("Album could not be deleted.", 503); }
}
