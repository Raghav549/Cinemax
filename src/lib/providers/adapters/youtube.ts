import type { ProviderAdapter } from "../types";

/**
 * YouTube - videos, Shorts, live streams and embed URLs.
 *
 * YouTube publishes an official, permitted embed player (youtube-nocookie)
 * plus a public oEmbed endpoint, so Cinemax plays these inside the integrated
 * viewing experience. Videos whose owners disabled embedding show YouTube's own
 * notice inside the frame; the provider page link remains as the fallback.
 */

const ID = /^[A-Za-z0-9_-]{11}$/;

function hostMatches(host: string, names: readonly string[]): boolean {
  return names.includes(host);
}

function parseYouTubeId(url: URL): { id: string; kind: "video" | "short" | "live" } | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const path = url.pathname;
  let id: string | null = null;
  let kind: "video" | "short" | "live" = "video";

  if (host === "youtu.be") {
    id = path.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    if (path === "/watch") {
      id = url.searchParams.get("v");
    } else if (path.startsWith("/shorts/")) {
      id = path.split("/")[2] ?? null;
      kind = "short";
    } else if (path.startsWith("/live/")) {
      id = path.split("/")[2] ?? null;
      kind = "live";
    } else if (path.startsWith("/embed/") || path.startsWith("/v/")) {
      id = path.split("/")[2] ?? null;
    }
  }
  if (!id || !ID.test(id)) return null;
  return { id, kind };
}

export const youtubeAdapter: ProviderAdapter = {
  info: {
    id: "youtube",
    name: "YouTube",
    tagline: "Videos, Shorts and live streams from YouTube.",
    accent: "#ff0033",
    requirements: { login: false, subscription: false, drm: false },
    restriction: "Most YouTube videos can be embedded. If a video’s owner has disabled embedding, YouTube shows a notice in the player and the same video can be opened on YouTube instead.",
  },
  match(url) {
    return parseYouTubeId(url) !== null || hostMatches(url.hostname.toLowerCase().replace(/\.$/, ""), ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com"]);
  },
  parse(url) {
    const parsed = parseYouTubeId(url);
    if (!parsed) return null;
    const canonicalUrl = `https://www.youtube.com/watch?v=${parsed.id}`;
    return {
      kind: parsed.kind,
      contentId: parsed.id,
      canonicalUrl,
      playback: {
        strategy: "embed",
        // Official youtube-nocookie embed; the provider's own controls are preserved.
        src: `https://www.youtube-nocookie.com/embed/${parsed.id}?autoplay=1&rel=0&playsinline=1`,
        embedTitle: "YouTube player",
      },
    };
  },
  oembed(url) {
    const parsed = parseYouTubeId(url);
    if (!parsed) return null;
    return `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${parsed.id}`)}&format=json`;
  },
};
