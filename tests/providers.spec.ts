import { test, expect } from "@playwright/test";
import { createPlaybackMovie, dismissPlayer, preparePage, readCatalogue, servePlaybackFixtures } from "./helpers";

/**
 * Verified catalog playback, official external handoff, Coming Soon separation,
 * and removal of arbitrary link-to-watch UI.
 */
test.beforeEach(async ({ page }) => {
  await preparePage(page);
  await servePlaybackFixtures(page);
});

test("arbitrary share-link paste/watch UI is removed from Search, navigation, and routes", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Search", exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search the catalogue" })).toBeVisible();
  // No arbitrary share-link submission strip or form exists in Search.
  await expect(page.getByRole("region", { name: "Play a share link" })).toHaveCount(0);
  await expect(page.locator(".watch-link-strip, .share-link-form")).toHaveCount(0);

  // Open the Category Browser and confirm no 'Watch a link' or arbitrary link option exists.
  await page.getByRole("button", { name: "Open More panel" }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/Watch a link|Paste a link/i)).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close More panel" }).click();

  // The old /watch arbitrary link route and /api/providers/resolve endpoint are removed.
  const watchRes = await page.request.get("/watch?url=https://www.netflix.com/title/80057281");
  expect(watchRes.status()).toBe(404);
  const resolveRes = await page.request.get("/api/providers/resolve?url=https://www.netflix.com/title/80057281");
  expect(resolveRes.status()).toBe(404);
});

test("verified playable catalog streams support HTTP byte-range (206), HLS manifests, and subtitles", async ({ page }) => {
  const headRes = await page.request.head("/api/media/stream/sita-sings-the-blues-2008.webm");
  expect(headRes.status()).toBe(200);
  expect(headRes.headers()["content-type"]).toContain("video/webm");
  expect(headRes.headers()["accept-ranges"]).toBe("bytes");

  const rangeRes = await page.request.get("/api/media/stream/sita-sings-the-blues-2008.webm", {
    headers: { Range: "bytes=0-1023" },
  });
  expect(rangeRes.status()).toBe(206);
  expect(rangeRes.headers()["content-range"]).toMatch(/^bytes 0-1023\/\d+$/);

  const hlsRes = await page.request.get("/api/media/hls/tears-of-steel-2012/master.m3u8");
  expect(hlsRes.status()).toBe(200);
  expect(await hlsRes.text()).toContain("#EXTM3U");

  const vttRes = await page.request.get("/api/media/subtitles/sita-sings-the-blues-2008.vtt");
  expect(vttRes.status()).toBe(200);
  expect(await vttRes.text()).toContain("WEBVTT");
});

test("official_external_playback catalog entries show Watch on Official Service and open honest handoff dialog", async ({ page, request }) => {
  const catalogue = await readCatalogue(request);
  const externalMovie = catalogue.find((m) => m.catalogStatus === "official_external_playback");
  expect(externalMovie, "Catalog must include official_external_playback entries").toBeDefined();

  await page.goto(`/movie/${externalMovie!.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: externalMovie!.title, exact: true })).toBeVisible();
  await expect(page.locator(".detail-status-badge.is-external")).toHaveText(/Official External Service/i);
  await expect(page.getByRole("button", { name: "Watch Now", exact: true })).toHaveCount(0);

  const watchExternal = page.getByRole("button", { name: "Watch on Official Service", exact: true });
  await expect(watchExternal).toBeVisible();
  await watchExternal.click();

  const providerDialog = page.locator(".provider-page");
  await expect(providerDialog).toBeVisible();
  await expect(providerDialog.getByRole("button", { name: /Play on/i })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  await dismissPlayer(page);
});

test("Coming Soon collection separates upcoming movies with Coming Soon badge, release date, and no Watch Now button", async ({ page, request }) => {
  const catalogue = await readCatalogue(request);
  const upcomingMovies = catalogue.filter((m) => m.catalogStatus === "upcoming");
  expect(upcomingMovies.length).toBeGreaterThanOrEqual(15);

  await page.goto("/category/coming-soon", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Coming Soon", exact: true })).toBeVisible();
  await expect(page.locator(".movie-card .movie-badge-upcoming").first()).toHaveText("Coming Soon");

  const target = upcomingMovies[0];
  await page.goto(`/movie/${target.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: target.title, exact: true })).toBeVisible();
  await expect(page.locator(".detail-status-badge.is-upcoming")).toContainText("Coming Soon");
  // Upcoming movies must never offer a Watch Now button.
  await expect(page.getByRole("button", { name: "Watch Now", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Coming Soon/i })).toBeDisabled();
  if (target.trailerUrl) {
    await expect(page.getByRole("button", { name: "Watch Official Trailer", exact: true })).toBeVisible();
  }
});

