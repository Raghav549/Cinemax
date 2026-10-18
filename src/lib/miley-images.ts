import { and, eq } from "drizzle-orm";
import { images } from "@/db/music-schema";
import { withDb } from "@/db/with-db";

/** Validate saved image URLs. Internal MiLey image IDs must be owned by the caller. */
export async function ownedImageUrl(value: unknown, ownerId: number, max = 2000): Promise<string | null> {
  const text = typeof value === "string" ? value.trim().slice(0, max) : "";
  if (!text) return "";
  const internal = text.match(/^\/api\/images\/(\d+)$/);
  if (internal) {
    const id = Number(internal[1]);
    if (!Number.isSafeInteger(id) || id < 1) return null;
    const rows = await withDb((db) => db.select({ id: images.id }).from(images).where(and(eq(images.id, id), eq(images.ownerId, ownerId))).limit(1));
    return rows.length ? text : null;
  }
  try {
    const url = new URL(text);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}
