import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { preparePage } from "./helpers";

/**
 * Universal in-app playback: web links (watch pages), direct files, HLS and DASH.
 *
 * Requires a local fixture provider (see tests/fixtures/README.md) and the app started with
 * CINEMAX_PLAYBACK_ALLOW_PRIVATE_HOSTS=true so the server may reach that loopback provider.
 * The suite creates its own clearly-labelled records and deletes only those records.
 */

const FIXTURE_BASE = process.env.PLAYBACK_FIXTURE_BASE || "http://127.0.0.1:8900";
const ADMIN = { email: process.env.ADMIN_EMAIL || "admin@cinemax.com", password: process.env.ADMIN_PASSWORD || "Admin@123" };

async function fixtureAvailable(request: APIRequestContext) {
  try {
    const res = await request.get(`${FIXTURE_BASE}/media/clip.webm`, { headers: { Range: "bytes=0-15" }, timeout: 4000 });
    return res.status() === 206 || res.status() === 200;
  } catch {
    return false;
  }
}

async function createTestMovie(request: APIRequestContext, title: string, videoUrl: string) {
  const login = await request.post("/api/admin/login", { data: ADMIN });
  expect(login.ok(), "admin login for the test studio").toBeTruthy();
  const res = await request.post("/api/movies", {
    data: {
      title: `Universal playback test ${title} ${Date.now()}`,
      description: "Temporary automated playback fixture. Deleted by the test that created it.",
      year: 2024, rating: "8.0", duration: "1m 30s", genre: "Test", language: "English", type: "Movie",
      category: "trending", posterUrl: "", backdropUrl: "", videoUrl, rightsConfirmed: true,
      sourceType: "open_license", catalogStatus: "verified_playable",
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: number; title: string };
}

async function deleteTestMovie(request: APIRequestContext, id: number) {
  await request.post("/api/admin/login", { data: ADMIN });
  await request.delete(`/api/movies/${id}`);
}

async function openPlayer(page: Page, movieId: number) {
  await page.goto(`/movie/${movieId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Watch Now", exact: true }).click();
}

async function videoState(page: Page) {
  return page.locator("video").first().evaluate((v: HTMLVideoElement) => ({
    readyState: v.readyState,
    paused: v.paused,
    time: v.currentTime,
    error: v.error?.code ?? null,
  })).catch(() => null);
}

test.describe("Universal playback resolution", () => {
  test.beforeEach(async ({ page }) => {
    await preparePage(page);
  });

  test("playback plan classifies direct, HLS, DASH, page-embed, static-page, OG, redirect, and dead links", async ({ request }) => {
    test.skip(!(await fixtureAvailable(request)), "Local playback fixture provider is not running");
    const cases: Array<{ url: string; strategy: string; engine?: string; embedPath?: string; embedSettings?: Record<string, string> }> = [
      { url: `${FIXTURE_BASE}/media/clip.webm`, strategy: "direct", engine: "video" },
      { url: `${FIXTURE_BASE}/media/clip.mp4`, strategy: "direct", engine: "video" },
      { url: `${FIXTURE_BASE}/media/hls/index.m3u8`, strategy: "direct", engine: "hls" },
      { url: `${FIXTURE_BASE}/media/dash/manifest.mpd`, strategy: "direct", engine: "dash" },
      { url: `${FIXTURE_BASE}/watch/movie/1058424`, strategy: "embed" },
      { url: `${FIXTURE_BASE}/movie/315162?color=B72CDD&autoplay=true`, strategy: "embed", embedPath: "/embed/vidy/315162", embedSettings: { color: "B72CDD", autoplay: "true" } },
      { url: `${FIXTURE_BASE}/watch/static-video`, strategy: "direct", engine: "video" },
      { url: `${FIXTURE_BASE}/watch/og-video`, strategy: "direct", engine: "video" },
      { url: `${FIXTURE_BASE}/watch/redirect`, strategy: "direct", engine: "video" },
      { url: `${FIXTURE_BASE}/watch/denied`, strategy: "external" },
      { url: `${FIXTURE_BASE}/watch/article`, strategy: "external" },
    ];
    await request.post("/api/admin/login", { data: ADMIN });
    for (const item of cases) {
      const created = await createTestMovie(request, item.url.split("/").slice(-2).join("-"), item.url);
      try {
        const res = await request.get(`/api/movies/${created.id}/playback`);
        expect(res.status(), item.url).toBe(200);
        const { resolution } = (await res.json()) as { resolution: { playback: { strategy: string; engine?: string; src?: string } } };
        expect(resolution.playback.strategy, item.url).toBe(item.strategy);
        if (item.engine) expect(resolution.playback.engine, item.url).toBe(item.engine);
        if (item.embedPath) {
          const iframe = new URL(resolution.playback.src!);
          expect(iframe.pathname, item.url).toBe(item.embedPath);
          for (const [key, value] of Object.entries(item.embedSettings || {})) {
            expect(iframe.searchParams.get(key), `${item.url} ${key}`).toBe(value);
          }
        }
      } finally {
        await deleteTestMovie(request, created.id);
      }
    }
  });

  test("a dead link reports the failure reason instead of a generic player error", async ({ request }) => {
    test.skip(!(await fixtureAvailable(request)), "Local playback fixture provider is not running");
    const created = await createTestMovie(request, "dead", `${FIXTURE_BASE}/mock/gone`);
    try {
      const res = await request.get(`/api/movies/${created.id}/playback`);
      expect(res.status()).toBe(502);
      expect((await res.json()).error).toMatch(/HTTP 404/);
    } finally {
      await deleteTestMovie(request, created.id);
    }
  });
});

test.describe("Universal playback in the browser", () => {
  test.beforeEach(async ({ page, request }) => {
    test.skip(!(await fixtureAvailable(request)), "Local playback fixture provider is not running");
    await preparePage(page);
  });

  test("a Vidy-shaped /movie page keeps its settings and provider controls, seeks, and closes", async ({ page, request }) => {
    const source = `${FIXTURE_BASE}/movie/315162?color=B72CDD&autoplay=true`;
    const created = await createTestMovie(request, "vidy-shaped", source);
    try {
      await openPlayer(page, created.id);
      const iframe = page.locator("iframe.embedded-video");
      await expect(iframe).toHaveCount(1);
      await expect(iframe).toHaveAttribute("src", /color=B72CDD/);
      await expect(iframe).toHaveAttribute("src", /autoplay=true/);
      const provider = page.frameLocator("iframe.embedded-video");
      await expect.poll(() => provider.locator("#provider-player").getAttribute("data-color"), { timeout: 12000 }).toBe("B72CDD");
      await expect.poll(() => provider.locator("#provider-player").getAttribute("data-autoplay"), { timeout: 12000 }).toBe("true");
      await expect.poll(() => provider.locator("#provider-video").evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 30000 }).toBeGreaterThan(1);
      expect(await provider.locator("#provider-video").evaluate((video: HTMLVideoElement) => video.controls)).toBe(true);
      await provider.locator("#provider-video").evaluate((video: HTMLVideoElement) => { video.currentTime = 8; });
      await expect.poll(() => provider.locator("#provider-video").evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 15000 }).toBeGreaterThan(7);
      await page.keyboard.press("Escape");
      await expect(page.locator(".playback-layer")).toHaveCount(0);
      await expect(page.locator("iframe.embedded-video")).toHaveCount(0);
    } finally {
      await deleteTestMovie(request, created.id);
    }
  });

  test("a provider page blocked from server probing is attempted in the browser frame", async ({ page, request }) => {
    const created = await createTestMovie(request, "browser-frame-fallback", `${FIXTURE_BASE}/movie/315163?color=B72CDD&autoplay=true`);
    try {
      await openPlayer(page, created.id);
      const iframe = page.locator("iframe.embedded-video");
      await expect(iframe).toHaveAttribute("src", /movie\/315163\?color=B72CDD&autoplay=true/);
      const provider = page.frameLocator("iframe.embedded-video");
      await expect.poll(() => provider.locator("#browser-provider-video").evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 30000 }).toBeGreaterThan(1);
      expect(await provider.locator("#browser-provider-video").evaluate((video: HTMLVideoElement) => video.controls)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator(".playback-layer")).toHaveCount(0);
    } finally {
      await deleteTestMovie(request, created.id);
    }
  });

  test("a watch page with its own JavaScript player plays through the page's own player", async ({ page, request }) => {
    const created = await createTestMovie(request, "watch-page", `${FIXTURE_BASE}/watch/movie/1058424`);
    try {
      await openPlayer(page, created.id);
      const frame = page.frameLocator("iframe.embedded-video");
      await expect(page.locator("iframe.embedded-video")).toHaveCount(1);
      await expect.poll(async () => frame.locator("video").first().evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30000 }).toBeGreaterThan(1);
      await expect(page.getByText("This stream needs another moment")).toHaveCount(0);
    } finally {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await deleteTestMovie(request, created.id);
    }
  });

  test("a direct WebM plays with advancing time, can seek, and stops when closed", async ({ page, request }) => {
    const created = await createTestMovie(request, "direct-webm", `${FIXTURE_BASE}/media/clip.webm`);
    try {
      await openPlayer(page, created.id);
      await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 30000 }).toBeGreaterThan(1);
      const state = await videoState(page);
      expect(state?.error).toBeNull();
      // Seek on the element directly and confirm the engine honours it.
      await page.locator("video").first().evaluate((v: HTMLVideoElement) => { v.currentTime = 20; });
      await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 15000 }).toBeGreaterThan(19);
      // Closing must tear down playback: no video element remains and the layer is gone.
      await page.keyboard.press("Escape");
      await expect(page.locator(".playback-layer")).toHaveCount(0);
      await expect(page.locator("video")).toHaveCount(0);
    } finally {
      await deleteTestMovie(request, created.id);
    }
  });

  test("a slow watch page shows a finding-the-stream state, then plays", async ({ page, request }) => {
    const created = await createTestMovie(request, "slow-watch", `${FIXTURE_BASE}/watch/slow`);
    try {
      await page.goto(`/movie/${created.id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Watch Now", exact: true }).click();
      // While the server searches the page, the player shows the loading panel and no video yet.
      await expect(page.locator(".player-error-title", { hasText: "Finding the stream" })).toBeVisible({ timeout: 4000 });
      expect(await page.locator("video").count()).toBe(0);
      // Once the media is found, the loading panel is replaced by real playback.
      await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 40000 }).toBeGreaterThan(0.5);
      await expect(page.locator(".player-error-title", { hasText: "Finding the stream" })).toHaveCount(0);
    } finally {
      await deleteTestMovie(request, created.id);
    }
  });

  test("a direct video enters and leaves fullscreen from the player's own control", async ({ page, request }) => {
    const created = await createTestMovie(request, "direct-fullscreen", `${FIXTURE_BASE}/media/clip.mp4`);
    try {
      await openPlayer(page, created.id);
      await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 30000 }).toBeGreaterThan(0.5);
      await page.locator(".video-player-shell").first().hover();
      await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null), { timeout: 10000 }).toBeTruthy();
      await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null), { timeout: 10000 }).toBeTruthy();
    } finally {
      await deleteTestMovie(request, created.id);
    }
  });

  test("an HLS manifest plays through hls.js and a DASH manifest plays through dash.js", async ({ page, request }) => {
    const hls = await createTestMovie(request, "hls", `${FIXTURE_BASE}/media/hls/index.m3u8`);
    const dash = await createTestMovie(request, "dash", `${FIXTURE_BASE}/media/dash/manifest.mpd`);
    try {
      for (const movie of [hls, dash]) {
        await openPlayer(page, movie.id);
        await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 40000 }).toBeGreaterThan(1);
        await page.keyboard.press("Escape");
        await expect(page.locator("video")).toHaveCount(0);
      }
    } finally {
      await deleteTestMovie(request, hls.id);
      await deleteTestMovie(request, dash.id);
    }
  });

  test("a frame-denied page with no playable media opens the honest hand-off, not a broken player", async ({ page, request }) => {
    const created = await createTestMovie(request, "denied", `${FIXTURE_BASE}/watch/denied`);
    try {
      await openPlayer(page, created.id);
      const handoff = page.locator(".provider-page");
      await expect(handoff).toBeVisible({ timeout: 20000 });
      await expect(handoff.getByRole("button", { name: "Open original link" })).toBeVisible();
      await expect(page.locator("video")).toHaveCount(0);
      await expect(page.locator("iframe.embedded-video")).toHaveCount(0);
    } finally {
      await page.keyboard.press("Escape");
      await deleteTestMovie(request, created.id);
    }
  });

  test("a dead link explains the failure instead of showing a generic player error", async ({ page, request }) => {
    const created = await createTestMovie(request, "dead-browser", `${FIXTURE_BASE}/mock/gone`);
    try {
      await openPlayer(page, created.id);
      await expect(page.getByRole("dialog", { name: /Playback unavailable/ })).toBeVisible({ timeout: 20000 });
      await expect(page.getByText("The link responded with HTTP 404.")).toBeVisible();
      await expect(page.locator("video")).toHaveCount(0);
    } finally {
      await page.keyboard.press("Escape");
      await deleteTestMovie(request, created.id);
    }
  });

  test("closing one title and opening another leaves no stale playback running", async ({ page, request }) => {
    const first = await createTestMovie(request, "switch-a", `${FIXTURE_BASE}/media/clip.webm`);
    const second = await createTestMovie(request, "switch-b", `${FIXTURE_BASE}/media/hls/index.m3u8`);
    try {
      await openPlayer(page, first.id);
      await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 30000 }).toBeGreaterThan(1);
      await page.keyboard.press("Escape");
      await expect(page.locator(".playback-layer")).toHaveCount(0);
      await expect(page.locator("video")).toHaveCount(0);

      const requestsBefore = [] as string[];
      page.on("request", (req) => { if (req.url().includes("/media/")) requestsBefore.push(req.url()); });
      await page.goto(`/movie/${second.id}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Watch Now", exact: true }).click();
      await expect.poll(async () => (await videoState(page))?.time ?? 0, { timeout: 40000 }).toBeGreaterThan(1);
      const playing = await page.locator("video").count();
      expect(playing).toBe(1);
      await expect(page.locator("video").first()).toHaveAttribute("src", /^blob:/);
      expect(requestsBefore.some((url) => url.endsWith("clip.webm"))).toBeFalsy();
      await page.keyboard.press("Escape");
      await expect(page.locator("video")).toHaveCount(0);
    } finally {
      await deleteTestMovie(request, first.id);
      await deleteTestMovie(request, second.id);
    }
  });
});

test("the studio saves and reopens a movie URL without losing player query parameters", async ({ page, request }) => {
  const title = `Admin URL preservation test ${Date.now()}`;
  const updatedTitle = `${title} updated`;
  const source = `${FIXTURE_BASE}/movie/315162?color=B72CDD&autoplay=true`;
  let movieId: number | undefined;

  try {
    const login = await page.request.post("/api/admin/login", { data: ADMIN });
    expect(login.ok(), "Admin session for the studio workflow").toBeTruthy();
    // PGlite is the isolated, in-memory test DB and is less tolerant of many
    // simultaneous PostgreSQL-wire clients than production PostgreSQL. Read
    // these unrelated dashboard summaries from the real API sequentially, then
    // replay those exact responses while the movie list and CRUD remain live.
    for (const path of ["/api/admin/stats", "/api/admin/slides", "/api/categories", "/api/admin/watchlist"]) {
      const response = await page.request.get(path);
      expect(response.ok(), `Read isolated dashboard data: ${path}`).toBeTruthy();
      const body = await response.text();
      await page.route(`**${path}`, (route) => route.fulfill({
        status: response.status(),
        headers: { "content-type": response.headers()["content-type"] || "application/json" },
        body,
      }));
    }
    await page.goto("/gate-keeper/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Cinemax studio", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "movies", exact: true }).click();
    await page.getByRole("button", { name: "+ Add", exact: true }).click();
    await page.locator(".studio-dashboard input.glass-input").first().fill(title);
    await page.getByPlaceholder("MP4, WebM, HLS, DASH, watch-page link, YouTube, Vimeo, or magnet URI").fill(source);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Added", { exact: true })).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    const readMovies = async () => {
      const response = await request.get("/api/movies?limit=500&includeUnavailable=true");
      expect(response.ok()).toBeTruthy();
      return await response.json() as Array<{ id: number; title: string; videoUrl: string | null }>;
    };
    const saved = (await readMovies()).find((movie) => movie.title === title);
    expect(saved).toBeDefined();
    movieId = saved!.id;
    expect(saved!.videoUrl).toBe(source);

    const row = page.getByText(title, { exact: true }).locator("..").locator("..");
    await row.locator("button").first().click();
    await expect(page.getByRole("heading", { name: "Edit Movie", exact: true })).toBeVisible();
    const videoUrlInput = page.getByPlaceholder("MP4, WebM, HLS, DASH, watch-page link, YouTube, Vimeo, or magnet URI");
    await expect(videoUrlInput).toHaveValue(source);
    await page.locator(".studio-dashboard input.glass-input").first().fill(updatedTitle);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Updated", { exact: true })).toBeVisible();

    const updated = (await readMovies()).find((movie) => movie.id === movieId);
    expect(updated?.title).toBe(updatedTitle);
    expect(updated?.videoUrl).toBe(source);
  } finally {
    if (!movieId) {
      const response = await request.get("/api/movies?limit=500&includeUnavailable=true").catch(() => null);
      const movies = response?.ok() ? await response.json().catch(() => []) as Array<{ id: number; title: string }> : [];
      movieId = movies.find((movie) => movie.title === title || movie.title === updatedTitle)?.id;
    }
    if (movieId) await deleteTestMovie(request, movieId);
  }
});
