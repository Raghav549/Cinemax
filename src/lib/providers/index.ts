/**
 * Universal share-link & embed playback system.
 *
 * See `types.ts` for the adapter contract and `registry.ts` for resolution.
 * Nothing in this folder bypasses DRM, subscriptions, paywalls or provider
 * security: links resolve to the provider's permitted playback method, or to
 * the in-app provider page with an official-service action.
 */
export type {
  ContentKind,
  DirectEngine,
  LinkResolution,
  LinkResolutionResult,
  LinkRejection,
  ParsedProviderContent,
  PlaybackPlan,
  PlaybackStrategy,
  ProviderAdapter,
  ProviderInfo,
  ProviderRequirements,
  ResolveApiResponse,
  ShareMetadata,
} from "./types";
export { MAX_URL_LENGTH, displayHost, isBlockedHost, isFetchableMetadataUrl, parseShareUrl } from "./url";
export { fetchShareMetadata, listProviders, resolveShareLink } from "./registry";
export type { ResolveOptions } from "./registry";
