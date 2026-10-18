import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { playlists } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, asString, fail, isSafeUser, parseVisibility, readBody } from "@/lib/miley-api";
import { ownedImageUrl } from "@/lib/miley-images";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  try {
    const rows = await withDb((db) => db.select().from(playlists).where(eq(playlists.ownerId, user.id)).orderBy(desc(playlists.createdAt)).limit(200));
    return NextResponse.json({ items: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Playlists could not be loaded.", 503); }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  const title = asString(body?.title, 120);
  if (title.length < 1) return fail("Give your playlist a name.");
  const visibility = body?.visibility === undefined ? "private" : parseVisibility(body.visibility);
  if (!visibility) return fail("Visibility must be public or private.");
  try {
    const artworkUrl = await ownedImageUrl(body?.artworkUrl, user.id);
    if (artworkUrl === null) return fail("Playlist artwork must be your own MiLey image or a secure HTTPS link.");
    const rows = await withDb((db) => db.insert(playlists).values({
      ownerId: user.id, title, description: asString(body?.description, 1000),
      artworkUrl, visibility,
    }).returning());
    return NextResponse.json(rows[0], { status: 201 });
  } catch { return fail("Playlist could not be created.", 503); }
}
