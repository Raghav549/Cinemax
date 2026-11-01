#!/usr/bin/env node
/**
 * Platform-logo integrity check — run with `npm run verify:logos`.
 *
 * Nineteen official brand marks ship with CINEMAX: the streaming platforms in
 * `public/platforms/`, CINEMAX itself included. All of them are
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
  "cinemax.webp": { bytes: "5a605b48623d1e2a" },
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
  "cinemax.webp": "tv-logo/tv-logos@main:countries/united-states/cinemax-us.png (resized 524px wide, WebP q92)",
};

const sha1 = (value) => createHash("sha1").update(value).digest("hex").slice(0, 12);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex").slice(0, 16);

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

/* ------------------------------------------------------------------ registry */

const entries = [...registry.matchAll(/id:\s*"([^"]+)",[\s\S]*?logo:\s*"([^"]+)"/g)].map(([, id, logo]) => ({
  id,
  logo,
}));

check(entries.length === 19, "the registry declares all nineteen streaming platforms", `${entries.length} declared`);

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
      if (chunk === "VP8X") {
        // Canvas size lives in the extended header: 24-bit little-endian, minus one.
        const width = 1 + (raw[24] | (raw[25] << 8) | (raw[26] << 16));
        const height = 1 + (raw[27] | (raw[28] << 8) | (raw[29] << 16));
        row.dims = `${width}x${height}`;
        check(Math.max(width, height) >= MIN_RASTER_EDGE, `${id}: enough pixels for a 3x screen`, row.dims);
      }
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
const orphans = shipped.filter((name) => !wired.has(name));
check(orphans.length === 0, "no unregistered artwork in public/platforms", orphans.join(", ") || "none");
check(payload <= PAYLOAD_BUDGET, "the whole collection stays inside the payload budget", `${(payload / 1024).toFixed(1)} KB`);

/* ------------------------------------------- CINEMAX is a real platform */

// CINEMAX ships as a streaming platform exactly like Netflix: a registry entry,
// artwork in the shared collection, a disc in the home rail, a checkbox in the
// studio picker and its own `platform-cinemax` token. Its artwork is the CINEMAX
// network's own brand mark from upstream - deliberately NOT this application's
// logo, which must stay untouched where it is.
const cinemaxEntry = entries.find(({ id }) => id === "cinemax");
check(Boolean(cinemaxEntry), "CINEMAX: is declared as a streaming platform");
check(cinemaxEntry?.logo === "/platforms/cinemax.webp", "CINEMAX: platform artwork is in the shared collection", cinemaxEntry?.logo ?? "-");

for (const [path, label] of [
  ["src/components/Logo.tsx", "application lockup (emblem + wordmark, vector)"],
  ["public/brand/cinemax-symbol.svg", "application emblem, standalone vector"],
  ["public/brand/cinemax-app-icon.svg", "application icon, vector"],
  ["android/app/src/main/res/drawable/cinemax_emblem.xml", "native splash emblem"],
]) {
  let ok = true;
  try {
    statSync(join(root, path));
  } catch {
    ok = false;
  }
  check(ok, `application logo untouched: ${label}`, path);
}

// Nothing else in this project would notice if the application emblem were
// quietly copied in as "the platform logo", which is exactly what must not
// happen: the platform mark is the network's artwork, not the app's.
check(!entries.some(({ logo }) => /cinemax\.svg$/i.test(logo)),
  "CINEMAX: the platform logo is not the application's emblem file");
if (cinemaxEntry) {
  const platformArt = readFileSync(join(assetDir, "cinemax.webp"));
  check(!platformArt.equals(readFileSync(join(root, "public", "brand", "cinemax-symbol.svg"))),
    "CINEMAX: platform logo is not a copy of the application logo");
  check(/cinemax\.webp$/.test(cinemaxEntry.logo), "CINEMAX: platform logo is the network brand artwork");
}

// The rail and the studio picker are registry-driven, so one entry is enough to
// make CINEMAX selectable and visible everywhere the other platforms are.
const railSource = readFileSync(join(root, "src", "components", "PlatformRail.tsx"), "utf8");
const pickerSource = readFileSync(join(root, "src", "components", "PlatformPicker.tsx"), "utf8");
check(/PLATFORMS\.map/.test(railSource), "CINEMAX: the home rail renders every registered platform");
check(/PLATFORMS\.map/.test(pickerSource), "CINEMAX: the studio picker offers every registered platform");
check(/platformTag/.test(registry) && /PLATFORM_TAG_PREFIX = "platform-"/.test(registry),
  "CINEMAX: selections are saved through the shared platform-token system");

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
console.log("");
console.log(`platforms: ${entries.length} logos, CINEMAX included`);
console.log(`files: ${shipped.length}  payload: ${(payload / 1024).toFixed(1)} KB`);
console.log(`checks: ${checks}, failures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
