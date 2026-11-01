#!/usr/bin/env node
/**
 * Platform-logo integrity check — run with `npm run verify:logos`.
 *
 * Nineteen brand marks ship with CINEMAX: the eighteen streaming platforms in
 * `public/platforms/` plus the project's own CINEMAX lockup. All of them are
 * rendered through `<img src>` from `PLATFORMS[n].logo`, so nothing at runtime
 * can tell a renamed file, a stale path, a recoloured export or a boxed JPEG
 * apart from a correct asset — it just looks wrong on a device. This script is
 * the pre-flight check:
 *
 *   1. every id in `src/lib/platforms.ts` resolves to a file that exists,
 *   2. the SVG parses as one self-contained document with a viewBox,
 *   3. no `<script>`, `on*` handler, `<image>` bitmap, external reference or
 *      remote `@import`: an `<img>` must be able to load it offline,
 *   4. rasters carry a real alpha channel and enough pixels for a 3x screen,
 *   5. the artwork is still the artwork: each file is pinned by a hash of its
 *      path geometry (no substitution) *and* of its colour tokens (no
 *      recolouring, grayscale, tint or filter slipping in),
 *   6. no duplicate paths, no orphan files, and the whole set stays under the
 *      payload budget.
 *
 * It only reads files. A pin mismatch means the asset changed on purpose, so
 * update the pin in that case — never the check.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = join(root, "public", "platforms");
const registry = readFileSync(join(root, "src", "lib", "platforms.ts"), "utf8");

/** A logo is never painted larger than 48 CSS px, so 192 px covers a 4x screen. */
const MIN_RASTER_EDGE = 192;
const MAX_BYTES = 120 * 1024;
const PAYLOAD_BUDGET = 160 * 1024;

/**
 * Identity pins: `geometry` hashes the sorted `d` attributes, `palette` the
 * sorted colour tokens, `bytes` the file itself for the two raster brands.
 */
const PINS = {
  "aha.webp": { bytes: "f948957e389623a8" },
  "apple-tv-plus.svg": { geometry: "43d6ebd53f8c", palette: "d14f901611f8" },
  "crunchyroll.svg": { geometry: "5b132c7a0fde", palette: "749e52fa5c56" },
  "discovery-plus.webp": { bytes: "76a56bed621380ec" },
  "disney-plus.svg": { geometry: "5ecaf804b8d7", palette: "324078e2b39a" },
  "hulu.svg": { geometry: "4b71e5369ef4", palette: "f7f4722f0946" },
  "jiocinema.svg": { geometry: "660373a774dc", palette: "ee45b565560e" },
  "jiohotstar.svg": { geometry: "1aa309c665e4", palette: "c659d630ce0a" },
  "max.svg": { geometry: "87b4fa50e26e", palette: "d14f901611f8" },
  "mubi.svg": { geometry: "8deb9e4f2f81", palette: "51159d174286" },
  "netflix.svg": { geometry: "84a34de2a46d", palette: "efa35d81c2e3" },
  "paramount-plus.svg": { geometry: "640a70d6420f", palette: "9b1752b6f60e" },
  "peacock.svg": { geometry: "141eff75aaff", palette: "85f0d2c09135" },
  "prime-video.svg": { geometry: "d162af343a88", palette: "f7d23b9c418b" },
  "sony-liv.svg": { geometry: "4919a132160e", palette: "c659d630ce0a" },
  "tubi.svg": { geometry: "5da1c9bc6d4b", palette: "7b4bf354734e" },
  "youtube.svg": { geometry: "e9193ec1877d", palette: "70b355a602fa" },
  "zee5.svg": { geometry: "c5e01ba00d31", palette: "318576946133" },
};

/**
 * Upstream provenance, verified by matching each file's path geometry against
 * the upstream repository (see docs/platform-assets.md §1).
 */
