import { NextRequest, NextResponse } from "next/server";
import { images } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { authenticatedUser, fail, isSafeUser } from "@/lib/miley-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const LIMITS: Record<string, number> = { avatar: 1_500_000, channel_profile: 2_500_000, channel_banner: 3_000_000, artwork: 2_500_000 };

function imageMatches(data: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (type === "image/png") return data.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => data[index] === value);
  if (type === "image/webp") return data.length >= 12 && String.fromCharCode(...data.subarray(0, 4)) === "RIFF" && String.fromCharCode(...data.subarray(8, 12)) === "WEBP";
  return false;
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 3_300_000) return fail("This image request is too large.", 413);
  try {
    const form = await request.formData();
    const file = form.get("file");
    const purpose = String(form.get("purpose") || "avatar");
    if (!(file instanceof File)) return fail("Select an image file.");
    if (!(purpose in LIMITS)) return fail("Choose a supported image purpose.");
    const type = file.type.toLowerCase();
    if (!TYPES.has(type)) return fail("Use a JPEG, PNG, or WebP image. SVG uploads are not accepted.");
    if (file.size < 1 || file.size > LIMITS[purpose]) return fail(`This image must be ${Math.floor(LIMITS[purpose] / 1_000_000)} MB or smaller.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!imageMatches(bytes, type)) return fail("The selected file does not match its image format.");
    const rows = await withDb((db) => db.insert(images).values({ ownerId: user.id, purpose, contentType: type, imageData: Buffer.from(bytes) }).returning({ id: images.id }));
    return NextResponse.json({ id: rows[0].id, url: `/api/images/${rows[0].id}` }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[images] upload failed:", error instanceof Error ? error.message : "unknown error");
    return fail("Image could not be saved. Check database configuration and try again.", 503);
  }
}
