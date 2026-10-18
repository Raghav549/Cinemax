import { and, eq, gt, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { blocks, channels, follows, notes, tracks, users } from "@/db/music-schema";
import { withDb } from "@/db/with-db";
import { getSessionUser } from "@/lib/miley-auth";
import { authenticatedUser, asString, fail, isSafeUser, parsePositiveId, readBody } from "@/lib/miley-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const viewer = await getSessionUser(request).catch(() => null);
  if (!viewer) return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
  try {
    const mutualVisibility = sql`(
      ${notes.userId} = ${viewer.id}
      OR EXISTS (
        SELECT 1 FROM miley_follows out
        JOIN miley_follows back ON back.follower_id = out.followed_id AND back.followed_id = out.follower_id
        WHERE out.follower_id = ${viewer.id} AND out.followed_id = ${notes.userId}
      )
    ) AND NOT EXISTS (
      SELECT 1 FROM miley_blocks b
      WHERE (b.blocker_id = ${viewer.id} AND b.blocked_id = ${notes.userId})
         OR (b.blocker_id = ${notes.userId} AND b.blocked_id = ${viewer.id})
    )`;
    const rows = await withDb((db) => db.select({ note: notes, author: users, track: tracks, channel: channels })
      .from(notes).innerJoin(users, eq(notes.userId, users.id)).innerJoin(tracks, eq(notes.trackId, tracks.id)).innerJoin(channels, eq(tracks.channelId, channels.id))
      .where(and(gt(notes.expiresAt, new Date()), mutualVisibility, eq(tracks.visibility, "public"), eq(tracks.rightsConfirmed, true), eq(channels.visibility, "public"), sql`${users.deletedAt} IS NULL`)).limit(100));
    return NextResponse.json({ items: rows.map(({ note, author, track, channel }) => ({
      id: note.id, caption: note.caption, expiresAt: note.expiresAt.toISOString(),
      author: { id: author.id, username: author.username, displayName: author.displayName, avatarUrl: author.avatarUrl },
      track: { id: track.id, title: track.title, artist: track.artist, artworkUrl: track.artworkUrl, durationSeconds: track.durationSeconds, channelHandle: channel.handle },
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("Music notes could not be loaded.", 503); }
}

async function saveNote(request: NextRequest, update: boolean) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  const body = await readBody(request);
  const trackId = parsePositiveId(body?.trackId);
  const caption = asString(body?.caption, 100);
  const hours = Number(body?.expiresInHours ?? 24);
  if (!trackId) return fail("Choose a song for your note.");
  if (!Number.isFinite(hours) || hours < 1 || hours > 24) return fail("A note can last from 1 to 24 hours.");
  try {
    const allowed = await withDb((db) => db.select({ id: tracks.id }).from(tracks).innerJoin(channels, eq(tracks.channelId, channels.id))
      .where(and(eq(tracks.id, trackId), eq(tracks.ownerId, user.id), eq(tracks.visibility, "public"), eq(tracks.rightsConfirmed, true), eq(channels.visibility, "public"))).limit(1));
    if (!allowed.length) return fail("Choose a public track that is cleared for playback.", 403);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const saved = await withDb(async (db) => {
      const existing = await db.select({ id: notes.id }).from(notes).where(eq(notes.userId, user.id)).limit(1);
      if (existing.length) {
        const rows = await db.update(notes).set({ trackId, caption, expiresAt, updatedAt: new Date() }).where(eq(notes.userId, user.id)).returning();
        return rows[0];
      }
      const rows = await db.insert(notes).values({ userId: user.id, trackId, caption, expiresAt }).returning();
      return rows[0];
    });
    return NextResponse.json({ id: saved.id, trackId: saved.trackId, caption: saved.caption, expiresAt: saved.expiresAt.toISOString(), updated: update }, { status: update ? 200 : 201 });
  } catch { return fail("The music note could not be saved.", 503); }
}

export async function POST(request: NextRequest) { return saveNote(request, false); }
export async function PATCH(request: NextRequest) { return saveNote(request, true); }

export async function DELETE(request: NextRequest) {
  const user = await authenticatedUser(request, true);
  if (!isSafeUser(user)) return user;
  try {
    await withDb((db) => db.delete(notes).where(eq(notes.userId, user.id)));
    return NextResponse.json({ deleted: true });
  } catch { return fail("The music note could not be deleted.", 503); }
}
