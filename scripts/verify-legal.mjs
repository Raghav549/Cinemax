#!/usr/bin/env node
/**
 * Legal-document check — run with `npm run verify:legal` after `npm run build`.
 *
 * The five legal documents (/license, /copyright, /attributions, /disclaimer,
 * /privacy) are static pages, so the build writes their finished HTML to
 * `.next/server/app/<route>.html`. This script reads that HTML — the same bytes
 * a browser receives — and checks what no TypeScript compiler can:
 *
 *   1. every route exists and renders with its own <title> and description,
 *   2. the canonical URL is present and points at that route,
 *   3. the table of contents links only to sections that exist, and no id is
 *      duplicated (a broken in-page anchor is invisible to the build),
 *   4. every document has a real heading structure and enough substance,
 *   5. the licensing page lists all nineteen platforms with an image that exists
 *      on disk — never a text-only or missing logo,
 *   6. each document links to its four siblings and back to the catalogue,
 *   7. the "no affiliation" disclaimer is actually present in the text,
 *   8. no page leaks a placeholder, a TODO or an unreplaced token.
 *
 * It only reads files. Run it after the build, as CI does.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, ".next", "server", "app");
const publicDir = join(root, "public");

const ROUTES = ["license", "copyright", "attributions", "disclaimer", "privacy"];
const PLATFORMS = [
  "Netflix",
  "Prime Video",
  "JioHotstar",
  "Disney+",
  "Max",
  "Apple TV+",
  "SonyLIV",
  "JioCinema",
  "Crunchyroll",
  "Tubi",
  "ZEE5",
  "Hulu",
  "Paramount+",
  "Peacock",
  "MUBI",
  "Discovery+",
  "YouTube",
  "aha",
  "CINEMAX",
];

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

const decode = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));

/** Visible text only: script payloads and styles are not copy. */
const textOf = (html) =>
  decode(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();

const pages = new Map();
for (const route of ROUTES) {
  const file = join(buildDir, `${route}.html`);
  if (!existsSync(file)) {
    continue;
  }
  pages.set(route, readFileSync(file, "utf8"));
}

section("Routes");
if (!check(pages.size === ROUTES.length, "the build produced all five legal documents", `${pages.size}/${ROUTES.length}`)) {
  console.log("  (run `npm run build` first)");
  process.exit(1);
}

for (const route of ROUTES) {
  const html = pages.get(route);
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] ?? "";
  const description = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] ?? "";
  const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] ?? "";

  check(title.toLowerCase().includes("cinemax") && title.length > 8, `${route}: has its own title`, title);
  check(description.length > 60, `${route}: has a real description`, `${description.length} chars`);
  check(canonical.endsWith(`/${route}`), `${route}: declares its own canonical URL`, canonical);
}

section("Structure and navigation");
for (const route of ROUTES) {
  const html = pages.get(route);
  const text = textOf(html);
  const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)].map((match) => textOf(match[1]));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const anchors = [...html.matchAll(/<a[^>]+href="#([^"]+)"/g)].map((match) => match[1]);
  const brokenAnchors = anchors.filter((id) => !ids.includes(id));
  const emptyLinks = [...html.matchAll(/<a\b[^>]*>\s*<\/a>/g)].length;

  check(headings.length >= 8, `${route}: has a long-form section structure`, `${headings.length} sections`);
  check(new Set(ids).size === ids.length, `${route}: no duplicate element ids`, duplicateIds.join(", ") || "none");
  check(anchors.length >= 8, `${route}: offers an in-page table of contents`, `${anchors.length} links`);
  check(brokenAnchors.length === 0, `${route}: every contents link resolves to a section`, brokenAnchors.join(", ") || "none");
  check(emptyLinks === 0, `${route}: has no empty link text`);
  check(text.length > 4000, `${route}: carries the document's substance`, `${text.length} chars`);
  // "placeholders" is legitimate copy about the artwork fallback; an unreplaced
  // token or a stubbed sentence is not.
  check(!/\bTODO\b|\bTBD\b|\blorem ipsum\b|\[\[|\]\]|\{\{|\}\}|\bFIXME\b/i.test(text), `${route}: contains no stub or unreplaced token`);

  // Cross-links: the four siblings plus a way back into the catalogue.
  for (const sibling of ROUTES.filter((name) => name !== route)) {
    check(html.includes(`href="/${sibling}"`), `${route}: links to /${sibling}`);
  }
  check(html.includes('href="/"'), `${route}: offers a way back to the catalogue`);
}

section("Licensing page — brand coverage");
{
  const html = pages.get("license");
  const text = textOf(html);
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  const logoSources = images
    .map((tag) => (tag.match(/\bsrc="([^"]+)"/) || [])[1] ?? "")
    .filter((src) => src.includes("/platforms/"));

  check(logoSources.length >= 19, "all nineteen platform marks are rendered", `${logoSources.length} images`);
  check(new Set(logoSources).size >= 19, "each platform uses its own artwork file", `${new Set(logoSources).size} distinct sources`);

  for (const src of new Set(logoSources)) {
    const file = join(publicDir, src.replace(/^\//, ""));
    check(existsSync(file), `logo file exists: ${src}`);
  }

  for (const name of PLATFORMS) {
    check(text.includes(name), `lists ${name} by name`);
  }

  check(/not affiliated|no affiliation|does not imply/i.test(text), "states that no affiliation is implied");
  check(/trademark/i.test(text), "addresses trademarks");
  check(/copyright/i.test(text), "addresses copyright");
  check(/SIL Open Font License|Open Font License/i.test(text), "documents the fonts' licence");
  check(/MIT|Apache|BSD/.test(text), "documents the software licences");
  check(/All rights (?:in them )?remain|rights reserved/i.test(text), "records that rights remain with their owners");
}

section("Attributions page — licence facts");
{
  const text = textOf(pages.get("attributions"));
  for (const component of ["Next.js", "React", "Tailwind", "TypeScript", "drizzle", "hls.js", "dash.js", "bcryptjs", "jose", "PostgreSQL"]) {
    check(text.toLowerCase().includes(component.toLowerCase()), `attributes ${component}`);
  }
  check(!/AGPL|SSPL/i.test(text) || /no AGPL/i.test(text), "makes no claim of a copyleft dependency it does not have");
}

section("Privacy page — real storage inventory");
{
  const text = textOf(pages.get("privacy"));
  for (const key of ["cinemax:playback", "cinemax:prism-intro", "session_id", "admin_token"]) {
    check(text.includes(key), `documents ${key}`);
  }
  check(/sessionStorage/i.test(text), "documents session storage");
  check(/localStorage/i.test(text), "documents local storage");
  check(/cookie/i.test(text), "documents cookies");
}

console.log("");
console.log(`checks: ${checks}, failures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
