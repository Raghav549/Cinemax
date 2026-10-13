/**
 * Trailer resolver for Cinemax title details.
 *
 * Resolves admin-provided `trailerUrl` values to YouTube, direct media (.mp4, .webm),
 * or Vimeo sources, configured for clean background cinematic playback with
 * minimal provider branding and Cinemax chrome.
 */

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export interface YouTubeTrailer {
  kind: "youtube";
  id: string;
  embedUrl: string;
}

export interface DirectTrailer {
  kind: "direct";
  src: string;
}

export interface VimeoTrailer {
  kind: "vimeo";
  id: string;
  embedUrl: string;
}

export type ResolvedTrailer = YouTubeTrailer | DirectTrailer | VimeoTrailer;

export function resolveTrailerUrl(rawUrl: string | null | undefined): ResolvedTrailer | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const raw = rawUrl.trim();
  if (!raw) return null;

  // Direct video files (.mp4, .webm, etc.) or internal stream endpoints
  if (
    /\.(mp4|webm|m4v|ogv)(\?.*)?$/i.test(raw) ||
    raw.startsWith("/__e2e__/") ||
    raw.startsWith("/api/media/stream/")
  ) {
    return { kind: "direct", src: raw };
  }

  try {
    const url = new URL(raw, "https://cinemax.local");
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    // YouTube
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com" ||
      host === "youtu.be"
    ) {
      let id: string | null = null;
      if (host === "youtu.be") {
        id = url.pathname.split("/").filter(Boolean)[0] ?? null;
      } else if (url.pathname === "/watch") {
        id = url.searchParams.get("v");
      } else if (url.pathname.startsWith("/embed/")) {
        id = url.pathname.split("/")[2] ?? null;
      } else if (url.pathname.startsWith("/shorts/")) {
        id = url.pathname.split("/")[2] ?? null;
      } else if (url.pathname.startsWith("/live/")) {
        id = url.pathname.split("/")[2] ?? null;
      } else if (url.pathname.startsWith("/v/")) {
        id = url.pathname.split("/")[2] ?? null;
      }

      if (id && YOUTUBE_ID_PATTERN.test(id)) {
        // Supported YouTube embed parameters minimizing branding & controls:
        // autoplay=1: autoplay immediately
        // mute=1: muted by default for browser autoplay compatibility
        // controls=0: hide YouTube player controls (Cinemax UI only)
        // modestbranding=1: minimize YouTube logo
        // rel=0: no unrelated external suggestions
        // playsinline=1: keep playback inline on mobile devices
        // enablejsapi=1: allow postMessage commands (mute/unMute, play, stop)
        // iv_load_policy=3: disable video annotations
        // disablekb=1: prevent YouTube keyboard shortcuts hijacking
        // fs=0: hide YouTube fullscreen button
        // loop=1&playlist=${id}: seamless background loop
        const params = new URLSearchParams({
          autoplay: "1",
          mute: "1",
          controls: "0",
          modestbranding: "1",
          rel: "0",
          playsinline: "1",
          enablejsapi: "1",
          iv_load_policy: "3",
          disablekb: "1",
          fs: "0",
          loop: "1",
          playlist: id,
        });

        return {
          kind: "youtube",
          id,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
        };
      }
    }

    // Vimeo
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const match = url.pathname.match(/\/(\d+)/);
      if (match && match[1]) {
        const id = match[1];
        const params = new URLSearchParams({
          autoplay: "1",
          muted: "1",
          controls: "0",
          background: "1",
          loop: "1",
        });
        return {
          kind: "vimeo",
          id,
          embedUrl: `https://player.vimeo.com/video/${id}?${params.toString()}`,
        };
      }
    }

    // Direct video fallback if query string has extensions
    if (/\.(mp4|webm|m4v)/i.test(url.pathname)) {
      return { kind: "direct", src: raw };
    }
  } catch {
    // Invalid URL string
    return null;
  }

  return null;
}
