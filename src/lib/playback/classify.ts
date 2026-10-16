import { resolveShareLink } from "@/lib/providers/registry";

/**
 * Isomorphic URL triage for catalogue playback sources.
 *
 * `needsServerResolution` is true for absolute web links that the registry
 * cannot identify as a known provider (watch pages, signed CDN links with no
 * extension) and for plain direct-file links. Those must be inspected on the
 * server - the page may be HTML, redirect elsewhere, or expose its own player -
 * before the browser is asked to play anything. Known providers (YouTube,
 * Vimeo, official embeds, local `/api/...` sources) are resolved synchronously.
 */
export function needsServerResolution(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim();
  if (!value || value.startsWith("/")) return false;
  const resolution = resolveShareLink(value);
  if (!resolution.ok) return false;
  return resolution.provider.id === "web" || resolution.provider.id === "direct-media";
}
