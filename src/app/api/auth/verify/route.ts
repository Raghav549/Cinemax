import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { authTokens, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { digestSecret } from "@/lib/miley-auth";
import { fail } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (token.length < 32 || token.length > 128) return fail("This verification link is invalid or expired.", 400);
  try {
    const tokenHash = digestSecret(token);
    const now = new Date();
    const verified = await withDb((db) => db.transaction(async (tx) => {
      const consumed = await tx.update(authTokens).set({ consumedAt: now })
        .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, "verify_email"), gt(authTokens.expiresAt, now), isNull(authTokens.consumedAt)))
        .returning({ userId: authTokens.userId });
      if (consumed.length) {
        await tx.update(users).set({ emailVerified: true, updatedAt: now }).where(eq(users.id, consumed[0].userId));
        return true;
      }
      // Safe to retry a just-completed verification (e.g. after a lost HTTP
      // response) without applying the one-time action a second time.
      const alreadyVerified = await tx.select({ id: users.id }).from(authTokens).innerJoin(users, eq(authTokens.userId, users.id))
        .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, "verify_email"), gt(authTokens.expiresAt, now), isNotNull(authTokens.consumedAt), eq(users.emailVerified, true)))
        .limit(1);
      return alreadyVerified.length > 0;
    }));
    if (!verified) return fail("This verification link is invalid or expired.", 400);
    return NextResponse.json({ verified: true, message: "Email verified. Your MiLey account is ready." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Email verification is temporarily unavailable.", 503);
  }
}
