import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, revokeRequestSession } from "@/lib/miley-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  try { await revokeRequestSession(request); }
  catch (error) { console.error("[auth] session revocation failed:", error instanceof Error ? error.message : "unknown error"); }
  return clearSessionCookie(response);
}
