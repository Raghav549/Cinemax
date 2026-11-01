#!/usr/bin/env node
/**
 * Platform-registry behaviour check — run with `npm run verify:platforms`.
 *
 * `verify:logos` proves the *artwork* is intact. This script proves the
 * *platform system* actually behaves, by compiling the real
 * `src/lib/platforms.ts` and calling it: the registry the home rail, the studio
 * picker and every `/category/platform-*` route read from, and the helpers that
 * turn an admin's checkboxes into the `platform-*` tokens stored in the existing
 * `movies.category` column.
 *
 * It needs only `typescript`, which is already a devDependency, so it runs in
 * the web CI job without a browser and without a database.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const ts = require("typescript");

const source = readFileSync(join(root, "src", "lib", "platforms.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

// Evaluate the compiled module without touching the filesystem.
const moduleShim = { exports: {} };
new Function("exports", "module", outputText)(moduleShim.exports, moduleShim);
const platforms = moduleShim.exports;

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

/* ------------------------------------------------------------- the registry */

const { PLATFORMS, PLATFORM_BY_ID } = platforms;
check(Array.isArray(PLATFORMS) && PLATFORMS.length === 19, "the registry lists all nineteen platforms", `${PLATFORMS.length}`);

const ids = PLATFORMS.map((platform) => platform.id);
check(new Set(ids).size === ids.length, "every platform id is unique");
check(PLATFORM_BY_ID.size === PLATFORMS.length, "the id lookup covers the whole registry");

const cinemax = PLATFORM_BY_ID.get("cinemax");
check(Boolean(cinemax), "CINEMAX is a selectable platform in the registry");
if (cinemax) {
  check(cinemax.name === "CINEMAX", "CINEMAX keeps its brand name", cinemax.name);
  check(cinemax.logo === "/platforms/cinemax.webp", "CINEMAX uses its own artwork in the shared collection", cinemax.logo);
  check(cinemax.matches.includes("cinemax.com"), "CINEMAX is recognised in stored streaming URLs");
}

// The platforms that existed before CINEMAX keep their identity and order, so
// the rail does not reshuffle under the admins and viewers who know it.
check(
  ids.slice(0, 5).join(",") === "netflix,prime-video,jiohotstar,disney-plus,max",
  "the existing platforms keep their original order",
  ids.slice(0, 5).join(",")
);
check(ids[ids.length - 1] === "cinemax", "CINEMAX is appended, so no existing disc moves", ids[ids.length - 1]);

/* --------------------------------------------------------------- the assets */

const assetDir = join(root, "public", "platforms");
for (const platform of PLATFORMS) {
  const file = join(assetDir, platform.logo.replace("/platforms/", ""));
  let ok = true;
  try {
    statSync(file);
  } catch {
    ok = false;
  }
  check(ok, `${platform.id}: artwork file exists`, platform.logo);
}

const shipped = readdirSync(assetDir).filter((name) => !name.startsWith("."));
const registered = new Set(PLATFORMS.map((platform) => platform.logo.replace("/platforms/", "")));
check(shipped.length === registered.size, "the collection holds exactly one file per platform", `${shipped.length} files`);
check(shipped.every((name) => registered.has(name)), "no unregistered artwork in public/platforms", shipped.filter((name) => !registered.has(name)).join(", ") || "none");

// The platform logo must be the network's artwork, never the application logo.
check(
  !cinemax || !cinemax.logo.endsWith(".svg"),
  "CINEMAX does not reuse the application's SVG emblem as its platform logo",
  cinemax?.logo ?? "-"
);
check(
  !readFileSync(join(assetDir, "cinemax.webp")).equals(readFileSync(join(root, "public", "brand", "cinemax-symbol.svg"))),
  "the CINEMAX platform logo is not a copy of the app logo"
);

/* ------------------------------------------------------ saving and reading it */

const { platformTag, platformsFromTags, withPlatformTags, platformIdFromTag, platformIdFromSlug, normalizePlatformId, movieIsOnPlatform, platformsFromText } =
  platforms;

check(platformTag("cinemax") === "platform-cinemax", "a CINEMAX selection is stored as the platform-cinemax token", platformTag("cinemax"));
check(platformIdFromTag("platform-cinemax") === "cinemax", "the stored token resolves back to CINEMAX");
check(platformIdFromSlug("platform-cinemax") === "cinemax", "/category/platform-cinemax is a CINEMAX collection");
check(normalizePlatformId("CINEMAX") === "cinemax", "the admin API also accepts the brand name");

// What the studio's save button produces, with the other tokens untouched.
const saved = withPlatformTags("trending, hindi", ["netflix", "cinemax"]);
check(
  saved === "trending,hindi,platform-netflix,platform-cinemax",
  "saving CINEMAX alongside Netflix keeps the other catalogue tokens",
  saved
);
check(platformsFromTags(saved).join(",") === "netflix,cinemax", "the saved record reads back both platforms", platformsFromTags(saved).join(","));
check(
  withPlatformTags(saved, ["cinemax"]) === "trending,hindi,platform-cinemax",
  "unticking Netflix removes only its token and keeps CINEMAX",
  withPlatformTags(saved, ["cinemax"])
);
check(
  movieIsOnPlatform({ category: withPlatformTags("trending", ["cinemax"]) }, "cinemax"),
  "a title tagged CINEMAX is reported as available on CINEMAX"
);
check(!movieIsOnPlatform({ category: "trending" }, "cinemax"), "a title without the tag is not reported on CINEMAX");
check(platformsFromText("https://www.cinemax.com/watch/1").includes("cinemax"), "a cinemax.com source URL maps to CINEMAX");

/* ----------------------------------------------------------------- reporting */

console.log("");
console.log(`platforms: ${PLATFORMS.length}${cinemax ? ", CINEMAX included" : ""}`);
console.log(`checks: ${checks}, failures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
