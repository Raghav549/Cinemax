import { test, expect } from "@playwright/test";
import { createPlaybackMovie, preparePage, servePlaybackFixtures, expectNoOverflow } from "./helpers";

test.beforeEach(async ({ page }) => { await preparePage(page); await servePlaybackFixtures(page); });

test("Watch Now launches direct playback with subtitles, speed, resume and focus restoration", async ({ page, request }) => {
  const movie = await createPlaybackMovie(request, "/__e2e__/prism-test.webm", "/__e2e__/prism-subtitles.vtt");
  try {
    await page.goto(`/movie/${movie.id}`, { waitUntil: "domcontentloaded" });
    const watch = page.getByRole("button", { name: "Watch Now", exact: true });
    await expect(watch).toBeVisible();
    await watch.click();
    const player = page.getByRole("dialog", { name: `Now playing ${movie.title}`, exact: true });
    await expect(player).toBeVisible();
    const video = page.locator("video");
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).duration)).toBeGreaterThan(85);
    expect(await page.locator("#cinemax-app").evaluate((element) => (element as HTMLElement).inert)).toBe(true);
    await player.getByRole("button", { name: "Open playback settings", exact: true }).click();
    const settings = player.getByRole("dialog", { name: "Playback settings" });
    await expect(settings.getByText(/Only .*source/)).toBeVisible();
    await expect(settings.getByRole("group", { name: "Choose stream quality" })).toHaveCount(0);
    await settings.getByRole("button", { name: "1.5×", exact: true }).click();
    expect(await video.evaluate((element) => (element as HTMLVideoElement).playbackRate)).toBe(1.5);
    await settings.getByRole("group", { name: "Choose subtitles" }).getByRole("button", { name: "English", exact: true }).click();
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).textTracks[0]?.mode)).toBe("showing");
    await video.evaluate((element) => { const video = element as HTMLVideoElement; video.currentTime = 45; video.pause(); video.dispatchEvent(new Event("timeupdate")); });
    await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem(`cinemax:playback:${id}`) || "{}").currentTime || 0, movie.id)).toBeGreaterThanOrEqual(44);
    await player.getByRole("button", { name: "Close playback settings", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(player).toHaveCount(0);
    expect(await page.locator("#cinemax-app").evaluate((element) => (element as HTMLElement).inert)).toBe(false);
    await expect(watch).toBeFocused();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const resume = page.getByRole("region", { name: "Continue watching", exact: true });
    await expect(resume.getByRole("link", { name: `Continue watching ${movie.title}`, exact: true })).toBeVisible();
    await resume.getByRole("link", { name: `Continue watching ${movie.title}`, exact: true }).click();
    await expect(page.getByRole("dialog", { name: `Now playing ${movie.title}`, exact: true })).toBeVisible();
    await expect.poll(() => page.locator("video").evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(40);
    await page.keyboard.press("Escape");
  } finally { await request.delete(`/api/movies/${movie.id}`); }
});

test("HLS uses the real adaptive player and exposes selectable stream quality", async ({ page, request }) => {
  const movie = await createPlaybackMovie(request, "/__e2e__/prism-master.m3u8");
  try {
    await page.goto(`/movie/${movie.id}?play=1`, { waitUntil: "domcontentloaded" });
    const player = page.getByRole("dialog", { name: `Now playing ${movie.title}`, exact: true });
    await expect(player).toBeVisible();
    await expect.poll(() => page.locator("video").evaluate((element) => (element as HTMLVideoElement).duration)).toBeGreaterThan(15);
    await player.getByRole("button", { name: "Open playback settings", exact: true }).click();
    const quality = page.getByRole("group", { name: "Choose stream quality" });
    await expect(quality.getByRole("button", { name: "Auto", exact: true })).toBeVisible();
    await expect(quality.getByRole("button", { name: "180p", exact: true })).toBeVisible();
    await expect(quality.getByRole("button", { name: "360p", exact: true })).toBeVisible();
    await expect(quality.getByRole("button", { name: "1080p", exact: true })).toHaveCount(0);
    await quality.getByRole("button", { name: "360p", exact: true }).click();
    await expect(quality.getByRole("button", { name: "360p", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(player).toHaveCount(0);
  } finally { await request.delete(`/api/movies/${movie.id}`); }
});

test("fullscreen fills the browser surface and exits before closing playback", async ({ page, request }) => {
  const movie = await createPlaybackMovie(request, "/__e2e__/prism-test.webm");
  try {
    await page.goto(`/movie/${movie.id}?play=1`, { waitUntil: "domcontentloaded" });
    const player = page.getByRole("dialog", { name: `Now playing ${movie.title}`, exact: true });
    await expect(player).toBeVisible();
    const fullscreen = player.getByRole("button", { name: "Enter fullscreen", exact: true });
    await fullscreen.click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBeTruthy();
    await expect(player).toHaveClass(/is-fullscreen/);
    await player.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBeFalsy();
    await expect(player).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(player).toHaveCount(0);
  } finally { await request.delete(`/api/movies/${movie.id}`); }
});

test("provider embeds retain their playback path and close without navigation collisions", async ({ page, request }) => {
  const movie = await createPlaybackMovie(request, "https://www.youtube.com/watch?v=abcDEF_1234");
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: '<html><body style="background:black;color:white">Provider verification</body></html>' }));
  try {
    await page.goto(`/movie/${movie.id}?play=1`, { waitUntil: "domcontentloaded" });
    const player = page.getByRole("dialog", { name: `Now playing ${movie.title}`, exact: true });
    await expect(player).toBeVisible();
    await expect(player.locator("iframe")).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/abcDEF_1234\?autoplay=1/);
    await expectNoOverflow(page);
    await player.getByRole("button", { name: "Close player", exact: true }).last().click();
    await expect(player).toHaveCount(0);
    await expect(page.getByRole("heading", { name: movie.title, exact: true })).toBeVisible();
  } finally { await request.delete(`/api/movies/${movie.id}`); }
});

test("unavailable media shows recoverable errors and Escape returns to details", async ({ page, request }) => {
  const movie = await createPlaybackMovie(request, "/__e2e__/prism-test.webm");
  await page.route("**/__e2e__/prism-test.webm", (route) => route.fulfill({ status: 404, body: "" }));
  try {
    await page.goto(`/movie/${movie.id}?play=1`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "This stream needs another moment" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".video-player-shell")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: movie.title, exact: true })).toBeVisible();
  } finally { await request.delete(`/api/movies/${movie.id}`); }
});

test("studio authentication and all existing management tabs remain available", async ({ page }) => {
  await page.goto("/gate-keeper", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(process.env.ADMIN_EMAIL || "admin@cinemax.com");
  await page.getByLabel("Password", { exact: true }).fill(process.env.ADMIN_PASSWORD || "Admin@123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/gate-keeper\/dashboard/);
  await expect(page.getByRole("heading", { name: "Cinemax studio", exact: true })).toBeVisible();
  for (const [tab, heading] of [["movies", /Library/], ["slides", /Hero Slides/], ["categories", /Categories/], ["lists", /Saved Lists/]] as const) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expectNoOverflow(page);
  }
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await expect(page).toHaveURL(/\/gate-keeper$/);
});
