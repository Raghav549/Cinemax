import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { blocks, follows, followRequests, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser } from "@/lib/miley-api";
import { createNotification } from "@/lib/miley-notifications";

export const dynamic = "force-dynamic";

async function change(request: NextRequest, context: { params: Promise<{ username: string }> }, remove: boolean) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const username = (await context.params).username.toLowerCase().replace(/^@/, "").slice(0, 30);
  try {
    const found = await withDb((db) => db.select({ id: users.id, isPrivate: users.isPrivate }).from(users).where(and(eq(users.username, username), sql`${users.deletedAt} IS NULL`)).limit(1));
    const target = found[0];
    if (!target || target.id === user.id) return fail("Profile not found.", 404);
    const blockRows = await withDb((db) => db.select({ blockerId: blocks.blockerId }).from(blocks)
      .where(sql`(${blocks.blockerId} = ${user.id} AND ${blocks.blockedId} = ${target.id}) OR (${blocks.blockerId} = ${target.id} AND ${blocks.blockedId} = ${user.id})`).limit(1));
    if (blockRows.length) return fail("This relationship is unavailable.", 403);
    if (remove) {
      await withDb(async (db) => {
        await db.delete(follows).where(and(eq(follows.followerId, user.id), eq(follows.followedId, target.id)));
        await db.delete(followRequests).where(and(eq(followRequests.requesterId, user.id), eq(followRequests.targetId, target.id)));
      });
      return NextResponse.json({ following: false, requested: false });
    }
    if (target.isPrivate) {
      const [alreadyFollowing] = await withDb((db) => db.select({ id: follows.followerId }).from(follows)
        .where(and(eq(follows.followerId, user.id), eq(follows.followedId, target.id))).limit(1));
      if (alreadyFollowing) return NextResponse.json({ following: true, requested: false });
      const [previousRequest] = await withDb((db) => db.select({ id: followRequests.id, status: followRequests.status }).from(followRequests)
        .where(and(eq(followRequests.requesterId, user.id), eq(followRequests.targetId, target.id))).limit(1));
      const result = await withDb((db) => db.insert(followRequests).values({ requesterId: user.id, targetId: target.id, status: "pending" })
        .onConflictDoUpdate({ target: [followRequests.requesterId, followRequests.targetId], set: { status: "pending", updatedAt: new Date() } })
        .returning({ id: followRequests.id }));
      if (result[0] && previousRequest?.status !== "pending") await createNotification(target.id, user.id, "follow_request", result[0].id);
      return NextResponse.json({ following: false, requested: true });
    }
    const result = await withDb((db) => db.insert(follows).values({ followerId: user.id, followedId: target.id }).onConflictDoNothing().returning({ followerId: follows.followerId }));
    if (result.length) await createNotification(target.id, user.id, "new_follower");
    return NextResponse.json({ following: true, requested: false });
  } catch { return fail("Follow could not be updated.", 503); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ username: string }> }) { return change(request, context, false); }
export async function DELETE(request: NextRequest, context: { params: Promise<{ username: string }> }) { return change(request, context, true); }
