import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { compare, hash } from "bcryptjs";
import type { NextRequest, NextResponse } from "next/server";
import { authLimits, authTokens, sessions, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";

export const SESSION_COOKIE = "miley_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const MINIMUM_AGE = 13;

export type SafeUser = {
  id: number;
  email: string;
  username: string;
  displayName: string;
  birthDate: string;
  gender: string;
  avatarUrl: string;
  bio: string;
  emailVerified: boolean;
  isPrivate: boolean;
  recommendationsEnabled: boolean;
  historyEnabled: boolean;
  createdAt: string | null;
};

export function safeUser(row: typeof users.$inferSelect): SafeUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.displayName,
    birthDate: row.birthDate,
    gender: row.gender,
    avatarUrl: row.avatarUrl,
    bio: row.bio,
    emailVerified: row.emailVerified,
    isPrivate: row.isPrivate,
    recommendationsEnabled: row.recommendationsEnabled,
    historyEnabled: row.historyEnabled,
    createdAt: row.createdAt?.toISOString() ?? null,
  };
}

export function digestSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function validEmail(value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validUsername(value: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(value);
}

export function validatePassword(value: string): string | null {
  if (Buffer.byteLength(value, "utf8") > 72) return "Password must be 72 bytes or fewer.";
  if (value.length < 10) return "Use at least 10 characters.";
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    return "Use a mix of uppercase, lowercase, and numbers.";
  }
  return null;
}

export function validBirthDate(value: string, now = new Date()): { valid: true; age: number } | { valid: false; message: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { valid: false, message: "Enter a valid birth date." };
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return { valid: false, message: "Enter a valid birth date." };
  if (date > now) return { valid: false, message: "Birth date cannot be in the future." };
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < date.getUTCMonth() || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate());
  if (beforeBirthday) age -= 1;
  if (age < MINIMUM_AGE) return { valid: false, message: `You must be at least ${MINIMUM_AGE} to create an account.` };
  if (age > 120) return { valid: false, message: "Enter a reasonable birth date." };
  return { valid: true, age };
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try { return await compare(password, passwordHash); } catch { return false; }
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = digestSecret(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await withDb((db) => db.insert(sessions).values({ userId, tokenHash, expiresAt }));
  return token;
}

export function setSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function getSessionUser(request: NextRequest): Promise<SafeUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  const tokenHash = digestSecret(token);
  const rows = await withDb((db) => db.select({ user: users })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date()), isNull(users.deletedAt)))
    .limit(1));
  const row = rows[0]?.user;
  return row ? safeUser(row) : null;
}

export async function revokeRequestSession(request: NextRequest): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return;
  const tokenHash = digestSecret(token);
  await withDb((db) => db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)));
}

export async function createAuthToken(userId: number, purpose: "verify_email" | "reset_password", lifetimeMs: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = digestSecret(token);
  await withDb(async (db) => {
    await db.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose)));
    await db.insert(authTokens).values({ userId, tokenHash, purpose, expiresAt: new Date(Date.now() + lifetimeMs) });
  });
  return token;
}

export function accountEmailBase(origin: string): string {
  const configured = process.env.MILEY_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "https:" || (process.env.NODE_ENV !== "production" && parsed.hostname === "localhost")) return parsed.origin;
    } catch { /* ignore invalid owner configuration */ }
  }
  return process.env.NODE_ENV === "production" ? "" : origin;
}

export async function sendAccountEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MILEY_MAIL_FROM;
  if (!key || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
    signal: AbortSignal.timeout(12_000),
  });
  return response.ok;
}

export function verificationLink(origin: string, token: string): string {
  const base = accountEmailBase(origin);
  return base ? `${base}/verify?token=${encodeURIComponent(token)}` : "";
}

/** Persistent email-based throttle, so restarts and serverless instances share the limit. */
export async function authLocked(email: string): Promise<boolean> {
  const limitKey = digestSecret(`login:${email}`);
  const rows = await withDb((db) => db.select().from(authLimits).where(eq(authLimits.limitKey, limitKey)).limit(1));
  return Boolean(rows[0]?.lockedUntil && rows[0].lockedUntil > new Date());
}

export async function recordLoginFailure(email: string): Promise<void> {
  const limitKey = digestSecret(`login:${email}`);
  await withDb((db) => db.execute(sql`INSERT INTO miley_auth_limits (limit_key, failures, window_started_at, locked_until)
    VALUES (${limitKey}, 1, now(), NULL)
    ON CONFLICT (limit_key) DO UPDATE SET
      failures = CASE WHEN miley_auth_limits.window_started_at < now() - interval '15 minutes' THEN 1 ELSE miley_auth_limits.failures + 1 END,
      window_started_at = CASE WHEN miley_auth_limits.window_started_at < now() - interval '15 minutes' THEN now() ELSE miley_auth_limits.window_started_at END,
      locked_until = CASE WHEN (CASE WHEN miley_auth_limits.window_started_at < now() - interval '15 minutes' THEN 1 ELSE miley_auth_limits.failures + 1 END) >= 8 THEN now() + interval '15 minutes' ELSE miley_auth_limits.locked_until END`));
}

export async function clearLoginFailures(email: string): Promise<void> {
  const limitKey = digestSecret(`login:${email}`);
  await withDb((db) => db.delete(authLimits).where(eq(authLimits.limitKey, limitKey)));
}
