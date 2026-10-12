import { NextRequest, NextResponse } from "next/server";
import { movies } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { movieInput, normalizeMovie, ValidationError } from "@/db/rows";
import { badRequest, isAdmin, readJson, unauthorized } from "@/lib/api";
import { publicMovie } from "@/lib/movies";
import { desc, eq, ilike, or, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * A movie belongs to a category when the stored value is that category, or when
 * it appears as one of several comma-separated categories ("Action, Drama").
 * The previous `ilike(category, '%slug%')` also matched unrelated slugs — the
 * "movies" category picked up anything containing the word.
 */
function matchesCategory(slug: string) {
  return or(
    sql`lower(${movies.category}) = lower(${slug})`,
    sql`lower(${slug}) = any (select lower(btrim(token)) from unnest(string_to_array(${movies.category}, ',')) as token)`
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const featured = searchParams.get("featured");
    const parsedLimit = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 50;

    const result = await withDb((db) => {
      if (search) {
        return db
          .select()
          .from(movies)
          .where(
            or(
              ilike(movies.title, `%${search}%`),
              ilike(movies.genre, `%${search}%`),
              ilike(movies.description, `%${search}%`),
              ilike(movies.cast, `%${search}%`),
              ilike(movies.director, `%${search}%`)
            )
          )
          .orderBy(desc(movies.createdAt))
          .limit(limit);
      }

      // `featured` is its own boolean column; it used to be filtered through
      // `category ilike 'featured'`, which matched nothing at all.
      if (featured === "true") {
        return db
          .select()
          .from(movies)
          .where(eq(movies.featured, true))
          .orderBy(desc(movies.createdAt))
          .limit(limit);
      }

      if (category) {
        return db
          .select()
          .from(movies)
          .where(matchesCategory(category))
          .orderBy(desc(movies.createdAt))
          .limit(limit);
      }

      return db.select().from(movies).orderBy(desc(movies.createdAt)).limit(limit);
    });

    const admin = await isAdmin(req);
    return NextResponse.json(result.map((row) => admin
      ? normalizeMovie(row as Record<string, unknown>)
      : publicMovie(row as Record<string, unknown>)));
  } catch (e) {
    console.error("[api/movies] GET failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) return unauthorized();

    const body = await readJson(req);
    if (!body) return badRequest("Invalid JSON body");

    let values;
    try {
      values = movieInput(body);
    } catch (error) {
      if (error instanceof ValidationError) return badRequest(error.message);
      throw error;
    }

    const result = await withDb((db) => db.insert(movies).values(values).returning());

    return NextResponse.json(normalizeMovie(result[0] as Record<string, unknown>), { status: 201 });
  } catch (e) {
    console.error("[api/movies] POST failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}
