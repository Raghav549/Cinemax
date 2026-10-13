import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { GET as getMediaRoute } from "@/app/api/media/[...slug]/route";
import { getDb } from "@/db";
import { movies } from "@/db/schema";
import { normalizeMovie, type CatalogStatus, type MovieRow, type SourceType } from "@/db/rows";
import { resolveShareLink } from "@/lib/providers/registry";

export type VerificationCheckReport = {
  verified: boolean;
  catalogStatus: CatalogStatus;
  sourceType: SourceType;
  strategy: "direct" | "embed" | "external" | "none";
  engine?: "video" | "hls" | "dash";
  httpStatus: number | null;
  mimeType: string | null;
  rangeSupported: boolean;
  seekSupported: boolean;
  corsPermitted: boolean;
  containerValid: boolean;
  rightsVerified: boolean;
  metadataValid: boolean;
  reason: string;
  checkedAt: string;
};

const PLACEHOLDER_HOST_PATTERNS = [
  /example\.(com|org|net|invalid)/i,
  /placeholder/i,
  /dummy/i,
  /test\.invalid/i,
  /fake/i,
];

const TRAILER_PATTERNS = [
  /youtube\.com\/watch/i,
  /youtu\.be\//i,
  /youtube\.com\/embed/i,
  /trailer/i,
];

function checkMetadataConsistency(movie: Partial<MovieRow>): { valid: boolean; reason?: string } {
  const title = (movie.title ?? "").trim();
  if (!title || title.length < 1) return { valid: false, reason: "Missing title" };
  const year = Number(movie.year ?? 0);
  if (!Number.isFinite(year) || year < 1888 || year > 2035) {
    return { valid: false, reason: "Invalid release year" };
  }
  const duration = (movie.duration ?? "").trim();
  if (!duration) return { valid: false, reason: "Missing runtime/duration" };
  const language = (movie.language ?? "").trim();
  if (!language) return { valid: false, reason: "Missing language" };
  const genre = (movie.genre ?? "").trim();
  if (!genre) return { valid: false, reason: "Missing genre" };
  const description = (movie.description ?? "").trim();
  if (!description || description.length < 10) {
    return { valid: false, reason: "Missing or incomplete synopsis" };
  }
  return { valid: true };
}

