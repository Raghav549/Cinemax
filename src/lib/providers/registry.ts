import type {
  LinkResolution,
  LinkResolutionResult,
  ProviderAdapter,
  ShareMetadata,
} from "./types";
import { parseShareUrl } from "./url";

import { youtubeAdapter } from "./adapters/youtube";
import { vimeoAdapter } from "./adapters/vimeo";
import { dailymotionAdapter, facebookAdapter, instagramAdapter, tiktokAdapter, twitchAdapter } from "./adapters/social-video";
import { archiveAdapter, loomAdapter, streamableAdapter, tedAdapter, wistiaAdapter } from "./adapters/embed-hosts";
import { appleTvAdapter, disneyPlusAdapter, hotstarAdapter, jioCinemaAdapter, mxPlayerAdapter, netflixAdapter, primeAdapter, sonyLivAdapter, zee5Adapter } from "./adapters/ott";
import { directMediaAdapter } from "./adapters/direct-media";
import { genericEmbedAdapter, unknownPageAdapter } from "./adapters/generic";
import { isLocalSourcePath, localSourceAdapter } from "./adapters/local-source";

/**
 * The provider registry: detection order is most-specific first, with the two
 * catch-all adapters at the end. Adding a platform means adding one adapter -
 * the player, the provider page and the share-link UI all pick it up from here.
 */
const ADAPTERS: ProviderAdapter[] = [
  youtubeAdapter,
  vimeoAdapter,
  dailymotionAdapter,
  twitchAdapter,
  facebookAdapter,
  instagramAdapter,
  tiktokAdapter,
  streamableAdapter,
  loomAdapter,
  wistiaAdapter,
  tedAdapter,
  archiveAdapter,
  netflixAdapter,
  primeAdapter,
  hotstarAdapter,
  disneyPlusAdapter,
  appleTvAdapter,
  zee5Adapter,
  sonyLivAdapter,
  jioCinemaAdapter,
  mxPlayerAdapter,
  // Direct media wins over the generic-embed heuristic: a .m3u8 URL on any host
  // is a stream, not an HTML embed page.
  directMediaAdapter,
  genericEmbedAdapter,
  unknownPageAdapter,
];

export interface ResolveOptions {
  /**
   * When true, an otherwise-unknown absolute URL resolves to a direct playback
   * attempt instead of the unsupported-site hand-off. Used for studio-curated
   * catalogue sources, which the API has already validated as media URLs -
   * user-pasted share links never enable this.
   */
  allowUnknownDirect?: boolean;
}

/**
 * Identify a share link and choose the playback strategy automatically.
 *
 * Pure URL analysis - no network, no scraping, safe to run on the client and on
 * the server. Returns an honest plan: `direct`, `embed`, or `external` with the
 * reason (DRM, subscription, unsupported) the provider page will show.
 */
export function resolveShareLink(raw: string | null | undefined, options: ResolveOptions = {}): LinkResolutionResult {
  const input = typeof raw === "string" ? raw.trim() : "";

  // Studio-stored same-origin sources (`/api/stream/5`, local library files).
  if (isLocalSourcePath(input)) {
    const url = new URL(input, "https://local.cinemax.invalid");
    const content = localSourceAdapter.parse(url)!;
    return {
      ok: true,
      provider: localSourceAdapter.info,
      kind: content.kind,
      contentId: content.contentId,
      canonicalUrl: input,
      originalUrl: input,
      playback: content.playback,
      metadataSource: null,
    };
  }

  const parsed = parseShareUrl(input);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, message: parsed.message };
  }
  const url = parsed.url;

  for (const adapter of ADAPTERS) {
    if (!adapter.match(url)) continue;
    const content = adapter.parse(url);
    if (!content) continue;
    // Curated catalogue sources may point at a media URL the registry has no
    // specific adapter for (e.g. a signed CDN link with no extension): keep the
    // old direct-playback behaviour for those, never for pasted share links.
    const playback = options.allowUnknownDirect && adapter.info.id === "web"
      ? { strategy: "direct" as const, src: url.toString(), engine: "video" as const }
      : content.playback;
    const resolution: LinkResolution = {
      ok: true,
      provider: options.allowUnknownDirect && adapter.info.id === "web" ? directMediaAdapter.info : adapter.info,
      kind: content.kind,
      contentId: content.contentId,
      canonicalUrl: content.canonicalUrl,
      originalUrl: url.toString(),
      playback,
      metadataSource: adapter.oembed ? { source: "official-oembed", endpoint: adapter.oembed(url) ?? "" } : { source: "url" },
    };
    if (resolution.metadataSource && resolution.metadataSource.source === "official-oembed" && !resolution.metadataSource.endpoint) {
      resolution.metadataSource = { source: "url" };
    }
    return resolution;
  }
  // unreachable: unknownPageAdapter matches everything.
  return { ok: false, reason: "invalid", message: "That link could not be read." };
}

/** Providers the system knows about - used by the docs surface and tests. */
export function listProviders(): ProviderAdapter["info"][] {
  return ADAPTERS.filter((adapter) => adapter.info.id !== "web").map((adapter) => adapter.info);
}

/**
 * Optional official-metadata fetch (server-side). `fetchMetadata` is injected so
 * the client bundle never needs it and the API route can wrap it in its SSRF
 * guards (https-only, oEmbed host allowlist, no redirect escapes, timeout).
 */
export async function fetchShareMetadata(
  resolution: LinkResolution,
  fetcher: (endpoint: string) => Promise<unknown>,
): Promise<ShareMetadata | null> {
  if (!resolution.metadataSource || resolution.metadataSource.source !== "official-oembed") {
    return resolution.metadataSource
      ? {
          providerId: resolution.provider.id,
          contentId: resolution.contentId,
          canonicalUrl: resolution.canonicalUrl,
        }
      : null;
  }
  try {
    const json = await fetcher(resolution.metadataSource.endpoint) as Record<string, unknown> | null;
    if (!json || typeof json !== "object") return null;
    const title = typeof json.title === "string" ? json.title.slice(0, 300) : undefined;
    const thumbnailUrl = typeof json.thumbnail_url === "string" ? json.thumbnail_url : undefined;
    const author = typeof json.author_name === "string" ? json.author_name : undefined;
    return {
      title,
      thumbnailUrl,
      author,
      providerId: resolution.provider.id,
      contentId: resolution.contentId,
      canonicalUrl: resolution.canonicalUrl,
    };
  } catch {
    // Official metadata is a progressive enhancement; failure never blocks playback.
    return {
      providerId: resolution.provider.id,
      contentId: resolution.contentId,
      canonicalUrl: resolution.canonicalUrl,
    };
  }
}
