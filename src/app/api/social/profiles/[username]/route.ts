import { and, desc, eq, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { blocks, channels, follows, followRequests, playlists, tracks, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { getSessionUser } from "@/lib/miley-auth";
import { fail } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const username = (await params).username.toLowerCase().replace(/^@/, "").slice(0, 30);
  const viewer = await getSessionUser(request).catch(() => null);
  try {
    const found = await withDb((db) => db.select({ profile: users,
      followers: sql<number>`count(distinct ${follows.followerId}) FILTER (WHERE ${follows.followerId} IS NOT NULL)`,
    }).from(users).leftJoin(follows, eq(follows.followedId, users.id))
      .where(and(eq(users.username, username), sql`${users.deletedAt} IS NULL`)).groupBy(users.id).limit(1));
    const profile = found[0]?.profile;
    if (!profile) return fail("Profile not found.", 404);
    const self = viewer?.id === profile.id;
    let isFollowing = false;
    let followsYou = false;
    let blocked = false;
    let requestPending = false;
    let followingCount = 0;
    if (viewer && !self) {
      const [outgoing, incoming, blockRows, requestRows, followingRows] = await withDb(async (db) => Promise.all([
        db.select({ id: follows.followerId }).from(follows).where(and(eq(follows.followerId, viewer.id), eq(follows.followedId, profile.id))).limit(1),
        db.select({ id: follows.followerId }).from(follows).where(and(eq(follows.followerId, profile.id), eq(follows.followedId, viewer.id))).limit(1),
        db.select({ blockerId: blocks.blockerId }).from(blocks).where(sql`(${blocks.blockerId} = ${viewer.id} AND ${blocks.blockedId} = ${profile.id}) OR (${blocks.blockerId} = ${profile.id} AND ${blocks.blockedId} = ${viewer.id})`).limit(1),
        db.select({ status: followRequests.status }).from(followRequests).where(and(eq(followRequests.requesterId, viewer.id), eq(followRequests.targetId, profile.id))).limit(1),
        db.select({ count: sql<number>`count(*)` }).from(follows).where(eq(follows.followerId, profile.id)),
      ]));
      isFollowing = outgoing.length > 0;
      followsYou = incoming.length > 0;
      blocked = blockRows.length > 0;
      requestPending = requestRows[0]?.status === "pending";
      followingCount = Number(followingRows[0]?.count ?? 0);
    } else {
      const count = await withDb((db) => db.select({ count: sql<number>`count(*)` }).from(follows).where(eq(follows.followerId, profile.id)));
      followingCount = Number(count[0]?.count ?? 0);
    }
    if (blocked) return fail("Profile not found.", 404);
    const isPrivate = profile.isPrivate && !self && !isFollowing;
    const safeProfile = {
      id: profile.id, username: profile.username, displayName: profile.displayName,
      avatarUrl: isPrivate ? "" : profile.avatarUrl,
      bio: isPrivate ? "" : profile.bio, isPrivate: profile.isPrivate, emailVerified: profile.emailVerified,
      followers: Number(found[0].followers), following: followingCount,
      isFollowing, followsYou, followRequestPending: requestPending,
      canViewContent: !isPrivate,
      ...(self ? { email: profile.email, birthDate: profile.birthDate, gender: profile.gender } : {}),
    };
    if (isPrivate) return NextResponse.json({ profile: safeProfile, playlists: [], tracks: [] }, { headers: { "Cache-Control": "no-store" } });
    const [userTracks, userPlaylists, channelRows] = await withDb(async (db) => Promise.all([
      db.select().from(tracks).where(and(eq(tracks.ownerId, profile.id), eq(tracks.visibility, "public"), eq(tracks.rightsConfirmed, true))).orderBy(desc(tracks.createdAt)).limit(100),
      db.select().from(playlists).where(and(eq(playlists.ownerId, profile.id), eq(playlists.visibility, "public"))).orderBy(desc(playlists.createdAt)).limit(100),
      db.select({ id: channels.id, ownerId: channels.ownerId, name: channels.name, handle: channels.handle, imageUrl: channels.imageUrl, bannerUrl: channels.bannerUrl, description: channels.description, visibility: channels.visibility, genre: channels.genre, language: channels.language }).from(channels).where(and(eq(channels.ownerId, profile.id), or(eq(channels.visibility, "public"), eq(channels.ownerId, viewer?.id || -1)))).limit(1),
    ]));
    const channel = channelRows[0] || null;
    return NextResponse.json({ profile: safeProfile, channel, tracks: userTracks.map((track) => ({ ...track, objectKey: undefined, sha256: undefined })), playlists: userPlaylists }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Profile could not be loaded.", 503); }
}
