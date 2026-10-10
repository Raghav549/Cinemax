import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { watchlist, movies } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const sid = req.cookies.get("session_id")?.value || "anonymous";
    const result = await db
      .select({ movie: movies, watchlistId: watchlist.id })
      .from(watchlist)
      .innerJoin(movies, eq(watchlist.movieId, movies.id))
      .where(eq(watchlist.sessionId, sid));
    return NextResponse.json(result.map((r) => ({ ...r.movie, watchlistId: r.watchlistId })));
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let sid = req.cookies.get("session_id")?.value;
    const body = await req.json();

    if (!sid) {
      sid = crypto.randomUUID();
    }

    const existing = await db
      .select()
      .from(watchlist)
      .where(and(eq(watchlist.movieId, body.movieId), eq(watchlist.sessionId, sid)));

    if (existing.length > 0) {
      await db.delete(watchlist).where(eq(watchlist.id, existing[0].id));
      const res = NextResponse.json({ added: false });
      res.cookies.set("session_id", sid, { maxAge: 86400 * 365, path: "/" });
      return res;
    }

    await db.insert(watchlist).values({ movieId: body.movieId, sessionId: sid });
    const res = NextResponse.json({ added: true });
    res.cookies.set("session_id", sid, { maxAge: 86400 * 365, path: "/" });
    return res;
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
