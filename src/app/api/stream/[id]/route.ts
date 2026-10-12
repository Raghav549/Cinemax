import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { movies } from "@/db/schema";
import { withDb } from "@/db/with-db";
import { normalizeMovie } from "@/db/rows";
import { parseId } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function gatewayUrl(): URL | null {
  const raw = process.env.TORRENT_GATEWAY_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (!(["https:", "http:"].includes(url.protocol)) || (!isLocal && url.protocol !== "https:") || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

async function streamMovie(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (process.env.TORRENT_STREAMING_ENABLED !== "true") {
    return jsonError("Magnet playback is not enabled on this server.", 503);
  }

  const endpoint = gatewayUrl();
  const gatewayToken = process.env.TORRENT_GATEWAY_TOKEN;
  if (!endpoint || !gatewayToken) {
    return jsonError("The authorized torrent gateway is not configured.", 503);
  }

  try {
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (id === null) return jsonError("Invalid movie id.", 400);

    const rows = await withDb((db) => db.select().from(movies).where(eq(movies.id, id)).limit(1));
    if (!rows.length) return jsonError("Movie not found.", 404);

    const movie = normalizeMovie(rows[0] as Record<string, unknown>);
    if (!movie.rightsConfirmed) return jsonError("This title is not cleared for public streaming.", 403);
    if (!movie.videoUrl.toLowerCase().startsWith("magnet:")) return jsonError("This title does not use a magnet source.", 404);

    const headers = new Headers({
      Authorization: `Bearer ${gatewayToken}`,
      "X-Cinemax-Movie-Id": String(movie.id),
      // The source stays between the app server and its configured private gateway;
      // it is never placed in a browser URL or returned by the catalogue API.
      "X-Cinemax-Authorized-Magnet": movie.videoUrl,
      Accept: request.headers.get("accept") || "video/*, application/octet-stream;q=0.9, */*;q=0.1",
    });
    for (const name of ["range", "if-range"] as const) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const upstream = await fetch(endpoint, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      return jsonError("The streaming gateway returned an unsafe redirect.", 502);
    }
    if (![200, 206, 416].includes(upstream.status)) {
      console.warn(`[api/stream] Gateway rejected movie ${movie.id} with HTTP ${upstream.status}`);
      return jsonError(upstream.status === 404 ? "No playable video file was found in this authorized source." : "The streaming gateway could not start this title.", upstream.status === 404 ? 404 : 502);
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (upstream.status !== 416 && contentType && !contentType.startsWith("video/") && !["application/octet-stream", "application/mp4"].includes(contentType)) {
      return jsonError("The configured gateway returned a non-video response.", 502);
    }

    const safeFilename = movie.title.replace(/[^a-z0-9 ._-]/gi, "").trim().slice(0, 100) || "Cinemax-video";
    const responseHeaders = new Headers({
      "Cache-Control": "private, no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${safeFilename}"`,
    });
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (!responseHeaders.has("content-type") && upstream.status !== 416) responseHeaders.set("content-type", "video/mp4");

    return new NextResponse(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (request.signal.aborted) return jsonError("Playback request was cancelled.", 499);
    console.error("[api/stream] Magnet stream failed:", error);
    return jsonError("Could not start the authorized magnet stream.", 502);
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return streamMovie(request, context);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return streamMovie(request, context);
}
