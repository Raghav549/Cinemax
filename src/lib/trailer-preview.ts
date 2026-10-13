import { resolveShareLink } from "@/lib/providers";

/**
 * In-card trailer previews, resolved from the admin-provided `trailerUrl`
 * only — never from the full-film `videoUrl`.
 *
 * Returns null for anything that cannot honestly preview inline (empty,
 * invalid, DRM/subscription hand-offs, DASH, same-origin embed pages), in
 * which case the card simply keeps showing its poster.
 */
export type TrailerPreview =
  | { kind: "direct"; src: string; engine: "video" | "hls" }
  | { kind: "embed"; src: string; providerName: string };

function mutedEmbedSrc(src: string): string {
  try {
    const url = new URL(src);
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(url.hostname)) {
      url.searchParams.set("mute", "1");
      url.searchParams.set("controls", "0");
      url.searchParams.set("playsinline", "1");
    } else if (/(^|\.)vimeo\.com$/.test(url.hostname)) {
      url.searchParams.set("muted", "1");
      url.searchParams.set("controls", "0");
    } else if (/(^|\.)dailymotion\.com$/.test(url.hostname)) {
      url.searchParams.set("mute", "1");
    }
    return url.toString();
  } catch {
    return src;
  }
}

export function getTrailerPreview(trailerUrl: string | null | undefined): TrailerPreview | null {
  const value = (trailerUrl ?? "").trim();
  if (!value) return null;

  const resolution = resolveShareLink(value, { allowUnknownDirect: true });
  if (!resolution.ok) return null;

  const plan = resolution.playback;
  if (plan.strategy === "direct") {
    // DASH needs the full player stack; a card preview stays on the poster.
    if (plan.engine === "dash") return null;
    return { kind: "direct", src: plan.src, engine: plan.engine };
  }
  if (plan.strategy === "embed") {
    // Only real provider embeds (absolute http(s) frames) preview inline.
    if (!/^https:\/\//i.test(plan.src)) return null;
    return { kind: "embed", src: mutedEmbedSrc(plan.src), providerName: resolution.provider.name };
  }
  return null;
}

/** Custom event that guarantees only one card preview plays at a time. */
export const TRAILER_PREVIEW_EVENT = "cinemax:trailer-preview";
