import type { ParsedProviderContent, ProviderAdapter, ProviderInfo } from "../types";

/**
 * Subscription streaming services.
 *
 * These providers protect their catalogues with DRM, authentication and their
 * own terms of service: none of them permits a third-party app to embed or
 * re-stream their player. Cinemax never pretends otherwise - each link resolves
 * to the in-app provider page with a "Play on …" action that opens the official
 * service (where installed apps can claim the link via verified app links).
 *
 * The requirement flags are accurate per link type: a public trailer page on a
 * provider's marketing site may not need a subscription, but the playback of
 * the actual title always does.
 */

function externalPlan(
  provider: ProviderInfo,
  reason: "drm" | "subscription" | "login",
  message: string,
): ParsedProviderContent["playback"] {
  return {
    strategy: "external",
    reason,
    message,
    actionLabel: `Play on ${provider.name}`,
  };
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function makeAdapter(
  info: ProviderInfo,
  hosts: readonly string[],
  parseUrl: (url: URL) => { kind: ParsedProviderContent["kind"]; contentId: string | null; canonicalUrl: string } | null,
  message: string,
): ProviderAdapter {
  return {
    info,
    // Detection is strictly host-based: a `/title/123` path on someone else's
    // domain is not Netflix. URL-shape parsing only refines recognised hosts.
    match(url) {
      return hosts.includes(hostOf(url));
    },
    parse(url) {
      const parsed = parseUrl(url);
      if (!parsed) {
        // Recognised provider host but an unknown page shape (e.g. a help
        // article) - still hand off to the official service honestly.
        const host = hostOf(url);
        if (!hosts.includes(host)) return null;
        return {
          kind: "page",
          contentId: null,
          canonicalUrl: url.toString(),
          playback: externalPlan(info, "drm", message),
        };
      }
      return { ...parsed, playback: externalPlan(info, "drm", message) };
    },
  };
}

/* ------------------------------------------------------------------- Netflix */

const netflix: ProviderInfo = {
  id: "netflix",
  name: "Netflix",
  tagline: "Netflix plays in the official Netflix app or website.",
  accent: "#e50914",
  requirements: { login: true, subscription: true, drm: true },
  restriction: "Netflix protects its catalogue with DRM and a Netflix membership. Third-party embedding is not permitted, so playback happens on Netflix.",
};

export const netflixAdapter: ProviderAdapter = makeAdapter(
  netflix,
  ["netflix.com"],
  (url) => {
    const segments = url.pathname.split("/").filter(Boolean);
    // /title/80057281 · /watch/80057281 · /gb/title/80057281 (region first)
    const titleIndex = segments.findIndex((segment) => segment === "title" || segment === "watch");
    const id = titleIndex >= 0 ? segments[titleIndex + 1] : null;
    if (id && /^\d+$/.test(id)) {
      return {
        kind: segments[titleIndex] === "watch" ? "video" : "episode-page",
        contentId: id,
        canonicalUrl: `https://www.netflix.com/title/${id}`,
      };
    }
    return null;
  },
  "Netflix protects every stream with DRM and requires a Netflix membership. Cinemax can’t embed Netflix playback — open the title on Netflix to watch it there.",
);

/* --------------------------------------------------------------- Prime Video */

const prime: ProviderInfo = {
  id: "prime",
  name: "Prime Video",
  tagline: "Prime Video plays in the official Prime Video app or website.",
  accent: "#00a8e1",
  requirements: { login: true, subscription: true, drm: true },
  restriction: "Prime Video protects its catalogue with DRM and an Amazon account. Third-party embedding is not permitted, so playback happens on Prime Video.",
};

export const primeAdapter: ProviderAdapter = makeAdapter(
  prime,
  ["primevideo.com", "amazon.com", "amazon.co.uk", "amazon.in", "amazon.de", "amazon.fr", "amazon.co.jp", "amazon.com.au", "amazon.ca", "amazon.it", "amazon.es", "amazon.com.br", "amazon.com.mx"],
  (url) => {
    const segments = url.pathname.split("/").filter(Boolean);
    // primevideo.com/detail/0EXAMPLE · primevideo.com/gp/video/detail/ASIN
    // amazon.com/gp/video/detail/ASIN · amazon.com/dp/ASIN
    let id: string | null = null;
    const detailIndex = segments.indexOf("detail");
    if (detailIndex >= 0 && segments[detailIndex + 1]) id = segments[detailIndex + 1];
    const dpIndex = segments.indexOf("dp");
    if (!id && dpIndex >= 0 && segments[dpIndex + 1]) id = segments[dpIndex + 1];
    if (id) {
      const clean = id.replace(/[^A-Za-z0-9]/g, "");
      return {
        kind: "episode-page",
        contentId: clean || null,
        canonicalUrl: url.hostname.toLowerCase().includes("primevideo")
          ? `https://www.primevideo.com/detail/${clean}`
          : `https://www.primevideo.com/detail/${clean}`,
      };
    }
    return null;
  },
  "Prime Video protects every stream with DRM and requires an Amazon account. Cinemax can’t embed Prime Video playback — open the title on Prime Video to watch it there.",
);

/* --------------------------------------------------------- Disney+ Hotstar */

const hotstar: ProviderInfo = {
  id: "hotstar",
  name: "Disney+ Hotstar",
  tagline: "Disney+ Hotstar plays in the official Hotstar app or website.",
  accent: "#1f80e0",
  requirements: { login: true, subscription: true, drm: true },
  restriction: "Disney+ Hotstar protects its catalogue with DRM and a Hotstar membership. Third-party embedding is not permitted, so playback happens on Hotstar.",
};

export const hotstarAdapter: ProviderAdapter = makeAdapter(
  hotstar,
  ["hotstar.com", "www.hotstar.com", "hotstar.com"],
  (url) => {
    const segments = url.pathname.split("/").filter(Boolean);
    // hotstar.com/in/1260000123 · hotstar.com/in/movies/slug/1234567890
    const last = segments[segments.length - 1];
    if (last && /^\d{6,}$/.test(last)) {
      return { kind: "episode-page", contentId: last, canonicalUrl: url.toString() };
    }
    return null;
  },
  "Disney+ Hotstar protects every stream with DRM and requires a Hotstar membership. Cinemax can’t embed Hotstar playback — open the title on Hotstar to watch it there.",
);

/* ----------------------------------------------------------------- Disney+ */

const disney: ProviderInfo = {
  id: "disneyplus",
  name: "Disney+",
  tagline: "Disney+ plays in the official Disney+ app or website.",
  accent: "#0c3a6e",
  requirements: { login: true, subscription: true, drm: true },
  restriction: "Disney+ protects its catalogue with DRM and a Disney+ membership. Third-party embedding is not permitted.",
};

export const disneyPlusAdapter: ProviderAdapter = makeAdapter(
  disney,
  ["disneyplus.com", "www.disneyplus.com"],
  (url) => {
    const segments = url.pathname.split("/").filter(Boolean);
    // disneyplus.com/en-gb/browse/entity-<id> / series/… / movies/… / play/…/<id>
    const last = segments[segments.length - 1];
    const id = last && /^[A-Za-z0-9-]{6,}$/.test(last) ? last : null;
    return id ? { kind: "episode-page", contentId: id, canonicalUrl: url.toString() } : null;
  },
  "Disney+ protects every stream with DRM and requires a Disney+ membership. Cinemax can’t embed Disney+ playback — open the title on Disney+ to watch it there.",
);

/* ----------------------------------------------------------------- Apple TV+ */

const appleTv: ProviderInfo = {
  id: "appletv",
  name: "Apple TV+",
  tagline: "Apple TV+ plays in the official Apple TV app or website.",
  accent: "#a2aaad",
  requirements: { login: true, subscription: true, drm: true },
  restriction: "Apple TV+ protects its catalogue with DRM and an Apple subscription. Third-party embedding is not permitted.",
};

export const appleTvAdapter: ProviderAdapter = makeAdapter(
  appleTv,
  ["tv.apple.com"],
  (url) => {
    // tv.apple.com/movie/name/umc.cmc.1234 · tv.apple.com/show/… / episode/…
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    const id = last && last.startsWith("umc.") ? last : null;
    return id ? { kind: "episode-page", contentId: id, canonicalUrl: url.toString() } : null;
  },
  "Apple TV+ protects every stream with DRM and requires an Apple subscription. Cinemax can’t embed Apple TV+ playback — open the title in the Apple TV app to watch it there.",
);

/* ---------------------------------------------------------------- Regional OTTs */

function regionalAdapter(
  info: ProviderInfo,
  hosts: readonly string[],
  message: string,
  matchPath: (url: URL) => string | null,
): ProviderAdapter {
  return makeAdapter(info, hosts, (url) => {
    const id = matchPath(url);
    return { kind: "episode-page", contentId: id, canonicalUrl: url.toString() };
  }, message);
}

export const zee5Adapter = regionalAdapter(
  {
    id: "zee5",
    name: "ZEE5",
    tagline: "ZEE5 plays in the official ZEE5 app or website.",
    accent: "#6c2bd9",
    requirements: { login: true, subscription: true, drm: true },
    restriction: "ZEE5 protects its catalogue with DRM and a ZEE5 membership. Third-party embedding is not permitted.",
  },
  ["zee5.com", "www.zee5.com"],
  "ZEE5 protects its streams with DRM and requires a ZEE5 membership. Cinemax can’t embed ZEE5 playback — open the title on ZEE5 to watch it there.",
  (url) => url.pathname.split("/").filter(Boolean).pop() ?? null,
);

export const sonyLivAdapter = regionalAdapter(
  {
    id: "sonyliv",
    name: "SonyLIV",
    tagline: "SonyLIV plays in the official SonyLIV app or website.",
    accent: "#ff6a00",
    requirements: { login: true, subscription: true, drm: true },
    restriction: "SonyLIV protects its catalogue with DRM and a SonyLIV membership. Third-party embedding is not permitted.",
  },
  ["sonyliv.com", "www.sonyliv.com"],
  "SonyLIV protects its streams with DRM and requires a SonyLIV membership. Cinemax can’t embed SonyLIV playback — open the title on SonyLIV to watch it there.",
  (url) => url.pathname.split("/").filter(Boolean).pop() ?? null,
);

export const jioCinemaAdapter = regionalAdapter(
  {
    id: "jiocinema",
    name: "JioCinema",
    tagline: "JioCinema plays in the official JioCinema app or website.",
    accent: "#9b2cf3",
    requirements: { login: true, subscription: true, drm: true },
    restriction: "JioCinema protects its catalogue with DRM and a JioCinema membership. Third-party embedding is not permitted.",
  },
  ["jiocinema.com", "www.jiocinema.com"],
  "JioCinema protects its streams with DRM and requires a JioCinema membership. Cinemax can’t embed JioCinema playback — open the title on JioCinema to watch it there.",
  (url) => url.pathname.split("/").filter(Boolean).pop() ?? null,
);

export const mxPlayerAdapter = regionalAdapter(
  {
    id: "mxplayer",
    name: "MX Player",
    tagline: "MX Player plays in the official MX Player app or website.",
    accent: "#6236ff",
    requirements: { login: false, subscription: false, drm: true },
    restriction: "MX Player streams are protected and only play in MX Player’s own player. Third-party embedding is not permitted.",
  },
  ["mxplayer.in", "www.mxplayer.in", "mxplayer.tv", "www.mxplayer.tv"],
  "MX Player streams only play inside MX Player’s own player. Cinemax can’t embed them — open the title on MX Player to watch it there.",
  (url) => url.pathname.split("/").filter(Boolean).pop() ?? null,
);
