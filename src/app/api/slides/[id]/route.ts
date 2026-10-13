import { NextRequest, NextResponse } from "next/server";
import { slides } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { normalizeSlide, slidePatch, ValidationError } from "@/db/rows";
import { badRequest, isAdmin, notFound, parseId, readJson, unauthorized } from "@/lib/api";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) return badRequest("Invalid id");

    const result = await withDb((db) => db.select().from(slides).where(eq(slides.id, id)));
    if (!result.length) return notFound("Slide not found");

    return NextResponse.json(normalizeSlide(result[0] as Record<string, unknown>), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/slides/:id] GET failed:", e);
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

    let patch;
    try {
      patch = slidePatch(body);
    } catch (error) {
      if (error instanceof ValidationError) return badRequest(error.message);
      throw error;
    }

    const result = await withDb((db) =>
      db.update(slides).set(patch).where(eq(slides.id, id)).returning()
    );
    if (!result.length) return notFound("Slide not found");

    return NextResponse.json(normalizeSlide(result[0] as Record<string, unknown>), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/slides/:id] PUT failed:", e);
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

    const removed = await withDb((db) => db.delete(slides).where(eq(slides.id, id)).returning({ id: slides.id }));
    if (!removed.length) return notFound("Slide not found");

    return NextResponse.json({ success: true, id }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/slides/:id] DELETE failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500 });
  }
}
