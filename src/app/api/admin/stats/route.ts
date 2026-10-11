import { NextRequest, NextResponse } from "next/server";
import { categories, movies, slides, watchlist } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { getSchemaReport } from "@/db/ensure-schema";
import { isAdmin, unauthorized } from "@/lib/api";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) return unauthorized();

    const counts = await withDb(async (db) => {
      const [movieCount] = await db.select({ count: sql<number>`count(*)` }).from(movies);
      const [slideCount] = await db.select({ count: sql<number>`count(*)` }).from(slides);
      const [catCount] = await db.select({ count: sql<number>`count(*)` }).from(categories);
      const [wlCount] = await db.select({ count: sql<number>`count(*)` }).from(watchlist);
      return {
        movies: Number(movieCount.count),
        slides: Number(slideCount.count),
        categories: Number(catCount.count),
        watchlistItems: Number(wlCount.count),
      };
    });

    // Surfaced in the dashboard so a database problem is never a silent zero.
    const schema = getSchemaReport();
    return NextResponse.json({ ...counts, schemaOk: schema?.ok ?? null, schemaError: schema?.error ?? null });
  } catch (e) {
    console.error("[api/admin/stats] GET failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}
