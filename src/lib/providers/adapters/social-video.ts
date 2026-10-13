import type { ProviderAdapter } from "../types";

/**
 * Social/video platforms with official embeddable players.
 *
 * Each of these publishes a documented embed player for public content. Login-
 * wall or private content shows the provider's own message inside the frame -
 * Cinemax never attempts to bypass it. Short links that cannot be canonicalised
 * without following redirects are handled as an official-service hand-off.
 */

/* --------------------------------------------------------------- Dailymotion */

function parseDailymotion(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const segments = url.pathname.split("/").filter(Boolean);
  if (host === "dai.ly") return segments[0] && /^([a-z0-9]+)$/i.test(segments[0]) ? segments[0] : null;
  if (host !== "dailymotion.com" && host !== "www.dailymotion.com") return null;
  if (segments[0] === "video" && segments[1]) return segments[1];
  return null;
}

export const dailymotionAdapter: ProviderAdapter = {
  info: {
    id: "dailymotion",
    name: "Dailymotion",
    tagline: "Public Dailymotion videos play in the official Dailymotion player.",
    accent: "#0066dc",
    requirements: { login: false, subscription: false, drm: false },
    restriction: "Private or geo-restricted Dailymotion videos cannot be embedded and show Dailymotion’s own message in the player.",
  },
  match(url) {
    return parseDailymotion(url) !== null || ["dailymotion.com", "www.dailymotion.com", "dai.ly"].includes(url.hostname.toLowerCase().replace(/\.$/, ""));
  },
  parse(url) {
    const id = parseDailymotion(url);
    if (!id) return null;
    return {
      kind: "video",
      contentId: id,
      canonicalUrl: `https://www.dailymotion.com/video/${id}`,
      playback: {
        strategy: "embed",
        src: `https://www.dailymotion.com/embed/video/${id}?autoplay=1`,
        embedTitle: "Dailymotion player",
      },
    };
  },
  oembed(url) {
    const id = parseDailymotion(url);
    if (!id) return null;
    return `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(`https://www.dailymotion.com/video/${id}`)}&format=json`;
  },
};

/* -------------------------------------------------------------------- Twitch */

const TWITCH_HOSTS = ["twitch.tv", "www.twitch.tv", "m.twitch.tv", "clips.twitch.tv", "www.clips.twitch.tv"];

/**
 * Twitch embeds require a `parent` parameter matching the embedding site's
 * hostname. `__CINEMAX_PARENT__` is substituted with the live hostname when the
 * embed is mounted - keeping the adapter pure and isomorphic.
 */
function twitchEmbed(path: string): string {
  return `https://player.twitch.tv/?${path}&parent=__CINEMAX_PARENT__&autoplay=true`;
}

export const twitchAdapter: ProviderAdapter = {
  info: {
    id: "twitch",
    name: "Twitch",
    tagline: "Twitch videos, clips and live channels play in the official Twitch player.",
    accent: "#9146ff",
    requirements: { login: false, subscription: false, drm: false },
    restriction: "Subscribers-only videos and mature-rated streams may require signing in on Twitch inside the player.",
  },
  match(url) {
    return TWITCH_HOSTS.includes(url.hostname.toLowerCase().replace(/\.$/, ""));
  },
  parse(url) {
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const segments = url.pathname.split("/").filter(Boolean);
    if (host === "clips.twitch.tv") {
      const slug = segments[0];
      if (!slug) return null;
      return {
        kind: "clip",
        contentId: slug,
        canonicalUrl: `https://clips.twitch.tv/${slug}`,
        playback: { strategy: "embed", src: twitchEmbed(`clip=${encodeURIComponent(slug)}`), embedTitle: "Twitch clip player" },
      };
    }
    if (segments[0] === "videos" && segments[1] && /^\d+$/.test(segments[1])) {
      return {
        kind: "video",
        contentId: segments[1],
        canonicalUrl: `https://www.twitch.tv/videos/${segments[1]}`,
        playback: { strategy: "embed", src: twitchEmbed(`video=${segments[1]}`), embedTitle: "Twitch player" },
      };
    }
    if (segments[0] === "clip" && segments[1]) {
      // www.twitch.tv/channel/clip/slug - the embed takes the clip slug.
      return {
        kind: "clip",
        contentId: segments[1],
        canonicalUrl: `https://www.twitch.tv/${segments[0]}/${segments[1]}`,
        playback: { strategy: "embed", src: twitchEmbed(`clip=${encodeURIComponent(segments[1])}`), embedTitle: "Twitch clip player" },
      };
    }
    const channel = segments[0];
    if (channel && !["directory", "videos", "downloads", "jobs", "p", "settings"].includes(channel)) {
      return {
        kind: "live",
        contentId: channel,
        canonicalUrl: `https://www.twitch.tv/${channel}`,
        playback: { strategy: "embed", src: twitchEmbed(`channel=${encodeURIComponent(channel)}`), embedTitle: "Twitch live player" },
      };
    }
    return null;
  },
};

/* ------------------------------------------------------------------ Facebook */

