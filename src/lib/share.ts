/**
 * Sharing a title — the rules both platforms follow.
 *
 * What a share contains, and what it deliberately does not:
 *
 *   · one destination link — the title's own page on the official domain;
 *   · that page's description, as the message text;
 *   · one preview card, which the receiving app builds from that page's own
 *     Open Graph metadata (or from the attached CINEMAX card image).
 *
 * It does not contain a second copy of the title as a separate message, a raw
 * deployment hostname, a trailer URL, or a second link: every one of those
 * produces a duplicate card in the receiving app. Nothing here fabricates a
 * poster, a title or a trailer, and nothing claims a platform relationship.
 *
 * This module is isomorphic: the website uses it to prepare Web Share data, and
 * the Android shell receives exactly these fields through the native bridge.
 */

/** The official origin. Never a deployment preview hostname. */
export const SHARE_SITE_URL = "https://cinemaxtv.space";

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

/**
 * The origin a share points at.
 *
 * Inside the site this is the page's own origin, except on a deployment
 * hostname (`*.vercel.app`) or a local server: a link shared from there must
 * still open the official site, so the official origin is substituted. This is
 * the rule that keeps a preview hostname out of every message, card and
 * canonical URL.
 */
export function currentOrigin(): string {
  const origin = typeof window !== "undefined" ? window.location?.origin : "";
  if (!origin) return SHARE_SITE_URL;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".vercel.app") || host === "127.0.0.1") return SHARE_SITE_URL;
    return origin.replace(/\/$/, "");
  } catch {
    return SHARE_SITE_URL;
  }
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

/**
 * The message that travels with the link.
 *
 * It is the title's own description and nothing else. The title, year, genre and
 * poster belong to the preview card the receiving app renders from the link, so
 * repeating them here is what used to produce a text bubble plus a card. The
 * destination URL is not in the text either: both share paths pass it as the
 * link (`navigator.share`'s `url`, Android's `EXTRA_TEXT` composition), which is
 * what makes the card clickable without printing a raw address twice.
 */
export function shareMessage(movie: ShareableTitle): string {
  const summary = (movie.description ?? "").trim().replace(/\s+/g, " ");
  if (!summary) {
    // A record with no description still needs one readable sentence.
    return `Watch ${movie.title} on CINEMAX.`;
  }
  const clipped = summary.length > 160 ? `${summary.slice(0, 157).trimEnd()}…` : summary;
  return clipped;
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
  return {
    title: shareSubject(movie),
    text: shareMessage(movie),
    url: sharePageUrl(movie.id, origin),
    imageUrl: shareCardUrl(movie.id, origin),
    // No attached trailer. A second media item next to the card image is a
    // second card in the receiving app, and the trailer already has its own
    // place on the page the link opens.
    videoUrl: "",
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
      // A bridge that refuses must not become a dead button: fall through to the
      // browser's own share sheet, and to the clipboard only after that.
    }
  }

  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return copyShareText(payload);
  }

  // One link, one description. Nothing is downloaded first: the receiving app
  // renders the CINEMAX card from the page's own Open Graph image, so the sheet
  // opens on the first tap instead of after a multi-hundred-kilobyte fetch.
  const data: ShareData = { title: payload.title, text: payload.text, url: payload.url };
  try {
    await navigator.share(data);
    return "shared";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "cancelled";
    // A browser that advertises sharing but rejects the call still gets a link.
    return copyShareText(payload);
  }
}

/**
 * The last resort when a browser has neither a native sheet nor Web Share. The
 * copied text carries the link explicitly, because a description on its own is
 * not something the recipient can open.
 */
async function copyShareText(payload: SharePayload): Promise<ShareOutcome> {
  try {
    await navigator.clipboard.writeText(`${payload.text}\n${payload.url}`);
    return "copied";
  } catch {
    return "unavailable";
  }
}
