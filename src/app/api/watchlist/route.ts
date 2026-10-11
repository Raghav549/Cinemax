import { NextRequest, NextResponse } from "next/server";
import { movies, watchlist } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { normalizeMovie } from "@/db/rows";
import { badRequest, parseId, readJson } from "@/lib/api";
import { and, asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = "session_id";
const YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

function withSession(res: NextResponse, sessionId: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, sessionId, {
    maxAge: YEAR_IN_SECONDS,
    path: "/",
    sameSite: "lax",
  });
  return res;
}

export async function GET(req: NextRequest) {
  try {
    let sessionId = req.cookies.get(SESSION_COOKIE)?.value;
    const isNewSession = !sessionId;
    if (!sessionId) sessionId = crypto.randomUUID();

    const rows = await withDb((db) =>
      db
        .select({ entry: watchlist, movie: movies })
        .from(watchlist)
        .innerJoin(movies, eq(watchlist.movieId, movies.id))
        .where(eq(watchlist.sessionId, sessionId))
        .orderBy(asc(watchlist.id))
    );

    const payload = rows.map((row) => ({
      ...normalizeMovie(row.movie as Record<string, unknown>),
      watchlistId: row.entry.id,
    }));

    // Handing the visitor a session id on the first read keeps "My List" stable
    // instead of starting a new anonymous list on every request.
    return isNewSession ? withSession(NextResponse.json(payload), sessionId) : NextResponse.json(payload);
  } catch (e) {
    console.error("[api/watchlist] GET failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    if (!body) return badRequest("Invalid JSON body");

    const movieId = parseId(String(body.movieId ?? ""));
    if (movieId === null) return badRequest("A numeric movieId is required");

    let sessionId = req.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionId) sessionId = crypto.randomUUID();

    const exists = await withDb((db) =>
      db
        .select({ id: watchlist.id })
        .from(watchlist)
        .where(and(eq(watchlist.movieId, movieId), eq(watchlist.sessionId, sessionId)))
        .limit(1)
    );

    if (exists.length) {
      // Remove every match: the table has no unique constraint, so a visitor can
      // hold more than one row for the same title.
      await withDb((db) =>
        db.delete(watchlist).where(and(eq(watchlist.movieId, movieId), eq(watchlist.sessionId, sessionId)))
      );
      return withSession(NextResponse.json({ added: false }), sessionId);
    }

    const movie = await withDb((db) => db.select({ id: movies.id }).from(movies).where(eq(movies.id, movieId)).limit(1));
    if (!movie.length) return badRequest("That movie does not exist");

    await withDb((db) => db.insert(watchlist).values({ movieId, sessionId }));
    return withSession(NextResponse.json({ added: true }), sessionId);
  } catch (e) {
    console.error("[api/watchlist] POST failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}
