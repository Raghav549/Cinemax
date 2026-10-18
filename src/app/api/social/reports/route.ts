import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { reports, users, tracks, playlists, channels } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, asString, fail, isSafeUser, parsePositiveId, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";
const TYPES = new Set(["user", "track", "playlist", "channel"]);

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  const targetType = typeof body?.targetType === "string" ? body.targetType : "";
  const targetId = parsePositiveId(body?.targetId);
  const reason = asString(body?.reason, 1000);
  if (!TYPES.has(targetType) || !targetId || reason.length < 8) return fail("Choose a report reason and a valid item.");
  try {
    let exists = false;
    if (targetType === "user") exists = (await withDb((db) => db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1))).length > 0;
    if (targetType === "track") exists = (await withDb((db) => db.select({ id: tracks.id }).from(tracks).where(eq(tracks.id, targetId)).limit(1))).length > 0;
    if (targetType === "playlist") exists = (await withDb((db) => db.select({ id: playlists.id }).from(playlists).where(eq(playlists.id, targetId)).limit(1))).length > 0;
    if (targetType === "channel") exists = (await withDb((db) => db.select({ id: channels.id }).from(channels).where(eq(channels.id, targetId)).limit(1))).length > 0;
    if (!exists) return fail("The reported item was not found.", 404);
    await withDb((db) => db.insert(reports).values({ reporterId: user.id, targetType, targetId, reason }));
    return NextResponse.json({ submitted: true }, { status: 201 });
  } catch { return fail("The report could not be submitted.", 503); }
}
