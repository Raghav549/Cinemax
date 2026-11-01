/**
 * Sharing a title — the rules both platforms follow.
 *
 * The share always carries the same four things: a professional line of text, a
 * link to the title's own page, a generated preview image built from that
 * title's artwork, and (where it exists) a reference to its trailer. Nothing
 * here fabricates a poster, a title or a trailer, and nothing claims a platform
 * relationship.
 *
 * This module is isomorphic: the website uses it to prepare Web Share data, and
 * the Android shell receives exactly these fields through the native bridge.
 */

export const SHARE_SITE_URL = "https://cinemax-orpin.vercel.app";

export interface ShareableTitle {
  id: number;
  title: string;
  year?: number | null;
  genre?: string | null;
  type?: string | null;
  description?: string | null;
  posterUrl?: string | null;
  trailerUrl?: string | null;
}

export type TrailerKind = "video" | "youtube" | "vimeo" | "link";

export interface TrailerTarget {
  kind: TrailerKind;
  /** Playable/embeddable URL. */
  url: string;
  /** Best-effort still for the trailer, when the host provides one. */
  thumbnail: string | null;
}

/** Origin of the current page, falling back to the canonical deployment. */
export function currentOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return SHARE_SITE_URL;
}

/** The page a share points at: a title page that renders the rich card itself. */
export function sharePageUrl(id: number, origin: string = currentOrigin()): string {
  return `${origin.replace(/\/$/, "")}/share/${id}`;
}

/** Direct link to the title inside the catalogue. */
export function titleUrl(id: number, origin: string = currentOrigin()): string {
  return `${origin.replace(/\/$/, "")}/movie/${id}`;
}

/** The generated Open Graph / share-card image for a title. */
export function shareCardUrl(id: number, origin: string = currentOrigin()): string {
  return `${origin.replace(/\/$/, "")}/api/share/card/${id}`;
}

/**
 * Classifies a trailer URL. Direct files can be attached to a share where the
 * destination supports a video; YouTube and Vimeo can only ever be linked or
 * embedded, and pretending otherwise would be claiming a video that is not
 * being sent.
 */
export function trailerTarget(rawUrl: string | null | undefined): TrailerTarget | null {
  const raw = (rawUrl ?? "").trim();
  if (!raw) return null;

  if (/\.(mp4|webm|m4v|ogv|mov)(\?.*)?$/i.test(raw) || raw.startsWith("/api/media/") || raw.startsWith("/api/stream/")) {
    return { kind: "video", url: absolute(raw), thumbnail: null };
  }

  try {
    const url = new URL(raw, SHARE_SITE_URL);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const id = host === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0]
        : url.pathname === "/watch"
          ? url.searchParams.get("v")
          : url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")
            ? url.pathname.split("/")[2]
            : url.searchParams.get("v");
      if (id) {
        return {
          kind: "youtube",
          url: `https://www.youtube.com/watch?v=${id}`,
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        };
      }
    }
    if (host.endsWith("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) {
        return { kind: "vimeo", url: `https://vimeo.com/${id}`, thumbnail: null };
      }
    }
    if (/\.(m3u8|mpd)(\?.*)?$/i.test(url.pathname)) {
      // Adaptive streams cannot be attached to a share; the page embeds them.
      return { kind: "link", url: raw, thumbnail: null };
    }
    return { kind: "link", url: raw, thumbnail: null };
  } catch {
    return null;
  }
}

