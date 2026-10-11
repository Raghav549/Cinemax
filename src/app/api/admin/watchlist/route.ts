import { NextRequest, NextResponse } from "next/server";
import { movies, watchlist } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { normalizeMovie } from "@/db/rows";
import { badRequest, isAdmin, notFound, parseId, unauthorized } from "@/lib/api";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Every saved entry across all visitors, newest first. */
export async function GET(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) return unauthorized();

    const rows = await withDb((db) =>
      db
        .select({ entry: watchlist, movie: movies })
        .from(watchlist)
        .leftJoin(movies, eq(watchlist.movieId, movies.id))
        .orderBy(desc(watchlist.createdAt), desc(watchlist.id))
    );

    return NextResponse.json(
      rows.map((row) => ({
        id: row.entry.id,
        movieId: row.entry.movieId,
        sessionId: row.entry.sessionId,
        createdAt: row.entry.createdAt instanceof Date ? row.entry.createdAt.toISOString() : null,
        movie: row.movie ? normalizeMovie(row.movie as Record<string, unknown>) : null,
      }))
    );
  } catch (e) {
    console.error("[api/admin/watchlist] GET failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) return unauthorized();

    const { searchParams } = new URL(req.url);
    const id = parseId(searchParams.get("id"));
    if (id === null) return badRequest("A numeric id query parameter is required");

    const removed = await withDb((db) =>
      db.delete(watchlist).where(eq(watchlist.id, id)).returning({ id: watchlist.id })
    );
    if (!removed.length) return notFound("Watchlist entry not found");

    return NextResponse.json({ success: true, id });
  } catch (e) {
    console.error("[api/admin/watchlist] DELETE failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}
