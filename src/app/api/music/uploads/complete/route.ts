import { and, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channelSubscriptions, channels, tracks, uploads } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser, parsePositiveId } from "@/lib/miley-api";
import { deleteObject, objectHead, objectStorageConfig, verifyAudioObject } from "@/lib/storage/s3";
import { createNotification } from "@/lib/miley-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, max: number): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function numberOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null; }

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const uploadId = parsePositiveId(body?.uploadId);
  if (!uploadId) return fail("A valid upload id is required.");
  const storage = objectStorageConfig();
  if (!storage) return fail("Durable uploads are not configured on this server.", 503);

  try {
    const pending = await withDb((db) => db.select().from(uploads).where(and(eq(uploads.id, uploadId), eq(uploads.userId, user.id))).limit(1));
    const upload = pending[0];
    if (!upload) return fail("Upload not found.", 404);
    if (upload.completedTrackId) return NextResponse.json({ trackId: upload.completedTrackId, alreadyComplete: true });
    if (upload.expiresAt <= new Date()) return fail("This upload session expired. Start the upload again.", 410);

    const head = await objectHead(storage, upload.objectKey);
    if (!head) return fail("The audio file has not reached storage yet. Retry the upload.", 409);
    if (head.size !== upload.expectedSize) {
      await deleteObject(storage, upload.objectKey).catch(() => undefined);
      return fail("The stored file size does not match the selected file.", 400);
    }
    if (head.contentType && head.contentType !== upload.contentType) {
      await deleteObject(storage, upload.objectKey).catch(() => undefined);
      return fail("The uploaded file type does not match the selected format.", 400);
    }

    const digest = await verifyAudioObject(storage, upload.objectKey, upload.expectedSize, upload.contentType);
    if (digest !== upload.claimedSha256) {
      await deleteObject(storage, upload.objectKey).catch(() => undefined);
      return fail("The uploaded file fingerprint changed. Please retry with the original file.", 400);
    }
    const duplicate = await withDb((db) => db.select({ id: tracks.id }).from(tracks)
      .where(and(eq(tracks.ownerId, user.id), eq(tracks.sha256, digest))).limit(1));
    if (duplicate.length) {
      await deleteObject(storage, upload.objectKey).catch(() => undefined);
      return fail("This audio file is already in your library.", 409);
    }

    const channelRows = await withDb((db) => db.select({ id: channels.id }).from(channels).where(eq(channels.ownerId, user.id)).limit(1));
    if (!channelRows.length) return fail("Create your channel before completing an audio upload.", 409);
    const metadata = upload.trackMetadata as Record<string, unknown>;
    const visibility = metadata.visibility === "public" ? "public" : "private";
    const title = text(metadata.title, 200);
    const artist = text(metadata.artist, 160);
    if (!title || !artist) return fail("The uploaded track needs a title and artist.", 400);

    const inserted = await withDb((db) => db.insert(tracks).values({
      ownerId: user.id,
      channelId: channelRows[0].id,
      title,
      artist,
      albumTitle: text(metadata.albumTitle, 200),
      description: text(metadata.description, 1000),
      durationSeconds: numberOrNull(metadata.durationSeconds),
      artworkUrl: text(metadata.artworkUrl, 2000),
      objectKey: upload.objectKey,
      contentType: upload.contentType,
      fileSize: upload.expectedSize,
      sha256: digest,
      lyrics: text(metadata.lyrics, 50_000),
      language: text(metadata.language, 80),
      genre: text(metadata.genre, 80),
      releaseYear: numberOrNull(metadata.releaseYear),
      visibility,
      rightsConfirmed: true,
      publishedAt: visibility === "public" ? new Date() : null,
    }).returning({ id: tracks.id }));
    await withDb((db) => db.update(uploads).set({ completedTrackId: inserted[0].id }).where(eq(uploads.id, uploadId)));
    if (visibility === "public") {
      const subscribers = await withDb((db) => db.select({ userId: channelSubscriptions.userId }).from(channelSubscriptions).where(eq(channelSubscriptions.channelId, channelRows[0].id)));
      await Promise.all(subscribers.map((subscriber) => createNotification(subscriber.userId, user.id, "channel_release", inserted[0].id)));
    }
    return NextResponse.json({ trackId: inserted[0].id, verified: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[music:upload] completion failed:", error instanceof Error ? error.message : "unknown error");
    return fail("MiLey could not verify this upload. Check storage access and try again.", 503);
  }
}
