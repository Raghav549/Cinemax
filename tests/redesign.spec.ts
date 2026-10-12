import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expectNoOverflow, preparePage, readCatalogue, readSlides } from "./helpers";

test.beforeEach(async ({ page }, info) => { await preparePage(page, info.title.startsWith("intro:")); });

test("home uses the real library, essential hero actions and continuous button light", async ({ page, request }) => {
  const catalogue = await readCatalogue(request);
  const slides = await readSlides(request);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const hero = page.locator(".hero-card");
  const expectedTitle = slides[0]?.title || catalogue.find((movie) => movie.featured)?.title || catalogue[0].title;
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
      await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
      const links = page.locator(".bottom-nav-link");
      await expect(links).toHaveCount(4);
      const hit = await links.first().boundingBox();
      expect(hit!.height).toBeGreaterThanOrEqual(44);
    }
  }
  if (info.project.name !== "desktop") {
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const persistent = await nav.evaluate((element) => { element.setAttribute("data-persistent-test", "yes"); return true; });
    expect(persistent).toBeTruthy();
    await nav.getByRole("link", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Search", exact: true })).toBeVisible();
    await expect(page.locator(".bottom-nav")).toHaveAttribute("data-persistent-test", "yes");
    await expect(nav.getByRole("link", { name: "Search", exact: true })).toHaveAttribute("aria-current", "page");
    expect(await nav.evaluate((element) => (element as HTMLElement).style.getPropertyValue("--nav-index"))).toBe("1");
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
  const bounds = await track.boundingBox();
  const poster = await track.locator(".movie-poster").first().boundingBox();
  expect(poster!.y).toBeGreaterThanOrEqual(bounds!.y);
  expect(poster!.y + poster!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
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
