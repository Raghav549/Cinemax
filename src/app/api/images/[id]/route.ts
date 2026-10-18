import { and, eq, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { albums, blocks, channels, follows, images, playlists, tracks, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { getSessionUser } from "@/lib/miley-auth";
import { fail, parsePositiveId } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = parsePositiveId((await params).id);
  if (!id) return fail("Image not found.", 404);
  const viewer = await getSessionUser(request).catch(() => null);
  try {
    const found = await withDb((db) => db.select({ image: images, owner: users })
      .from(images).innerJoin(users, eq(images.ownerId, users.id))
      .where(and(eq(images.id, id), sql`${users.deletedAt} IS NULL`)).limit(1));
    const item = found[0];
    if (!item) return fail("Image not found.", 404);

    if (viewer?.id !== item.owner.id) {
      const relation = await withDb(async (db) => Promise.all([
        viewer ? db.select({ id: blocks.blockerId }).from(blocks)
          .where(sql`(${blocks.blockerId} = ${viewer.id} AND ${blocks.blockedId} = ${item.owner.id}) OR (${blocks.blockerId} = ${item.owner.id} AND ${blocks.blockedId} = ${viewer.id})`).limit(1) : Promise.resolve([]),
        viewer ? db.select({ id: follows.followerId }).from(follows)
          .where(and(eq(follows.followerId, viewer.id), eq(follows.followedId, item.owner.id))).limit(1) : Promise.resolve([]),
      ]));
      if (relation[0].length) return fail("Image not found.", 404);

      const url = `/api/images/${id}`;
      const visible = await withDb(async (db) => {
        if (item.image.purpose === "avatar") {
          if (item.owner.isPrivate && !relation[1].length) return false;
          return (await db.select({ id: users.id }).from(users)
            .where(and(eq(users.id, item.owner.id), eq(users.avatarUrl, url))).limit(1)).length > 0;
        }
        if (item.image.purpose === "channel_profile" || item.image.purpose === "channel_banner") {
          const column = item.image.purpose === "channel_profile" ? channels.imageUrl : channels.bannerUrl;
          return (await db.select({ id: channels.id }).from(channels)
            .where(and(eq(channels.ownerId, item.owner.id), eq(channels.visibility, "public"), eq(column, url))).limit(1)).length > 0;
        }
        if (item.image.purpose === "artwork") {
          const [publicTrack, publicAlbum, publicPlaylist] = await Promise.all([
            db.select({ id: tracks.id }).from(tracks).innerJoin(channels, eq(tracks.channelId, channels.id))
              .where(and(eq(tracks.ownerId, item.owner.id), eq(tracks.artworkUrl, url), eq(tracks.visibility, "public"), eq(tracks.rightsConfirmed, true), eq(channels.visibility, "public"))).limit(1),
            db.select({ id: albums.id }).from(albums).innerJoin(channels, eq(albums.channelId, channels.id))
              .where(and(eq(albums.ownerId, item.owner.id), eq(albums.artworkUrl, url), eq(albums.visibility, "public"), eq(channels.visibility, "public"))).limit(1),
            db.select({ id: playlists.id }).from(playlists)
              .where(and(eq(playlists.ownerId, item.owner.id), eq(playlists.artworkUrl, url), eq(playlists.visibility, "public"))).limit(1),
          ]);
          return publicTrack.length + publicAlbum.length + publicPlaylist.length > 0;
        }
        return false;
      });
      if (!visible) return fail("Image not found.", 404);
    }

    const bytes = item.image.imageData;
    return new NextResponse(bytes as unknown as BodyInit, { status: 200, headers: {
      "Content-Type": item.image.contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch { return fail("Image could not be loaded.", 503); }
}
