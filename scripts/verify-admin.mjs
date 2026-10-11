/**
 * End-to-end check of the admin API against a running server.
 *
 *   ADMIN_EMAIL=admin@cinemax.com ADMIN_PASSWORD=... npm run verify:api
 *   BASE_URL=https://your-app.vercel.app npm run verify:api
 *
 * It creates its own rows, exercises every CRUD path, and removes what it
 * created, so it is safe to run against a database that already holds data.
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.ADMIN_EMAIL || "admin@cinemax.com";
const PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";
const MARKER = `verify-${Date.now()}`;

let cookie = "";
let passed = 0;
const failures = [];

/**
 * Cookies are merged the way a browser does: the admin token and the visitor
 * session live side by side, so setting `session_id` must not drop `admin_token`.
 */
const jar = new Map();

function applyCookies(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";")[0];
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === "" || /max-age=0/i.test(raw)) jar.delete(name);
    else jar.set(name, value);
  }
  cookie = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(method, path, body, opts = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.cookie !== false && cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  applyCookies(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json, text };
}

const movie = {
  title: `${MARKER} Movie`,
  description: "created by verify:api",
  year: 2024,
  rating: "7.7",
  duration: "1h 55m",
  genre: "Action, Drama",
  language: "English",
  type: "Movie",
  director: "Verifier",
  cast: "Nobody",
  posterUrl: "https://example.invalid/poster.jpg",
  backdropUrl: "https://example.invalid/backdrop.jpg",
  videoUrl: "https://example.invalid/video.mp4",
  category: "trending",
  featured: true,
};