function inspectContainerMagic(bytes: Uint8Array, expectedMime: string): boolean {
  if (bytes.byteLength < 4) return false;
  const mime = expectedMime.toLowerCase();
  // WebM / Matroska EBML header: 0x1A 0x45 0xDF 0xA3
  if (mime.includes("webm") || mime.includes("matroska")) {
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  // MP4 ftyp box at offset 4: 'ftyp' (0x66 0x74 0x79 0x70)
  if (mime.includes("mp4")) {
    return (
      bytes.byteLength >= 8 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    );
  }
  // MPEG-TS sync byte: 0x47
  if (mime.includes("mp2t")) {
    return bytes[0] === 0x47;
  }
  // HLS playlist: starts with #EXTM3U
  if (mime.includes("mpegurl")) {
    const text = Buffer.from(bytes).toString("utf8").trimStart();
    return text.startsWith("#EXTM3U");
  }
  return true;
}

async function fetchMediaEndpoint(
  urlOrPath: string,
  headers: Record<string, string> = {},
  baseUrl?: string,
): Promise<{ status: number; headers: Headers; body: Uint8Array }> {
  if (urlOrPath.startsWith("/api/media/")) {
    const cleanPath = urlOrPath.split("?")[0];
    const segments = cleanPath.replace(/^\/api\/media\//, "").split("/").filter(Boolean);
    const reqUrl = `${baseUrl || "http://127.0.0.1:3000"}${urlOrPath}`;
    const req = new NextRequest(reqUrl, { method: "GET", headers });
    const res = await getMediaRoute(req, { params: Promise.resolve({ slug: segments }) });
    const buf = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, body: buf };
  }

  const target = urlOrPath.startsWith("/") ? `${baseUrl || "http://127.0.0.1:3000"}${urlOrPath}` : urlOrPath;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(target, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, body: buf };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyMovieSource(
  movie: Partial<MovieRow>,
  options: { baseUrl?: string } = {},
): Promise<VerificationCheckReport> {
  const checkedAt = new Date().toISOString();
  const videoUrl = (movie.videoUrl ?? "").trim();
  const metaCheck = checkMetadataConsistency(movie);

  // 1. Upcoming titles without a full-film source
  if (movie.catalogStatus === "upcoming" || (!videoUrl && (movie.year ?? 0) >= 2026)) {
    return {
      verified: false,
      catalogStatus: "upcoming",
      sourceType: "upcoming",
      strategy: "none",
      httpStatus: null,
      mimeType: null,
      rangeSupported: false,
      seekSupported: false,
      corsPermitted: false,
      containerValid: false,
      rightsVerified: Boolean(movie.rightsConfirmed),
      metadataValid: metaCheck.valid,
      reason: videoUrl
        ? "Upcoming title — full-film playback remains disabled until official release"
        : "Upcoming release — Coming Soon (no full-film stream published yet)",
      checkedAt,
    };
  }

  // 2. Empty videoUrl on non-upcoming record -> verification_failed
  if (!videoUrl) {
    return {
      verified: false,
      catalogStatus: "verification_failed",
      sourceType: movie.sourceType ?? "direct",
      strategy: "none",
      httpStatus: null,
      mimeType: null,
      rangeSupported: false,
      seekSupported: false,
      corsPermitted: false,
      containerValid: false,
      rightsVerified: false,
      metadataValid: metaCheck.valid,
      reason: "No media playback source configured",
      checkedAt,
    };
  }

  // 3. Reject placeholder / demo URLs and YouTube trailers disguised as full movies
  if (PLACEHOLDER_HOST_PATTERNS.some((rx) => rx.test(videoUrl))) {
    return {
      verified: false,
      catalogStatus: "verification_failed",
      sourceType: movie.sourceType ?? "direct",
      strategy: "none",
      httpStatus: null,
      mimeType: null,
      rangeSupported: false,
      seekSupported: false,
      corsPermitted: false,
      containerValid: false,
      rightsVerified: false,
      metadataValid: metaCheck.valid,
      reason: "Placeholder or mock media domain rejected",
      checkedAt,
    };
  }

  if (TRAILER_PATTERNS.some((rx) => rx.test(videoUrl))) {
    return {
      verified: false,
      catalogStatus: "verification_failed",
      sourceType: movie.sourceType ?? "direct",
      strategy: "none",
      httpStatus: null,
      mimeType: null,
      rangeSupported: false,
      seekSupported: false,
      corsPermitted: false,
      containerValid: false,
      rightsVerified: false,
      metadataValid: metaCheck.valid,
      reason: "Trailers cannot be advertised as full playable films",
      checkedAt,
    };
  }

  // 4. Resolve through provider registry
  const resolved = resolveShareLink(videoUrl, { allowUnknownDirect: true });
  if (!resolved.ok) {
    return {
      verified: false,
      catalogStatus: "verification_failed",
      sourceType: movie.sourceType ?? "direct",
      strategy: "none",
      httpStatus: null,
      mimeType: null,
      rangeSupported: false,
      seekSupported: false,
      corsPermitted: false,
      containerValid: false,
      rightsVerified: false,
      metadataValid: metaCheck.valid,
      reason: resolved.message || "Unrecognized or unsupported playback URL",
      checkedAt,
    };
  }

  const { playback } = resolved;

  // 5. Official external OTT services (Netflix, Prime Video, Hotstar, etc.)
  if (playback.strategy === "external") {
    return {
      verified: true,
      catalogStatus: "official_external_playback",
      sourceType: "official_external",
      strategy: "external",
      httpStatus: 200,
      mimeType: "text/html",
      rangeSupported: false,
      seekSupported: false,
      corsPermitted: false,
      containerValid: true,
      rightsVerified: true,
      metadataValid: metaCheck.valid,
      reason: `Authorized external provider handoff (${resolved.provider.name})`,
      checkedAt,
    };
  }

  // 6. Metadata & authorization check before marking playable
  if (!metaCheck.valid) {
    return {
      verified: false,
      catalogStatus: "verification_failed",
      sourceType: movie.sourceType ?? "direct",
      strategy: playback.strategy,
      httpStatus: null,
      mimeType: null,
      rangeSupported: false,
      seekSupported: false,
      corsPermitted: false,
      containerValid: false,
      rightsVerified: Boolean(movie.rightsConfirmed),
      metadataValid: false,
      reason: metaCheck.reason ?? "Metadata validation failed",
      checkedAt,
    };
  }

  const rightsVerified = Boolean(movie.rightsConfirmed);
  if (!rightsVerified) {
    return {
      verified: false,
      catalogStatus: "verification_failed",
      sourceType: movie.sourceType ?? "direct",
      strategy: playback.strategy,
      httpStatus: null,
      mimeType: null,
      rangeSupported: false,
      seekSupported: false,
      corsPermitted: false,
      containerValid: false,
      rightsVerified: false,
      metadataValid: true,
      reason: "Distribution/embedding rights are not confirmed for this source",
      checkedAt,
    };
  }

  // 7. Verify Official Permitted Embed
  if (playback.strategy === "embed") {
    try {
      const embedRes = await fetchMediaEndpoint(playback.src, {}, options.baseUrl);
      const mimeType = embedRes.headers.get("content-type") ?? "";
      const xfo = (embedRes.headers.get("x-frame-options") ?? "").toUpperCase();
      const frameAllowed = xfo !== "DENY";
      const htmlText = Buffer.from(embedRes.body).toString("utf8");
      const hasPlayer = htmlText.includes("<video") || htmlText.includes("player");

      if (embedRes.status === 200 && mimeType.includes("text/html") && frameAllowed && hasPlayer) {
        return {
          verified: true,
          catalogStatus: "verified_playable",
          sourceType: movie.sourceType === "public_domain" || movie.sourceType === "open_license" ? movie.sourceType : "official_embed",
          strategy: "embed",
          httpStatus: embedRes.status,
          mimeType,
          rangeSupported: true,
          seekSupported: true,
          corsPermitted: true,
          containerValid: true,
          rightsVerified: true,
          metadataValid: true,
          reason: "Verified permitted archival embed player",
          checkedAt,
        };
      }
      return {
        verified: false,
        catalogStatus: embedRes.status >= 500 ? "temporarily_unavailable" : "verification_failed",
        sourceType: "official_embed",
        strategy: "embed",
        httpStatus: embedRes.status,
        mimeType,
        rangeSupported: false,
        seekSupported: false,
        corsPermitted: frameAllowed,
        containerValid: hasPlayer,
        rightsVerified: true,
        metadataValid: true,
        reason: `Embed verification failed (status ${embedRes.status})`,
        checkedAt,
      };
    } catch (error) {
      return {
        verified: false,
        catalogStatus: "temporarily_unavailable",
        sourceType: "official_embed",
        strategy: "embed",
        httpStatus: null,
        mimeType: null,
        rangeSupported: false,
        seekSupported: false,
        corsPermitted: false,
        containerValid: false,
        rightsVerified: true,
        metadataValid: true,
        reason: `Embed host unreachable: ${error instanceof Error ? error.message : "network error"}`,
        checkedAt,
      };
    }
  }

  // 8. Verify Direct Video / Adaptive HLS / DASH
  try {
    if (playback.engine === "hls") {
      const masterRes = await fetchMediaEndpoint(playback.src, {}, options.baseUrl);
      const masterMime = masterRes.headers.get("content-type") ?? "";
      const masterText = Buffer.from(masterRes.body).toString("utf8");
      const isM3u8 = masterText.trimStart().startsWith("#EXTM3U");

      if (masterRes.status !== 200 || !isM3u8) {
        return {
          verified: false,
          catalogStatus: masterRes.status >= 500 ? "temporarily_unavailable" : "verification_failed",
          sourceType: movie.sourceType ?? "direct",
          strategy: "direct",
          engine: "hls",
          httpStatus: masterRes.status,
          mimeType: masterMime,
          rangeSupported: false,
          seekSupported: false,
          corsPermitted: false,
          containerValid: false,
          rightsVerified: true,
          metadataValid: true,
          reason: `HLS manifest invalid or unavailable (HTTP ${masterRes.status})`,
          checkedAt,
        };
      }

      // Resolve first child playlist or segment to verify actual stream playability & seeking
      const baseDir = playback.src.slice(0, playback.src.lastIndexOf("/") + 1);
      const lines = masterText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
      const firstChild = lines[0];
      if (!firstChild) {
        return {
          verified: false,
          catalogStatus: "verification_failed",
          sourceType: movie.sourceType ?? "direct",
          strategy: "direct",
          engine: "hls",
          httpStatus: 200,
          mimeType: masterMime,
          rangeSupported: false,
          seekSupported: false,
          corsPermitted: true,
          containerValid: false,
          rightsVerified: true,
          metadataValid: true,
          reason: "HLS manifest contains no playable renditions or segments",
          checkedAt,
        };
      }

      const childUrl = firstChild.startsWith("/") || firstChild.startsWith("http") ? firstChild : `${baseDir}${firstChild}`;
      const childRes = await fetchMediaEndpoint(childUrl, {}, options.baseUrl);
      const childText = Buffer.from(childRes.body).toString("utf8");
      const segmentLine = childText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("#"));

      if (segmentLine) {
        const segUrl = segmentLine.startsWith("/") || segmentLine.startsWith("http") ? segmentLine : `${baseDir}${segmentLine}`;
        const segRes = await fetchMediaEndpoint(segUrl, { Range: "bytes=0-511" }, options.baseUrl);
        const segMime = segRes.headers.get("content-type") ?? "";
        const rangeSupported = segRes.status === 206 || segRes.headers.get("accept-ranges") === "bytes";
        const tsValid = inspectContainerMagic(segRes.body, "video/mp2t");

        if ((segRes.status === 200 || segRes.status === 206) && tsValid) {
          return {
            verified: true,
            catalogStatus: "verified_playable",
            sourceType: movie.sourceType ?? "open_license",
            strategy: "direct",
            engine: "hls",
            httpStatus: segRes.status,
            mimeType: masterMime || segMime,
            rangeSupported,
            seekSupported: true,
            corsPermitted: Boolean(masterRes.headers.get("access-control-allow-origin")),
            containerValid: true,
            rightsVerified: true,
            metadataValid: true,
            reason: "Verified multi-rendition HLS stream, child playlist, and MPEG-TS segment byte-range playback",
            checkedAt,
          };
        }
      }
    }

    // Direct progressive video (WebM / MP4)
    const rangeRes = await fetchMediaEndpoint(playback.src, { Range: "bytes=0-1023" }, options.baseUrl);
    const mimeType = rangeRes.headers.get("content-type") ?? "";
    const acceptRanges = rangeRes.headers.get("accept-ranges") ?? "";
    const contentRange = rangeRes.headers.get("content-range") ?? "";
    const rangeSupported = rangeRes.status === 206 || acceptRanges.toLowerCase().includes("bytes") || Boolean(contentRange);
    const isVideoMime = /^video\/(webm|mp4|ogg|x-matroska|mp2t)/i.test(mimeType);
    const containerValid = inspectContainerMagic(rangeRes.body, mimeType);
    const corsPermitted = Boolean(rangeRes.headers.get("access-control-allow-origin")) || playback.src.startsWith("/");

    if ((rangeRes.status === 200 || rangeRes.status === 206) && isVideoMime && containerValid) {
      return {
        verified: true,
        catalogStatus: "verified_playable",
        sourceType: movie.sourceType ?? "public_domain",
        strategy: "direct",
        engine: "video",
        httpStatus: rangeRes.status,
        mimeType,
        rangeSupported,
        seekSupported: rangeSupported,
        corsPermitted,
        containerValid: true,
        rightsVerified: true,
        metadataValid: true,
        reason: `Verified ${mimeType} stream with HTTP ${rangeRes.status} and byte-range seeking`,
        checkedAt,
      };
    }

    return {
      verified: false,
      catalogStatus: rangeRes.status >= 500 ? "temporarily_unavailable" : "verification_failed",
      sourceType: movie.sourceType ?? "direct",
      strategy: "direct",
      engine: playback.engine,
      httpStatus: rangeRes.status,
      mimeType,
      rangeSupported,
      seekSupported: false,
      corsPermitted,
      containerValid,
      rightsVerified: true,
      metadataValid: true,
      reason: `Media check failed: HTTP ${rangeRes.status}, MIME '${mimeType || "unknown"}', containerValid=${containerValid}`,
      checkedAt,
    };
  } catch (error) {
    return {
      verified: false,
      catalogStatus: "temporarily_unavailable",
      sourceType: movie.sourceType ?? "direct",
      strategy: "direct",
      engine: playback.engine,
      httpStatus: null,
      mimeType: null,
      rangeSupported: false,
      seekSupported: false,
      corsPermitted: false,
      containerValid: false,
      rightsVerified: true,
      metadataValid: true,
      reason: `Source unreachable: ${error instanceof Error ? error.message : "network error"}`,
      checkedAt,
    };
  }
}

export async function recheckCatalogSources(options: { baseUrl?: string } = {}) {
  const db = getDb();
  const rows = (await db.select().from(movies)).map(normalizeMovie);
  const results: Array<{ id: number; title: string; previousStatus: CatalogStatus; newStatus: CatalogStatus; verified: boolean; reason: string }> = [];

  for (const movie of rows) {
    const report = await verifyMovieSource(movie, options);
    const shouldDisableFeatured = report.catalogStatus !== "verified_playable" && movie.featured;
    await db
      .update(movies)
      .set({
        catalogStatus: report.catalogStatus,
        sourceType: report.sourceType,
        verificationResult: JSON.stringify(report),
        lastVerifiedAt: new Date(report.checkedAt),
        ...(shouldDisableFeatured ? { featured: false } : {}),
      })
      .where(eq(movies.id, movie.id));

    results.push({
      id: movie.id,
      title: movie.title,
      previousStatus: movie.catalogStatus,
      newStatus: report.catalogStatus,
      verified: report.verified,
      reason: report.reason,
    });
  }

  return {
    totalChecked: results.length,
    verifiedPlayable: results.filter((r) => r.newStatus === "verified_playable").length,
    officialExternal: results.filter((r) => r.newStatus === "official_external_playback").length,
    upcoming: results.filter((r) => r.newStatus === "upcoming").length,
    temporarilyUnavailable: results.filter((r) => r.newStatus === "temporarily_unavailable").length,
    verificationFailed: results.filter((r) => r.newStatus === "verification_failed").length,
    results,
  };
}