test("admin source verification service validates real streams and rejects dead URLs", async ({ request }) => {
  const login = await request.post("/api/admin/login", {
    data: {
      email: process.env.ADMIN_EMAIL || "admin@cinemax.com",
      password: process.env.ADMIN_PASSWORD || "Admin@123",
    },
  });
  expect(login.ok()).toBeTruthy();

  const validStream = await request.post("/api/admin/verify-sources", {
    data: { videoUrl: "/api/media/stream/big-buck-bunny-2008.webm", sourceType: "open_license" },
  });
  expect(validStream.ok()).toBeTruthy();
  const validBody = await validStream.json();
  expect(validBody.verification.ok).toBe(true);
  expect(validBody.verification.catalogStatus).toBe("verified_playable");

  const deadStream = await request.post("/api/admin/verify-sources", {
    data: { videoUrl: "/api/media/stream/missing-nonexistent-file.webm", sourceType: "direct" },
  });
  expect(deadStream.ok()).toBeTruthy();
  const deadBody = await deadStream.json();
  expect(deadBody.verification.ok).toBe(false);
  expect(deadBody.verification.catalogStatus).toBe("verification_failed");
});

test("player controls fade out ~1s after interaction while playing and stay while paused", async ({ page, request }) => {
  const movie = await createPlaybackMovie(request, "/__e2e__/prism-test.webm");
  try {
    await page.goto(`/movie/${movie.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Watch Now", exact: true }).click();
    const player = page.getByRole("dialog", { name: `Now playing ${movie.title}`, exact: true });
    await expect(player).toBeVisible();
    await expect.poll(() => page.locator("video").evaluate((element) => (element as HTMLVideoElement).paused)).toBe(false);
    await page.mouse.move(120, 120);
    await expect(player.locator(".player-control-dock")).not.toHaveClass(/hidden/);
    await expect(player.locator(".player-control-dock")).toHaveClass(/hidden/, { timeout: 3000 });
    await page.mouse.move(160, 160);
    await expect(player.locator(".player-control-dock")).not.toHaveClass(/hidden/);
    const rail = player.locator(".player-progress");
    const box = (await rail.boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(player.locator(".player-control-dock")).not.toHaveClass(/hidden/);
    await page.mouse.up();
    await page.locator("video").evaluate((element) => {
      (element as HTMLVideoElement).pause();
      element.dispatchEvent(new Event("pause"));
    });
    await page.waitForTimeout(1400);
    await expect(player.locator(".player-control-dock")).not.toHaveClass(/hidden/);
    await dismissPlayer(page);
  } finally {
    await request.delete(`/api/movies/${movie.id}`);
  }
});

test("Watch Now requests landscape/immersive playback through the native shell", async ({ page, request }) => {
  const movie = await createPlaybackMovie(request, "/__e2e__/prism-test.webm");
  try {
    await page.addInitScript(() => {
      const calls: string[] = [];
      (window as unknown as { __nativeCalls: string[] }).__nativeCalls = calls;
      (window as unknown as { CinemaxNative: unknown }).CinemaxNative = {
        enterPlayerFullscreen: () => calls.push("enter"),
        exitPlayerFullscreen: () => calls.push("exit"),
        openExternal: () => calls.push("open"),
        themeApplied: () => calls.push("theme"),
        shellReady: () => calls.push("ready"),
        setMediaPlaying: () => calls.push("media"),
      };
    });
    await page.goto(`/movie/${movie.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Watch Now", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __nativeCalls: string[] }).__nativeCalls)).toContain("enter");
    await dismissPlayer(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __nativeCalls: string[] }).__nativeCalls)).toContain("exit");
    await expect(page.getByRole("heading", { name: movie.title, exact: true })).toBeVisible();
  } finally {
    await request.delete(`/api/movies/${movie.id}`);
  }
});
