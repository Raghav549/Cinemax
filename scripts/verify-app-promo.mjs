#!/usr/bin/env node
/**
 * The first-visit app promotion and the artifact it downloads — `npm run verify:promo`.
 *
 * Two things can go wrong here and neither would look broken in a browser: the
 * button could hand out a file that is not the app (a stale build, a different
 * package, an unsigned archive), and the promotion could interrupt a visitor who
 * already said no. This script checks both against the real artifact:
 *
 *   1. the shipped APK is the app: package id, version, signature files, intact
 *      archive — read from the APK itself, not from a constant;
 *   2. the download route answers with the file, with the Android package MIME
 *      type and an attachment filename, and never with a redirect;
 *   3. the promotion's own rules: first visit only, device-side dismissal, no
 *      download without a press, Android gets the file and everything else gets
 *      an availability note, never inside the Android app.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const esbuild = require("esbuild");

let checks = 0;
let failures = 0;

function check(ok, label, detail = "") {
  checks += 1;
  if (!ok) {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? `  (${detail})` : ""}`);
  } else if (process.env.VERBOSE) {
    console.log(`  ok   ${label}${detail ? `  (${detail})` : ""}`);
  }
  return ok;
}

function section(name) {
  console.log(`\n== ${name}`);
}

const read = (relative) => readFileSync(join(root, relative), "utf8");

/* ------------------------------------------------------------- 1. the APK */

section("The downloaded artifact is the app");
{
  const apk = join(root, "public", "downloads", "Cinemax-1.1.0.apk");
  const reported = JSON.parse(
    execFileSync("python3", [join(root, "android", "tests", "apk_summary.py"), apk], { encoding: "utf8" })
  );

  check(reported.exists, "the APK the button hands out exists in the repository", reported.path);
  check(reported.intact, "the archive is intact (every entry unpacks)");
  check(reported.manifest, "it declares an Android manifest");
  check(reported.dex?.length >= 1, "it contains compiled code", (reported.dex ?? []).join(", "));
  check(reported.package === "com.cinemax.app", "package id is com.cinemax.app", reported.package);
  check(reported.versionName === "1.1.0", "version name is 1.1.0", reported.versionName);
  check(reported.versionCode === "2", "version code is 2", reported.versionCode);
  check(
    (reported.signature ?? []).some((name) => name.endsWith(".RSA") || name.endsWith(".EC")),
    "it carries a signing block (a release key, not a debug placeholder)",
    (reported.signature ?? []).join(", ")
  );
  check(
    (reported.signature ?? []).some((name) => name.endsWith(".SF")),
    "it carries the signature file that verifies the digest"
  );

  const promo = read("src/lib/app-promo.ts");
  const version = /APP_VERSION = "([^"]+)"/.exec(promo)?.[1];
  const packageId = /APP_PACKAGE = "([^"]+)"/.exec(promo)?.[1];
  const versionCode = Number(/APP_VERSION_CODE = (\d+)/.exec(promo)?.[1]);
  const fileName = /APP_APK_FILE = "([^"]+)"/.exec(promo)?.[1];
  check(version === reported.versionName, "the promotion names the version the APK declares", `${version} / ${reported.versionName}`);
  check(packageId === reported.package, "the promotion names the package the APK declares", `${packageId}`);
  check(versionCode === Number(reported.versionCode), "the promotion names the version code the APK declares", `${versionCode}`);
  check(fileName === reported.path, "the promotion names the file that is present", fileName);
  check(statSync(apk).size === reported.size, "the file on disk matches the summary", `${reported.size} bytes`);
  check(reported.size > 100_000, "the artifact is a real package, not an empty placeholder", `${reported.size} bytes`);
  if (process.env.VERBOSE) console.log(`     sha256 ${reported.sha256}`);
}

/* ----------------------------------------------------------- 2. the route */

