import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { sessions, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { createSession, getSessionUser, hashPassword, safeUser, setSessionCookie, validatePassword, verifyPassword } from "@/lib/miley-auth";
import { fail, readBody } from "@/lib/miley-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const current = await getSessionUser(request).catch(() => null);
  if (!current) return fail("Sign in to continue.", 401);
  const body = await readBody(request);
  const oldPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const passwordError = validatePassword(newPassword);
  if (passwordError) return fail(passwordError);
  try {
    const rows = await withDb((db) => db.select().from(users).where(eq(users.id, current.id)).limit(1));
    if (!rows[0] || !await verifyPassword(oldPassword, rows[0].passwordHash)) return fail("Current password is incorrect.", 401);
    const passwordHash = await hashPassword(newPassword);
    await withDb(async (db) => {
      await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, current.id));
      await db.delete(sessions).where(eq(sessions.userId, current.id));
    });
    const token = await createSession(current.id);
    const updated = { ...safeUser(rows[0]), emailVerified: current.emailVerified };
    const response = NextResponse.json({ changed: true, user: updated }, { headers: { "Cache-Control": "no-store" } });
    return setSessionCookie(response, token);
  } catch { return fail("Password could not be changed right now.", 503); }
}
