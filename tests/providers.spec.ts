import { test, expect } from "@playwright/test";
import { createPlaybackMovie, dismissPlayer, preparePage, servePlaybackFixtures } from "./helpers";

/**
 * Universal share-link & embed playback system.
 *
 * These checks pin the honest behaviour: permitted embeds play inside Cinemax,
 * DRM/subscription services show the in-app provider page with an official
 * "Play on …" action (never a fake embed), and unsafe/unknown links are
 * rejected or handed over without loading anything privileged.
 */
test.beforeEach(async ({ page }) => {
  await preparePage(page);
  await servePlaybackFixtures(page);
});

test("Netflix share links open the official-service page, never a fake embed", async ({ page }) => {
  await page.goto("/watch?url=https%3A%2F%2Fwww.netflix.com%2Ftitle%2F80057281", { waitUntil: "domcontentloaded" });
  const provider = page.getByRole("dialog", { name: /Netflix/ });
  await expect(provider).toBeVisible();
  await expect(provider.getByRole("heading", { name: /Netflix/ })).toBeVisible();
  await expect(provider.getByRole("button", { name: "Play on Netflix", exact: true })).toBeVisible();
  // The restriction is explained honestly and the original URL is preserved.
  await expect(provider.getByText(/DRM/i).first()).toBeVisible();
  await expect(provider.locator(".provider-url-full")).toHaveText("https://www.netflix.com/title/80057281");
  // No embedded player is pretended for DRM content.
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  await provider.getByRole("button", { name: "Back to title", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Watch from a link", exact: true })).toBeVisible();
});

test("Prime Video and Hotstar links resolve to their provider pages with official CTAs", async ({ page }) => {
  await page.goto("/watch?url=https%3A%2F%2Fwww.primevideo.com%2Fdetail%2F0EXAMPLE", { waitUntil: "domcontentloaded" });
  let provider = page.getByRole("dialog", { name: /Prime Video/ });
  await expect(provider).toBeVisible();
  await expect(provider.getByRole("button", { name: "Play on Prime Video", exact: true })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await dismissPlayer(page);

  await page.goto("/watch?url=https%3A%2F%2Fwww.hotstar.com%2Fin%2F1260000123", { waitUntil: "domcontentloaded" });
  provider = page.getByRole("dialog", { name: /Hotstar/ });
  await expect(provider).toBeVisible();
  await expect(provider.getByRole("button", { name: "Play on Disney+ Hotstar", exact: true })).toBeVisible();
  await expect(provider.getByText(/subscription|membership/i).first()).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("permitted YouTube links play inside Cinemax through the official embed", async ({ page }) => {
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body style='background:black;color:white'>YouTube embed</body></html>" }));
  await page.goto("/watch?url=https%3A%2F%2Fyoutu.be%2FabcDEF_1234", { waitUntil: "domcontentloaded" });
  const player = page.getByRole("dialog", { name: /Now playing|YouTube/ });
  await expect(player).toBeVisible();
  const frame = page.locator("iframe.embedded-video");
  await expect(frame).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/abcDEF_1234\?autoplay=1/);
  // Provider controls are preserved: no Cinemax control dock over the embed.
  await expect(player.locator(".player-control-dock")).toHaveCount(0);
  await dismissPlayer(page);
  await expect(frame).toHaveCount(0);
});

test("direct media links open the Cinemax player and pick the right engine", async ({ page }) => {
  // Library-relative sources (the authorized /api/stream route) resolve to
  // direct playback with the original path preserved.
  const relative = await page.request.get("/api/providers/resolve?url=" + encodeURIComponent("/api/stream/5"));
  expect(relative.ok()).toBeTruthy();
  const relativeBody = await relative.json();
  expect(relativeBody.resolution.playback.strategy).toBe("direct");
  expect(relativeBody.resolution.playback.src).toBe("/api/stream/5");

  // An absolute direct file opens the integrated viewing experience and plays
  // in the Cinemax player (the fixture server stands in for a media host).
  await page.goto("/watch?url=" + encodeURIComponent("http://localhost:3000/__e2e__/prism-test.webm"), { waitUntil: "domcontentloaded" });
  const player = page.getByRole("dialog", { name: /Now playing/ });
  await expect(player).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
  await expect.poll(() => page.locator("video").evaluate((element) => (element as HTMLVideoElement).readyState)).toBeGreaterThan(2);
  await dismissPlayer(page);

  // Engine selection: progressive files, HLS and DASH.
  const hls = await page.request.get("/api/providers/resolve?url=" + encodeURIComponent("https://media.example.com/stream/master.m3u8"));
  expect(hls.ok()).toBeTruthy();
  const hlsBody = await hls.json();
  expect(hlsBody.resolution.playback.strategy).toBe("direct");
  expect(hlsBody.resolution.playback.engine).toBe("hls");
  const dash = await page.request.get("/api/providers/resolve?url=" + encodeURIComponent("https://media.example.com/stream/manifest.mpd"));
  expect((await dash.json()).resolution.playback.engine).toBe("dash");
});

test("invalid and unsafe links are rejected before anything loads", async ({ page }) => {
  await page.goto("/watch?url=javascript%3Aalert(1)", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /allowed|read|Paste a link/ }).first()).toBeVisible();
  await expect(page.getByText(/JavaScript links, local files and app schemes are blocked/)).toBeVisible();
  await expect(page.locator("iframe, video")).toHaveCount(0);

  await page.goto("/watch?url=not-a-url", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /read|Paste a link/ }).first()).toBeVisible();

  const blocked = await page.request.get("/api/providers/resolve?url=" + encodeURIComponent("file:///etc/passwd"));
  expect(blocked.status()).toBe(422);
  const missing = await page.request.get("/api/providers/resolve?url=");
  expect(missing.status()).toBe(400);
});

