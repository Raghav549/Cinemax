/**
 * Provider adapter contracts for the universal share-link system.
 *
 * A share link is not necessarily a playable video URL: subscription services
 * (Netflix, Prime Video, Hotstar, …) prohibit third-party embedding and protect
 * their streams with DRM. Each adapter is honest about what Cinemax can do with
 * a link - play it in the integrated player, embed the provider's own official
 * player, or hand off to the official service - and never claims to bypass a
 * provider's restrictions.
 *
 * New platforms are added by implementing {@link ProviderAdapter} and
 * registering it in `registry.ts`; the player never needs to change.
 */

/** What the link points at, as precisely as the provider's URL format allows. */
export type ContentKind =
  | "video"
  | "short"
  | "live"
  | "clip"
  | "reel"
  | "episode-page"
  | "page"
  | "file"
  | "stream";

/** How Cinemax is allowed to play this content. */
export type PlaybackStrategy =
  /** Native Cinemax player (direct file, HLS or DASH source). */
  | "direct"
  /** The provider's own official embeddable player, shown inside Cinemax. */
  | "embed"
  /** No permitted embedding: show the in-app provider page with an official CTA. */
  | "external";

/** Media engine used for a `direct` plan. */
export type DirectEngine = "video" | "hls" | "dash";

export interface ProviderRequirements {
  /** Viewing needs a signed-in account on the provider. */
  login: boolean;
  /** Viewing needs a paid subscription on the provider. */
  subscription: boolean;
  /** Streams are DRM-protected and can only play in the provider's own player. */
  drm: boolean;
}

export interface ProviderInfo {
  /** Stable adapter id, e.g. "youtube". */
  id: string;
  /** Display name, e.g. "Disney+ Hotstar". */
  name: string;
  /** One-line description used on the in-app provider page. */
  tagline: string;
  /** Accent colour for the provider badge (CSS colour). */
  accent: string;
  requirements: ProviderRequirements;
  /**
   * Human-readable embedding restriction shown when the strategy is `external`.
   * Written to be accurate: it explains why playback happens on the official
   * service rather than pretending the link can be embedded.
   */
  restriction?: string;
}

export type PlaybackPlan =
  | {
      strategy: "direct";
      /** Absolute, validated media URL handed to the native player. */
      src: string;
      engine: DirectEngine;
    }
  | {
      strategy: "embed";
      /** Absolute URL of the provider's official embed player (https only). */
      src: string;
      /** Describes whose controls are inside the frame - they are preserved, not replaced. */
      embedTitle: string;
    }
  | {
      strategy: "external";
      reason: "drm" | "subscription" | "login" | "unsupported";
      /** Copy shown on the provider page, explaining what happens next. */
      message: string;
      /** Label of the primary action, e.g. "Play on Netflix". */
      actionLabel: string;
    };

export interface LinkResolution {
  ok: true;
  provider: ProviderInfo;
  kind: ContentKind;
  /** Canonical content id (YouTube video id, Netflix title id, …) when the format has one. */
  contentId: string | null;
  /** Canonicalised content URL - what "Play on the official service" opens. */
  canonicalUrl: string;
  /** The original user-supplied URL, preserved verbatim for display and fallback. */
  originalUrl: string;
  playback: PlaybackPlan;
  /**
   * Where official metadata may be fetched from, if the provider publishes an
   * oEmbed-style endpoint that permits it. `null` means no metadata may be
   * fetched - the UI simply shows what the URL itself carries.
   */
  metadataSource: { source: "official-oembed"; endpoint: string } | { source: "url" } | null;
}

export interface LinkRejection {
  ok: false;
  reason: "empty" | "invalid" | "unsafe-scheme";
  message: string;
}

export type LinkResolutionResult = LinkResolution | LinkRejection;

/** Optional official metadata (oEmbed) for a resolved link. */
export interface ShareMetadata {
  title?: string;
  thumbnailUrl?: string;
  author?: string;
  providerId: string;
  contentId: string | null;
  canonicalUrl: string;
}

export interface ParsedProviderContent {
  kind: ContentKind;
  contentId: string | null;
  canonicalUrl: string;
  playback: PlaybackPlan;
}

export interface ProviderAdapter {
  info: ProviderInfo;
  /** Fast host/path inspection. Only ever receives a safely parsed http(s) URL. */
  match(url: URL): boolean;
  /** Provider-specific parse. Return null when the URL shape is not recognised. */
  parse(url: URL): ParsedProviderContent | null;
  /**
   * Official metadata endpoint for this content URL, or null when the provider
   * does not publish one (or does not permit programmatic access). The runtime
   * only ever fetches endpoints returned here, and only over https to the
   * provider's own oEmbed host.
   */
  oembed?(url: URL): string | null;
}

/** Metadata returned by `GET /api/providers/resolve`. */
export interface ResolveApiResponse {
  resolution: LinkResolution;
  metadata: ShareMetadata | null;
}
