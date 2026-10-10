import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { movies, slides, categories, watchlist } from "@/db/schema";
import { verifyToken } from "@/lib/auth";
import { sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("admin_token")?.value;
    if (!token || !(await verifyToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [movieCount] = await db.select({ count: sql<number>`count(*)` }).from(movies);
    const [slideCount] = await db.select({ count: sql<number>`count(*)` }).from(slides);
    const [catCount] = await db.select({ count: sql<number>`count(*)` }).from(categories);
    const [wlCount] = await db.select({ count: sql<number>`count(*)` }).from(watchlist);

    return NextResponse.json({
      movies: Number(movieCount.count),
      slides: Number(slideCount.count),
      categories: Number(catCount.count),
      watchlistItems: Number(wlCount.count),
    });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
