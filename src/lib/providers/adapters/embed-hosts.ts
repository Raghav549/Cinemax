import type { ProviderAdapter } from "../types";

/**
 * Video hosts that publish official, documented embed players for public
 * content. Each adapter only rewrites the share URL into that provider's own
 * embed URL - nothing is scraped or proxied.
 */

function firstSegment(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

/* ---------------------------------------------------------------- Streamable */

export const streamableAdapter: ProviderAdapter = {
  info: {
    id: "streamable",
    name: "Streamable",
    tagline: "Public Streamable videos play in the official Streamable embed.",
    accent: "#0f8fff",
    requirements: { login: false, subscription: false, drm: false },
  },
  match(url) {
    return ["streamable.com", "www.streamable.com"].includes(url.hostname.toLowerCase().replace(/\.$/, ""));
  },
  parse(url) {
    const segments = url.pathname.split("/").filter(Boolean);
    const id = segments[0] === "e" || segments[0] === "embed" ? segments[1] : segments[0];
    if (!id || !/^[a-z0-9]+$/i.test(id)) return null;
    return {
      kind: "video",
      contentId: id,
      canonicalUrl: `https://streamable.com/${id}`,
      playback: { strategy: "embed", src: `https://streamable.com/e/${id}`, embedTitle: "Streamable player" },
    };
  },
};

/* ---------------------------------------------------------------------- Loom */

export const loomAdapter: ProviderAdapter = {
  info: {
    id: "loom",
    name: "Loom",
    tagline: "Shared Loom recordings play in the official Loom embed.",
    accent: "#625df5",
    requirements: { login: false, subscription: false, drm: false },
    restriction: "Workspace-restricted Loom recordings may require signing in to Loom inside the player.",
  },
  match(url) {
    return ["loom.com", "www.loom.com"].includes(url.hostname.toLowerCase().replace(/\.$/, ""));
  },
  parse(url) {
    const segments = url.pathname.split("/").filter(Boolean);
    const id = segments[0] === "share" || segments[0] === "embed" ? segments[1] : null;
    if (!id || !/^[a-f0-9]{16,}$/i.test(id)) return null;
    return {
      kind: "video",
      contentId: id,
      canonicalUrl: `https://www.loom.com/share/${id}`,
      playback: { strategy: "embed", src: `https://www.loom.com/embed/${id}`, embedTitle: "Loom player" },
    };
  },
};

/* -------------------------------------------------------------------- Wistia */

export const wistiaAdapter: ProviderAdapter = {
  info: {
    id: "wistia",
    name: "Wistia",
    tagline: "Public Wistia videos play in the official Wistia player.",
    accent: "#54bbff",
    requirements: { login: false, subscription: false, drm: false },
    restriction: "Turnstile-gated or password-protected Wistia videos ask for the details inside the player.",
  },
  match(url) {
    return ["wistia.com", "www.wistia.com", "fast.wistia.net", "wistia.net", "wi.st"].includes(url.hostname.toLowerCase().replace(/\.$/, ""));
  },
  parse(url) {
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const segments = url.pathname.split("/").filter(Boolean);
    let id: string | null = null;
    if (host === "fast.wistia.net" && segments[0] === "embed" && (segments[1] === "iframe" || segments[1] === "medias")) id = segments[2] ?? null;
    else if (segments[0] === "medias") id = segments[1] ?? null;
    if (!id) return null;
    return {
      kind: "video",
      contentId: id,
      canonicalUrl: `https://fast.wistia.net/embed/iframe/${id}`,
      playback: { strategy: "embed", src: `https://fast.wistia.net/embed/iframe/${id}`, embedTitle: "Wistia player" },
    };
  },
};

/* ----------------------------------------------------------------------- TED */

export const tedAdapter: ProviderAdapter = {
  info: {
    id: "ted",
    name: "TED",
    tagline: "TED talks play in the official TED embed player.",
    accent: "#e62b1e",
    requirements: { login: false, subscription: false, drm: false },
  },
  match(url) {
    return ["ted.com", "www.ted.com"].includes(url.hostname.toLowerCase().replace(/\.$/, ""));
  },
  parse(url) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] !== "talks" || !segments[1]) return null;
    const slug = segments[1].replace(/[^A-Za-z0-9_-]/g, "");
    if (!slug) return null;
    return {
      kind: "video",
      contentId: slug,
      canonicalUrl: `https://www.ted.com/talks/${slug}`,
      playback: { strategy: "embed", src: `https://embed.ted.com/talks/${slug}`, embedTitle: "TED player" },
    };
  },
};

/* ---------------------------------------------------------- Internet Archive */

export const archiveAdapter: ProviderAdapter = {
  info: {
    id: "archive",
    name: "Internet Archive",
    tagline: "Public domain and archived videos play in the official archive.org embed.",
    accent: "#666666",
    requirements: { login: false, subscription: false, drm: false },
  },
  match(url) {
    return ["archive.org", "www.archive.org", "ia800000.us.archive.org"].includes(url.hostname.toLowerCase().replace(/\.$/, ""));
  },
  parse(url) {
    const segments = url.pathname.split("/").filter(Boolean);
    const kind = segments[0] === "details" || segments[0] === "embed" ? segments[1] : null;
    if (!kind) return null;
    const id = kind.replace(/[^A-Za-z0-9_.-]/g, "");
    if (!id) return null;
    return {
      kind: "video",
      contentId: id,
      canonicalUrl: `https://archive.org/details/${id}`,
      playback: { strategy: "embed", src: `https://archive.org/embed/${id}`, embedTitle: "Internet Archive player" },
    };
  },
};

/** Shared helper kept close to its users. */
export { firstSegment };
