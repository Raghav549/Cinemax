import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { authTokens, sessions, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { digestSecret, hashPassword, validatePassword } from "@/lib/miley-auth";
import { asString, fail, readBody } from "@/lib/miley-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  const token = asString(body?.token, 128);
  const password = typeof body?.password === "string" ? body.password : "";
  if (token.length < 32 || token.length > 128) return fail("This reset link is invalid or expired.");
  const passwordError = validatePassword(password);
  if (passwordError) return fail(passwordError);
  try {
    const rows = await withDb((db) => db.select({ id: authTokens.id, userId: authTokens.userId })
      .from(authTokens).where(and(eq(authTokens.tokenHash, digestSecret(token)), eq(authTokens.purpose, "reset_password"), gt(authTokens.expiresAt, new Date()), isNull(authTokens.consumedAt))).limit(1));
    if (!rows.length) return fail("This reset link is invalid or expired.", 400);
    const passwordHash = await hashPassword(password);
    await withDb(async (db) => {
      await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, rows[0].userId));
      await db.update(authTokens).set({ consumedAt: new Date() }).where(eq(authTokens.userId, rows[0].userId));
      await db.delete(sessions).where(eq(sessions.userId, rows[0].userId));
    });
    return NextResponse.json({ success: true, message: "Password updated. Please sign in with your new password." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("The password could not be changed right now.", 503);
  }
}
