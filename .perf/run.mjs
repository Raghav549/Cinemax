/**
 * Runs .perf/harness.tsx in jsdom against a production React build.
 * Usage: node .perf/run.mjs [--dev]
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outfile = path.join(here, ".bundle.cjs");
const require = createRequire(path.join(root, "android/.toolchain/tests/package.json"));
const { JSDOM } = require("jsdom");
const dev = process.argv.includes("--dev");
// React is kept external, so it reads NODE_ENV at require time: this must be set
// before the bundle is imported. Counters work in both modes; <Profiler> commit
// durations are only reported by the development build, hence --dev.
process.env.NODE_ENV = dev ? "development" : "production";

await build({
  entryPoints: [path.join(here, "harness.tsx")],
  bundle: true,
  outfile,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  logLevel: "warning",
  define: { "process.env.NODE_ENV": dev ? '"development"' : '"production"' },
  alias: { "@": path.join(root, "src") },
  loader: { ".css": "empty" },
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  absWorkingDir: root,
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://cinemax.test/", pretendToBeVisual: true });

// Minimal browser surface the app touches.
dom.window.matchMedia = (query) => ({
  matches: false, media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
});
dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
dom.window.scrollTo = () => {};
if (!dom.window.Element.prototype.scrollBy) dom.window.Element.prototype.scrollBy = () => {};
if (!dom.window.Element.prototype.scrollTo) dom.window.Element.prototype.scrollTo = () => {};

// The library: 200 synthetic titles (generated, not database data). A real API
// decodes fresh objects on every response, and so does this stub.
const LIBRARY = Array.from({ length: 200 }, (_, index) => ({
  id: index + 1,
  title: `Title ${index + 1}`,
  year: 2024,
  rating: 8.1,
  duration: 118,
  genres: ["Action"],
  description: "Synthetic record for measurement only.",
  posterUrl: `https://image.tmdb.org/t/p/w342/poster-${index + 1}.jpg`,
  backdropUrl: `https://image.tmdb.org/t/p/w780/backdrop-${index + 1}.jpg`,
  trailerUrl: null,
  videoUrl: null,
  category: "trending",
  platforms: ["netflix"],
  availability: "streaming",
}));

dom.window.fetch = async (url) => {
  const pathname = String(url).split("?")[0];
  let body = [];
  if (pathname === "/api/movies") body = LIBRARY;
  if (pathname === "/api/movies" && dom.window.__provided) body = [{ ...LIBRARY[0], title: "Edited title" }, ...LIBRARY.slice(1)];
  return { ok: true, json: async () => JSON.parse(JSON.stringify(body)) };
};
globalThis.fetch = dom.window.fetch;

for (const key of [
  "window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "CustomEvent",
  "MutationObserver", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia",
  "ResizeObserver", "IntersectionObserver", "getComputedStyle", "localStorage", "sessionStorage",
  "history", "location",
]) {
  const value = dom.window[key];
  if (value === undefined) continue;
  try { globalThis[key] = typeof value === "function" && !value.prototype ? value.bind(dom.window) : value; }
  catch { /* read-only accessor on this Node version */ }
}

// React reports development warnings (keys, act, invalid props) through
// console.error, so collect them instead of letting them scroll by.
const consoleIssues = [];
for (const level of ["error", "warn"]) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    consoleIssues.push(`[${level}] ${args.map((value) => (typeof value === "string" ? value : String(value))).join(" ")}`);
    if (!dev) original(...args);
  };
}
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

try {
  await import("file://" + outfile + "?" + Date.now());
} catch (error) {
  console.error("harness import failed:", error);
}
let result;
for (let waited = 0; waited < 20000; waited += 50) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (dom.window.__perf) { result = dom.window.__perf; break; }
}
result ??= { error: "harness produced no result" };
result.consoleIssues = consoleIssues;
writeFileSync(path.join(here, dev ? "last-run.dev.json" : "last-run.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
