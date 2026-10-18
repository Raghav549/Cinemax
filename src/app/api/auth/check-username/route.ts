import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { normalizeUsername, validUsername } from "@/lib/miley-auth";
import { fail } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const username = normalizeUsername(request.nextUrl.searchParams.get("username") || "");
  if (!validUsername(username)) return fail("Use 3–30 lowercase letters, numbers, or underscores.");
  try {
    const matches = await withDb((db) => db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1));
    return NextResponse.json({ available: matches.length === 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Username availability is temporarily unavailable.", 503);
  }
}