async function main() {
  console.log(`\nCineMax admin API verification → ${BASE}\n`);

  console.log("health & connection");
  const health = await call("GET", "/api/health", undefined, { cookie: false });
  check("/api/health reports ok", health.status === 200 && health.json?.ok === true, health.text.slice(0, 200));
  if (health.json?.tables) {
    const changed = Object.entries(health.json.tables).filter(
      ([, t]) => t.created || t.added.length || t.renamed.length || t.backfilled.length
    );
    if (changed.length) console.log(`    schema reconciled: ${JSON.stringify(health.json.tables)}`);
  }

  console.log("\nadmin session");
  const login = await call("POST", "/api/admin/login", { email: EMAIL, password: PASSWORD }, { cookie: false });
  check("login succeeds", login.status === 200 && login.json?.success === true, login.text.slice(0, 120));
  const verify = await call("GET", "/api/admin/verify");
  check("verify accepts the session", verify.json?.valid === true);
  const badLogin = await call("POST", "/api/admin/login", { email: EMAIL, password: "wrong" }, { cookie: false });
  check("wrong password is rejected", badLogin.status === 401);

  console.log("\nauth guards");
  const noAuth = await call("POST", "/api/movies", movie, { cookie: false });
  check("anonymous create is refused", noAuth.status === 401);

  console.log("\nread paths");
  const before = await call("GET", "/api/admin/stats");
  check("stats respond", before.status === 200 && typeof before.json?.movies === "number", before.text.slice(0, 120));
  const list = await call("GET", "/api/movies?limit=500");
  check("movie list is an array", Array.isArray(list.json), list.text.slice(0, 160));
  const cats = await call("GET", "/api/categories");
  check("category list is an array", Array.isArray(cats.json), cats.text.slice(0, 160));
  const slidesPublic = await call("GET", "/api/slides");
  check("public slide list is an array", Array.isArray(slidesPublic.json), slidesPublic.text.slice(0, 160));
  if (Array.isArray(list.json) && list.json.length) {
    const first = list.json[0];
    check(
      "movies expose camelCase fields",
      typeof first.id === "number" && typeof first.title === "string" && "posterUrl" in first && "featured" in first,
      JSON.stringify(Object.keys(first))
    );
  }

  console.log("\nmovie CRUD");
  const created = await call("POST", "/api/movies", movie);
  check("create movie", created.status === 201 && typeof created.json?.id === "number", created.text.slice(0, 160));
  const movieId = created.json?.id;
  const fetched = await call("GET", `/api/movies/${movieId}`);
  check("read movie back", fetched.json?.title === movie.title, fetched.text.slice(0, 160));
  const updated = await call("PUT", `/api/movies/${movieId}`, { ...movie, title: `${MARKER} Movie EDITED`, year: 2025, featured: false });
  check(
    "edit movie persists",
    updated.json?.title === `${MARKER} Movie EDITED` && updated.json?.year === 2025 && updated.json?.featured === false,
    updated.text.slice(0, 160)
  );
  const reread = await call("GET", `/api/movies/${movieId}`);
  check("edit is visible on a fresh read", reread.json?.title === `${MARKER} Movie EDITED`);
  const partial = await call("PUT", `/api/movies/${movieId}`, { rating: "9.1" });
  check("partial edit keeps other fields", partial.json?.rating === "9.1" && partial.json?.title === `${MARKER} Movie EDITED`);
  const featured = await call("GET", "/api/movies?featured=true");
  check(
    "featured filter uses the featured column",
    Array.isArray(featured.json) && featured.json.every((m) => m.featured === true),
    JSON.stringify(featured.json?.slice(0, 2))
  );
  const byCategory = await call("GET", "/api/movies?category=trending&limit=500");
  check(
    "category filter matches the category",
    Array.isArray(byCategory.json) && byCategory.json.every((m) => (m.category || "").toLowerCase().includes("trending")),
    JSON.stringify(byCategory.json?.map((m) => m.category)?.slice(0, 5))
  );
  const search = await call("GET", `/api/movies?search=${encodeURIComponent(MARKER)}`);
  check("search finds the new title", Array.isArray(search.json) && search.json.some((m) => m.id === movieId));

  console.log("\nvalidation");
  const noTitle = await call("POST", "/api/movies", { ...movie, title: "  " });
  check("empty title is a 400, not a 500", noTitle.status === 400 && /title/i.test(noTitle.json?.error || ""), noTitle.text.slice(0, 120));
  const badYear = await call("POST", "/api/movies", { ...movie, title: `${MARKER} bad year`, year: 12 });
  check("implausible year is rejected", badYear.status === 400, badYear.text.slice(0, 120));
  const missing = await call("GET", "/api/movies/99999999");
  check("unknown id is a 404", missing.status === 404);
  const badId = await call("GET", "/api/movies/not-a-number");
  check("non-numeric id is a 400", badId.status === 400);

  console.log("\nslide CRUD");
  const slideCreated = await call("POST", "/api/slides", {
    title: `${MARKER} Slide`,
    subtitle: "sub",
    imageUrl: "https://example.invalid/slide.jpg",
    movieId,
    sortOrder: 99,
    active: true,
  });
  check("create slide", slideCreated.status === 201 && typeof slideCreated.json?.id === "number", slideCreated.text.slice(0, 160));
  const slideId = slideCreated.json?.id;
  const slideOn = await call("GET", "/api/slides");
  check("active slide reaches the public carousel", slideOn.json?.some((s) => s.id === slideId));
  const slideOff = await call("PUT", `/api/slides/${slideId}`, { active: false });
  check("deactivating a slide persists", slideOff.json?.active === false);
  const slideHidden = await call("GET", "/api/slides");
  check("inactive slide is hidden publicly", !slideHidden.json?.some((s) => s.id === slideId));
  const adminSlides = await call("GET", "/api/admin/slides");
  check("admin still lists inactive slides", adminSlides.json?.some((s) => s.id === slideId));

  console.log("\ncategory CRUD");
  const catCreated = await call("POST", "/api/categories", { name: `${MARKER} Cat` });
  check("create category (slug generated)", catCreated.status === 201 && catCreated.json?.slug?.includes("cat"), catCreated.text.slice(0, 160));
  const catId = catCreated.json?.id;
  const dup = await call("POST", "/api/categories", { name: `${MARKER} Cat` });
  check("duplicate slug is a readable 400", dup.status === 400, dup.text.slice(0, 120));
  await call("PUT", `/api/movies/${movieId}`, { category: catCreated.json.slug });
  const renamedSlug = `${MARKER}-renamed`.toLowerCase();
  const catUpdated = await call("PUT", `/api/categories/${catId}`, { slug: renamedSlug });
  check("edit category", catUpdated.status === 200 && catUpdated.json?.slug === renamedSlug, catUpdated.text.slice(0, 160));
  const moved = await call("GET", `/api/movies/${movieId}`);
  check("renaming a slug keeps its movies", moved.json?.category === renamedSlug, moved.json?.category);
  const catDeleted = await call("DELETE", `/api/categories/${catId}`);
  check("delete category", catDeleted.json?.success === true);

  console.log("\nwatchlist / My List");
  const add1 = await call("POST", "/api/watchlist", { movieId });
  check("add to list", add1.json?.added === true, add1.text.slice(0, 120));
  const myList = await call("GET", "/api/watchlist");
  check("list contains the title", myList.json?.some((m) => m.id === movieId && m.watchlistId), myList.text.slice(0, 120));
  const badMovie = await call("POST", "/api/watchlist", { movieId: 99999999 });
  check("unknown movie is a 400", badMovie.status === 400, badMovie.text.slice(0, 120));

  console.log("\nadmin list management");
  const adminLists = await call("GET", "/api/admin/watchlist");
  check(
    "admin can list saved entries",
    Array.isArray(adminLists.json) && adminLists.json.some((e) => e.movieId === movieId),
    adminLists.text.slice(0, 160)
  );
  const entryId = Array.isArray(adminLists.json) ? adminLists.json.find((e) => e.movieId === movieId)?.id : undefined;
  if (entryId) {
    const removed = await call("DELETE", `/api/admin/watchlist?id=${entryId}`);
    check("admin can remove an entry", removed.json?.success === true, removed.text.slice(0, 120));
  } else {
    check("admin can remove an entry", false, "no entry found for the test movie");
  }
  const afterAdminRemove = await call("GET", "/api/watchlist");
  check("visitor sees the removal", !afterAdminRemove.json?.some((m) => m.id === movieId));

  console.log("\nwatchlist toggle");
  const add2 = await call("POST", "/api/watchlist", { movieId });
  check("re-adding after a removal works", add2.json?.added === true, add2.text.slice(0, 120));
  const add3 = await call("POST", "/api/watchlist", { movieId });
  check("adding again removes it", add3.json?.added === false);
  const emptied = await call("GET", "/api/watchlist");
  check("list is empty again", !emptied.json?.some((m) => m.id === movieId));

  console.log("\ncleanup & final counts");
  const delSlide = await call("DELETE", `/api/slides/${slideId}`);
  check("delete slide", delSlide.json?.success === true);
  const delMovie = await call("DELETE", `/api/movies/${movieId}`);
  check("delete movie", delMovie.json?.success === true);
  const afterDelete = await call("GET", `/api/movies/${movieId}`);
  check("deleted movie is gone", afterDelete.status === 404);
  const after = await call("GET", "/api/admin/stats");
  check(
    "row counts are back to where they started",
    after.json?.movies === before.json?.movies &&
      after.json?.slides === before.json?.slides &&
      after.json?.categories === before.json?.categories,
    `before=${JSON.stringify(before.json)} after=${JSON.stringify(after.json)}`
  );

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("All admin API checks passed.\n");
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
