import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { slides } from "@/db/schema";
import { verifyToken } from "@/lib/auth";
import { asc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("admin_token")?.value;
    if (!token || !(await verifyToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await db.select().from(slides).orderBy(asc(slides.sortOrder));
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
