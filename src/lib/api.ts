import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

/** Parse a route/query id. Returns null when it is not a positive integer. */
export function parseId(rawId: string | null | undefined): number | null {
  if (!rawId) return null;
  const id = Number.parseInt(rawId, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** True when the request carries a valid admin session cookie. */
export async function isAdmin(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("admin_token")?.value;
  if (!token) return false;
  return verifyToken(token);
}

/** 401 response used by every admin-only mutation. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** Read a JSON body, or null when the client sent something unparseable. */
export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
