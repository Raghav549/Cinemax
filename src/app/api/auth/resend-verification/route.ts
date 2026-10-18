import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { accountEmailBase, createAuthToken, getSessionUser, sendAccountEmail } from "@/lib/miley-auth";
import { fail, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  const user = await getSessionUser(request).catch(() => null);
  const email = (user?.email || (typeof body?.email === "string" ? body.email.trim().toLowerCase() : "")).slice(0, 320);
  if (!email) return fail("Enter the email address for your account.");
  try {
    const rows = await withDb((db) => db.select().from(users).where(eq(users.email, email)).limit(1));
    const account = rows[0];
    if (account && !account.emailVerified && !account.deletedAt) {
      const token = await createAuthToken(account.id, "verify_email", 24 * 60 * 60 * 1000);
      const base = accountEmailBase(request.nextUrl.origin);
      if (base) {
        const link = `${base}/verify?token=${encodeURIComponent(token)}`;
        const safeLink = link.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        await sendAccountEmail(email, "Verify your MiLey email", `<p>Confirm your email address to finish setting up MiLey:</p><p><a href="${safeLink}">Verify email</a></p><p>This link expires in 24 hours.</p>`).catch(() => false);
      }
    }
    return NextResponse.json({ sent: true, message: "If the account needs verification, a new link has been sent." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("We could not send a verification email right now.", 503);
  }
}
