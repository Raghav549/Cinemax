import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { albums, channels, channelSubscriptions, playlists, tracks, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { getSessionUser } from "@/lib/miley-auth";
import { authenticatedUser, asString, fail, isSafeUser, parseVisibility, readBody } from "@/lib/miley-api";
import { ownedImageUrl } from "@/lib/miley-images";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const handle = (await params).handle.toLowerCase().replace(/^@/, "").slice(0, 32);
  const viewer = await getSessionUser(request).catch(() => null);
  try {
    const found = await withDb((db) => db.select({ channel: channels, user: users,
      subscribers: sql<number>`count(distinct ${channelSubscriptions.userId})`,
    }).from(channels).innerJoin(users, eq(channels.ownerId, users.id))
      .leftJoin(channelSubscriptions, eq(channels.id, channelSubscriptions.channelId))
      .where(and(eq(channels.handle, handle), sql`${users.deletedAt} IS NULL`)).groupBy(channels.id, users.id).limit(1));
    const row = found[0];
    if (!row || (row.channel.visibility !== "public" && viewer?.id !== row.channel.ownerId)) return fail("Channel not found.", 404);
    const [songRows, albumRows, playlistRows, subRows] = await withDb(async (db) => Promise.all([
      db.select().from(tracks).where(and(eq(tracks.channelId, row.channel.id), viewer?.id === row.channel.ownerId ? undefined : and(eq(tracks.visibility, "public"), eq(tracks.rightsConfirmed, true)))).orderBy(desc(tracks.createdAt)).limit(200),
      db.select().from(albums).where(and(eq(albums.channelId, row.channel.id), viewer?.id === row.channel.ownerId ? undefined : eq(albums.visibility, "public"))).orderBy(desc(albums.createdAt)).limit(100),
      db.select({ playlist: playlists }).from(playlists).where(and(eq(playlists.ownerId, row.channel.ownerId), viewer?.id === row.channel.ownerId ? undefined : eq(playlists.visibility, "public"))).orderBy(desc(playlists.createdAt)).limit(100),
      viewer ? db.select({ userId: channelSubscriptions.userId }).from(channelSubscriptions).where(and(eq(channelSubscriptions.channelId, row.channel.id), eq(channelSubscriptions.userId, viewer.id))).limit(1) : Promise.resolve([]),
    ]));
    return NextResponse.json({
      channel: { ...row.channel, ownerUsername: row.user.username, ownerName: row.user.displayName, subscribers: Number(row.subscribers), subscribed: subRows.length > 0 },
      tracks: songRows.map((track) => ({ ...track, objectKey: undefined, sha256: undefined })),
      albums: albumRows,
      playlists: playlistRows.map((item) => item.playlist),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Channel could not be loaded.", 503); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const handle = (await params).handle.toLowerCase().replace(/^@/, "").slice(0, 32);
  const body = await readBody(request);
  if (!body) return fail("Channel details were invalid.");
  const patch: Partial<typeof channels.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string") { const name = asString(body.name, 100); if (!name) return fail("Channel name cannot be empty."); patch.name = name; }
  if (typeof body.description === "string") patch.description = asString(body.description, 1000);
  if (typeof body.genre === "string") patch.genre = asString(body.genre, 80);
  if (typeof body.language === "string") patch.language = asString(body.language, 80);
  if (body.visibility !== undefined) { const visibility = parseVisibility(body.visibility); if (!visibility) return fail("Visibility must be public or private."); patch.visibility = visibility; }
  try {
    if (typeof body.imageUrl === "string") { const imageUrl = await ownedImageUrl(body.imageUrl, user.id); if (imageUrl === null) return fail("Channel artwork must be your own MiLey image or a secure HTTPS link."); patch.imageUrl = imageUrl; }
    if (typeof body.bannerUrl === "string") { const bannerUrl = await ownedImageUrl(body.bannerUrl, user.id); if (bannerUrl === null) return fail("Channel artwork must be your own MiLey image or a secure HTTPS link."); patch.bannerUrl = bannerUrl; }
    if (Array.isArray(body.links)) {
      if (body.links.length > 5) return fail("Add at most five channel links.");
      const links: string[] = [];
      for (const item of body.links) {
        if (typeof item !== "string") return fail("Channel links must be secure HTTPS URLs.");
        try { const parsed = new URL(item); if (parsed.protocol !== "https:" || parsed.username || parsed.password) return fail("Channel links must be secure HTTPS URLs."); links.push(parsed.toString()); }
        catch { return fail("Channel links must be secure HTTPS URLs."); }
      }
      patch.links = links;
    }
    const owned = await withDb((db) => db.select({ id: channels.id }).from(channels).where(and(eq(channels.handle, handle), eq(channels.ownerId, user.id))).limit(1));
    if (!owned.length) return fail("Channel not found.", 404);
    const rows = await withDb((db) => db.update(channels).set(patch).where(eq(channels.id, owned[0].id)).returning());
    return NextResponse.json(rows[0], { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Channel could not be updated.", 503); }
}
