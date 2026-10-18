import { and, desc, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { notifications, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser, parsePositiveId, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  try {
    const rows = await withDb((db) => db.select({ item: notifications, actorUsername: users.username, actorName: users.displayName, actorAvatar: users.avatarUrl })
      .from(notifications).leftJoin(users, eq(notifications.actorId, users.id)).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(100));
    return NextResponse.json({ items: rows.map(({ item, actorUsername, actorName, actorAvatar }) => ({ ...item, createdAt: item.createdAt.toISOString(), readAt: item.readAt?.toISOString() ?? null, actor: actorUsername ? { username: actorUsername, displayName: actorName, avatarUrl: actorAvatar } : null })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Notifications could not be loaded.", 503); }
}

export async function PATCH(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  const id = parsePositiveId(body?.id);
  try {
    if (body?.all === true) await withDb((db) => db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))));
    else if (id) await withDb((db) => db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id))));
    else return fail("Choose a notification to mark as read.");
    return NextResponse.json({ updated: true });
  } catch { return fail("Notifications could not be updated.", 503); }
}
