import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createMovieWithTrailer, deleteMovie, expectNoOverflow, preparePage, readCatalogue, readSlides, servePlaybackFixtures } from "./helpers";

test.beforeEach(async ({ page }, info) => { await preparePage(page, info.title.startsWith("intro:")); });

test("home uses the real library, essential hero actions and continuous button light", async ({ page, request }) => {
  const catalogue = await readCatalogue(request);
  const slides = await readSlides(request);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const hero = page.locator(".hero-card");
  const expectedTitle = slides[0]?.title || "Your library is ready";
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText(expectedTitle);
  await expect(page.getByText("Your front row starts here")).toHaveCount(0);
  await expect(page.getByText("Big stories. Beautifully at home.")).toHaveCount(0);
  await expect(hero.getByRole("link", { name: "Watch Now" })).toHaveAttribute("href", /\?play=1$/);
  await expect(hero.getByRole("link", { name: "More Details" })).toHaveAttribute("href", /^\/movie\/\d+$/);
  const light = hero.locator(".light-head").first();
  expect(await light.getAttribute("pathLength")).toBe("100");
  expect(await light.evaluate((element) => parseFloat(getComputedStyle(element).strokeWidth))).toBeLessThanOrEqual(1.2);
  if (await hero.getByRole("button", { name: "Pause featured slideshow" }).count()) {
    await hero.getByRole("button", { name: "Pause featured slideshow" }).click();
    await expect(hero.getByRole("button", { name: "Resume featured slideshow" })).toHaveAttribute("aria-pressed", "true");
  }
  if (slides.length > 1) {
    await hero.getByRole("button", { name: "Next featured title" }).click();
    await expect(hero.getByRole("heading", { level: 1 })).toHaveText(slides[1].title);
  }
  await page.getByRole("group", { name: "Filter the catalogue" }).getByRole("button", { name: "Movies", exact: true }).click();
  await expect(page.locator(".filtered-results .movie-card").first()).toBeVisible();
  await expect(page.locator(".filter-chip[aria-pressed=true]")).toHaveText("Movies");
  await expectNoOverflow(page);
});

test("layouts stay within desktop, mobile and 320px screens; navigation survives route changes", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  const movies = await readCatalogue(request);
  for (const route of ["/", "/search", "/categories", "/category/action", "/watchlist", `/movie/${movies[0].id}`]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
    await expectNoOverflow(page);
    const poster = page.locator(".movie-poster").first();
    if (await poster.count()) {
      const box = await poster.boundingBox();
      expect(box!.width / box!.height).toBeCloseTo(2 / 3, 2);
    }
    if (info.project.name !== "desktop") {
      // The old top navigation pill (Web | Movies | Dramas | chevron) is gone.
      await expect(page.locator(".nav-pill")).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
      // The bottom row below the curved line: Home (Cinemax logo asset), Search, More.
      const menu = page.getByRole("navigation", { name: "App sections" });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("link", { name: /Home/ })).toBeVisible();
      await expect(menu.locator("img.nav-menu-logo")).toHaveAttribute("src", "/brand/cinemax-symbol.svg");
      await expect(menu.getByRole("link", { name: /Search/ })).toBeVisible();
      await expect(menu.getByRole("link", { name: /Categories/ })).toHaveCount(0);
      const moreButton = menu.getByRole("button", { name: "Open More panel" });
      await expect(moreButton).toBeVisible();
      expect((await moreButton.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      // The animated More icon is inline SVG (never a static grid/profile icon).
      await expect(moreButton.locator("svg.more-icon")).toHaveCount(1);
    }
  }
  if (info.project.name !== "desktop") {
    const menu = page.getByRole("navigation", { name: "App sections" });
    const persistent = await menu.evaluate((element) => { element.setAttribute("data-persistent-test", "yes"); return true; });
    expect(persistent).toBeTruthy();
    // The dock instance survives a route change.
    await menu.getByRole("link", { name: /Search/ }).click();
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator(".nav-menu")).toHaveAttribute("data-persistent-test", "yes");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Clicking More opens the discovery panel immediately; the idle icon
    // animation never blocks the tap.
    const moreButton = page.locator(".nav-menu-more");
    await moreButton.click();
    await expect(moreButton).toHaveAttribute("aria-expanded", "true");
    await expect(moreButton).toHaveAccessibleName("Close More panel");
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Browse", exact: true })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Discover by Content Type", exact: true })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Popular Languages", exact: true })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Popular Genres", exact: true })).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Collections", exact: true })).toBeVisible();
    // No sports, TV channels, broadcasting channels, or gaming categories exist.
    const sheetText = await sheet.innerText();
    expect(sheetText).not.toMatch(/\b(Sports|Live TV|TV Channels|Broadcasting|Gaming)\b/i);
    // Close button closes the sheet cleanly.
    await sheet.getByRole("button", { name: "Close More panel" }).click();
    await expect(sheet).toHaveCount(0);
    // Re-open and navigate to Watchlist from the quickbar.
    await moreButton.click();
    await page.getByRole("dialog", { name: "More" }).getByRole("link", { name: "Watchlist" }).click();
    await expect(page.getByRole("heading", { name: /Watchlist|Saved/ })).toBeVisible();
    // The bottom row keeps Search one tap away.
    await page.getByRole("navigation", { name: "App sections" }).getByRole("link", { name: /Search/ }).click();
    await expect(page.getByRole("heading", { name: "Search", exact: true })).toBeVisible();
  }
});

