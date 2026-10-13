import { NextRequest, NextResponse } from "next/server";
import { movies } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { movieInput, normalizeMovie, ValidationError } from "@/db/rows";
import { badRequest, isAdmin, readJson, unauthorized } from "@/lib/api";
import { and, desc, eq, ilike, notInArray, or, sql, SQL } from "drizzle-orm";

export const dynamic = "force-dynamic";

function matchesCategory(value: string) {
  const token = value.trim().toLowerCase();
  return sql`exists (
    select 1
    from unnest(string_to_array(lower(coalesce(${movies.category}, '')), ',')) as item
    where btrim(item) = ${token}
  )`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.trim();
    const search = searchParams.get("search")?.trim();
    const type = searchParams.get("type")?.trim();
    const featured = searchParams.get("featured");
    const status = searchParams.get("status")?.trim();
    const language = searchParams.get("language")?.trim();
    const genre = searchParams.get("genre")?.trim();
    const includeUnavailable = searchParams.get("includeUnavailable") === "true";
    const rawLimit = Number.parseInt(searchParams.get("limit") || "250", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 1000) : 250;

    const conditions: SQL[] = [];

    if (!includeUnavailable && !status) {
      conditions.push(notInArray(movies.catalogStatus, ["verification_failed", "temporarily_unavailable"]));
    }

    if (status) {
      conditions.push(eq(movies.catalogStatus, status));
    }

    if (category && category !== "all") {
      conditions.push(matchesCategory(category));
    }

    if (type && type !== "all") {
      conditions.push(eq(movies.type, type));
    }

    if (language && language !== "all") {
      conditions.push(ilike(movies.language, `%${language}%`));
    }

    if (genre && genre !== "all") {
      conditions.push(ilike(movies.genre, `%${genre}%`));
    }

    if (featured === "true") {
      conditions.push(eq(movies.featured, true));
    }

    if (search) {
      const term = `%${search}%`;
      const clause = or(
        ilike(movies.title, term),
        ilike(movies.genre, term),
        ilike(movies.director, term),
        ilike(movies.cast, term),
        ilike(movies.language, term),
        ilike(movies.description, term),
      );
      if (clause) conditions.push(clause);
    }

    const result = await withDb((db) => {
      const base = db.select().from(movies);
      const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;
      return filtered
        .orderBy(
          sql`CASE WHEN ${movies.catalogStatus} = 'verified_playable' THEN 0 WHEN ${movies.catalogStatus} = 'official_external_playback' THEN 1 ELSE 2 END`,
          desc(movies.featured),
          desc(movies.id)
        )
        .limit(limit);
    });

    return NextResponse.json(result.map((row) => normalizeMovie(row as Record<string, unknown>)));
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
