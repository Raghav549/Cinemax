/**
 * Safe parsing of user-supplied share links.
 *
 * Every URL that enters the share-link system - pasted into the app, opened via
 * a deep link, or stored as a playback source - goes through here first. The
 * rules are deliberately strict:
 *
 *   · only http(s) URLs are accepted; https is required for anything that will
 *     be embedded or fetched (http survives only for direct media sources,
 *     which legacy streaming servers still use);
 *   · javascript:, data:, file:, vbscript:, blob:, intent:, content: and every
 *     other custom scheme is rejected before any component sees the URL;
 *   · credentials in the authority, control characters and absurd lengths are
 *     rejected;
 *   · IP-literal hosts are refused for server-side fetches (SSRF hardening).
 */

export type UrlRejectionReason = "empty" | "invalid" | "unsafe-scheme";

export type ParsedShareUrl =
  | { ok: true; url: URL }
  | { ok: false; reason: UrlRejectionReason; message: string };

/** Absolute URLs beyond this are never legitimate share links. */
export const MAX_URL_LENGTH = 2048;

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F\s]/;

function reject(reason: UrlRejectionReason, message: string): ParsedShareUrl {
  return { ok: false, reason, message };
}

/**
 * Parse and validate a user-supplied URL. Never throws.
 *
 * `requireSecure` additionally forbids plain http - used for anything that is
 * embedded in the app or fetched server-side.
 */
export function parseShareUrl(raw: string | null | undefined, requireSecure = false): ParsedShareUrl {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) return reject("empty", "Paste a video or share link to continue.");
  if (input.length > MAX_URL_LENGTH) return reject("invalid", "That link is too long to be a video or share link.");
  if (CONTROL_CHARACTERS.test(input)) return reject("invalid", "That link contains characters that are not allowed in URLs.");

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return reject("invalid", "That doesn’t look like a link. Include the full address, e.g. https://…");
  }

  if (url.protocol === "javascript:" || url.protocol === "data:" || url.protocol === "file:" || url.protocol === "vbscript:") {
    return reject("unsafe-scheme", "Links of that type are not allowed.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return reject("unsafe-scheme", "Only web (http/https) video and share links are supported.");
  }
  if (url.username || url.password) {
    return reject("invalid", "Links with embedded sign-in details are not allowed.");
  }
  if (!url.hostname) {
    return reject("invalid", "That link is missing a website address.");
  }
  if (requireSecure && url.protocol !== "https:") {
    return reject("unsafe-scheme", "This action requires a secure https link.");
  }
  return { ok: true, url };
}

/** True for hosts that must never be contacted by the server-side metadata fetch. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  // IPv4 literals (including decimal/hex forms URL parsers normalise).
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  // IPv6 literals ([::1], [fe80::…]) - URL.hostname keeps the brackets-less form.
  if (host.includes(":") || host.startsWith("[")) return true;
  // Integer/hex IPv4 tricks (http://2130706433/) become pure digits or 0x….
  if (/^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) return true;
  return false;
}

/**
 * Server-side SSRF guard for the metadata fetch: the endpoint must be https,
 * on a non-private host, and inside the explicit provider oEmbed allowlist.
 * Nothing else is ever contacted - no redirects to unknown hosts, no internal
 * addresses, no user-controlled fetch targets.
 */
export function isFetchableMetadataUrl(raw: string, allowedHosts: ReadonlySet<string>): boolean {
  const parsed = parseShareUrl(raw, true);
  if (!parsed.ok) return false;
  const host = parsed.url.hostname.toLowerCase().replace(/\.$/, "");
  if (isBlockedHost(host)) return false;
  return allowedHosts.has(host);
}

/** Small helper: display-safe host name for UI copy. */
export function displayHost(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}
