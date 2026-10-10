import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { movies } from "@/db/schema";
import { verifyToken } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await db.select().from(movies).where(eq(movies.id, parseInt(id)));
    if (!result.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result[0]);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get("admin_token")?.value;
    if (!token || !(await verifyToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();
    const result = await db.update(movies).set({
      title: body.title,
      description: body.description,
      year: body.year,
      rating: body.rating,
      duration: body.duration,
      genre: body.genre,
      language: body.language,
      type: body.type,
      director: body.director,
      cast: body.cast,
      posterUrl: body.posterUrl,
      backdropUrl: body.backdropUrl,
      videoUrl: body.videoUrl,
      category: body.category,
      featured: body.featured,
    }).where(eq(movies.id, parseInt(id))).returning();
    return NextResponse.json(result[0]);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get("admin_token")?.value;
    if (!token || !(await verifyToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await db.delete(movies).where(eq(movies.id, parseInt(id)));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
