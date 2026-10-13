import { NextRequest, NextResponse } from "next/server";
import {
  fetchShareMetadata,
  isFetchableMetadataUrl,
  resolveShareLink,
  type ResolveApiResponse,
  type ShareMetadata,
} from "@/lib/providers";

export const dynamic = "force-dynamic";

/**
 * `GET /api/providers/resolve?url=…`
 *
 * Identifies a share link and returns the playback plan plus - only where the
 * provider officially permits it - title/thumbnail metadata from that
 * provider's own oEmbed endpoint.
 *
 * Security: user URLs are never fetched. The only outbound requests are to a
 * fixed oEmbed host allowlist derived from the registered adapters, over https,
 * with every redirect hop re-validated against the same allowlist (so a
 * redirect can never escape to an internal address), a short timeout, and a
 * small response cap. No credentials, no provider keys, no private addresses.
 * The response never echoes secrets and never proxies page content.
 */

/** The only hosts the server will ever contact, and only for oEmbed JSON. */
const OEMBED_ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  "www.youtube.com",
  "youtube.com",
  "vimeo.com",
  "www.dailymotion.com",
  "www.tiktok.com",
]);

const MAX_REDIRECTS = 2;
const FETCH_TIMEOUT_MS = 4000;
const MAX_METADATA_BYTES = 64 * 1024;

async function safeOembedFetch(endpoint: string): Promise<unknown | null> {
  if (!isFetchableMetadataUrl(endpoint, OEMBED_ALLOWED_HOSTS)) return null;
  let target = endpoint;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(target, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": "CinemaxLinkPreview/1.0" },
        cache: "no-store",
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || hop === MAX_REDIRECTS || !isFetchableMetadataUrl(location, OEMBED_ALLOWED_HOSTS)) return null;
        target = new URL(location, target).toString();
        continue;
      }
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("json")) return null;
      const text = (await response.text()).slice(0, MAX_METADATA_BYTES);
      return JSON.parse(text) as unknown;
    } catch {
      // Timeout, network failure or malformed JSON: metadata is optional.
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("url");
  const resolution = resolveShareLink(raw);

  if (!resolution.ok) {
    return NextResponse.json(
      { error: resolution.message, reason: resolution.reason },
      { status: resolution.reason === "empty" ? 400 : 422 },
    );
  }

  // The endpoint that may be fetched always comes from the adapter registry and
  // must pass the same allowlist as every redirect hop inside safeOembedFetch.
  const source = resolution.metadataSource;
  let metadata: ShareMetadata | null = null;
  if (source) {
    if (source.source === "official-oembed" && source.endpoint) {
      const json = await safeOembedFetch(source.endpoint);
      metadata = await fetchShareMetadata(resolution, async () => {
        if (json === null) throw new Error("metadata unavailable");
        return json;
      });
    } else {
      metadata = {
        providerId: resolution.provider.id,
        contentId: resolution.contentId,
        canonicalUrl: resolution.canonicalUrl,
      };
    }
  }

  const body: ResolveApiResponse = { resolution, metadata };
  return NextResponse.json(body, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
