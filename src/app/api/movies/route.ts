import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { movies } from "@/db/schema";
import { verifyToken } from "@/lib/auth";
import { desc, ilike, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const featured = searchParams.get("featured");
    const limit = parseInt(searchParams.get("limit") || "50");

    let query = db.select().from(movies);

    if (search) {
      const result = await db
        .select()
        .from(movies)
        .where(
          or(
            ilike(movies.title, `%${search}%`),
            ilike(movies.genre, `%${search}%`),
            ilike(movies.description, `%${search}%`)
          )
        )
        .orderBy(desc(movies.createdAt))
        .limit(limit);
      return NextResponse.json(result);
    }

    if (featured === "true") {
      const result = await db
        .select()
        .from(movies)
        .where(ilike(movies.category, "featured"))
        .orderBy(desc(movies.createdAt))
        .limit(limit);
      return NextResponse.json(result);
    }

    if (category) {
      const result = await db
        .select()
        .from(movies)
        .where(ilike(movies.category, `%${category}%`))
        .orderBy(desc(movies.createdAt))
        .limit(limit);
      return NextResponse.json(result);
    }

    const result = await query.orderBy(desc(movies.createdAt)).limit(limit);
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch movies" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("admin_token")?.value;
    if (!token || !(await verifyToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const result = await db.insert(movies).values({
      title: body.title,
      description: body.description || "",
      year: body.year || 2024,
      rating: body.rating || "8.0",
      duration: body.duration || "2h 0m",
      genre: body.genre || "",
      language: body.language || "English",
      type: body.type || "Movie",
      director: body.director || "",
      cast: body.cast || "",
      posterUrl: body.posterUrl || "",
      backdropUrl: body.backdropUrl || "",
      videoUrl: body.videoUrl || "",
      category: body.category || "trending",
      featured: body.featured || false,
    }).returning();

    return NextResponse.json(result[0]);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create movie" }, { status: 500 });
  }
}
