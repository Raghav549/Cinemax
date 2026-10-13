import { NextRequest, NextResponse } from "next/server";
import { categories } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { categoryInput, normalizeCategory, ValidationError } from "@/db/rows";
import { badRequest, isAdmin, parseId, readJson, unauthorized } from "@/lib/api";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await withDb((db) =>
      db.select().from(categories).orderBy(asc(categories.name))
    );
    return NextResponse.json(result.map((row) => normalizeCategory(row as Record<string, unknown>)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[api/categories] GET failed:", e);
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
      values = categoryInput(body);
    } catch (error) {
      if (error instanceof ValidationError) return badRequest(error.message);
      throw error;
    }

    // A duplicate slug would otherwise surface as a raw 23505 from Postgres.
    const clash = await withDb((db) =>
      db.select({ id: categories.id }).from(categories).where(eq(categories.slug, values.slug)).limit(1)
    );
    if (clash.length) return badRequest(`A category with the slug "${values.slug}" already exists`);

    const result = await withDb((db) => db.insert(categories).values(values).returning());
    return NextResponse.json(normalizeCategory(result[0] as Record<string, unknown>), { status: 201 });
  } catch (e) {
    console.error("[api/categories] POST failed:", e);
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
      db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id })
    );
    if (!removed.length) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    return NextResponse.json({ success: true, id });
  } catch (e) {
    console.error("[api/categories] DELETE failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}
