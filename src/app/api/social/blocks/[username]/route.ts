import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { blocks, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  const username = (await params).username.toLowerCase().replace(/^@/, "").slice(0, 30);
  try {
    const target = await withDb((db) => db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1));
    if (!target.length) return fail("Profile not found.", 404);
    await withDb((db) => db.delete(blocks).where(and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, target[0].id))));
    return NextResponse.json({ blocked: false });
  } catch { return fail("This account could not be unblocked.", 503); }
}
