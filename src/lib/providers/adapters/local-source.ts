import type { DirectEngine, ProviderAdapter } from "../types";

/**
 * Same-origin media sources stored by the studio: `/api/stream/5` (the
 * authorized magnet-stream endpoint), `/api/media/...` (verified archival/open
 * streams and embeds), and local fixture/library paths.
 *
 * Only root-relative paths are accepted (never `//host`, never schemes), so a
 * local source can never smuggle an external or dangerous URL in.
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

function engineOf(pathname: string): DirectEngine {
  const match = /\.([a-z0-9]+)$/i.exec(pathname);
  if (!match) return "video";
  return FILE_EXTENSIONS[match[1].toLowerCase()] ?? "video";
}

export function isLocalSourcePath(raw: string): boolean {
  return raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") && !/[\u0000-\u001F\u007F]/.test(raw) && raw.length <= 2048;
}

export const localSourceAdapter: ProviderAdapter = {
  info: {
    id: "local-media",
    name: "Cinemax library",
    tagline: "Media served by the Cinemax library.",
    accent: "#4fd8ff",
    requirements: { login: false, subscription: false, drm: false },
  },
  match() {
    return false; // selected explicitly by the registry for local paths.
  },
  parse(url) {
    const path = url.pathname + url.search;
    if (url.pathname.startsWith("/api/media/embed/")) {
      const slug = url.pathname.slice("/api/media/embed/".length) || null;
      return {
        kind: "video",
        contentId: slug,
        canonicalUrl: path,
        playback: {
          strategy: "embed",
          src: path,
          embedTitle: "Cinemax Archival Embed Player",
        },
      };
    }
    return {
      kind: "stream",
      contentId: null,
      canonicalUrl: path,
      playback: { strategy: "direct", src: path, engine: engineOf(url.pathname) },
    };
  },
};
