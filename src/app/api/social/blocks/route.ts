import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { blocks, follows, followRequests, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  try {
    const rows = await withDb((db) => db.select({ username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl, createdAt: blocks.createdAt })
      .from(blocks).innerJoin(users, eq(blocks.blockedId, users.id)).where(eq(blocks.blockerId, user.id)).orderBy(desc(blocks.createdAt)).limit(500));
    return NextResponse.json({ items: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Blocked accounts could not be loaded.", 503); }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  const username = typeof body?.username === "string" ? body.username.trim().replace(/^@/, "").toLowerCase().slice(0, 30) : "";
  if (!username) return fail("Choose a profile to block.");
  try {
    const targets = await withDb((db) => db.select({ id: users.id }).from(users).where(and(eq(users.username, username), sql`${users.deletedAt} IS NULL`)).limit(1));
    const targetId = targets[0]?.id;
    if (!targetId || targetId === user.id) return fail("Profile not found.", 404);
    await withDb(async (db) => {
      await db.insert(blocks).values({ blockerId: user.id, blockedId: targetId }).onConflictDoNothing();
      await db.delete(follows).where(sql`(${follows.followerId} = ${user.id} AND ${follows.followedId} = ${targetId}) OR (${follows.followerId} = ${targetId} AND ${follows.followedId} = ${user.id})`);
      await db.delete(followRequests).where(sql`(${followRequests.requesterId} = ${user.id} AND ${followRequests.targetId} = ${targetId}) OR (${followRequests.requesterId} = ${targetId} AND ${followRequests.targetId} = ${user.id})`);
    });
    return NextResponse.json({ blocked: true });
  } catch { return fail("This account could not be blocked.", 503); }
}