test("unsupported sites keep the original link and never load unknown pages", async ({ page }) => {
  await page.goto("/watch?url=" + encodeURIComponent("https://unknown-video-site.example/watch/42"), { waitUntil: "domcontentloaded" });
  const provider = page.getByRole("dialog", { name: /This website/ });
  await expect(provider).toBeVisible();
  await expect(provider.getByRole("button", { name: "Open original link", exact: true })).toBeVisible();
  await expect(provider.locator(".provider-url-full")).toHaveText("https://unknown-video-site.example/watch/42");
  await expect(page.locator("iframe, video")).toHaveCount(0);
});

test("the resolve API only contacts official oEmbed hosts and never leaks secrets", async ({ page, request }) => {
  // SSRF guard: internal addresses and spoofed oEmbed hosts never trigger a
  // metadata fetch - they resolve honestly without any outbound request.
  for (const target of [
    "https://www.youtube.com.oembed.internal/resolve",
    "http://127.0.0.1/watch?v=abc",
    "https://192.168.0.1/title/1",
  ]) {
    const response = await request.get("/api/providers/resolve?url=" + encodeURIComponent(target));
    expect(response.status(), target).toBe(200);
    const body = await response.json();
    // No official-oEmbed metadata is ever returned for un-allowlisted hosts.
    expect(body.metadata?.title === undefined, target).toBeTruthy();
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/TOKEN|SECRET|PASSWORD|DATABASE_URL/i);
  }
  // Dangerous schemes are rejected outright by the API as well.
  for (const target of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x"]) {
    const response = await request.get("/api/providers/resolve?url=" + encodeURIComponent(target));
    expect(response.status(), target).toBeGreaterThanOrEqual(400);
  }
  const ok = await request.get("/api/providers/resolve?url=" + encodeURIComponent("https://www.youtube.com/watch?v=aqz-KE-bpKQ"));
  expect(ok.ok()).toBeTruthy();
  const body = await ok.json();
  expect(body.resolution.provider.id).toBe("youtube");
  expect(body.resolution.playback.strategy).toBe("embed");
  // Metadata may be empty (offline sandbox) but the shape is stable.
  expect(body.metadata === null || typeof body.metadata === "object").toBeTruthy();
  await page.goto("/watch", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Watch from a link", exact: true })).toBeVisible();
});

test("player controls fade out ~1s after interaction while playing and stay while paused", async ({ page, request }) => {
  const movie = await createPlaybackMovie(request, "/__e2e__/prism-test.webm");
  try {
    await page.goto(`/movie/${movie.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Watch Now", exact: true }).click();
    const player = page.getByRole("dialog", { name: `Now playing ${movie.title}`, exact: true });
    await expect(player).toBeVisible();
    await expect.poll(() => page.locator("video").evaluate((element) => (element as HTMLVideoElement).paused)).toBe(false);
    // Any interaction reveals the controls (a pointer move is enough - and
    // does not toggle playback)...
    await page.mouse.move(120, 120);
    await expect(player.locator(".player-control-dock")).not.toHaveClass(/hidden/);
    // ...and they fade away about a second after the interaction ends.
    await expect(player.locator(".player-control-dock")).toHaveClass(/hidden/, { timeout: 3000 });
    // While the seek bar is being dragged the controls stay visible.
    await page.mouse.move(160, 160);
    await expect(player.locator(".player-control-dock")).not.toHaveClass(/hidden/);
    const rail = player.locator(".player-progress");
    const box = (await rail.boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(player.locator(".player-control-dock")).not.toHaveClass(/hidden/);
    await page.mouse.up();
    // Paused playback keeps the controls on screen.
    await page.locator("video").evaluate((element) => { (element as HTMLVideoElement).pause(); element.dispatchEvent(new Event("pause")); });
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
    // Stub the Android bridge: the player must ask for landscape/immersive as
    // playback opens, and restore portrait when the session ends.
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
    // Back/close exits immersive and returns to the portrait details page
    // without closing the movie experience.
    await dismissPlayer(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __nativeCalls: string[] }).__nativeCalls)).toContain("exit");
    await expect(page.getByRole("heading", { name: movie.title, exact: true })).toBeVisible();
  } finally {
    await request.delete(`/api/movies/${movie.id}`);
  }
});

test("Search offers the share-link entry and it lands on the viewing experience", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  const strip = page.getByRole("region", { name: "Play a share link" });
  await expect(strip).toBeVisible();
  await strip.getByRole("textbox", { name: "Movie or share link", exact: true }).fill("https://www.netflix.com/title/80057281");
  await strip.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(page).toHaveURL(/\/watch\?url=/);
  await expect(page.getByRole("dialog", { name: /Netflix/ })).toBeVisible();
});
