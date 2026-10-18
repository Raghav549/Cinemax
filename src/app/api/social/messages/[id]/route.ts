import { and, count, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { conversations, directMessages } from "@/db/miley-messages-schema";
import { blocks, follows, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, asString, fail, isSafeUser, parsePositiveId, readBody } from "@/lib/miley-api";
import { createNotification } from "@/lib/miley-notifications";

export const dynamic = "force-dynamic";

async function getAccessibleConversation(id: number, userId: number) {
  const rows = await withDb((db) => db.select().from(conversations).where(eq(conversations.id, id)).limit(1));
  const conversation = rows[0];
  if (!conversation || (conversation.userA !== userId && conversation.userB !== userId)) return null;
  const otherId = conversation.userA === userId ? conversation.userB : conversation.userA;
  const relations = await withDb(async (db) => Promise.all([
    db.select({ id: follows.followerId }).from(follows).where(and(eq(follows.followerId, userId), eq(follows.followedId, otherId))).limit(1),
    db.select({ id: follows.followerId }).from(follows).where(and(eq(follows.followerId, otherId), eq(follows.followedId, userId))).limit(1),
    db.select({ id: blocks.blockerId }).from(blocks).where(sql`(${blocks.blockerId} = ${userId} AND ${blocks.blockedId} = ${otherId}) OR (${blocks.blockerId} = ${otherId} AND ${blocks.blockedId} = ${userId})`).limit(1),
    db.select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl, isPrivate: users.isPrivate }).from(users).where(eq(users.id, otherId)).limit(1),
  ]));
  if (!relations[0].length || !relations[1].length || relations[2].length || !relations[3][0]) return null;
  return { conversation, otherId, other: relations[3][0] };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const id = parsePositiveId((await context.params).id);
  if (!id) return fail("Conversation not found.", 404);
  try {
    const accessible = await getAccessibleConversation(id, user.id);
    if (!accessible) return fail("Conversation not found.", 404);
    const items = await withDb((db) => db.select({ id: directMessages.id, senderId: directMessages.senderId, body: directMessages.body, createdAt: directMessages.createdAt })
      .from(directMessages).where(eq(directMessages.conversationId, id)).orderBy(sql`${directMessages.createdAt} DESC, ${directMessages.id} DESC`).limit(100));
    await withDb((db) => db.update(directMessages).set({ readAt: new Date() }).where(and(eq(directMessages.conversationId, id), ne(directMessages.senderId, user.id), isNull(directMessages.readAt))));
    return NextResponse.json({ conversationId: id, other: accessible.other, items: items.reverse().map((item) => ({ ...item, mine: item.senderId === user.id })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Conversation could not be loaded.", 503); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const id = parsePositiveId((await context.params).id);
  if (!id) return fail("Conversation not found.", 404);
  const body = await readBody(request);
  const text = asString(body?.body, 2000);
  if (!text) return fail("Write a message first.");
  try {
    const accessible = await getAccessibleConversation(id, user.id);
    if (!accessible) return fail("Conversation not found.", 404);
    const recent = await withDb((db) => db.select({ count: count() }).from(directMessages).where(and(eq(directMessages.senderId, user.id), gt(directMessages.createdAt, new Date(Date.now() - 60_000)))));
    if ((recent[0]?.count || 0) >= 20) return fail("Please wait a moment before sending more messages.", 429);
    const now = new Date();
    const result = await withDb(async (db) => db.transaction(async (tx) => {
      const [message] = await tx.insert(directMessages).values({ conversationId: id, senderId: user.id, body: text }).returning({ id: directMessages.id, senderId: directMessages.senderId, body: directMessages.body, createdAt: directMessages.createdAt });
      await tx.update(conversations).set({ lastMessageAt: now, updatedAt: now }).where(eq(conversations.id, id));
      return message;
    }));
    await createNotification(accessible.otherId, user.id, "message", id);
    return NextResponse.json({ item: { ...result, mine: true } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Message could not be sent.", 503); }
}
