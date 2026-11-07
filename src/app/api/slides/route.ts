import { NextRequest, NextResponse } from "next/server";
import { slides } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { normalizeSlide, slideInput, ValidationError } from "@/db/rows";
import { badRequest, isAdmin, readJson, unauthorized } from "@/lib/api";
import { eq, isNull, or } from "drizzle-orm";
import { latestFirst } from "@/db/slide-order";

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
        // Latest-first: the slide the admin published most recently leads the
        // hero. See `db/slide-order.ts` for the exact (stable) ordering.
        .orderBy(...latestFirst())
    );
    return NextResponse.json(result.map((row) => normalizeSlide(row as Record<string, unknown>)), {
      headers: { "Cache-Control": "no-store" },
    });
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

    // Stamp the creation time explicitly rather than relying on the column
    // default alone: a slide inserted into a database whose `created_at` was
    // added without a default would otherwise have no ordering key and fall
    // to the end of the hero instead of leading it.
    const result = await withDb((db) => db.insert(slides).values({ ...values, createdAt: new Date() }).returning());
    return NextResponse.json(normalizeSlide(result[0] as Record<string, unknown>), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/slides] POST failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}
