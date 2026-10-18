import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channels, channelSubscriptions, tracks, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, asString, fail, isSafeUser, parseVisibility, readBody } from "@/lib/miley-api";
import { ownedImageUrl } from "@/lib/miley-images";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  try {
    const rows = await withDb((db) => db.select({
      channel: channels, ownerUsername: users.username,
      subscribers: sql<number>`count(distinct ${channelSubscriptions.userId})`,
      publishedTracks: sql<number>`count(distinct ${tracks.id})`,
    }).from(channels).innerJoin(users, eq(channels.ownerId, users.id))
      .leftJoin(channelSubscriptions, eq(channels.id, channelSubscriptions.channelId))
      .leftJoin(tracks, and(eq(tracks.channelId, channels.id), eq(tracks.visibility, "public"), eq(tracks.rightsConfirmed, true)))
      .where(and(eq(channels.visibility, "public"), q ? ilike(channels.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined, sql`${users.deletedAt} IS NULL`))
      .groupBy(channels.id, users.id).orderBy(desc(sql`count(distinct ${channelSubscriptions.userId})`), asc(channels.name)).limit(40));
    return NextResponse.json({ items: rows.map(({ channel, ownerUsername, subscribers, publishedTracks }) => ({ ...channel, links: channel.links, ownerUsername, subscribers: Number(subscribers), publishedTracks: Number(publishedTracks) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Channels could not be loaded.", 503); }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  const name = asString(body?.name, 100);
  const handle = asString(body?.handle, 32).toLowerCase().replace(/^@/, "");
  const description = asString(body?.description, 1000);
  const language = asString(body?.language, 80);
  const genre = asString(body?.genre, 80);
  const visibility = body?.visibility === undefined ? "public" : parseVisibility(body.visibility);
  if (!name || !/^[a-z0-9_]{3,32}$/.test(handle)) return fail("Enter a channel name and a unique handle (3–32 lowercase letters, numbers, or underscores).");
  if (!visibility) return fail("Visibility must be public or private.");
  const links = Array.isArray(body?.links) ? body.links.slice(0, 5).map((item) => {
    if (typeof item !== "string") return "";
    try { const url = new URL(item); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : ""; } catch { return ""; }
  }).filter(Boolean) : [];
  try {
    const existing = await withDb((db) => db.select({ id: channels.id, handle: channels.handle }).from(channels)
      .where(sql`${channels.ownerId} = ${user.id} OR ${channels.handle} = ${handle}`).limit(1));
    if (existing.some((row) => row.handle === handle)) return fail("That channel handle is already taken.", 409);
    if (existing.length) return fail("You already have a channel. Edit the existing channel instead.", 409);
    const [imageUrl, bannerUrl] = await Promise.all([ownedImageUrl(body?.imageUrl, user.id), ownedImageUrl(body?.bannerUrl, user.id)]);
    if (imageUrl === null || bannerUrl === null) return fail("Channel images must be your own MiLey uploads or secure HTTPS images.");
    const inserted = await withDb((db) => db.insert(channels).values({
      ownerId: user.id, name, handle, description, language, genre, links, visibility,
      imageUrl, bannerUrl,
    }).returning());
    return NextResponse.json(inserted[0], { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") return fail("That channel handle is already taken.", 409);
    return fail("Channel could not be created.", 503);
  }
}