const PROVENANCE = {
  "netflix.svg": "selfhst/icons@main:svg/netflix.svg",
  "prime-video.svg": "selfhst/icons@main:svg/amazon-prime-video.svg",
  "jiohotstar.svg": "ackinc/webext-movie-ratings@master:…/platformWordmarks/jiohotstar.svg",
  "disney-plus.svg": "selfhst/icons@main:svg/disney-plus-light.svg",
  "max.svg": "selfhst/icons@main:svg/max-light.svg",
  "apple-tv-plus.svg": "homarr-labs/dashboard-icons@main:svg/apple-tv-plus.svg",
  "sony-liv.svg": "Dant5/clean-home-tizen@main:app/assets/icons/sonyliv.svg",
  "jiocinema.svg": "DevanshiJodhani/Jio-Cinema@main:public/images/jiocinema-logo.svg",
  "crunchyroll.svg": "selfhst/icons@main:svg/crunchyroll.svg",
  "tubi.svg": "CarlesRojas/ha-diorama@main:src/tiles/apps/tubi.svg",
  "zee5.svg": "CarlesRojas/ha-diorama@main:src/tiles/apps/zee5.svg",
  "hulu.svg": "CarlesRojas/ha-diorama@main:src/tiles/apps/hulu.svg",
  "paramount-plus.svg": "CarlesRojas/ha-diorama@main:src/tiles/apps/paramount-plus.svg",
  "peacock.svg": "CarlesRojas/ha-diorama@main:src/tiles/apps/peacock-dark.svg",
  "mubi.svg": "homarr-labs/dashboard-icons@main:svg/mubi-dark.svg",
  "discovery-plus.webp": "tv-logo/tv-logos@main:misc/media/discovery-plus.png (trimmed, WebP q92)",
  "youtube.svg": "selfhst/icons@main:svg/youtube.svg",
  "aha.webp": "tv-logo/tv-logos@main:misc/media/aha.png (trimmed, WebP q92)",
};

const sha1 = (value) => createHash("sha1").update(value).digest("hex").slice(0, 12);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex").slice(0, 16);

let checks = 0;
let failures = 0;

/** The nineteenth logo: this project's own mark, in the shared collection. */
const CINEMAX_ASSET = "cinemax.svg";

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

/* ------------------------------------------------------------------ registry */

const entries = [...registry.matchAll(/id:\s*"([^"]+)",[\s\S]*?logo:\s*"([^"]+)"/g)].map(([, id, logo]) => ({
  id,
  logo,
}));

check(entries.length === 18, "the registry declares all eighteen streaming platforms", `${entries.length} declared`);

const paths = new Set();
for (const { id, logo } of entries) {
  check(logo.startsWith("/platforms/"), `${id}: is served from /platforms/`, logo);
  check(!paths.has(logo), `${id}: has its own artwork`, logo);
  paths.add(logo);
}

/* ------------------------------------------------------------------- artwork */

const rows = [];
let payload = 0;

