import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/miley-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[auth] session lookup failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ user: null, error: "Authentication is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
