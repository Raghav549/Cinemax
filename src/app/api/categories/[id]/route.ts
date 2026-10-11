import { NextRequest, NextResponse } from "next/server";
import { categories, movies } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { normalizeCategory, slugify, type CategoryInput, ValidationError } from "@/db/rows";
import { badRequest, isAdmin, notFound, parseId, readJson, unauthorized } from "@/lib/api";
import { and, eq, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) return badRequest("Invalid id");

    const result = await withDb((db) => db.select().from(categories).where(eq(categories.id, id)));
    if (!result.length) return notFound("Category not found");

    return NextResponse.json(normalizeCategory(result[0] as Record<string, unknown>));
  } catch (e) {
    console.error("[api/categories/:id] GET failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isAdmin(req))) return unauthorized();

    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) return badRequest("Invalid id");

    const body = await readJson(req);
    if (!body) return badRequest("Invalid JSON body");

    const rows = await withDb((db) => db.select().from(categories).where(eq(categories.id, id)));
    if (!rows.length) return notFound("Category not found");
    const current = rows[0];

    // Fields the caller did not send keep their stored value, so a slug-only or
    // name-only edit cannot blank the row.
    let patch: Partial<CategoryInput>;
    try {
      patch = {};
      if (body.name !== undefined) {
        const name = String(body.name ?? "").trim();
        if (!name) throw new ValidationError("name is required");
        if (name.length > 200) throw new ValidationError("name must be 200 characters or fewer");
        patch.name = name;
      }
      if (body.slug !== undefined || body.name !== undefined) {
        const requested = String(body.slug ?? "").trim();
        const slug = slugify(requested || patch.name || current.name);
        if (!slug) throw new ValidationError("slug could not be generated from that name");
        if (slug !== current.slug) patch.slug = slug;
      }
      if (body.sortOrder !== undefined) {
        const order = Number(body.sortOrder);
        patch.sortOrder = Number.isFinite(order) ? Math.trunc(order) : (current.sortOrder ?? 0);
      }
      if (Object.keys(patch).length === 0) throw new ValidationError("No fields to update");
    } catch (error) {
      if (error instanceof ValidationError) return badRequest(error.message);
      throw error;
    }

    const result = await withDb(async (db) => {
      if (patch.slug) {
        const clash = await db
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.slug, patch.slug), ne(categories.id, id)))
          .limit(1);
        if (clash.length) return { conflict: true as const };
      }

      return db.transaction(async (tx) => {
        const [updated] = await tx.update(categories).set(patch).where(eq(categories.id, id)).returning();
        // Keep the library attached to the category: movies store the slug, so a
        // renamed slug would otherwise empty that row on the public site.
        if (patch.slug) {
          await tx.update(movies).set({ category: patch.slug }).where(eq(movies.category, current.slug));
        }
        return updated;
      });
    });

    if (!result) return notFound("Category not found");
    if ("conflict" in result) {
      return badRequest(`A category with the slug "${patch.slug}" already exists`);
    }

    return NextResponse.json(normalizeCategory(result as unknown as Record<string, unknown>));
  } catch (e) {
    console.error("[api/categories/:id] PUT failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isAdmin(req))) return unauthorized();

    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) return badRequest("Invalid id");

    const removed = await withDb((db) =>
      db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id })
    );
    if (!removed.length) return notFound("Category not found");

    return NextResponse.json({ success: true, id });
  } catch (e) {
    console.error("[api/categories/:id] DELETE failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}