function facebookHref(url: URL): { id: string; canonical: string } | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const segments = url.pathname.split("/").filter(Boolean);
  if (host === "fb.watch" || host === "facebook.watch") {
    const slug = segments[0];
    return slug ? { id: slug, canonical: `https://fb.watch/${slug}/` } : null;
  }
  if (host !== "facebook.com" && host !== "www.facebook.com" && host !== "m.facebook.com") return null;
  if (segments[0] === "watch" && url.searchParams.get("v")) {
    const id = url.searchParams.get("v")!;
    return { id, canonical: `https://www.facebook.com/watch/?v=${id}` };
  }
  if ((segments[0] === "reel" || segments[0] === "videos") && segments[1]) {
    return { id: segments[1], canonical: `https://www.facebook.com/${segments[0]}/${segments[1]}` };
  }
  return null;
}

export const facebookAdapter: ProviderAdapter = {
  info: {
    id: "facebook",
    name: "Facebook",
    tagline: "Public Facebook videos and reels play in the official Facebook plugin player.",
    accent: "#0866ff",
    requirements: { login: false, subscription: false, drm: false },
    restriction: "Facebook only allows public videos to be embedded. Videos shared with a limited audience show Facebook’s own message in the player.",
  },
  match(url) {
    return facebookHref(url) !== null || ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch", "facebook.watch"].includes(url.hostname.toLowerCase().replace(/\.$/, ""));
  },
  parse(url) {
    const parsed = facebookHref(url);
    if (!parsed) return null;
    return {
      kind: "video",
      contentId: parsed.id,
      canonicalUrl: parsed.canonical,
      playback: {
        strategy: "embed",
        src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(parsed.canonical)}&show_text=0&width=560&autoplay=true`,
        embedTitle: "Facebook player",
      },
    };
  },
};

/* ------------------------------------------------------------------ Instagram */

function instagramShortcode(url: URL): { shortcode: string; kind: "reel" | "video" } | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host !== "instagram.com" && host !== "www.instagram.com") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const kind = segments[0] === "reel" || segments[0] === "reels" ? "reel" : segments[0] === "p" || segments[0] === "tv" ? "video" : null;
  if (!kind || !segments[1]) return null;
  const shortcode = segments[1].replace(/[^A-Za-z0-9_-]/g, "");
  return shortcode ? { shortcode, kind } : null;
}

export const instagramAdapter: ProviderAdapter = {
  info: {
    id: "instagram",
    name: "Instagram",
    tagline: "Public Instagram reels and videos play in the official Instagram embed.",
    accent: "#e1306c",
    requirements: { login: false, subscription: false, drm: false },
    restriction: "Instagram only embeds public posts. Private accounts and login-walled content show Instagram’s own message in the player.",
  },
  match(url) {
    return instagramShortcode(url) !== null || ["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase().replace(/\.$/, ""));
  },
  parse(url) {
    const parsed = instagramShortcode(url);
    if (!parsed) return null;
    const path = parsed.kind === "reel" ? "reel" : "p";
    return {
      kind: parsed.kind === "reel" ? "reel" : "video",
      contentId: parsed.shortcode,
      canonicalUrl: `https://www.instagram.com/${path}/${parsed.shortcode}/`,
      playback: {
        strategy: "embed",
        src: `https://www.instagram.com/${path}/${parsed.shortcode}/embed/`,
        embedTitle: "Instagram player",
      },
    };
  },
};

/* --------------------------------------------------------------------- TikTok */

function tiktokVideoId(url: URL): { id: string | null; shortLink: boolean } | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const segments = url.pathname.split("/").filter(Boolean);
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    return segments[0] ? { id: null, shortLink: true } : null;
  }
  if (host !== "tiktok.com" && host !== "www.tiktok.com") return null;
  if (segments[0] && segments[0].startsWith("@") && segments[1] === "video" && segments[2] && /^\d+$/.test(segments[2])) {
    return { id: segments[2], shortLink: false };
  }
  if (segments[0] === "embed" && segments[2] && /^\d+$/.test(segments[2])) {
    return { id: segments[2], shortLink: false };
  }
  if (segments[0] === "t" && segments[1]) return { id: null, shortLink: true };
  return null;
}

export const tiktokAdapter: ProviderAdapter = {
  info: {
    id: "tiktok",
    name: "TikTok",
    tagline: "Public TikTok videos play in the official TikTok embed.",
    accent: "#00f2ea",
    requirements: { login: false, subscription: false, drm: false },
    restriction: "TikTok only embeds public videos. Login-walled content shows TikTok’s own message in the player.",
  },
  match(url) {
    return tiktokVideoId(url) !== null || ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname.toLowerCase().replace(/\.$/, ""));
  },
  parse(url) {
    const parsed = tiktokVideoId(url);
    if (!parsed) return null;
    if (parsed.shortLink) {
      // Short links cannot be canonicalised without following redirects, which
      // the app deliberately never does for untrusted input. Hand off officially.
      return {
        kind: "page",
        contentId: null,
        canonicalUrl: url.toString(),
        playback: {
          strategy: "external",
          reason: "unsupported",
          message: "Short TikTok links can’t be embedded without following redirects. Open the link on TikTok to watch it there.",
          actionLabel: "Open on TikTok",
        },
      };
    }
    return {
      kind: "video",
      contentId: parsed.id,
      canonicalUrl: `https://www.tiktok.com/embed/v2/${parsed.id}`,
      playback: {
        strategy: "embed",
        src: `https://www.tiktok.com/embed/v2/${parsed.id}`,
        embedTitle: "TikTok player",
      },
    };
  },
  oembed(url) {
    const parsed = tiktokVideoId(url);
    if (!parsed || parsed.shortLink || !parsed.id) return null;
    return `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/embed/v2/${parsed.id}`)}`;
  },
};
