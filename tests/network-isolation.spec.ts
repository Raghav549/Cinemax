import { test, expect, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPlaybackMovie, dismissPlayer, preparePage } from "./helpers";

/**
 * Network isolation and recovery for externally hosted media.
 *
 * A stand-in "provider" origin (`https://provider.test`) is answered by the
 * browser-side route handler, so every request the player makes for the media
 * is observable: where it went, what it carried, and how the player reacts
 * when the provider is slow, drops the connection or is genuinely down. The
 * Cinemax server cannot reach that host, which exercises the real production
 * path for a direct media link: the browser is handed the admin's own URL and
 * fetches it from the provider itself.
 */

const PROVIDER = "https://provider.test";
const CLIP = `${PROVIDER}/library/prism-test.webm`;
const HLS = `${PROVIDER}/library/prism-master.m3u8`;

interface ProviderControl {
  /** Delay before the first byte of every response, ms. */
  delayMs: number;
  /** When true every request fails at the connection level (server down). */
  down: boolean;
  /** HTTP status to answer with instead of media (0 = serve media). */
  status: number;
  requests: Array<{ url: string; range: string | null; cookie: string | null; referer: string | null }>;
}

const MIME: Record<string, string> = { webm: "video/webm", m3u8: "application/vnd.apple.mpegurl", ts: "video/mp2t" };

async function serveProvider(page: Page, control: ProviderControl) {
  const files = new Map<string, Buffer>();
  await page.route(`${PROVIDER}/**`, async (route: Route) => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split("/").pop() || "";
    if (!/^prism-[a-z0-9-]+\.(webm|m3u8|ts)$/.test(name)) { await route.fulfill({ status: 404, body: "" }); return; }
    if (!files.has(name)) files.set(name, await readFile(join(__dirname, "fixtures", name)));
    const bytes = files.get(name)!;
    const mime = MIME[name.split(".").pop() || ""] || "application/octet-stream";
    control.requests.push({
      url: request.url(),
      range: await request.headerValue("range"),
      cookie: await request.headerValue("cookie"),
      referer: await request.headerValue("referer"),
    });
    if (control.down) { await route.abort("connectionfailed"); return; }
    if (control.delayMs) await new Promise((resolve) => setTimeout(resolve, control.delayMs));
    if (control.down) { await route.abort("connectionfailed"); return; }
    if (control.status) { await route.fulfill({ status: control.status, body: "" }); return; }
    const range = await request.headerValue("range");
    const match = range ? /bytes=(\d+)-(\d*)/.exec(range) : null;
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
    await route.fulfill({
      status: match ? 206 : 200,
      headers: {
        "content-type": mime,
        "access-control-allow-origin": "*",
        "accept-ranges": "bytes",
        "content-length": String(end - start + 1),
        ...(match ? { "content-range": `bytes ${start}-${end}/${bytes.length}` } : {}),
      },
      body: bytes.subarray(start, end + 1),
    });
  });
}

function control(): ProviderControl {
  return { delayMs: 0, down: false, status: 0, requests: [] };
}

async function appRequests(page: Page) {
  return page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
}

const videoState = (page: Page) => page.evaluate(() => {
  const video = document.querySelector<HTMLVideoElement>("video.video-element");
  return video ? { src: video.currentSrc || video.src, time: video.currentTime, paused: video.paused, readyState: video.readyState, error: video.error?.code ?? null } : null;
});

