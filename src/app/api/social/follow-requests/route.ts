import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { followRequests, users, follows } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser, parsePositiveId, readBody } from "@/lib/miley-api";
import { createNotification } from "@/lib/miley-notifications";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  try {
    const rows = await withDb((db) => db.select({ request: followRequests, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(followRequests).innerJoin(users, eq(followRequests.requesterId, users.id))
      .where(and(eq(followRequests.targetId, user.id), eq(followRequests.status, "pending"))).orderBy(desc(followRequests.createdAt)).limit(100));
    return NextResponse.json({ items: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Follow requests could not be loaded.", 503); }
}

export async function PATCH(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  const id = parsePositiveId(body?.requestId);
  const action = body?.action;
  if (!id || (action !== "accept" && action !== "reject")) return fail("Choose a follow request and an action.");
  try {
    const requestRows = await withDb((db) => db.select().from(followRequests).where(and(eq(followRequests.id, id), eq(followRequests.targetId, user.id), eq(followRequests.status, "pending"))).limit(1));
    if (!requestRows.length) return fail("Follow request not found.", 404);
    const followRequest = requestRows[0];
    await withDb((db) => db.transaction(async (tx) => {
      await tx.update(followRequests).set({ status: action === "accept" ? "accepted" : "rejected", updatedAt: new Date() }).where(eq(followRequests.id, id));
      if (action === "accept") await tx.insert(follows).values({ followerId: followRequest.requesterId, followedId: user.id }).onConflictDoNothing();
    }));
    if (action === "accept") await createNotification(followRequest.requesterId, user.id, "follow_accepted");
    return NextResponse.json({ updated: true, status: action === "accept" ? "accepted" : "rejected" });
  } catch { return fail("Follow request could not be updated.", 503); }
}
