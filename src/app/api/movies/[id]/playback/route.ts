import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { movies } from "@/db/schema";
import { describeDbError, withDb } from "@/db/with-db";
import { badRequest, notFound, parseId } from "@/lib/api";
import { publicMovie } from "@/lib/movies";
import { needsServerResolution } from "@/lib/playback/classify";
import { resolveWebPlayback } from "@/lib/playback/web-resolver";
import { resolveShareLink } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Playback plan for a catalogue title's stored source (read-only).
 *
 * The movie's own sanitised `videoUrl` is used - the client never supplies a
 * URL here, so this route cannot be pointed at arbitrary hosts. Unidentified web
 * links are inspected on the server (see `web-resolver.ts`); everything else is
 * resolved from the registry exactly as the client would.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) return badRequest("Invalid id");

    const rows = await withDb((db) => db.select().from(movies).where(eq(movies.id, id)).limit(1));
    if (!rows.length) return notFound("Movie not found");

    const movie = publicMovie(rows[0] as Record<string, unknown>);
    if (!movie.videoUrl.trim()) {
      return NextResponse.json({ error: "This title has no playable source." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    if (!needsServerResolution(movie.videoUrl)) {
      const resolution = resolveShareLink(movie.videoUrl, { allowUnknownDirect: true });
      if (!resolution.ok) {
        return NextResponse.json({ error: resolution.message }, { status: 422, headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ resolution }, { headers: { "Cache-Control": "no-store" } });
    }

    const web = await resolveWebPlayback(movie.videoUrl, { embedderOrigin: req.nextUrl.origin });
    if (!web.ok) {
      return NextResponse.json({ error: web.message }, { status: web.status, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ resolution: web.resolution }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/movies/:id/playback] failed:", e);
    return NextResponse.json({ error: describeDbError(e).message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
