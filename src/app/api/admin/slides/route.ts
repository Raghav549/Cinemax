import { NextRequest, NextResponse } from "next/server";
import { slides } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { normalizeSlide } from "@/db/rows";
import { isAdmin, unauthorized } from "@/lib/api";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Every slide, including the inactive ones the public carousel hides. */
export async function GET(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) return unauthorized();

    const result = await withDb((db) => db.select().from(slides).orderBy(asc(slides.sortOrder), asc(slides.id)));
    return NextResponse.json(result.map((row) => normalizeSlide(row as Record<string, unknown>)));
  } catch (e) {
    console.error("[api/admin/slides] GET failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}
