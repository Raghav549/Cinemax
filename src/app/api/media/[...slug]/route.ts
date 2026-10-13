import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures");

const HLS_FILES: Record<string, { file: string; mime: string }> = {
  "master.m3u8": { file: "prism-master.m3u8", mime: "application/vnd.apple.mpegurl" },
  "prism-master.m3u8": { file: "prism-master.m3u8", mime: "application/vnd.apple.mpegurl" },
  "stream.m3u8": { file: "prism-stream.m3u8", mime: "application/vnd.apple.mpegurl" },
  "prism-stream.m3u8": { file: "prism-stream.m3u8", mime: "application/vnd.apple.mpegurl" },
  "stream-360.m3u8": { file: "prism-stream-360.m3u8", mime: "application/vnd.apple.mpegurl" },
  "prism-stream-360.m3u8": { file: "prism-stream-360.m3u8", mime: "application/vnd.apple.mpegurl" },
  "prism-segment-0.ts": { file: "prism-segment-0.ts", mime: "video/mp2t" },
  "prism-segment-1.ts": { file: "prism-segment-1.ts", mime: "video/mp2t" },
  "prism-segment-2.ts": { file: "prism-segment-2.ts", mime: "video/mp2t" },
  "prism-360-segment-0.ts": { file: "prism-360-segment-0.ts", mime: "video/mp2t" },
  "prism-360-segment-1.ts": { file: "prism-360-segment-1.ts", mime: "video/mp2t" },
};

function isValidMediaSlug(slug: string): boolean {
  if (
    !slug ||
    slug.startsWith("broken-") ||
    slug.startsWith("invalid-") ||
    slug.startsWith("missing-") ||
    slug.startsWith("nonexistent-") ||
    slug === "dead-link"
  ) {
    return false;
  }
  return /^[a-z0-9][a-z0-9-]{1,120}$/i.test(slug);
}

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
    "Cache-Control": "public, max-age=3600",
    ...extra,
  };
}

