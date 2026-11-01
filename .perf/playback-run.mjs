/**
 * Runs .perf/playback.tsx in jsdom against a production React build.
 * Usage: node .perf/playback-run.mjs [--json]
 *
 * Prints how long it takes from rendering the playback overlay to the player
 * element (iframe/video) existing in the document, with the playback-plan API
 * stubbed to a fixed latency. That interval is what the viewer spends waiting
 * before the provider is even asked for its player.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outfile = path.join(here, ".playback.bundle.mjs");
const require = createRequire(path.join(root, "android/.toolchain/tests/package.json"));
const { JSDOM } = require("jsdom");

process.env.NODE_ENV = "production";

await build({
  entryPoints: [path.join(here, "playback.tsx")],
  bundle: true,
  outfile,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  logLevel: "warning",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": path.join(root, "src") },
  loader: { ".css": "empty" },
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  absWorkingDir: root,
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://www.cinemaxtv.space/", pretendToBeVisual: true });

dom.window.matchMedia = (query) => ({
  matches: false, media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
});
dom.window.scrollTo = () => {};
if (!dom.window.Element.prototype.scrollIntoView) dom.window.Element.prototype.scrollIntoView = () => {};

for (const key of [
  "window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "CustomEvent",
  "MutationObserver", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia",
  "getComputedStyle", "localStorage", "sessionStorage", "history", "location",
]) {
  const value = dom.window[key];
  if (value === undefined) continue;
  try { globalThis[key] = typeof value === "function" && !value.prototype ? value.bind(dom.window) : value; }
  catch { /* read-only accessor on this Node version */ }
}

const consoleIssues = [];
for (const level of ["error", "warn"]) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    consoleIssues.push(`[${level}] ${args.map((value) => (typeof value === "string" ? value : String(value))).join(" ")}`);
    if (process.env.CINEMAX_MEASURE_VERBOSE) original(...args);
  };
}

try {
  await import("file://" + outfile + "?" + Date.now());
} catch (error) {
  console.error("harness import failed:", error);
}

let result;
for (let waited = 0; waited < 15000; waited += 25) {
  await new Promise((resolve) => setTimeout(resolve, 25));
  if (globalThis.__playbackMeasurement) { result = globalThis.__playbackMeasurement; break; }
}
result ??= { error: "harness produced no result" };
result.consoleIssues = consoleIssues;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("");
  console.log(`  mode                      : ${result.mode}${result.mode === "warm" ? ` (intent ${result.intentLeadMs} ms before the press)` : ""}`);
  console.log(`  playback-plan API latency : ${result.apiLatencyMs} ms`);
  console.log(`  server plan received at   : ${result.serverPlanAtMs ?? "never"} ms`);
  console.log(`  player element at         : ${result.playerElementAtMs ?? "never"} ms (from mount)   ${result.element ?? ""}`);
  console.log(`  wait after the press      : ${result.afterPressMs ?? "never"} ms`);
  console.log(`  element source            : ${result.source ?? "-"}`);
  console.log(`  plan requests             : ${result.planRequests}`);
  console.log(`  console issues            : ${result.consoleIssues.length}`);
  console.log("");
}
