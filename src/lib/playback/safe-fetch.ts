import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { Agent as HttpAgent, request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { isBlockedHost, parseShareUrl } from "@/lib/providers/url";

/**
 * Server-side, SSRF-hardened GET used only to inspect a playback link.
 *
 * · http(s) only, no credentials, redirects followed manually (max 5) and
 *   every hop re-validated;
 * · the destination must resolve to public addresses only, and the socket is
 *   pinned to the address that was validated (no DNS-rebinding window);
 * · bounded body size and time, no cookies, no caller-supplied credentials;
 * · connections and DNS answers are reused for a short while, so a page and the
 *   probes it leads to pay for one handshake and one lookup instead of one each.
 *
 * `CINEMAX_PLAYBACK_ALLOW_PRIVATE_HOSTS=true` lifts the address checks for
 * local development and automated tests ONLY. It is never needed in production.
 */

const MAX_REDIRECTS = 5;
/** Compressed bodies decompress to at most this much; guards against zip bombs. */
const MAX_DECODED_BYTES = 4 * 1024 * 1024;
const DNS_TTL_MS = 30 * 1000;
const DNS_CACHE_LIMIT = 256;

/**
 * Keep-alive agents. A playback probe is a burst of short requests to one host;
 * without pooling each one pays a fresh TCP + TLS handshake, which on a real
 * provider is a third of the wait.
 */
const agents = {
  "http:": new HttpAgent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 4, timeout: 20_000 }),
  "https:": new HttpsAgent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 4, timeout: 20_000 }),
};

/**
 * Short-lived DNS cache. Every probe used to re-resolve the same hostname; the
 * answer cannot change meaningfully inside half a minute, and the address is
 * still validated before use.
 */
const dnsCache = new Map<string, { address: string; family: number; at: number }>();
const dnsInFlight = new Map<string, Promise<{ address: string; family: number }>>();
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

function rememberAddress(hostname: string, found: { address: string; family: number }) {
  if (dnsCache.size >= DNS_CACHE_LIMIT) dnsCache.delete(dnsCache.keys().next().value as string);
  dnsCache.set(hostname, { ...found, at: Date.now() });
  return found;
}

async function lookupCached(hostname: string): Promise<{ address: string; family: number }> {
  const cached = dnsCache.get(hostname);
  if (cached && Date.now() - cached.at < DNS_TTL_MS) return { address: cached.address, family: cached.family };
  const pending = dnsInFlight.get(hostname);
  if (pending) return pending;
  const lookupPromise = (async () => {
    try {
      return rememberAddress(hostname, await lookup(hostname));
    } finally {
      dnsInFlight.delete(hostname);
    }
  })();
  dnsInFlight.set(hostname, lookupPromise);
  return lookupPromise;
}

async function resolveTarget(hostname: string): Promise<{ address: string; family: number }> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (privateHostsAllowed()) {
    return lookupCached(bare);
  }
  const literal = isIP(bare);
  if (literal) {
    if (isPrivateAddress(bare, literal)) throw new SafeFetchError("That address is not a public website.");
    return { address: bare, family: literal };
  }
  const cached = dnsCache.get(bare);
  if (cached && Date.now() - cached.at < DNS_TTL_MS) return { address: cached.address, family: cached.family };
  const addresses = await lookup(bare, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address, entry.family))) {
    throw new SafeFetchError("That address is not a public website.");
  }
  return rememberAddress(bare, addresses[0]);
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

/** Decode a compressed body, bounded so a hostile or broken response cannot exhaust memory. */
function decodeBody(body: Buffer, encoding: string): Promise<Buffer> {
  const kind = encoding.split(",")[0].trim().toLowerCase();
  if (!kind || kind === "identity") return Promise.resolve(body);
  const stream = kind === "gzip" || kind === "x-gzip" ? createGunzip()
    : kind === "br" ? createBrotliDecompress()
    : kind === "deflate" ? createInflate()
    : null;
  if (!stream) return Promise.resolve(body);
  return new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).subarray(0, MAX_DECODED_BYTES));
    };
    stream.on("data", (chunk: Buffer) => {
      const remaining = MAX_DECODED_BYTES - received;
      if (chunk.length >= remaining) {
        chunks.push(chunk.subarray(0, remaining));
        received = MAX_DECODED_BYTES;
        stream.destroy();
        done();
        return;
      }
      received += chunk.length;
      chunks.push(chunk);
    });
    stream.on("end", done);
    stream.on("error", done);
    stream.end(body);
  });
}

function requestOnce(url: URL, options: GetOptions): Promise<SafeResponse> {
  return resolveTarget(url.hostname).then(
    (target) =>
      new Promise<SafeResponse>((resolve, reject) => {
        const headers: Record<string, string> = {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,video/*,application/vnd.apple.mpegurl,application/dash+xml,*/*;q=0.8",
          // Provider pages are mostly markup, and they are read for a few
          // kilobytes of it: let the server compress the transfer.
          "Accept-Encoding": "gzip, br",
        };
        if (options.range) headers.Range = options.range;
        const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
        const req = transport(
          url,
          {
            method: "GET",
            headers,
            // Reuse a pooled socket instead of paying a handshake per probe.
            agent: agents[url.protocol === "https:" ? "https:" : "http:"],
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
            const settle = async () => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              const body = await decodeBody(Buffer.concat(chunks), String(res.headers["content-encoding"] ?? ""));
              resolve({ status: res.statusCode ?? 0, headers: res.headers, body, url: url.toString() });
            };
            res.on("data", (chunk: Buffer) => {
              if (REDIRECT_STATUSES.has(res.statusCode ?? 0)) return; // redirect bodies are discarded
              const remaining = options.maxBytes - received;
              if (chunk.length >= remaining) {
                if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
                received = options.maxBytes;
                res.destroy();
                void settle();
                return;
              }
              received += chunk.length;
              chunks.push(chunk);
            });
            res.on("end", () => void settle());
            res.on("error", () => void settle());
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
