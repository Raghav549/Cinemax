import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, type SafeUser } from "@/lib/miley-auth";

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; }
}

export async function authenticatedUser(request: NextRequest, requireVerified = false): Promise<SafeUser | NextResponse> {
  const user = await getSessionUser(request);
  if (!user) return fail("Sign in to continue.", 401);
  if (requireVerified && !user.emailVerified) return fail("Verify your email address to use this feature.", 403);
  return user;
}

export function isSafeUser(value: SafeUser | NextResponse): value is SafeUser {
  return !(value instanceof NextResponse);
}

export function jsonError(error: unknown, fallback = "The request could not be completed.", status = 500): NextResponse {
  const message = error instanceof Error ? error.message : fallback;
  return fail(message || fallback, status);
}

export function asString(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parsePositiveId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function parseVisibility(value: unknown): "public" | "private" | null {
  return value === "public" || value === "private" ? value : null;
}

export function userMessage(response: NextResponse): NextResponse { return response; }
