import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channels, playlistTracks, playlists, tracks } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { getSessionUser } from "@/lib/miley-auth";
import { authenticatedUser, asString, fail, isSafeUser, parseVisibility, parsePositiveId, readBody } from "@/lib/miley-api";
import { ownedImageUrl } from "@/lib/miley-images";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parsePositiveId((await params).id);
  if (!id) return fail("Playlist not found.", 404);
  try {
    const viewer = await getSessionUser(request).catch(() => null);
    const found = await withDb((db) => db.select().from(playlists).where(eq(playlists.id, id)).limit(1));
    const playlist = found[0];
    if (!playlist || (playlist.visibility !== "public" && viewer?.id !== playlist.ownerId)) return fail("Playlist not found.", 404);
    const rows = await withDb((db) => db.select({ item: playlistTracks, track: tracks, channelName: channels.name, channelHandle: channels.handle, channelVisibility: channels.visibility })
      .from(playlistTracks).innerJoin(tracks, eq(playlistTracks.trackId, tracks.id)).innerJoin(channels, eq(tracks.channelId, channels.id))
      .where(eq(playlistTracks.playlistId, id)).orderBy(playlistTracks.position, desc(playlistTracks.addedAt)).limit(500));
    const visible = rows.filter((row) => row.track.ownerId === viewer?.id || (row.track.visibility === "public" && row.track.rightsConfirmed && row.channelVisibility === "public"));
    return NextResponse.json({
      playlist: { ...playlist, ownerId: playlist.ownerId },
      tracks: visible.map(({ item, track, channelName, channelHandle }) => ({ ...track, objectKey: undefined, sha256: undefined, channelName, channelHandle, position: item.position })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Playlist could not be loaded.", 503); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const id = parsePositiveId((await params).id);
  if (!id) return fail("Playlist not found.", 404);
  const body = await readBody(request);
  if (!body) return fail("Playlist details were invalid.");
  const patch: Partial<typeof playlists.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.title === "string") { const value = asString(body.title, 120); if (!value) return fail("Playlist name cannot be empty."); patch.title = value; }
  if (typeof body.description === "string") patch.description = asString(body.description, 1000);
  if (body.visibility !== undefined) { const value = parseVisibility(body.visibility); if (!value) return fail("Visibility must be public or private."); patch.visibility = value; }
  try {
    if (typeof body.artworkUrl === "string") { const artworkUrl = await ownedImageUrl(body.artworkUrl, user.id); if (artworkUrl === null) return fail("Playlist artwork must be your own MiLey image or a secure HTTPS link."); patch.artworkUrl = artworkUrl; }
    const rows = await withDb((db) => db.update(playlists).set(patch).where(and(eq(playlists.id, id), eq(playlists.ownerId, user.id))).returning());
    if (!rows.length) return fail("Playlist not found.", 404);
    return NextResponse.json(rows[0]);
  } catch { return fail("Playlist could not be saved.", 503); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const id = parsePositiveId((await params).id);
  if (!id) return fail("Playlist not found.", 404);
  try {
    const rows = await withDb((db) => db.delete(playlists).where(and(eq(playlists.id, id), eq(playlists.ownerId, user.id))).returning({ id: playlists.id }));
    if (!rows.length) return fail("Playlist not found.", 404);
    return NextResponse.json({ deleted: true, id });
  } catch { return fail("Playlist could not be deleted.", 503); }
}
