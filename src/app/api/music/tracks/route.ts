import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { channels, tracks, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { fail } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

function dto(row: Record<string, unknown>) {
  return {
    id: Number(row.id), title: String(row.title), artist: String(row.artist), albumTitle: String(row.albumTitle || ""),
    description: String(row.description || ""), lyrics: String(row.lyrics || ""), durationSeconds: row.durationSeconds == null ? null : Number(row.durationSeconds),
    artworkUrl: String(row.artworkUrl || ""), language: String(row.language || ""), genre: String(row.genre || ""),
    releaseYear: row.releaseYear == null ? null : Number(row.releaseYear), visibility: String(row.visibility),
    ownerId: Number(row.ownerId), channelId: Number(row.channelId), channelName: String(row.channelName || ""),
    channelHandle: String(row.channelHandle || ""), ownerUsername: String(row.ownerUsername || ""),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
  };
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  const genre = (request.nextUrl.searchParams.get("genre") || "").trim().slice(0, 80);
  const language = (request.nextUrl.searchParams.get("language") || "").trim().slice(0, 80);
  const limit = Math.max(1, Math.min(50, Number.parseInt(request.nextUrl.searchParams.get("limit") || "24", 10) || 24));
  const offset = Math.max(0, Math.min(5000, Number.parseInt(request.nextUrl.searchParams.get("offset") || "0", 10) || 0));
  try {
    const conditions = [eq(tracks.visibility, "public"), eq(tracks.rightsConfirmed, true), eq(channels.visibility, "public")];
    if (query) {
      const escaped = query.replace(/[\\%_]/g, "\\$&");
      const pattern = `%${escaped}%`;
      conditions.push(or(ilike(tracks.title, pattern), ilike(tracks.artist, pattern), ilike(channels.name, pattern), ilike(tracks.albumTitle, pattern))!);
    }
    if (genre) conditions.push(eq(tracks.genre, genre));
    if (language) conditions.push(eq(tracks.language, language));
    const rows = await withDb((db) => db.select({
      id: tracks.id, title: tracks.title, artist: tracks.artist, albumTitle: tracks.albumTitle,
      description: tracks.description, lyrics: tracks.lyrics, durationSeconds: tracks.durationSeconds, artworkUrl: tracks.artworkUrl,
      language: tracks.language, genre: tracks.genre, releaseYear: tracks.releaseYear, visibility: tracks.visibility,
      ownerId: tracks.ownerId, channelId: tracks.channelId, createdAt: tracks.createdAt,
      channelName: channels.name, channelHandle: channels.handle, ownerUsername: users.username,
    }).from(tracks).innerJoin(channels, eq(tracks.channelId, channels.id)).innerJoin(users, eq(tracks.ownerId, users.id))
      .where(and(...conditions, sql`${users.deletedAt} IS NULL`)).orderBy(desc(tracks.createdAt), desc(tracks.id)).limit(limit).offset(offset));
    return NextResponse.json({ items: rows.map((row) => dto(row as unknown as Record<string, unknown>)), limit, offset }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[music:catalog] lookup failed:", error instanceof Error ? error.message : "unknown error");
    return fail("Music catalogue is unavailable. Check the database configuration.", 503);
  }
}
