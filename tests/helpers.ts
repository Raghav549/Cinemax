import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogueMovie, FeaturedSlide } from "@/lib/catalogue";

export async function readCatalogue(request: APIRequestContext) {
  const response = await request.get("/api/movies?limit=500");
  expect(response.ok(), "A connected test database is required").toBeTruthy();
  const movies = (await response.json() as CatalogueMovie[]).filter((movie) => !movie.title.startsWith("Prism playback verification"));
  expect(movies.length, "Use a populated test library; no runtime mock catalogue is supplied").toBeGreaterThan(0);
  return movies;
}
export async function readSlides(request: APIRequestContext) {
  const response = await request.get("/api/slides");
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<FeaturedSlide[]>;
}
export async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
}
export async function preparePage(page: Page, intro = false) {
  if (!intro) await page.addInitScript(() => sessionStorage.setItem("cinemax:prism-intro:v1", "1"));
  await page.addInitScript(() => localStorage.setItem("cinemax_seeded", "1"));
  // Offline artwork is a deliberate failure test. Movie records and all APIs stay real.
  // It also keeps regression checks independent of third-party CDN uptime.
  await page.route("https://image.tmdb.org/**", (route) => route.abort());
}
export async function createPlaybackMovie(request: APIRequestContext, source: string, subtitleUrl = "") {
  const login = await request.post("/api/admin/login", { data: { email: process.env.ADMIN_EMAIL || "admin@cinemax.com", password: process.env.ADMIN_PASSWORD || "Admin@123" } });
  expect(login.ok(), "Configure test-studio credentials").toBeTruthy();
  const response = await request.post("/api/movies", { data: { title: `Prism playback verification ${Date.now()}`, description: "Temporary automated test record. Removed after the test.", year: 2024, rating: "8.0", duration: "1m 30s", genre: "Sci-Fi", type: "Movie", category: "trending", posterUrl: "", backdropUrl: "", videoUrl: source, subtitleUrl, subtitleLanguage: "en" } });
  expect(response.status()).toBe(201);
  return response.json() as Promise<CatalogueMovie>;
}
export async function servePlaybackFixtures(page: Page) {
  await page.route("**/__e2e__/**", async (route) => {
    const file = new URL(route.request().url()).pathname.split("/").pop()!;
    if (!/^prism-(?:test\.webm|master\.m3u8|stream\.m3u8|segment-\d+\.ts|subtitles\.vtt)$/.test(file)) return route.abort();
    const body = await readFile(join(process.cwd(), "tests/fixtures", file));
    const contentType = file.endsWith("webm") ? "video/webm" : file.endsWith("m3u8") ? "application/vnd.apple.mpegurl" : file.endsWith("vtt") ? "text/vtt" : "video/mp2t";
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(Number(range[2] || body.length - 1), body.length - 1);
      return route.fulfill({ status: 206, contentType, headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${body.length}` }, body: body.subarray(start, end + 1) });
    }
    return route.fulfill({ status: 200, contentType, headers: { "Accept-Ranges": "bytes" }, body });
  });
}
