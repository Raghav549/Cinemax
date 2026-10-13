import type { DirectEngine, ProviderAdapter } from "../types";

/**
 * Direct media sources: progressive files and adaptive streams the app is
 * allowed to play in its own engine. These are the same sources the library
 * already supports for catalogue playback (MP4/WebM/…, HLS via hls.js or
 * native, MPEG-DASH via dash.js).
 */

const FILE_EXTENSIONS: Record<string, DirectEngine> = {
  mp4: "video",
  webm: "video",
  ogg: "video",
  ogv: "video",
  mov: "video",
  mkv: "video",
  m4v: "video",
  m3u8: "hls",
  mpd: "dash",
};

function mediaEngine(url: URL): DirectEngine | null {
  // Path-only match: query strings carry tokens on signed media URLs.
  const match = /\.([a-z0-9]+)$/i.exec(url.pathname);
  if (!match) return null;
  return FILE_EXTENSIONS[match[1].toLowerCase()] ?? null;
}

export const directMediaAdapter: ProviderAdapter = {
  info: {
    id: "direct-media",
    name: "Video file",
    tagline: "Direct MP4, WebM, HLS and DASH sources play in the Cinemax player.",
    accent: "#4fd8ff",
    requirements: { login: false, subscription: false, drm: false },
  },
  match(url) {
    return mediaEngine(url) !== null;
  },
  parse(url) {
    const engine = mediaEngine(url);
    if (!engine) return null;
    return {
      kind: engine === "video" ? "file" : "stream",
      contentId: null,
      canonicalUrl: url.toString(),
      playback: { strategy: "direct", src: url.toString(), engine },
    };
  },
};