test.describe("external media network isolation", () => {
  test.beforeEach(async ({ page }) => { await preparePage(page); });

  test("media requests go straight to the provider with the stored URL; nothing is proxied through Cinemax", async ({ page, request }) => {
    const provider = control();
    await serveProvider(page, provider);
    const movie = await createPlaybackMovie(request, CLIP);
    try {
      await page.goto(`/movie/${movie.id}?play=1`, { waitUntil: "domcontentloaded" });
      await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 20_000 }).toBeGreaterThan(0.5);

      const state = await videoState(page);
      expect(state?.src).toBe(CLIP);
      expect(provider.requests.length).toBeGreaterThan(0);
      for (const entry of provider.requests) {
        expect(entry.url.startsWith(PROVIDER)).toBeTruthy();
        // No Cinemax cookie/session leaks to the provider; the Referer is the
        // browser default (origin only) - the provider's own policies apply.
        expect(entry.cookie).toBeNull();
        expect(entry.referer ?? "").not.toContain("/movie/");
      }
      // The only Cinemax request on behalf of playback is the plan; no byte of
      // media crosses a Cinemax endpoint.
      const names = await appRequests(page);
      expect(names.some((name) => name.includes("/api/stream/") || name.includes("/api/media/"))).toBeFalsy();
      expect(names.filter((name) => name.includes(`/api/movies/${movie.id}/playback`)).length).toBeLessThanOrEqual(1);
      // A preconnect to the provider origin is the only hint Cinemax adds.
      expect(await page.locator('link[rel="preconnect"][data-cinemax-player]').getAttribute("href")).toBe(PROVIDER);
      await dismissPlayer(page);
    } finally { await request.delete(`/api/movies/${movie.id}`); }
  });

  test("a slow provider is waited for while it is still sending, not cut off by a fixed timer", async ({ page, request }) => {
    const provider = control();
    provider.delayMs = 13_500; // longer than the former 12 s hard timeout
    await serveProvider(page, provider);
    const movie = await createPlaybackMovie(request, CLIP);
    try {
      await page.goto(`/movie/${movie.id}?play=1`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".player-buffering")).toBeVisible();
      await page.waitForTimeout(12_600);
      await expect(page.locator(".player-error")).toHaveCount(0);
      provider.delayMs = 0;
      await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 25_000 }).toBeGreaterThan(0.5);
      await dismissPlayer(page);
    } finally { await request.delete(`/api/movies/${movie.id}`); }
  });

  test("a provider that stops responding mid-stream is reconnected to with back-off and playback resumes in place", async ({ page, request }) => {
    const provider = control();
    provider.delayMs = 1200; // each segment takes a while: playback starts well before the stream is buffered
    await serveProvider(page, provider);
    const movie = await createPlaybackMovie(request, HLS);
    try {
      await page.goto(`/movie/${movie.id}?play=1`, { waitUntil: "domcontentloaded" });
      await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 25_000 }).toBeGreaterThan(0.3);
      await page.evaluate(() => { (window as unknown as { __cinemaxMarker: number }).__cinemaxMarker = 42; });
      // Every segment so far came from the provider, directly.
      expect(provider.requests.every((entry) => entry.url.startsWith(PROVIDER))).toBeTruthy();
      const before = provider.requests.length;

      // The provider drops every connection (an outage at the source).
      provider.down = true;
      provider.delayMs = 0;
      await page.waitForTimeout(9_000);
      // The player must not blame the viewer's connection, must not reload
      // the page, and must not hammer the provider.
      await expect(page.getByRole("heading", { name: "You’re offline" })).toHaveCount(0);
      const attemptsWhileDown = provider.requests.length - before;
      expect(attemptsWhileDown).toBeGreaterThan(0);
      expect(attemptsWhileDown).toBeLessThan(40);
      const stalledAt = (await videoState(page))?.time ?? 0;

      // The provider comes back: playback continues from where it stopped, in
      // the same document (no application reload, no re-mounted player).
      provider.down = false;
      await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 40_000 }).toBeGreaterThan(stalledAt + 1.5);
      expect(await page.evaluate(() => (window as unknown as { __cinemaxMarker?: number }).__cinemaxMarker)).toBe(42);
      await expect(page.locator(".player-error")).toHaveCount(0);
      await dismissPlayer(page);
    } finally { await request.delete(`/api/movies/${movie.id}`); }
  });

  test("a provider that is down at start shows the source error, never an application network failure", async ({ page, request }) => {
    const provider = control();
    provider.down = true;
    await serveProvider(page, provider);
    const movie = await createPlaybackMovie(request, CLIP);
    try {
      await page.goto(`/movie/${movie.id}?play=1`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".player-error-title")).toBeVisible({ timeout: 40_000 });
      const title = await page.locator(".player-error-title").textContent();
      expect(["The video server isn’t responding", "This video can’t be played here"]).toContain(title?.trim());
      await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
      // Try again re-attaches the provider URL; it does not reload the app.
      provider.down = false;
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 20_000 }).toBeGreaterThan(0.5);
      await dismissPlayer(page);
    } finally { await request.delete(`/api/movies/${movie.id}`); }
  });

  test("a provider that refuses the request (403) is reported as such, without reconnect attempts", async ({ page, request }) => {
    const provider = control();
    provider.status = 403;
    await serveProvider(page, provider);
    const movie = await createPlaybackMovie(request, CLIP);
    try {
      await page.goto(`/movie/${movie.id}?play=1`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "This video can’t be played here" })).toBeVisible({ timeout: 20_000 });
      const seen = provider.requests.length;
      await page.waitForTimeout(2_500);
      expect(provider.requests.length).toBe(seen);
      await dismissPlayer(page);
    } finally { await request.delete(`/api/movies/${movie.id}`); }
  });
});
