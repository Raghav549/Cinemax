import { NextRequest, NextResponse } from "next/server";
import { slides } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { normalizeSlide, slideInput, ValidationError } from "@/db/rows";
import { badRequest, isAdmin, readJson, unauthorized } from "@/lib/api";
import { asc, eq, isNull, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await withDb((db) =>
      db
        .select()
        .from(slides)
        // `active` is nullable: rows inserted straight into Postgres leave it
        // NULL, and `active = true` silently hid those slides from the hero.
        .where(or(eq(slides.active, true), isNull(slides.active)))
        .orderBy(asc(slides.sortOrder))
    );
    return NextResponse.json(result.map((row) => normalizeSlide(row as Record<string, unknown>)));
  } catch (e) {
    console.error("[api/slides] GET failed:", e);
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
      values = slideInput(body);
    } catch (error) {
      if (error instanceof ValidationError) return badRequest(error.message);
      throw error;
    }

    const result = await withDb((db) => db.insert(slides).values(values).returning());
    return NextResponse.json(normalizeSlide(result[0] as Record<string, unknown>), { status: 201 });
  } catch (e) {
    console.error("[api/slides] POST failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}