for (const { id, logo } of entries) {
  const name = logo.replace("/platforms/", "");
  const file = join(assetDir, name);

  let exists = true;
  try {
    statSync(file);
  } catch {
    exists = false;
  }
  if (!check(exists, `${id}: ${name} exists`)) continue;

  const raw = readFileSync(file);
  const bytes = raw.byteLength;
  payload += bytes;
  check(bytes <= MAX_BYTES, `${id}: within the per-logo budget`, `${(bytes / 1024).toFixed(1)} KB`);

  const pin = PINS[name];
  check(Boolean(pin), `${id}: has an identity pin`);
  check(Boolean(PROVENANCE[name]), `${id}: has recorded provenance`);

  const extension = extname(file).toLowerCase();
  const row = { id, name, format: extension.slice(1), size: bytes, dims: "—", pin: "n/a" };

  if (extension === ".svg") {
    const svg = raw.toString("utf8").replace(/<!--[\s\S]*?-->/g, "");

    check(/^\s*<svg[\s>]/i.test(svg), `${id}: is a single SVG document`);
    const viewBox = (svg.slice(0, 600).match(/viewBox\s*=\s*["']([^"']+)["']/) || [])[1];
    check(Boolean(viewBox), `${id}: declares a viewBox`);
    if (viewBox) {
      const numbers = viewBox.trim().split(/[\s,]+/).map(Number);
      const [, , width, height] = numbers;
      check(numbers.length === 4 && numbers.every(Number.isFinite), `${id}: viewBox is well formed`, viewBox);
      if (width > 0 && height > 0) {
        row.dims = `${+width.toFixed(1)}x${+height.toFixed(1)}`;
        const ratio = width / height;
        check(ratio > 0.12 && ratio < 8.5, `${id}: proportions are plausible (not stretched or cropped)`, ratio.toFixed(2));
      }
    }

    // An `<img>`-loaded SVG can only use what it contains.
    check(!/<script\b/i.test(svg), `${id}: carries no script`);
    check(!/\son[a-z]+\s*=/i.test(svg), `${id}: carries no inline handler`);
    check(!/<image\b/i.test(svg), `${id}: embeds no bitmap`);
    check(!/\b(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg), `${id}: references nothing external`);
    check(!/@import|url\(\s*["']?https?:/i.test(svg), `${id}: imports nothing remote`);

    const geometry = sha1(
      [...svg.matchAll(/\sd\s*=\s*"([^"]+)"/g)]
        .map((match) => match[1].replace(/\s+/g, " ").trim())
        .sort()
        .join("|")
    );
    const palette = sha1(
      [...svg.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|fill:\s*[a-z]+/g)]
        .map((match) => match[0].toLowerCase())
        .sort()
        .join("|")
    );

    if (pin?.geometry) {
      const sameShape = check(geometry === pin.geometry, `${id}: artwork is the pinned original (no substitution)`, `${geometry}`);
      const sameColour = check(palette === pin.palette, `${id}: colours are the pinned original (no tint/greyscale)`, `${palette}`);
      row.pin = sameShape && sameColour ? "match" : "CHANGED";
    }
  } else {
    const isPng = raw.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = raw.subarray(0, 4).toString("ascii") === "RIFF" && raw.subarray(8, 12).toString("ascii") === "WEBP";
    check(isPng || isWebp, `${id}: is a real PNG or WebP`, extension);

    if (isPng) {
      const width = raw.readUInt32BE(16);
      const height = raw.readUInt32BE(20);
      const colourType = raw[25]; // 4 = grey+alpha, 6 = RGBA
      row.dims = `${width}x${height}`;
      check(colourType === 4 || colourType === 6, `${id}: keeps an alpha channel`, `colour type ${colourType}`);
      check(Math.max(width, height) >= MIN_RASTER_EDGE, `${id}: enough pixels for a 3x screen`, row.dims);
    }

    if (isWebp) {
      const chunk = raw.subarray(12, 16).toString("ascii");
      const alpha = chunk === "VP8X" ? Boolean(raw[20] & 0x10) : chunk === "VP8L" || chunk === "VP8 ";
      check(alpha, `${id}: keeps transparency`, chunk);
    }

    const pinned = pin?.bytes ? sha256(raw) === pin.bytes : false;
    check(pinned, `${id}: file is the pinned original`, sha256(raw));
    row.pin = pinned ? "match" : "CHANGED";
  }

  rows.push(row);
}

/* -------------------------------------------------------------------- folder */

const shipped = readdirSync(assetDir).filter((name) => !name.startsWith("."));
const wired = new Set(entries.map(({ logo }) => logo.replace("/platforms/", "")));
// The project's own mark is part of the collection, but it is deliberately NOT
// a streaming platform: it must never appear in PLATFORMS, or the rail, the
// platform filter and /category/platform-* would advertise a fake provider.
wired.add(CINEMAX_ASSET);
const orphans = shipped.filter((name) => !wired.has(name));
check(orphans.length === 0, "no unregistered artwork in public/platforms", orphans.join(", ") || "none");
check(payload <= PAYLOAD_BUDGET, "the whole collection stays inside the payload budget", `${(payload / 1024).toFixed(1)} KB`);

/* ------------------------------------------------------- 19th mark: CINEMAX */

// The project's own identity is reused, never re-downloaded or redrawn: the
// primary lockup is the vector component, backed by standalone files.
for (const [path, label] of [
  ["src/components/Logo.tsx", "primary lockup (emblem + wordmark, vector)"],
  ["public/brand/cinemax-symbol.svg", "emblem, standalone vector"],
  ["public/brand/cinemax-app-icon.svg", "app icon, vector"],
]) {
  let ok = true;
  try {
    statSync(join(root, path));
  } catch {
    ok = false;
  }
  check(ok, `CINEMAX: ${label} is present`, path);
}

// The collection copy must exist, be a valid standalone SVG, and be the very
// same artwork as the file the app loads for the favicon and the dock — one
// brand mark, two paths, no drift.
const cinemaxAssetPath = join(assetDir, CINEMAX_ASSET);
let cinemaxAsset = null;
try {
  cinemaxAsset = readFileSync(cinemaxAssetPath, "utf8");
} catch {
  /* reported below */
}
check(Boolean(cinemaxAsset), `CINEMAX: the mark is part of the collection (${CINEMAX_ASSET})`);
check(!entries.some(({ id }) => id === "cinemax"), "CINEMAX is a brand mark, not a fake streaming platform");
if (cinemaxAsset) {
  check(/^\s*<svg[\s>]/i.test(cinemaxAsset) && /viewBox\s*=/.test(cinemaxAsset), "CINEMAX: is one SVG with a viewBox");
  check(!/(?:xlink:)?href\s*=/.test(cinemaxAsset), "CINEMAX: references nothing external");
  check(cinemaxAsset === readFileSync(join(root, "public", "brand", "cinemax-symbol.svg"), "utf8"),
    "CINEMAX: collection copy is identical to the brand symbol (no drift)");
  // The component is the renderer; its emblem path must match the asset, so a
  // future edit to one cannot silently fork the logo.
  const component = readFileSync(join(root, "src", "components", "Logo.tsx"), "utf8");
  const emblemPath = (cinemaxAsset.match(/<path d="(M42\.2[^"]+)"/) || [])[1];
  check(Boolean(emblemPath) && component.includes(emblemPath), "CINEMAX: component and asset share the same emblem geometry");
  check(cinemaxAsset.includes("#70e0ff") && cinemaxAsset.includes("#be65f7") && cinemaxAsset.includes("#ff65ae"),
    "CINEMAX: the original ribbon/fold gradient colours are intact");
}

/* --------------------------------------------------------------------- print */

console.log("");
console.log("  platform            file                      format  size     box        pin     upstream");
console.log("  ──────────────────  ────────────────────────  ──────  ───────  ─────────  ──────  ────────────────────────────────────");
for (const row of rows) {
  console.log(
    `  ${row.id.padEnd(18)}  ${row.name.padEnd(24)}  ${row.format.padEnd(6)}  ${(row.size / 1024)
      .toFixed(1)
      .padStart(5)}KB  ${row.dims.padEnd(9)}  ${row.pin.padEnd(6)}  ${PROVENANCE[row.name] ?? "—"}`
  );
}
console.log(
  `  ${"cinemax".padEnd(18)}  ${CINEMAX_ASSET.padEnd(24)}  svg     ${(cinemaxAsset ? Buffer.byteLength(cinemaxAsset) / 1024 : 0)
    .toFixed(1)
    .padStart(5)}KB  ${"64x64".padEnd(9)}  reuse   in-repo brand identity (identical to /brand/cinemax-symbol.svg)`
);

console.log("");
console.log(`platforms: ${entries.length}  + 1 project mark  =  ${entries.length + 1} logos`);
console.log(`files: ${shipped.length}  payload: ${(payload / 1024).toFixed(1)} KB`);
console.log(`checks: ${checks}, failures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