function absolute(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${SHARE_SITE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

/** "Type · Year · Genre", omitting whatever the record does not have. */
export function shareSubtitle(movie: ShareableTitle): string {
  const parts = [movie.type, movie.year ? String(movie.year) : null, movie.genre?.split(",")[0]?.trim()]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return parts.join(" · ");
}

/** The one-line message that accompanies the link. */
export function shareMessage(movie: ShareableTitle, origin: string = currentOrigin()): string {
  const subtitle = shareSubtitle(movie);
  const lead = subtitle ? `${movie.title} (${subtitle})` : movie.title;
  const trailer = trailerTarget(movie.trailerUrl);
  const trailerLine = trailer ? `\nTrailer: ${trailer.url}` : "";
  return `${lead} — watch it on CINEMAX\n${sharePageUrl(movie.id, origin)}${trailerLine}`;
}

export function shareSubject(movie: ShareableTitle): string {
  return `${movie.title} on CINEMAX`;
}

/** Description used by Open Graph / the share card page. */
export function shareDescription(movie: ShareableTitle): string {
  const subtitle = shareSubtitle(movie);
  const summary = (movie.description ?? "").trim().replace(/\s+/g, " ");
  const clipped = summary.length > 180 ? `${summary.slice(0, 177).trimEnd()}…` : summary;
  const head = subtitle ? `${movie.title} (${subtitle})` : movie.title;
  return clipped ? `${head} — ${clipped}` : `${head} — watch it on CINEMAX.`;
}

/* --------------------------------------------------------------- the shell */

export interface NativeShareBridge {
  share?: (title: string, text: string, url: string, imageUrl: string, videoUrl: string) => void;
}

export function nativeShareBridge(): NativeShareBridge | null {
  if (typeof window === "undefined") return null;
  return (window as typeof window & { CinemaxNative?: NativeShareBridge }).CinemaxNative ?? null;
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "unavailable" | "failed";

export interface SharePayload {
  title: string;
  text: string;
  url: string;
  imageUrl: string;
  videoUrl: string;
}

export function buildSharePayload(movie: ShareableTitle, origin: string = currentOrigin()): SharePayload {
  const trailer = trailerTarget(movie.trailerUrl);
  return {
    title: shareSubject(movie),
    text: shareMessage(movie, origin),
    url: sharePageUrl(movie.id, origin),
    imageUrl: shareCardUrl(movie.id, origin),
    // Only a real, attachable video file is offered as a video. A YouTube or
    // Vimeo trailer stays a link (see trailerTarget), so the shell never claims
    // to be sending a video that it cannot send.
    videoUrl: trailer?.kind === "video" ? trailer.url : "",
  };
}

/**
 * Hands the payload to the platform.
 *
 * Inside the Android shell the native share sheet is used (the bridge hands the
 * intent to Android itself, so the list of apps is whatever is installed).
 * Otherwise the Web Share API is used where it exists, and a clipboard copy is
 * the documented fallback where it does not.
 */
export async function shareTitle(movie: ShareableTitle, origin: string = currentOrigin()): Promise<ShareOutcome> {
  const payload = buildSharePayload(movie, origin);

  const bridge = nativeShareBridge();
  if (typeof bridge?.share === "function") {
    try {
      bridge.share(payload.title, payload.text, payload.url, payload.imageUrl, payload.videoUrl);
      return "shared";
    } catch {
      return "failed";
    }
  }

  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return copyShareText(payload);
  }

  const data: ShareData = { title: payload.title, text: payload.text, url: payload.url };
  try {
    const files = await shareFiles(payload);
    if (files.length && typeof navigator.canShare === "function" && navigator.canShare({ files })) {
      await navigator.share({ ...data, files });
    } else {
      await navigator.share(data);
    }
    return "shared";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "cancelled";
    // A browser that advertises sharing but rejects the call still gets a link.
    return copyShareText(payload);
  }
}

/** The generated preview card, plus the trailer file when it can be attached. */
async function shareFiles(payload: SharePayload): Promise<File[]> {
  const files: File[] = [];
  const card = await fetchAsFile(payload.imageUrl, `cinemax-${payload.url.split("/").pop()}.jpg`, 4 * 1024 * 1024);
  if (card) files.push(card);

  if (payload.videoUrl) {
    // 24 MB is roughly a minute of 1080p trailer and keeps the share quick; a
    // larger file would stall the share sheet and often fail outright.
    const video = await fetchAsFile(payload.videoUrl, `cinemax-trailer.mp4`, 24 * 1024 * 1024);
    if (video) files.push(video);
  }
  return files;
}

async function fetchAsFile(url: string, name: string, limitBytes: number): Promise<File | null> {
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > limitBytes) return null;
    const blob = await response.blob();
    if (!blob.size || blob.size > limitBytes) return null;
    const type = blob.type || (name.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
    return new File([blob], name, { type });
  } catch {
    return null;
  }
}

async function copyShareText(payload: SharePayload): Promise<ShareOutcome> {
  try {
    await navigator.clipboard.writeText(`${payload.text}`);
    return "copied";
  } catch {
    return "unavailable";
  }
}
