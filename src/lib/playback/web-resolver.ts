import type { IncomingHttpHeaders } from "node:http";
import { resolveShareLink } from "@/lib/providers/registry";
import { directMediaAdapter } from "@/lib/providers/adapters/direct-media";
import { unknownPageAdapter } from "@/lib/providers/adapters/generic";
import { displayHost } from "@/lib/providers/url";
import type { DirectEngine, LinkResolution, PlaybackPlan, ProviderInfo } from "@/lib/providers/types";
import { SafeFetchError, safeGet, validatePlaybackUrl, type SafeResponse } from "@/lib/playback/safe-fetch";

/**
 * Turns an admin-entered web link into a playback plan the player can use.
 *
 * Order of attempts (first success wins):
 *   1. the URL itself is media (direct file, HLS, DASH - detected by content, not by extension);
 *   2. the URL is an HTML page that names a known provider's official embed (iframe);
 *   3. the page exposes a media URL (<video>/<source>, og:video, JSON-LD, script URLs) that
 *      answers as real media;
 *   4. the page's own player can be framed (no X-Frame-Options / frame-ancestors block) -
 *      the provider's player is shown with its own controls;
 *   5. media that the browser may still play, but that the server cannot confirm (no CORS
 *      for HLS/DASH);
 *   6. otherwise an honest external hand-off with the reason.
 *
 * Nothing here calls private provider APIs or bypasses DRM/login/paywalls: only what
 * the page itself publishes is inspected, and only public URLs are contacted.
 */

const PAGE_MAX_BYTES = 2 * 1024 * 1024;
const PROBE_MAX_BYTES = 64 * 1024;
const FRAME_PROBE_MAX_BYTES = 16 * 1024;
const RESULT_TTL_MS = 5 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 1000;
const CACHE_LIMIT = 300;
const MAX_MEDIA_CANDIDATES = 6;
const MAX_IFRAME_CANDIDATES = 4;

/** Words a page only uses when it actually contains a player. */
const PLAYER_HINT = /<video\b|<iframe\b|\bplayer\b|\bhls\b|\bdash\b|\.m3u8|\.mpd\b|videojs|jwplayer|plyr|artplayer/i;

export type WebPlaybackResult =
  | { ok: true; resolution: LinkResolution }
  | { ok: false; status: number; message: string };

interface CacheEntry { at: number; ttl: number; result: WebPlaybackResult }
const cache = new Map<string, CacheEntry>();

function rememberResult(key: string, result: WebPlaybackResult) {
  const ttl = result.ok && result.resolution.playback.strategy !== "external" ? RESULT_TTL_MS : FAILURE_TTL_MS;
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), ttl, result });
}

function providerFor(url: URL, id: string, tagline: string, restriction?: string): ProviderInfo {
  return {
    id,
    name: displayHost(url.toString()),
    tagline,
    accent: "#8a93b2",
    requirements: { login: false, subscription: false, drm: false },
    restriction,
  };
}

const PAGE_PROVIDER_TAGLINE = "This page’s own player plays inside Cinemax with its own controls.";
const PAGE_PROVIDER_RESTRICTION =
  "Subtitles, quality and speed are the provider’s own controls. Some sites ask you to sign in inside the player.";
const MEDIA_PROVIDER_TAGLINE = "Video found on this page plays in the Cinemax player.";

function makeResolution(originalUrl: string, canonicalUrl: string, provider: ProviderInfo, kind: LinkResolution["kind"], playback: PlaybackPlan): WebPlaybackResult {
  return {
    ok: true,
    resolution: {
      ok: true,
      provider,
      kind,
      contentId: null,
      canonicalUrl,
      originalUrl,
      playback,
      metadataSource: { source: "url" },
    },
  };
}

function header(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name];
  if (Array.isArray(value)) return value.join(", ");
  return value ? String(value) : "";
}

function contentTypeOf(headers: IncomingHttpHeaders): string {
  return header(headers, "content-type").split(";")[0].trim().toLowerCase();
}

