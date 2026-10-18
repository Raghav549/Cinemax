import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channels, tracks } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, asString, fail, isSafeUser, parseVisibility, parsePositiveId, readBody } from "@/lib/miley-api";
import { deleteObject, objectStorageConfig } from "@/lib/storage/s3";
import { ownedImageUrl } from "@/lib/miley-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const id = parsePositiveId((await params).id);
  if (!id) return fail("Track not found.", 404);
  const body = await readBody(request);
  if (!body) return fail("Track details were invalid.");
  const patch: Record<string, string | number | boolean | null> = {};
  if (typeof body.title === "string") { const value = asString(body.title, 200); if (!value) return fail("Track title cannot be empty."); patch.title = value; }
  if (typeof body.artist === "string") { const value = asString(body.artist, 160); if (!value) return fail("Artist cannot be empty."); patch.artist = value; }
  if (typeof body.albumTitle === "string") patch.albumTitle = asString(body.albumTitle, 200);
  if (typeof body.description === "string") patch.description = asString(body.description, 1000);
  if (typeof body.lyrics === "string") patch.lyrics = asString(body.lyrics, 50_000);
  if (typeof body.genre === "string") patch.genre = asString(body.genre, 80);
  if (typeof body.language === "string") patch.language = asString(body.language, 80);
  if (body.visibility !== undefined) {
    const visibility = parseVisibility(body.visibility);
    if (!visibility) return fail("Visibility must be public or private.");
    patch.visibility = visibility;
    if (visibility === "public") patch.publishedAt = new Date() as unknown as string;
  }
  try {
    if (typeof body.artworkUrl === "string") { const artworkUrl = await ownedImageUrl(body.artworkUrl, user.id); if (artworkUrl === null) return fail("Track artwork must be your own MiLey image or a secure HTTPS link."); patch.artworkUrl = artworkUrl; }
    const owned = await withDb((db) => db.select({ id: tracks.id }).from(tracks).where(and(eq(tracks.id, id), eq(tracks.ownerId, user.id))).limit(1));
    if (!owned.length) return fail("Track not found.", 404);
    const rows = await withDb((db) => db.update(tracks).set({ ...patch, updatedAt: new Date() }).where(eq(tracks.id, id)).returning({ id: tracks.id, title: tracks.title, artist: tracks.artist, visibility: tracks.visibility }));
    return NextResponse.json(rows[0], { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Track details could not be saved.", 503);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const id = parsePositiveId((await params).id);
  if (!id) return fail("Track not found.", 404);
  try {
    const owned = await withDb((db) => db.select({ id: tracks.id, objectKey: tracks.objectKey }).from(tracks).where(and(eq(tracks.id, id), eq(tracks.ownerId, user.id))).limit(1));
    if (!owned.length) return fail("Track not found.", 404);
    const storage = objectStorageConfig();
    if (storage) await deleteObject(storage, owned[0].objectKey);
    await withDb((db) => db.delete(tracks).where(eq(tracks.id, id)));
    return NextResponse.json({ deleted: true, id });
  } catch {
    return fail("The track could not be deleted. Check storage configuration and retry.", 503);
  }
}