test("search cancels stale responses and filters real results", async ({ page, request }) => {
  const movies = await readCatalogue(request);
  const first = movies[0];
  const second = movies.find((movie) => movie.id !== first.id && movie.type === "Movie")!;
  await page.route("**/api/movies?search=**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("search") === first.title) await new Promise((resolve) => setTimeout(resolve, 650));
    try { await route.continue(); } catch { /* Expected when a superseded search was aborted. */ }
  });
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  const search = page.getByRole("searchbox", { name: "Search the catalogue" });
  await search.fill(first.title);
  await page.waitForTimeout(270); // Let the first debounced request start before replacing it.
  await search.fill(second.title);
  await expect(page.getByRole("link", { name: `View ${second.title}`, exact: true })).toBeVisible();
  await page.waitForTimeout(750);
  await expect(search).toHaveValue(second.title);
  await expect(page.getByRole("link", { name: `View ${first.title}`, exact: true })).toHaveCount(0);
  await page.getByRole("group", { name: "Filter search results" }).getByRole("button", { name: "Movies", exact: true }).click();
  await expect(page.getByRole("link", { name: `View ${second.title}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator(".movie-card").first()).toBeVisible();
  await search.fill("no-matching-cinemax-title-94627");
  await expect(page.getByRole("heading", { name: /No matches/ })).toBeVisible();
  await expectNoOverflow(page);
});

test("watchlist saves once, persists across navigation, and keeps cards when removal fails", async ({ page, request }) => {
  const movies = await readCatalogue(request);
  const movie = movies[0];
  await page.goto(`/movie/${movie.id}`, { waitUntil: "domcontentloaded" });
  const save = page.getByRole("button", { name: "Add to watchlist", exact: true });
  await expect(save).toBeVisible();
  await save.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole("button", { name: "Remove from watchlist", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
  const card = page.getByRole("link", { name: `View ${movie.title}`, exact: true });
  await expect(card).toBeVisible();
  await page.route("**/api/watchlist", async (route) => route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Simulated unavailable service"}' }) : route.continue());
  await page.getByRole("button", { name: `Remove ${movie.title} from watchlist`, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Couldn’t update your watchlist/ })).toBeVisible();
  await expect(card).toBeVisible();
  await page.unroute("**/api/watchlist");
  await page.getByRole("button", { name: `Remove ${movie.title} from watchlist`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "A little space for your favourites" })).toBeVisible();
  const response = await page.request.get("/api/watchlist");
  expect((await response.json()).some((item: { id: number }) => item.id === movie.id)).toBe(false);
});

test("carousel keyboard scrolling is smooth and posters are not vertically clipped", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const row = page.getByRole("region", { name: "Movies", exact: true });
  const track = row.getByRole("list", { name: "Movies titles" });
  await expect(track).toBeVisible();
  await track.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(10);
  // Both rects are read in one shot: separate boundingBox() calls can straddle
  // a layout settle (lazy rows, artwork decode) and compare stale geometry.
  const geometry = await track.evaluate((element) => {
    const trackRect = element.getBoundingClientRect();
    const posterRect = element.querySelector(".movie-poster")!.getBoundingClientRect();
    return { trackTop: trackRect.top, trackBottom: trackRect.bottom, posterTop: posterRect.top, posterBottom: posterRect.bottom };
  });
  expect(geometry.posterTop).toBeGreaterThanOrEqual(geometry.trackTop - 1);
  expect(geometry.posterBottom).toBeLessThanOrEqual(geometry.trackBottom + 1);
});

test("unavailable catalogue is explicit and never replaced with mock titles", async ({ page }) => {
  await page.route("**/api/movies?limit=500", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Simulated unavailable library"}' }));
  await page.route("**/api/slides", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Simulated unavailable library"}' }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Library unavailable" })).toBeVisible();
  await expect(page.locator(".movie-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expectNoOverflow(page);
  await page.unroute("**/api/movies?limit=500");
  await page.unroute("**/api/slides");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".movie-card").first()).toBeVisible();
});

test("intro: cinematic first-home reveal exits cleanly and is not repeated", async ({ page }, info) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  if (info.project.name !== "reduced-motion") {
    const intro = page.getByRole("dialog", { name: "Opening Cinemax" });
    await expect(intro).toBeVisible();
    await page.getByRole("button", { name: "Skip intro" }).click({ force: true });
    await expect(intro).toHaveCount(0);
  } else await expect(page.locator(".splash-screen")).toHaveCount(0, { timeout: 2000 });
  expect(await page.locator("#cinemax-app").evaluate((element) => (element as HTMLElement).inert)).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem("cinemax:prism-intro:v1"))).toBe("1");
  await page.reload();
  await expect(page.locator(".splash-screen")).toHaveCount(0);
  await expect(page.locator(".hero-title")).toBeVisible();
});

test("reduced motion disables looping effects; browsing works under CPU throttling", async ({ page, context }, info) => {
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".movie-card").first()).toBeVisible();
  await expectNoOverflow(page);
  if (info.project.name === "reduced-motion") {
    expect(await page.locator(".light-head").first().evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    await expect(page.getByRole("button", { name: "Pause featured slideshow" })).toHaveCount(0);
    expect(await page.evaluate(() => document.getAnimations().some((animation) => animation.playState === "running"))).toBe(false);
  }
  expect(errors).toEqual([]);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});

test("public screens satisfy automated WCAG AA checks", async ({ page, request }) => {
  test.setTimeout(120_000);
  const movies = await readCatalogue(request);
  for (const route of ["/", "/search", "/categories", "/watchlist", `/movie/${movies[0].id}`]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
    expect(results.violations, `${route}: ${JSON.stringify(results.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })))}`).toEqual([]);
  }
});

test("trailer preview plays inside the card, stops cleanly, and invalid trailers keep the poster", async ({ page, request }) => {
  await servePlaybackFixtures(page);
  const withTrailer = await createMovieWithTrailer(request, "/__e2e__/prism-test.webm");
  const brokenTrailer = await createMovieWithTrailer(request, "https://example.invalid/definitely-not-a-trailer.mp4");
  try {
    await page.goto("/search", { waitUntil: "domcontentloaded" });
    const search = page.getByRole("searchbox", { name: "Search the catalogue" });

    await search.fill(withTrailer.title);
    const card = page.locator(".movie-card", { hasText: withTrailer.title });
    await expect(card).toBeVisible();
    // No preview until the user asks for it.
    await expect(card.locator("video.movie-trailer-video")).toHaveCount(0);
    await card.getByRole("button", { name: `Play trailer preview for ${withTrailer.title}` }).click();
    const video = card.locator("video.movie-trailer-video");
    await expect(video).toBeVisible();
    await expect.poll(() => video.evaluate((el) => !(el as HTMLVideoElement).paused && (el as HTMLVideoElement).currentTime > 0)).toBeTruthy();
    expect(await video.evaluate((el) => (el as HTMLVideoElement).muted)).toBeTruthy();
    // The full-movie source is untouched by the preview.
    await card.getByRole("button", { name: `Stop trailer preview for ${withTrailer.title}` }).click();
    await expect(card.locator("video.movie-trailer-video")).toHaveCount(0);
    await expect(card.locator(".movie-poster-image, .artwork-placeholder").first()).toBeVisible();

    await search.fill(brokenTrailer.title);
    const brokenCard = page.locator(".movie-card", { hasText: brokenTrailer.title });
    await expect(brokenCard).toBeVisible();
    await brokenCard.getByRole("button", { name: `Play trailer preview for ${brokenTrailer.title}` }).click();
    // An unplayable trailer falls back to the poster — no broken player, no stuck spinner.
    await expect.poll(async () => brokenCard.locator("video.movie-trailer-video").count()).toBe(0);
    await expect(brokenCard.locator(".movie-poster-image, .artwork-placeholder").first()).toBeVisible();
  } finally {
    await deleteMovie(request, withTrailer.id);
    await deleteMovie(request, brokenTrailer.id);
  }
});