/** Media engine from the response itself: content-type first, then file signatures. */
export function classifyMedia(contentType: string, body: Buffer): DirectEngine | null {
  const head = body.subarray(0, 512);
  const text = head.toString("latin1").trimStart();
  if (text.startsWith("#EXTM3U")) return "hls";
  if (contentType === "application/vnd.apple.mpegurl" || contentType === "application/x-mpegurl") return "hls";
  if (contentType === "application/dash+xml" || /<MPD[\s>]/.test(text)) return "dash";
  if (body.length >= 8 && head.subarray(4, 8).toString("latin1") === "ftyp") return "video"; // MP4/MOV family
  if (body.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "video"; // WebM/Matroska
  if (contentType.startsWith("video/") && !text.startsWith("<")) return "video";
  return null;
}

function isHtml(contentType: string, body: Buffer): boolean {
  if (contentType === "text/html" || contentType === "application/xhtml+xml") return true;
  if (contentType.startsWith("video/") || contentType.startsWith("audio/")) return false;
  const start = body.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  return start.startsWith("<!doctype html") || start.startsWith("<html");
}

/** Whether a response's own headers allow it to be framed by `embedderOrigin`. */
export function framingAllowed(headers: IncomingHttpHeaders, embedderOrigin: string | undefined): boolean {
  const xfo = header(headers, "x-frame-options").trim().toUpperCase();
  if (xfo === "DENY" || xfo === "SAMEORIGIN") return false;
  if (xfo.startsWith("ALLOW-FROM")) return Boolean(embedderOrigin) && xfo.includes(String(embedderOrigin).toUpperCase());
  const csp = header(headers, "content-security-policy");
  const match = /frame-ancestors\s+([^;]+)/i.exec(csp);
  if (match) {
    const sources = match[1].trim().split(/\s+/);
    if (sources.includes("*")) return true;
    if (!embedderOrigin) return false;
    const origin = new URL(embedderOrigin);
    return sources.some((source) => {
      const s = source.toLowerCase();
      return s === origin.origin.toLowerCase() || s === origin.host.toLowerCase() || s === origin.hostname.toLowerCase() ||
        (s.startsWith("*.") && origin.hostname.toLowerCase().endsWith(s.slice(1)));
    });
  }
  return true;
}

/** Whether a media response can be fetched by the Cinemax origin (needed for hls.js/dash.js). */
export function corsAllows(headers: IncomingHttpHeaders, embedderOrigin: string | undefined): boolean {
  const allowed = header(headers, "access-control-allow-origin").trim();
  if (allowed === "*") return true;
  return Boolean(embedderOrigin) && allowed === embedderOrigin;
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function absolute(raw: string, base: string): string | null {
  const value = decodeAttribute(raw).replace(/\\\//g, "/");
  if (!value || value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("javascript:")) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function attributeValues(html: string, tagPattern: RegExp, attribute: string): string[] {
  const values: string[] = [];
  for (const tag of html.matchAll(tagPattern)) {
    const match = new RegExp(`\\s${attribute}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag[0]);
    if (match) values.push(match[1]);
  }
  return values;
}

/** Iframe sources on the page, in document order. */
export function extractIframes(html: string, base: string): string[] {
  return attributeValues(html, /<iframe\b[^>]*>/gi, "src")
    .map((value) => absolute(value, base))
    .filter((value): value is string => Boolean(value));
}

/** Media URLs a page publishes, most specific first. */
export function extractMediaCandidates(html: string, base: string): string[] {
  const found: string[] = [];
  const push = (value: string | null | undefined) => {
    if (!value) return;
    if (!found.includes(value)) found.push(value);
  };
  for (const value of attributeValues(html, /<(?:video|source|audio)\b[^>]*>/gi, "src")) push(absolute(value, base));
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const property = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag[0])?.[1]?.toLowerCase() ?? "";
    if (["og:video", "og:video:url", "og:video:secure_url", "twitter:player:stream"].includes(property)) {
      push(absolute(/content\s*=\s*["']([^"']+)["']/i.exec(tag[0])?.[1] ?? "", base));
    }
  }
  for (const match of html.matchAll(/"contentUrl"\s*:\s*"([^"]+)"/gi)) push(absolute(match[1], base));
  const scriptUrls = html.replace(/\\\//g, "/").matchAll(/https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mpd|mp4|webm)(?:\?[^\s"'<>\\]*)?/gi);
  for (const match of scriptUrls) push(absolute(match[0], base));
  // Manifests before progressive files: they are the usual adaptive source.
  return found.sort((a, b) => manifestRank(a) - manifestRank(b)).slice(0, MAX_MEDIA_CANDIDATES);
}

function manifestRank(url: string): number {
  if (/\.(m3u8|mpd)(?:$|[?#])/i.test(url)) return 0;
  if (/\.(mp4|webm)(?:$|[?#])/i.test(url)) return 1;
  return 2;
}

async function probeFrame(url: string, embedderOrigin: string | undefined): Promise<boolean> {
  try {
    const response = await safeGet(url, { maxBytes: FRAME_PROBE_MAX_BYTES, timeoutMs: 6000 });
    return response.status >= 200 && response.status < 300 && framingAllowed(response.headers, embedderOrigin);
  } catch {
    return false;
  }
}

async function resolvePage(page: SafeResponse, rawUrl: string, embedderOrigin: string | undefined): Promise<WebPlaybackResult> {
  const finalUrl = new URL(page.url);
  const html = page.body.toString("utf8");
  const pageWebProvider = providerFor(finalUrl, "web-page", PAGE_PROVIDER_TAGLINE, PAGE_PROVIDER_RESTRICTION);

  // 2. A known provider's official embed used on the page.
  for (const iframe of extractIframes(html, finalUrl.toString()).slice(0, MAX_IFRAME_CANDIDATES)) {
    const strict = resolveShareLink(iframe);
    if (!strict.ok || strict.playback.strategy !== "embed" || strict.provider.id === "web") continue;
    if (await probeFrame(iframe, embedderOrigin)) {
      return makeResolution(rawUrl, finalUrl.toString(), strict.provider, strict.kind, strict.playback);
    }
  }

  // 3. Media the page publishes that answers as real media.
  let corsBlocked: { engine: DirectEngine; src: string; provider: ProviderInfo } | null = null;
  for (const candidate of extractMediaCandidates(html, finalUrl.toString())) {
    let probe: SafeResponse;
    try {
      probe = await safeGet(candidate, { maxBytes: PROBE_MAX_BYTES, timeoutMs: 8000, range: "bytes=0-65535" });
    } catch {
      continue;
    }
    if (probe.status < 200 || probe.status >= 300) continue;
    const engine = classifyMedia(contentTypeOf(probe.headers), probe.body);
    if (!engine) continue;
    const provider = providerFor(new URL(probe.url), "web-media", MEDIA_PROVIDER_TAGLINE);
    if (engine === "video" || corsAllows(probe.headers, embedderOrigin)) {
      return makeResolution(rawUrl, finalUrl.toString(), provider, engine === "video" ? "file" : "stream", { strategy: "direct", src: probe.url, engine });
    }
    corsBlocked ??= { engine, src: probe.url, provider };
  }

  // 4. The page's own player, framed with its own controls.
  const hasPlayer = PLAYER_HINT.test(html);
  const framable = framingAllowed(page.headers, embedderOrigin);
  if (hasPlayer && framable) {
    return makeResolution(rawUrl, finalUrl.toString(), pageWebProvider, "page", {
      strategy: "embed",
      src: finalUrl.toString(),
      embedTitle: `${displayHost(finalUrl.toString())} player`,
    });
  }

  // 5. Media the browser may still play even though the server cannot confirm CORS.
  if (corsBlocked) {
    return makeResolution(rawUrl, finalUrl.toString(), corsBlocked.provider, corsBlocked.engine === "video" ? "file" : "stream", {
      strategy: "direct",
      src: corsBlocked.src,
      engine: corsBlocked.engine,
    });
  }

  // 6. Honest hand-off.
  const reason = !hasPlayer
    ? "Cinemax found no playable video or player on this page."
    : "This page’s player refuses to be shown inside another site, and no playable video file was published on it.";
  return {
    ok: true,
    resolution: {
      ok: true,
      provider: unknownPageAdapter.info,
      kind: "page",
      contentId: null,
      canonicalUrl: finalUrl.toString(),
      originalUrl: rawUrl,
      playback: {
        strategy: "external",
        reason: "unsupported",
        message: `${reason} Open the original link to watch it on the provider’s own website.`,
        actionLabel: "Open original link",
      },
      metadataSource: { source: "url" },
    },
  };
}

async function resolveUncached(rawUrl: string, embedderOrigin: string | undefined): Promise<WebPlaybackResult> {
  const original = validatePlaybackUrl(rawUrl);
  // Known providers never reach here (the caller only sends unidentified/direct links).
  const localDirect = directMediaAdapter.parse(original);

  let response: SafeResponse;
  try {
    response = await safeGet(original, { maxBytes: PAGE_MAX_BYTES, timeoutMs: 10000 });
  } catch (error) {
    if (localDirect) {
      // A plain media link the server could not reach: keep the browser attempt
      // (the browser may have network access the server does not).
      return makeResolution(rawUrl, original.toString(), directMediaAdapter.info, "file", localDirect.playback);
    }
    const message = error instanceof SafeFetchError ? error.message : "The link could not be reached.";
    return { ok: false, status: 502, message: `${message} Check the address and try again.` };
  }

  if (response.status < 200 || response.status >= 300) {
    return { ok: false, status: 502, message: `The link responded with HTTP ${response.status}.` };
  }

  const contentType = contentTypeOf(response.headers);
  const engine = classifyMedia(contentType, response.body);
  if (engine) {
    const finalUrl = response.url;
    const provider = localDirect ? directMediaAdapter.info : providerFor(new URL(finalUrl), "web-media", MEDIA_PROVIDER_TAGLINE);
    return makeResolution(rawUrl, finalUrl, provider, engine === "video" ? "file" : "stream", { strategy: "direct", src: finalUrl, engine });
  }

  if (isHtml(contentType, response.body)) {
    return resolvePage(response, rawUrl, embedderOrigin);
  }

  return { ok: false, status: 415, message: "That link is not a video, a stream or a web page Cinemax can play." };
}

/**
 * Resolve a web link for playback. Cached briefly per URL so repeated
 * playback attempts do not re-fetch the page.
 */
export async function resolveWebPlayback(rawUrl: string, options: { embedderOrigin?: string } = {}): Promise<WebPlaybackResult> {
  let key: string;
  try {
    key = validatePlaybackUrl(rawUrl).toString();
  } catch (error) {
    return { ok: false, status: 422, message: error instanceof Error ? error.message : "That link could not be read." };
  }
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.result;

  let result: WebPlaybackResult;
  try {
    result = await resolveUncached(key, options.embedderOrigin);
  } catch (error) {
    result = { ok: false, status: 502, message: error instanceof Error ? error.message : "The link could not be checked." };
  }
  rememberResult(key, result);
  return result;
}
