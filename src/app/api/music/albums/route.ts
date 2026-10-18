import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { albums, channels } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, asString, fail, isSafeUser, parseVisibility, readBody } from "@/lib/miley-api";
import { ownedImageUrl } from "@/lib/miley-images";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authenticated = await authenticatedUser(request).catch(() => null);
  const user = authenticated && isSafeUser(authenticated) ? authenticated : null;
  try {
    const rows = await withDb((db) => db.select({ album: albums, channelName: channels.name, channelHandle: channels.handle })
      .from(albums).innerJoin(channels, eq(albums.channelId, channels.id))
      .where(user ? eq(albums.ownerId, user.id) : and(eq(albums.visibility, "public"), eq(channels.visibility, "public")))
      .orderBy(desc(albums.createdAt)).limit(100));
    return NextResponse.json({ items: rows.map(({ album, channelName, channelHandle }) => ({ ...album, channelName, channelHandle })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Albums could not be loaded.", 503); }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  const title = asString(body?.title, 200);
  if (!title) return fail("Give your album a title.");
  const visibility = body?.visibility === undefined ? "private" : parseVisibility(body.visibility);
  if (!visibility) return fail("Visibility must be public or private.");
  let releaseDate: string | null = null;
  if (body?.releaseDate) {
    releaseDate = asString(body.releaseDate, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate) || Number.isNaN(Date.parse(`${releaseDate}T00:00:00Z`))) return fail("Enter a valid release date.");
  }
  try {
    const artworkUrl = await ownedImageUrl(body?.artworkUrl, user.id);
    if (artworkUrl === null) return fail("Album artwork must be your own MiLey image or a secure HTTPS link.");
    const rows = await withDb(async (db) => {
      const channel = await db.select({ id: channels.id }).from(channels).where(eq(channels.ownerId, user.id)).limit(1);
      if (!channel.length) return null;
      const result = await db.insert(albums).values({
        ownerId: user.id, channelId: channel[0].id, title,
        description: asString(body?.description, 1000), artworkUrl,
        releaseDate, genre: asString(body?.genre, 80), language: asString(body?.language, 80), visibility,
      }).returning();
      return result[0];
    });
    if (!rows) return fail("Create your channel before creating an album.", 409);
    return NextResponse.json(rows, { status: 201 });
  } catch { return fail("Album could not be created.", 503); }
}
