import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channels, tracks, uploads } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, asString, fail, isSafeUser, parseVisibility, readBody } from "@/lib/miley-api";
import { objectStorageConfig, presignObject } from "@/lib/storage/s3";
import { ownedImageUrl } from "@/lib/miley-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/flac", "audio/x-flac", "audio/ogg", "audio/opus", "audio/webm"]);
const EXTENSIONS: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/flac": "flac", "audio/x-flac": "flac", "audio/ogg": "ogg", "audio/opus": "opus", "audio/webm": "webm" };

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const storage = objectStorageConfig();
  if (!storage) return fail("Durable uploads are not configured. Set the S3-compatible storage variables in the server environment.", 503);
  const body = await readBody(request);
  if (!body) return fail("Upload details were invalid.");
  const title = asString(body.title, 200);
  const artist = asString(body.artist, 160);
  const albumTitle = asString(body.albumTitle, 200);
  const originalName = asString(body.fileName, 240).split(/[\\/]/).pop() || "audio";
  const contentType = asString(body.contentType, 100).toLowerCase().split(";")[0];
  const size = Number(body.size);
  const sha256 = asString(body.sha256, 64).toLowerCase();
  const parsedVisibility = parseVisibility(body.visibility);
  if (body.visibility !== undefined && !parsedVisibility) return fail("Visibility must be public or private.");
  const visibility = parsedVisibility || "private";
  const language = asString(body.language, 80);
  const genre = asString(body.genre, 80);
  const releaseYear = body.releaseYear === "" || body.releaseYear == null ? null : Number(body.releaseYear);
  const durationSeconds = body.durationSeconds === "" || body.durationSeconds == null ? null : Number(body.durationSeconds);
  const artworkValue = asString(body.artworkUrl, 2000);
  const lyrics = asString(body.lyrics, 50_000);

  if (title.length < 1 || artist.length < 1) return fail("Add a song title and artist name.");
  if (!AUDIO_TYPES.has(contentType)) return fail("Choose an MP3, AAC, WAV, FLAC, OGG, Opus, M4A, or WebM audio file.");
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_AUDIO_BYTES) return fail("Audio files must be 60 MB or smaller.");
  if (!/^[a-f0-9]{64}$/.test(sha256)) return fail("The file fingerprint could not be read. Please select the file again.");
  if (body.rightsConfirmed !== true) return fail("Confirm that you own or are authorized to upload and share this recording.");
  if (visibility === "public" && body.rightsConfirmed !== true) return fail("Confirm distribution rights before publishing.");
  if (releaseYear !== null && (!Number.isInteger(releaseYear) || releaseYear < 1900 || releaseYear > new Date().getFullYear() + 1)) return fail("Enter a reasonable release year.");
  if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 24 * 60 * 60)) return fail("The audio duration is not valid.");

  try {
    const artworkUrl = await ownedImageUrl(artworkValue, user.id);
    if (artworkUrl === null) return fail("Track artwork must be your own MiLey image or a secure HTTPS link.");
    const creator = await withDb((db) => db.select({ id: channels.id }).from(channels).where(eq(channels.ownerId, user.id)).limit(1));
    if (!creator.length) return fail("Create your MiLey channel before uploading music.", 409);
    const duplicate = await withDb((db) => db.select({ id: tracks.id }).from(tracks)
      .where(and(eq(tracks.ownerId, user.id), eq(tracks.sha256, sha256))).limit(1));
    if (duplicate.length) return fail("This file is already in your library.", 409);

    const extension = EXTENSIONS[contentType];
    const objectKey = `miley/${user.id}/${crypto.randomUUID()}.${extension}`;
    const metadata = { title, artist, albumTitle, durationSeconds, artworkUrl, lyrics, language, genre, releaseYear, visibility, rightsConfirmed: true };
    const upload = await withDb((db) => db.insert(uploads).values({
      userId: user.id,
      objectKey,
      originalName: originalName.replace(/[\u0000-\u001f]/g, "").slice(0, 240),
      contentType,
      expectedSize: size,
      claimedSha256: sha256,
      trackMetadata: metadata,
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),
    }).returning({ id: uploads.id }));
    const url = presignObject(storage, "PUT", objectKey, 900, contentType);
    return NextResponse.json({ uploadId: upload[0].id, uploadUrl: url, requiredHeaders: { "Content-Type": contentType }, expiresInSeconds: 900 }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[music:upload] presign failed:", error instanceof Error ? error.message : "unknown error");
    return fail("An upload could not be prepared. Please try again.", 503);
  }
}
