import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { accountEmailBase, createAuthToken, sendAccountEmail, validEmail } from "@/lib/miley-auth";
import { fail, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!validEmail(email)) return fail("Enter a valid email address.");
  try {
    const rows = await withDb((db) => db.select().from(users).where(eq(users.email, email)).limit(1));
    const account = rows[0];
    if (account && !account.deletedAt) {
      const token = await createAuthToken(account.id, "reset_password", 30 * 60 * 1000);
      const base = accountEmailBase(request.nextUrl.origin);
      if (base) {
        const link = `${base}/reset-password?token=${encodeURIComponent(token)}`.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        try { await sendAccountEmail(email, "Reset your MiLey password", `<p>Use this single-use link to choose a new password:</p><p><a href="${link}">Reset password</a></p><p>The link expires in 30 minutes. If you did not request it, ignore this email.</p>`); }
        catch { /* Do not reveal whether the address exists or whether delivery failed. */ }
        if (process.env.NODE_ENV !== "production") console.info(`[auth:dev] password reset link for ${email}: ${base}/reset-password?token=${encodeURIComponent(token)}`);
      }
    }
    return NextResponse.json({ sent: true, message: "If an account exists for that address, password reset instructions will be sent." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Password reset is temporarily unavailable.", 503);
  }
}
