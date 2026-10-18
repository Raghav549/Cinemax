import { and, eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { accountEmailBase, createAuthToken, createSession, hashPassword, safeUser, sendAccountEmail, setSessionCookie, validBirthDate, validEmail, validatePassword, validUsername } from "@/lib/miley-auth";
import { asString, fail, readBody } from "@/lib/miley-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genders = new Set(["woman", "man", "non_binary", "self_describe", "prefer_not_to_say"]);
const VERIFY_LIFETIME = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const body = await readBody(request);
  if (!body) return fail("Please submit valid registration details.");
  if (body.acceptedTerms !== true) return fail("Please accept the Terms and Privacy Policy to create an account.");

  const email = asString(body.email, 320).toLowerCase();
  const username = asString(body.username, 30).toLowerCase();
  const displayName = asString(body.displayName, 100);
  const password = typeof body.password === "string" ? body.password : "";
  const birthDate = asString(body.birthDate, 10);
  const gender = asString(body.gender, 40) || "prefer_not_to_say";

  if (!validEmail(email)) return fail("Enter a valid email address.");
  if (!validUsername(username)) return fail("Username must be 3–30 characters: lowercase letters, numbers, and underscores.");
  if (displayName.length < 2) return fail("Enter your name as you would like it to appear.");
  const passwordError = validatePassword(password);
  if (passwordError) return fail(passwordError);
  const birth = validBirthDate(birthDate);
  if (!birth.valid) return fail(birth.message);
  if (!genders.has(gender)) return fail("Choose an available gender option.");

  try {
    const duplicate = await withDb((db) => db.select({ id: users.id }).from(users)
      .where(or(eq(users.email, email), eq(users.username, username))).limit(1));
    if (duplicate.length) return fail("That email or username is already in use.", 409);

    const passwordHash = await hashPassword(password);
    const created = await withDb((db) => db.insert(users).values({
      email, username, displayName, passwordHash, birthDate, gender,
    }).returning());
    const user = created[0];
    if (!user) return fail("Your account could not be created. Please try again.", 500);

    const token = await createAuthToken(user.id, "verify_email", VERIFY_LIFETIME);
    const base = accountEmailBase(request.nextUrl.origin);
    const verificationUrl = base ? `${base}/verify?token=${encodeURIComponent(token)}` : "";
    let emailSent = false;
    if (verificationUrl) {
      const safeUrl = verificationUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      try {
        emailSent = await sendAccountEmail(email, "Verify your MiLey email", `<p>Welcome to MiLey.</p><p>Confirm your email address to finish setting up your account:</p><p><a href="${safeUrl}">Verify email</a></p><p>This link expires in 24 hours. If you did not create this account, ignore this email.</p>`);
      } catch (error) {
        console.error("[auth] verification email delivery failed:", error instanceof Error ? error.message : "unknown error");
      }
    }

    const sessionToken = await createSession(user.id);
    const response = NextResponse.json({
      user: safeUser(user),
      emailVerificationRequired: true,
      emailSent,
      message: emailSent
        ? "Check your inbox for a verification link."
        : "Your account is saved. Email verification delivery is not configured yet.",
      ...(process.env.NODE_ENV !== "production" && verificationUrl ? { developmentVerificationUrl: verificationUrl } : {}),
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
    response.cookies.set("miley_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "23505") return fail("That email or username is already in use.", 409);
    console.error("[auth] registration failed:", error instanceof Error ? error.message : "unknown error");
    return fail("Registration is temporarily unavailable. Check the database configuration and try again.", 503);
  }
}
