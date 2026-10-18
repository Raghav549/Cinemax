import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channels } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, asString, fail, isSafeUser, parseVisibility, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

function safeImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().slice(0, 2000);
  if (!clean) return "";
  try { const url = new URL(clean); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!isSafeUser(user)) return user;
  try {
    const rows = await withDb((db) => db.select().from(channels).where(eq(channels.ownerId, user.id)).limit(1));
    return NextResponse.json({ channel: rows[0] || null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Channel settings could not be loaded.", 503); }
}

export async function PATCH(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  if (!body) return fail("Channel details were invalid.");
  const patch: Partial<typeof channels.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string") { const value = asString(body.name, 100); if (!value) return fail("Channel name cannot be empty."); patch.name = value; }
  if (typeof body.handle === "string") { const handle = asString(body.handle, 32).toLowerCase().replace(/^@/, ""); if (!/^[a-z0-9_]{3,32}$/.test(handle)) return fail("Enter a valid channel handle."); patch.handle = handle; }
  if (typeof body.description === "string") patch.description = asString(body.description, 1000);
  if (typeof body.genre === "string") patch.genre = asString(body.genre, 80);
  if (typeof body.language === "string") patch.language = asString(body.language, 80);
  if (body.visibility !== undefined) { const visibility = parseVisibility(body.visibility); if (!visibility) return fail("Visibility must be public or private."); patch.visibility = visibility; }
  if (typeof body.imageUrl === "string") { const image = safeImage(body.imageUrl); if (image === null) return fail("Profile image must be an HTTPS URL."); patch.imageUrl = image; }
  if (typeof body.bannerUrl === "string") { const image = safeImage(body.bannerUrl); if (image === null) return fail("Banner image must be an HTTPS URL."); patch.bannerUrl = image; }
  if (Array.isArray(body.links)) {
    patch.links = body.links.slice(0, 5).map((item) => {
      try { const url = new URL(String(item)); return url.protocol === "https:" ? url.toString() : ""; } catch { return ""; }
    }).filter(Boolean);
  }
  try {
    const rows = await withDb((db) => db.update(channels).set(patch).where(eq(channels.ownerId, user.id)).returning());
    if (!rows.length) return fail("Create your channel before editing it.", 404);
    return NextResponse.json(rows[0]);
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") return fail("That channel handle is already in use.", 409);
    return fail("Channel settings could not be saved.", 503);
  }
}