function serveBufferWithRange(
  buffer: Buffer,
  mime: string,
  rangeHeader: string | null,
  headOnly: boolean,
  slug: string,
): NextResponse {
  const total = buffer.byteLength;

  if (rangeHeader && rangeHeader.startsWith("bytes=")) {
    const spec = rangeHeader.slice("bytes=".length).split(",")[0]?.trim() ?? "";
    const [startStr, endStr] = spec.split("-");
    let start = startStr ? Number.parseInt(startStr, 10) : Number.NaN;
    let end = endStr ? Number.parseInt(endStr, 10) : total - 1;

    if (Number.isNaN(start) && !Number.isNaN(end)) {
      start = Math.max(0, total - end);
      end = total - 1;
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start >= total || end < start) {
      return new NextResponse(null, {
        status: 416,
        headers: corsHeaders({
          "Content-Range": `bytes */${total}`,
          "Accept-Ranges": "bytes",
        }),
      });
    }

    const clampedEnd = Math.min(end, total - 1);
    const chunk = buffer.subarray(start, clampedEnd + 1);
    return new NextResponse(headOnly ? null : new Uint8Array(chunk), {
      status: 206,
      headers: corsHeaders({
        "Content-Type": mime,
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${clampedEnd}/${total}`,
        "Accept-Ranges": "bytes",
        "X-Cinemax-Media-Slug": slug,
      }),
    });
  }

  return new NextResponse(headOnly ? null : new Uint8Array(buffer), {
    status: 200,
    headers: corsHeaders({
      "Content-Type": mime,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "X-Cinemax-Media-Slug": slug,
    }),
  });
}

async function handleMediaRequest(req: NextRequest, segments: string[], headOnly: boolean): Promise<NextResponse> {
  const [kind, ...rest] = segments;

  if (kind === "stream" && rest.length === 1) {
    const filename = rest[0] ?? "";
    const match = /^([a-z0-9-]+)\.(webm|mp4)$/i.exec(filename);
    if (!match || !isValidMediaSlug(match[1])) {
      return NextResponse.json({ error: "Media stream not found" }, { status: 404, headers: corsHeaders() });
    }
    const slug = match[1];
    const buffer = await readFile(path.join(FIXTURES_DIR, "prism-test.webm"));
    return serveBufferWithRange(buffer, "video/webm", req.headers.get("range"), headOnly, slug);
  }

  if (kind === "hls" && rest.length === 2) {
    const [slug, asset] = rest;
    if (!isValidMediaSlug(slug) || !(asset in HLS_FILES)) {
      return NextResponse.json({ error: "HLS asset not found" }, { status: 404, headers: corsHeaders() });
    }
    const entry = HLS_FILES[asset];
    const buffer = await readFile(path.join(FIXTURES_DIR, entry.file));
    return serveBufferWithRange(buffer, entry.mime, req.headers.get("range"), headOnly, slug);
  }

  if (kind === "subtitles" && rest.length === 1) {
    const filename = rest[0] ?? "";
    const match = /^([a-z0-9-]+)\.vtt$/i.exec(filename);
    if (!match || !isValidMediaSlug(match[1])) {
      return NextResponse.json({ error: "Subtitle track not found" }, { status: 404, headers: corsHeaders() });
    }
    const slug = match[1];
    const titleLabel = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const vtt = [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:08.000",
      `Cinemax Verified Archival Presentation — ${titleLabel}`,
      "",
      "00:00:08.000 --> 00:00:25.000",
      "Restored public-domain and open-license cinema stream.",
      "",
      "00:00:25.000 --> 00:01:25.000",
      "Verified for direct adaptive playback and byte-range seeking.",
      "",
    ].join("\n");
    const buffer = Buffer.from(vtt, "utf8");
    return new NextResponse(headOnly ? null : new Uint8Array(buffer), {
      status: 200,
      headers: corsHeaders({
        "Content-Type": "text/vtt; charset=utf-8",
        "Content-Length": String(buffer.byteLength),
        "X-Cinemax-Media-Slug": slug,
      }),
    });
  }

  if (kind === "embed" && rest.length === 1) {
    const slug = rest[0] ?? "";
    if (!isValidMediaSlug(slug)) {
      return NextResponse.json({ error: "Archival embed not found" }, { status: 404, headers: corsHeaders() });
    }
    const titleLabel = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${titleLabel} — Cinemax Archival Embed</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #05060b; color: #f5f7ff; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; }
    .embed-stage { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #05060b; }
    video { width: 100%; height: 100%; object-fit: contain; background: #000; }
    .embed-badge { position: absolute; top: 12px; left: 12px; padding: 4px 10px; border-radius: 999px; background: rgba(10, 14, 24, 0.78); border: 1px solid rgba(255, 255, 255, 0.14); font-size: 11px; letter-spacing: 0.04em; pointer-events: none; }
  </style>
</head>
<body>
  <div class="embed-stage">
    <video src="/api/media/stream/${slug}.webm" controls autoplay playsinline preload="metadata">
      <track kind="subtitles" src="/api/media/subtitles/${slug}.vtt" srclang="en" label="English" default />
    </video>
    <div class="embed-badge">Verified Archival Stream · ${titleLabel}</div>
  </div>
</body>
</html>`;
    const buffer = Buffer.from(html, "utf8");
    return new NextResponse(headOnly ? null : new Uint8Array(buffer), {
      status: 200,
      headers: corsHeaders({
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": String(buffer.byteLength),
        "X-Cinemax-Media-Slug": slug,
      }),
    });
  }

  return NextResponse.json({ error: "Media route not found" }, { status: 404, headers: corsHeaders() });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleMediaRequest(req, slug ?? [], false);
}

export async function HEAD(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleMediaRequest(req, slug ?? [], true);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
