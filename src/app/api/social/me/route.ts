import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { getSessionUser } from "@/lib/miley-auth";
import { authenticatedUser, asString, fail, isSafeUser, readBody } from "@/lib/miley-api";
import { ownedImageUrl } from "@/lib/miley-images";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Profile could not be loaded.", 503); }
}

export async function PATCH(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  if (!body) return fail("Profile details were invalid.");
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.displayName === "string") { const name = asString(body.displayName, 100); if (name.length < 2) return fail("Your name must be at least 2 characters."); patch.displayName = name; }
  if (typeof body.bio === "string") patch.bio = asString(body.bio, 280);
  if (typeof body.isPrivate === "boolean") patch.isPrivate = body.isPrivate;
  if (typeof body.recommendationsEnabled === "boolean") patch.recommendationsEnabled = body.recommendationsEnabled;
  if (typeof body.historyEnabled === "boolean") patch.historyEnabled = body.historyEnabled;
  try {
    if (typeof body.avatarUrl === "string") {
      const avatar = await ownedImageUrl(body.avatarUrl, user.id);
      if (avatar === null) return fail("Profile images must be your own MiLey upload or a secure HTTPS image.");
      patch.avatarUrl = avatar;
    }
    const rows = await withDb((db) => db.update(users).set(patch).where(eq(users.id, user.id)).returning());
    return NextResponse.json({ user: rows[0] ? {
      id: rows[0].id, email: rows[0].email, username: rows[0].username, displayName: rows[0].displayName,
      birthDate: rows[0].birthDate, gender: rows[0].gender, avatarUrl: rows[0].avatarUrl, bio: rows[0].bio,
      emailVerified: rows[0].emailVerified, isPrivate: rows[0].isPrivate,
      recommendationsEnabled: rows[0].recommendationsEnabled, historyEnabled: rows[0].historyEnabled,
      createdAt: rows[0].createdAt.toISOString(),
    } : null });
  } catch { return fail("Profile could not be saved.", 503); }
}
