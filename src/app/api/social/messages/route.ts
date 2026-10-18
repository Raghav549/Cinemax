import { and, count, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextRequest, NextResponse } from "next/server";
import { conversations, directMessages } from "@/db/miley-messages-schema";
import { blocks, follows, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, asString, fail, isSafeUser, readBody } from "@/lib/miley-api";
import { createNotification } from "@/lib/miley-notifications";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  try {
    const userA = alias(users, "conversation_user_a");
    const userB = alias(users, "conversation_user_b");
    const rows = await withDb((db) => db.select({
      id: conversations.id,
      userAId: conversations.userA,
      userBId: conversations.userB,
      userA: { id: userA.id, username: userA.username, displayName: userA.displayName, avatarUrl: userA.avatarUrl, isPrivate: userA.isPrivate },
      userB: { id: userB.id, username: userB.username, displayName: userB.displayName, avatarUrl: userB.avatarUrl, isPrivate: userB.isPrivate },
      lastMessage: sql<string | null>`(SELECT body FROM miley_direct_messages m WHERE m.conversation_id = ${conversations.id} ORDER BY m.created_at DESC, m.id DESC LIMIT 1)`,
      lastSenderId: sql<number | null>`(SELECT sender_id FROM miley_direct_messages m WHERE m.conversation_id = ${conversations.id} ORDER BY m.created_at DESC, m.id DESC LIMIT 1)`,
      lastMessageAt: conversations.lastMessageAt,
      unreadCount: sql<number>`(SELECT count(*) FROM miley_direct_messages m WHERE m.conversation_id = ${conversations.id} AND m.sender_id <> ${user.id} AND m.read_at IS NULL)`,
    }).from(conversations).innerJoin(userA, eq(conversations.userA, userA.id)).innerJoin(userB, eq(conversations.userB, userB.id))
      .where(or(eq(conversations.userA, user.id), eq(conversations.userB, user.id))).orderBy(desc(conversations.lastMessageAt)).limit(100));
    const partners = rows.map((row) => row.userAId === user.id ? row.userBId : row.userAId);
    if (!partners.length) return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
    const [outgoingRows, incomingRows, blockRows] = await withDb(async (db) => Promise.all([
      db.select({ followerId: follows.followerId, followedId: follows.followedId }).from(follows).where(and(eq(follows.followerId, user.id), inArray(follows.followedId, partners))),
      db.select({ followerId: follows.followerId, followedId: follows.followedId }).from(follows).where(and(inArray(follows.followerId, partners), eq(follows.followedId, user.id))),
      db.select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId }).from(blocks).where(or(and(eq(blocks.blockerId, user.id), inArray(blocks.blockedId, partners)), and(inArray(blocks.blockerId, partners), eq(blocks.blockedId, user.id)))),
    ]));
    const outgoing = new Set(outgoingRows.map((row) => row.followedId));
    const incoming = new Set(incomingRows.map((row) => row.followerId));
    const blocked = new Set(blockRows.map((row) => row.blockerId === user.id ? row.blockedId : row.blockerId));
    const items = rows.filter((row) => {
      const partnerId = row.userAId === user.id ? row.userBId : row.userAId;
      return outgoing.has(partnerId) && incoming.has(partnerId) && !blocked.has(partnerId) && row.lastMessage !== null;
    }).map((row) => {
      const other = row.userAId === user.id ? row.userB : row.userA;
      return { id: row.id, other, lastMessage: row.lastMessage, lastSenderId: row.lastSenderId, lastMessageAt: row.lastMessageAt, unreadCount: Number(row.unreadCount || 0) };
    });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Messages could not be loaded.", 503); }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  const username = asString(body?.username, 30).replace(/^@/, "").toLowerCase();
  const text = asString(body?.body, 2000);
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return fail("Enter a valid username.");
  if (!text) return fail("Write a message first.");
  try {
    const targetRows = await withDb((db) => db.select({ id: users.id, isPrivate: users.isPrivate }).from(users).where(and(eq(users.username, username), isNull(users.deletedAt))).limit(1));
    const target = targetRows[0];
    if (!target || target.id === user.id) return fail("Profile not found.", 404);
    const relations = await withDb(async (db) => Promise.all([
      db.select({ id: follows.followerId }).from(follows).where(and(eq(follows.followerId, user.id), eq(follows.followedId, target.id))).limit(1),
      db.select({ id: follows.followerId }).from(follows).where(and(eq(follows.followerId, target.id), eq(follows.followedId, user.id))).limit(1),
      db.select({ id: blocks.blockerId }).from(blocks).where(or(and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, target.id)), and(eq(blocks.blockerId, target.id), eq(blocks.blockedId, user.id)))).limit(1),
      db.select({ count: count() }).from(directMessages).where(and(eq(directMessages.senderId, user.id), gt(directMessages.createdAt, new Date(Date.now() - 60_000)))),
    ]));
    if (relations[2].length) return fail("This conversation is not available.", 403);
    if (!relations[0].length || !relations[1].length) return fail("You can message only people who mutually follow each other.", 403);
    if (relations[3][0]?.count >= 20) return fail("Please wait a moment before sending more messages.", 429);
    const userA = Math.min(user.id, target.id); const userB = Math.max(user.id, target.id); const now = new Date();
    const conversationId = await withDb((db) => db.transaction(async (tx) => {
      const [row] = await tx.insert(conversations).values({ userA, userB, lastMessageAt: now, updatedAt: now }).onConflictDoUpdate({ target: [conversations.userA, conversations.userB], set: { updatedAt: now } }).returning({ id: conversations.id });
      if (!row) throw new Error("Conversation could not be created.");
      await tx.insert(directMessages).values({ conversationId: row.id, senderId: user.id, body: text });
      await tx.update(conversations).set({ lastMessageAt: now, updatedAt: now }).where(eq(conversations.id, row.id));
      return row.id;
    }));
    await createNotification(target.id, user.id, "message", conversationId);
    return NextResponse.json({ conversationId, sent: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Message could not be sent.", 503); }
}
