import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { slides } from "@/db/schema";
import { verifyToken } from "@/lib/auth";
import { asc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const result = await db
      .select()
      .from(slides)
      .where(eq(slides.active, true))
      .orderBy(asc(slides.sortOrder));
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("admin_token")?.value;
    if (!token || !(await verifyToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const result = await db.insert(slides).values({
      title: body.title,
      subtitle: body.subtitle || "",
      imageUrl: body.imageUrl || "",
      movieId: body.movieId || null,
      sortOrder: body.sortOrder || 0,
      active: body.active !== false,
    }).returning();
    return NextResponse.json(result[0]);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