section("The download route serves the file itself");
{
  const route = read("src/app/download/android/route.ts");
  check(route.includes("application/vnd.android.package-archive"), "the response uses the Android package MIME type");
  check(/content-disposition": `attachment; filename=/.test(route), "the response is an attachment with a filename");
  check(route.includes("content-length"), "the response declares its length");
  check(/cache-control/.test(route), "the response declares caching for the artifact");
  check(!/NextResponse\.redirect|redirect\(/.test(route), "the download is not a redirect to another page");
  check(!/vercel/i.test(route), "the download never points at a deployment hostname");
  check(route.includes("createReadStream"), "the bytes are streamed from the artifact on this deployment");
  check(route.includes("runtime = \"nodejs\""), "the route runs where it can read the file");
}

/* ------------------------------------------------------- 3. the promotion */

section("First visit only, device-side, never blocking");
{
  const bundle = join(root, ".perf", ".app-promo-check.cjs");
  esbuild.buildSync({
    entryPoints: [join(root, "src", "lib", "app-promo.ts")],
    bundle: true,
    outfile: bundle,
    platform: "node",
    format: "cjs",
    logLevel: "warning",
  });
  const api = require(bundle);

  check(api.promoDecision({ dismissed: false, nativeShell: false }) === "show", "a first visit may see the promotion");
  check(api.promoDecision({ dismissed: true, nativeShell: false }) === "hidden-dismissed", "a dismissal hides it for good");
  check(api.promoDecision({ dismissed: false, nativeShell: true }) === "hidden-native-shell", "inside the Android app it never appears");
  check(api.promoDecision({ dismissed: true, nativeShell: true }) === "hidden-native-shell", "the shell check wins over everything");

  check(api.isAndroidUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)") === true, "an Android phone is recognised");
  check(api.isAndroidUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1)") === false, "a desktop is not an Android phone");
  check(api.isAndroidUserAgent("") === false, "an empty user agent is not an Android phone");
  check(/Android/.test(api.availabilityMessage(false)), "unsupported devices get a message about Android, not a file");
  check(/1\.1\.0/.test(api.availabilityMessage(true)), "Android devices are told the version before downloading");
  check(!/vercel/i.test(api.availabilityMessage(false)), "the availability message names no deployment host");

  check(api.appDownloadUrl() === "/download/android", "the download URL is the route on this origin", api.appDownloadUrl());
  check(api.appDownloadUrl("https://cinemaxtv.space") === "https://cinemaxtv.space/download/android", "the absolute form stays on the official domain");

  // Dismissal: storage first, cookie as the durable record, both device-side.
  const store = new Map();
  const writes = [];
  api.rememberPromoDismissed(
    { setItem: (key, value) => store.set(key, value) },
    (value) => writes.push(value)
  );
  check(store.get(api.APP_PROMO_STORAGE_KEY) === "1", "the dismissal is written to local storage");
  check(writes.length === 1 && writes[0].includes(`${api.APP_PROMO_COOKIE}=1`), "a cookie records it too", writes.join(" "));
  check(/max-age=\d{6,}/.test(writes[0] ?? ""), "the cookie outlives the session");
  check(/path=\//.test(writes[0] ?? ""), "the cookie is scoped to the site root");

  check(api.readPromoDismissed({ getItem: () => "1" }, "") === true, "a stored dismissal is honoured");
  check(api.readPromoDismissed({ getItem: () => null }, `${api.APP_PROMO_COOKIE}=1`) === true, "a cookie dismissal is honoured when storage is unavailable");
  check(api.readPromoDismissed({ getItem: () => null }, "") === false, "a fresh visitor is not treated as dismissed");
  check(
    api.readPromoDismissed({ getItem: () => { throw new Error("blocked"); } }, "") === false,
    "blocked storage degrades to the cookie instead of throwing"
  );

  check(api.APP_PROMO_DELAY_MS >= 1000, "it waits for the page to settle before appearing", `${api.APP_PROMO_DELAY_MS} ms`);
  check(api.formatBytes(220028) === "0.2 MB", "sizes are formatted for the detail line", api.formatBytes(220028));
}

/* -------------------------------------------------- 4. the component itself */

section("What the component is allowed to do");
{
  const component = read("src/components/AppPromo.tsx");
  check(/hasNativeShell\(\)/.test(component), "it is suppressed inside the Android shell");
  check(/promoDecision\(/.test(component), "the first-visit decision comes from the checked rules");
  check(/readPromoDismissed\(/.test(component) && /rememberPromoDismissed\(/.test(component), "the dismissal is read and written through the shared helpers");
  check(/href=\{APP_DOWNLOAD_PATH\}/.test(component), "the download is a link to the download route");
  check(!/\.click\(\)/.test(component), "nothing presses the download for the visitor (no auto-download)");
  check(!/fetch\(/.test(component), "the component performs no request of its own");
  check(!/db|withDb|prisma|drizzle/i.test(component), "it stores nothing in the database");
  check(!/inert|overflow\s*=\s*["']hidden|focus-trap/i.test(component), "it never blocks the page behind it");
  check(/role="complementary"/.test(component), "it is a complementary region, not a modal dialog");
  check(/aria-label="Close this promotion"/.test(component), "it can be closed by assistive technology too");
  check(/Continue on website/.test(component), "the website continues to be an explicit choice");
  check(/Escape/.test(component), "Escape closes it");

  const layout = read("src/app/layout.tsx");
  check((layout.match(/<AppPromo \/>/g) ?? []).length === 1, "the promotion is mounted exactly once, at the root");

  const css = read("src/app/globals.css");
  check(/\.app-promo\s*\{/.test(css), "the promotion has its own styles");
  check(/@keyframes app-promo-rise/.test(css), "its entrance is a composited animation");
  check(/prefers-reduced-motion[^}]*\{[\s\S]{0,200}\.app-promo/.test(css), "reduced-motion users get it without animation");
  check(/html\[data-cinemax-app="android"\]\s*\.app-promo\s*\{[\s\S]{0,80}display:\s*none/.test(css), "the app itself hides it");
  check(/position:\s*fixed/.test(css) && !/backdrop-filter/.test(css.slice(css.indexOf(".app-promo"))), "it floats without a backdrop over the page");
}

console.log(`\nchecks: ${checks}, failures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
