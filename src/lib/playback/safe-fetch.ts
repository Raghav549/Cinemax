import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isBlockedHost, parseShareUrl } from "@/lib/providers/url";

/**
 * Server-side, SSRF-hardened GET used only to inspect a playback link.
 *
 * · http(s) only, no credentials, redirects followed manually (max 5) and
 *   every hop re-validated;
 * · the destination must resolve to public addresses only, and the socket is
 *   pinned to the address that was validated (no DNS-rebinding window);
 * · bounded body size and time, no cookies, no caller-supplied credentials.
 *
 * `CINEMAX_PLAYBACK_ALLOW_PRIVATE_HOSTS=true` lifts the address checks for
 * local development and automated tests ONLY. It is never needed in production.
 */

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 CinemaxPlayback/1.0";

const PRIVATE_ADDRESSES = new BlockList();
([
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const).forEach(([address, prefix]) => PRIVATE_ADDRESSES.addSubnet(address, prefix, "ipv4"));
([
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["::ffff:0:0", 96],
] as const).forEach(([address, prefix]) => PRIVATE_ADDRESSES.addSubnet(address, prefix, "ipv6"));

export function privateHostsAllowed(): boolean {
  return process.env.CINEMAX_PLAYBACK_ALLOW_PRIVATE_HOSTS === "true";
}

function isPrivateAddress(address: string, family: number): boolean {
  return PRIVATE_ADDRESSES.check(address, family === 6 ? "ipv6" : "ipv4");
}

export class SafeFetchError extends Error {}

export function validatePlaybackUrl(raw: string): URL {
  const parsed = parseShareUrl(raw);
  if (!parsed.ok) throw new SafeFetchError(parsed.message);
  const url = parsed.url;
  if (!privateHostsAllowed()) {
    if (url.port && url.port !== "80" && url.port !== "443") throw new SafeFetchError("Only standard web ports are allowed.");
    if (isBlockedHost(url.hostname)) throw new SafeFetchError("That address is not a public website.");
  }
  return url;
}

async function resolveTarget(hostname: string): Promise<{ address: string; family: number }> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (privateHostsAllowed()) {
    const found = await lookup(bare);
    return found;
  }
  const literal = isIP(bare);
  if (literal) {
    if (isPrivateAddress(bare, literal)) throw new SafeFetchError("That address is not a public website.");
    return { address: bare, family: literal };
  }
  const addresses = await lookup(bare, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address, entry.family))) {
    throw new SafeFetchError("That address is not a public website.");
  }
  return addresses[0];
}

export interface SafeResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  /** Final URL after redirects. */
  url: string;
}

interface GetOptions {
  maxBytes: number;
  timeoutMs: number;
  range?: string;
}

function requestOnce(url: URL, options: GetOptions): Promise<SafeResponse> {
  return resolveTarget(url.hostname).then(
    (target) =>
      new Promise<SafeResponse>((resolve, reject) => {
        const headers: Record<string, string> = {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,video/*,application/vnd.apple.mpegurl,application/dash+xml,*/*;q=0.8",
          "Accept-Encoding": "identity",
        };
        if (options.range) headers.Range = options.range;
        const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
        const req = transport(
          url,
          {
            method: "GET",
            headers,
            // Pin the socket to the validated address; the Host/SNI still come from the URL.
            lookup: (_host: string, opts: { all?: boolean }, callback: (...args: unknown[]) => void) => {
              if (opts && opts.all) callback(null, [{ address: target.address, family: target.family }]);
              else callback(null, target.address, target.family);
            },
          } as Parameters<typeof transport>[1],
          (res) => {
            const chunks: Buffer[] = [];
            let received = 0;
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks), url: url.toString() });
            };
            res.on("data", (chunk: Buffer) => {
              if (REDIRECT_STATUSES.has(res.statusCode ?? 0)) return; // redirect bodies are discarded
              const remaining = options.maxBytes - received;
              if (chunk.length >= remaining) {
                if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
                received = options.maxBytes;
                res.destroy();
                finish();
                return;
              }
              received += chunk.length;
              chunks.push(chunk);
            });
            res.on("end", finish);
            res.on("error", () => finish());
          },
        );
        const timer = setTimeout(() => req.destroy(new SafeFetchError("The site took too long to respond.")), options.timeoutMs);
        req.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        req.end();
      }),
  );
}

/** GET a public http(s) URL, following validated redirects. Never sends credentials. */
export async function safeGet(input: string | URL, options: GetOptions): Promise<SafeResponse> {
  let current = validatePlaybackUrl(input.toString());
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await requestOnce(current, options);
    const location = response.headers.location;
    if (REDIRECT_STATUSES.has(response.status) && location) {
      current = validatePlaybackUrl(new URL(String(location), current).toString());
      continue;
    }
    return response;
  }
  throw new SafeFetchError("The link redirects too many times.");
}
