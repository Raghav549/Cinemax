import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channels, channelSubscriptions, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser } from "@/lib/miley-api";
import { createNotification } from "@/lib/miley-notifications";

export const dynamic = "force-dynamic";

async function subscribe(request: NextRequest, context: { params: Promise<{ handle: string }> }, remove: boolean) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const handle = (await context.params).handle.toLowerCase().replace(/^@/, "").slice(0, 32);
  try {
    const found = await withDb((db) => db.select({ channelId: channels.id, ownerId: channels.ownerId, visibility: channels.visibility }).from(channels)
      .innerJoin(users, eq(channels.ownerId, users.id)).where(and(eq(channels.handle, handle), sql`${users.deletedAt} IS NULL`)).limit(1));
    const channel = found[0];
    if (!channel || channel.visibility !== "public") return fail("Channel not found.", 404);
    if (channel.ownerId === user.id) return fail("You already own this channel.", 400);
    if (remove) {
      await withDb((db) => db.delete(channelSubscriptions).where(and(eq(channelSubscriptions.userId, user.id), eq(channelSubscriptions.channelId, channel.channelId))));
      return NextResponse.json({ subscribed: false });
    }
    const inserted = await withDb((db) => db.insert(channelSubscriptions).values({ userId: user.id, channelId: channel.channelId }).onConflictDoNothing().returning({ userId: channelSubscriptions.userId }));
    if (inserted.length) {
      await createNotification(channel.ownerId, user.id, "channel_subscription", channel.channelId);
    }
    return NextResponse.json({ subscribed: true });
  } catch { return fail("Channel subscription could not be updated.", 503); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ handle: string }> }) { return subscribe(request, context, false); }
export async function DELETE(request: NextRequest, context: { params: Promise<{ handle: string }> }) { return subscribe(request, context, true); }
