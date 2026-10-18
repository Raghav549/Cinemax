import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { tracks, uploads, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { clearSessionCookie, getSessionUser, verifyPassword } from "@/lib/miley-auth";
import { fail, readBody } from "@/lib/miley-api";
import { deleteObject, objectStorageConfig } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  const current = await getSessionUser(request).catch(() => null);
  if (!current) return fail("Sign in to continue.", 401);
  const body = await readBody(request);
  const password = typeof body?.password === "string" ? body.password : "";
  if (body?.confirmation !== "DELETE") return fail("Type DELETE to confirm account removal.");
  try {
    const account = await withDb((db) => db.select().from(users).where(eq(users.id, current.id)).limit(1));
    if (!account[0] || !await verifyPassword(password, account[0].passwordHash)) return fail("Password is incorrect.", 401);
    const objectKeys = await withDb(async (db) => {
      const [songRows, pendingRows] = await Promise.all([
        db.select({ key: tracks.objectKey }).from(tracks).where(eq(tracks.ownerId, current.id)),
        db.select({ key: uploads.objectKey }).from(uploads).where(eq(uploads.userId, current.id)),
      ]);
      return [...new Set([...songRows.map((row) => row.key), ...pendingRows.map((row) => row.key)])];
    });
    const storage = objectStorageConfig();
    if (objectKeys.length && !storage) {
      return fail("Account was not deleted because stored audio could not be removed. Configure storage or contact the service owner, then retry.", 503);
    }
    if (storage) {
      for (const key of objectKeys) {
        try { await deleteObject(storage, key); }
        catch (error) {
          console.error("[auth] account deletion paused; private object cleanup failed:", error instanceof Error ? error.message : "storage error");
          return fail("Account was not deleted because one or more audio files could not be removed. Check storage access and retry.", 503);
        }
      }
    }
    await withDb((db) => db.delete(users).where(eq(users.id, current.id)));
    return clearSessionCookie(NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } }));
  } catch {
    return fail("Account deletion could not be completed. Please retry or contact the service owner.", 503);
  }
}
