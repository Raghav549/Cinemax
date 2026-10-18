import { eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authLocked, clearLoginFailures, createSession, safeUser, setSessionCookie, validEmail, verifyPassword, recordLoginFailure } from "@/lib/miley-auth";
import { fail, readBody } from "@/lib/miley-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!validEmail(email) || !password || password.length > 72) return fail("Email or password is incorrect.", 401);

  try {
    if (await authLocked(email)) return fail("Too many sign-in attempts. Try again in 15 minutes.", 429);
    const rows = await withDb((db) => db.select().from(users).where(eq(users.email, email)).limit(1));
    const account = rows[0];
    const valid = account && !account.deletedAt && await verifyPassword(password, account.passwordHash);
    if (!valid || !account) {
      await recordLoginFailure(email);
      return fail("Email or password is incorrect.", 401);
    }

    await clearLoginFailures(email);
    const token = await createSession(account.id);
    const response = NextResponse.json({ user: safeUser(account) }, { headers: { "Cache-Control": "no-store" } });
    return setSessionCookie(response, token);
  } catch (error) {
    console.error("[auth] sign-in failed:", error instanceof Error ? error.message : "unknown error");
    return fail("Sign-in is temporarily unavailable. Please try again.", 503);
  }
}
