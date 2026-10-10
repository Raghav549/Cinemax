import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { slides } from "@/db/schema";
import { verifyToken } from "@/lib/auth";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get("admin_token")?.value;
    if (!token || !(await verifyToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: rawId } = await params;
    const id = Number.parseInt(rawId, 10);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await req.json();
    const result = await db.update(slides).set({
      title: body.title,
      subtitle: body.subtitle,
      imageUrl: body.imageUrl,
      movieId: body.movieId,
      sortOrder: body.sortOrder,
      active: body.active,
    }).where(eq(slides.id, id)).returning();
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
    const { id: rawId } = await params;
    const id = Number.parseInt(rawId, 10);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    await db.delete(slides).where(eq(slides.id, id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
