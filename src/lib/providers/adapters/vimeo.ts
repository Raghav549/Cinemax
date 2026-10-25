import type { ProviderAdapter } from "../types";
import { preservePlayerSettings } from "../url";

function preserveVimeoPlayerSettings(targetRaw: string, source: URL): string {
  const target = new URL(preservePlayerSettings(targetRaw, source));
  // Vimeo's `h` is the documented privacy hash for unlisted videos.
  const privacyHash = source.searchParams.get("h");
  if (privacyHash && !target.searchParams.has("h")) target.searchParams.set("h", privacyHash);
  return target.toString();
}

/**
 * Vimeo - public videos via the official player.vimeo.com embed and the
 * public oEmbed endpoint. Private/unlisted-with-restriction videos show
 * Vimeo's own notice; the original link stays available as the fallback.
 */

function parseVimeoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host !== "vimeo.com" && host !== "www.vimeo.com" && host !== "player.vimeo.com" && host !== "m.vimeo.com") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  // /123456789 · /video/123456789 · /channels/name/123456789 · /showcase/id/video/123 · /album/id/video/123
  const candidates = [segments[segments.length - 1], segments[0], segments[1]];
  for (const candidate of candidates) {
    if (candidate && /^\d{6,12}$/.test(candidate)) return candidate;
  }
  return null;
}

export const vimeoAdapter: ProviderAdapter = {
  info: {
    id: "vimeo",
    name: "Vimeo",
    tagline: "Public Vimeo videos play in the official Vimeo player.",
    accent: "#1ab7ea",
    requirements: { login: false, subscription: false, drm: false },
    restriction: "Vimeo videos marked private or domain-restricted cannot be embedded and show Vimeo’s own message in the player.",
  },
  match(url) {
    return parseVimeoId(url) !== null || ["vimeo.com", "www.vimeo.com", "player.vimeo.com", "m.vimeo.com"].includes(url.hostname.toLowerCase().replace(/\.$/, ""));
  },
  parse(url) {
    const id = parseVimeoId(url);
    if (!id) return null;
    return {
      kind: "video",
      contentId: id,
      canonicalUrl: `https://vimeo.com/${id}`,
      playback: {
        strategy: "embed",
        // The official player URL can carry unlisted-video hashes and
        // presentation settings; do not rebuild it from only the numeric ID.
        src: url.hostname.toLowerCase() === "player.vimeo.com" && url.pathname.startsWith("/video/")
          ? url.toString()
          : preserveVimeoPlayerSettings(`https://player.vimeo.com/video/${id}?autoplay=1&color=8b5cf6&title=0&byline=0`, url),
        embedTitle: "Vimeo player",
      },

    };
  },
  oembed(url) {
    const id = parseVimeoId(url);
    if (!id) return null;
    return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`;
  },
};
