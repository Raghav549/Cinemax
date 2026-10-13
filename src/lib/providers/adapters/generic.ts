import type { ProviderAdapter } from "../types";
import { displayHost, parseShareUrl } from "../url";

/**
 * The two catch-all adapters:
 *
 *  · `genericEmbedAdapter` recognises URLs that already point at a hosted
 *    embeddable player (…/embed/…, player.…, embed.…) and shows that official
 *    player inside Cinemax - only for https URLs, never arbitrary HTML.
 *
 *  · `unknownPageAdapter` is the honest fallback for every other public page:
 *    Cinemax does not scrape or blindly load arbitrary HTML in a privileged
 *    frame, so the link resolves to the in-app provider page with an
 *    "open the original link" action.
 */

export const genericEmbedAdapter: ProviderAdapter = {
  info: {
    id: "generic-embed",
    name: "Embedded player",
    tagline: "This page hosts an official embeddable video player.",
    accent: "#7c8cf8",
    requirements: { login: false, subscription: false, drm: false },
    restriction: "If the page’s own player rejects the embed, the original link is preserved below.",
  },
  match(url) {
    const host = url.hostname.toLowerCase();
    return url.pathname.includes("/embed") || host.startsWith("player.") || host.startsWith("embed.") || host.startsWith("play.");
  },
  parse(url) {
    // Only https pages are ever loaded as embeds; everything else falls through
    // to the unsupported-page hand-off.
    const secure = parseShareUrl(url.toString(), true);
    if (!secure.ok) return null;
    const host = url.hostname.toLowerCase();
    const looksLikePlayer = url.pathname.includes("/embed") || host.startsWith("player.") || host.startsWith("embed.") || host.startsWith("play.");
    if (!looksLikePlayer) return null;
    return {
      kind: "page",
      contentId: null,
      canonicalUrl: url.toString(),
      playback: {
        strategy: "embed",
        src: url.toString(),
        embedTitle: `${displayHost(url.toString())} player`,
      },
    };
  },
};

export const unknownPageAdapter: ProviderAdapter = {
  info: {
    id: "web",
    name: "This website",
    tagline: "Cinemax plays this link through the site’s own experience.",
    accent: "#8a93b2",
    requirements: { login: false, subscription: false, drm: false },
    restriction: "Cinemax doesn’t have an integration for this site yet, and won’t load unknown pages inside the app player. The original link is preserved and can be opened in your browser.",
  },
  match() {
    return true;
  },
  parse(url) {
    return {
      kind: "page",
      contentId: null,
      canonicalUrl: url.toString(),
      playback: {
        strategy: "external",
        reason: "unsupported",
        message: "Cinemax can’t play this site inside the app. Open the original link to watch it on the provider’s own website.",
        actionLabel: "Open original link",
      },
    };
  },
};
