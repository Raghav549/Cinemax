#!/usr/bin/env node
/**
 * Playback-pipeline measurement — run with `npm run measure:playback`.
 *
 * The complaint this script exists to answer: the same provider page opens
 * quickly on its own but loads slowly inside CINEMAX. The suspicion is CINEMAX's
 * own network path, not the connection.
 *
 * It runs the **real server resolver** (`src/lib/playback/web-resolver.ts`,
 * compiled from source, not a copy) against a local fixture provider that is
 * deliberately built like a real one:
 *
 *   · a watch page that embeds its player in an <iframe>;
 *   · a watch page whose first three frames refuse to be framed and whose fourth
 *     is fine;
 *   · a watch page with no frame at all, only six media candidates, each of which
 *     takes a while to answer.
 *
 * For each page it records the wall-clock time the resolver needs, how many
 * outbound requests it made, and the plan it produced. These are the numbers
 * quoted for "before" and "after" — the same script, the same fixture, the same
 * machine.
 *
 * Usage:
 *   node scripts/measure-playback.mjs            # human-readable table
 *   node scripts/measure-playback.mjs --json     # machine-readable
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const esbuild = require("esbuild");

const asJson = process.argv.includes("--json");

/* --------------------------------------------------------------- fixtures */

/** Latency each fixture endpoint adds before answering (ms). */
const LATENCY = { page: 120, frame: 220, media: 300 };

const hits = [];
/** TCP connections opened by the resolver — one per TLS handshake it pays for. */
let connections = 0;
let base = "";

function count(path) {
  hits.push(path);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  count(url.pathname);
  const send = (status, headers, body, delay) => {
    setTimeout(() => {
      res.writeHead(status, headers);
      res.end(body);
    }, delay);
  };

  if (url.pathname === "/watch/iframe") {
    // A provider that publishes its player in a frame — the common case.
    send(200, { "content-type": "text/html; charset=utf-8" }, `<!doctype html><html><head><title>Watch</title></head>
      <body><h1>Watch</h1><iframe src="/embed/player-1" allowfullscreen></iframe></body></html>`, LATENCY.page);
    return;
  }
  if (url.pathname === "/watch/blocked-then-open") {
    // Three frames that refuse framing, then one that allows it.
    send(200, { "content-type": "text/html; charset=utf-8" }, `<!doctype html><html><head><title>Watch</title></head>
      <body>
        <iframe src="/embed/denied-1"></iframe>
        <iframe src="/embed/denied-2"></iframe>
        <iframe src="/embed/denied-3"></iframe>
        <iframe src="/embed/player-2"></iframe>
      </body></html>`, LATENCY.page);
    return;
  }
  if (url.pathname === "/watch/dead-then-live") {
    // Five candidates that answer with the wrong content, then the real media.
    // Sequential probing pays for all six; a bounded parallel probe pays for one
    // round of them.
    const candidates = [1, 2, 3, 4, 5].map((n) => `<source src="/dead/candidate-${n}.mp4">`).join("")
      + '<source src="/media/live.mp4" type="video/mp4">';
    send(200, { "content-type": "text/html; charset=utf-8" }, `<!doctype html><html><head><title>Watch</title></head>
      <body><div class="player"><video>${candidates}</video></div></body></html>`, LATENCY.page);
    return;
  }
  if (url.pathname === "/watch/hanging-candidates") {
    // Six media URLs that never answer. Sequential probing pays the full
    // per-probe timeout for each one; this is the case that used to make
    // opening a title feel like a hang.
    const candidates = [1, 2, 3, 4, 5, 6].map((n) => `<source src="/hang/candidate-${n}.mp4" type="video/mp4">`).join("");
    send(200, { "content-type": "text/html; charset=utf-8" }, `<!doctype html><html><head><title>Watch</title></head>
      <body><div class="player"><video>${candidates}</video></div></body></html>`, LATENCY.page);
    return;
  }
  if (url.pathname === "/watch/media-only") {
    // No frame: the player is discovered through six media candidates, each of
    // which answers slowly. This is the shape that used to add up to a minute.
    const candidates = [1, 2, 3, 4, 5, 6].map((n) => `<source src="/media/candidate-${n}.mp4" type="video/mp4">`).join("");
    send(200, { "content-type": "text/html; charset=utf-8" }, `<!doctype html><html><head><title>Watch</title></head>
      <body><div class="player"><video>${candidates}</video></div></body></html>`, LATENCY.page);
    return;
  }
  if (url.pathname.startsWith("/embed/")) {
    const denied = url.pathname.includes("denied");
    send(200, {
      "content-type": "text/html; charset=utf-8",
      ...(denied ? { "x-frame-options": "DENY" } : {}),
    }, `<!doctype html><html><body><video src="/media/player.mp4"></video></body></html>`, LATENCY.frame);
    return;
  }
  if (url.pathname.startsWith("/hang/")) {
    // Never answers; the client gives up on its own timeout.
    return;
  }
  if (url.pathname.startsWith("/dead/")) {
    // An HTML error page behind a .mp4 URL: exactly what a signed CDN URL that
    // has expired looks like, and the case that makes sequential probing slow.
    send(200, { "content-type": "text/html; charset=utf-8" },
      "<!doctype html><html><body>This link is no longer valid.</body></html>", LATENCY.media);
    return;
  }
  if (url.pathname.startsWith("/media/")) {
    // A real 2-second MP4 header would be needed for classification; these
    // fixtures are classified by content-type, which is what a CDN returns.
    const isVideo = url.pathname.endsWith(".mp4");
    send(200, {
      "content-type": isVideo ? "video/mp4" : "application/octet-stream",
      "content-length": "32",
      "access-control-allow-origin": "*",
    }, Buffer.alloc(32), LATENCY.media);
    return;
  }
  send(404, { "content-type": "text/plain" }, "not found", 0);
});

server.on("connection", () => { connections += 1; });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
base = `http://127.0.0.1:${server.address().port}`;

/* ---------------------------------------------------------------- harness */

// The resolver only contacts private hosts when this is set; it is the same
// switch the automated playback tests use.
process.env.CINEMAX_PLAYBACK_ALLOW_PRIVATE_HOSTS = "true";
process.env.CINEMAX_PLAYBACK_DEADLINE_MS = process.env.CINEMAX_PLAYBACK_DEADLINE_MS ?? "";

const bundlePath = join(root, ".perf", ".playback-measure.cjs");
await esbuild.build({
  entryPoints: [join(root, "src", "lib", "playback", "web-resolver.ts")],
  bundle: true,
  outfile: bundlePath,
  platform: "node",
  format: "cjs",
  target: "node20",
  logLevel: "warning",
  absWorkingDir: root,
  alias: { "@": join(root, "src") },
});

const { resolveWebPlayback } = require(bundlePath);

const CASES = [
  { name: "iframe player page", path: "/watch/iframe" },
  { name: "3 blocked frames + 1 open", path: "/watch/blocked-then-open" },
  { name: "6 slow media candidates", path: "/watch/media-only" },
  { name: "5 dead + 1 live candidate", path: "/watch/dead-then-live" },
];

if (process.argv.includes("--worst-case")) {
  // Slow on purpose (one case, ~50 s before the fix): the pathological provider.
  CASES.push({ name: "6 candidates never answer", path: "/watch/hanging-candidates" });
}

const results = [];
for (const testCase of CASES) {
  const before = hits.length;
  const connectionsBefore = connections;
  const started = process.hrtime.bigint();
  let firstRequestAt = null;
  const watcher = setInterval(() => {
    if (firstRequestAt === null && hits.length > before) firstRequestAt = Number(process.hrtime.bigint() - started) / 1e6;
  }, 5);
  const outcome = await resolveWebPlayback(`${base}${testCase.path}`, { embedderOrigin: "https://cinemaxtv.space" });
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  clearInterval(watcher);
  const plan = outcome.ok ? outcome.resolution.playback : { strategy: "error" };
  results.push({
    case: testCase.name,
    ms: Math.round(elapsed),
    firstRequestMs: firstRequestAt === null ? null : Math.round(firstRequestAt),
    requests: hits.length - before,
    connections: connections - connectionsBefore,
    strategy: plan.strategy,
    src: "src" in plan ? String(plan.src).replace(base, "") : "",
  });
}

server.close();

const summary = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  fixtureLatencyMs: LATENCY,
  results,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("");
  console.log(`  fixture latency: page ${LATENCY.page} ms · frame ${LATENCY.frame} ms · media ${LATENCY.media} ms`);
  console.log("");
  console.log("  case                        total     first req  requests  conns  strategy  source");
  console.log("  ──────────────────────────  ────────  ─────────  ────────  ─────  ────────  ──────────────");
  for (const row of results) {
    console.log(`  ${row.case.padEnd(26)}  ${String(row.ms + " ms").padEnd(8)}  ${String((row.firstRequestMs ?? "-") + " ms").padEnd(9)}  ${String(row.requests).padEnd(8)}  ${String(row.connections).padEnd(5)}  ${row.strategy.padEnd(8)}  ${row.src}`);
  }
  console.log("");
}

if (process.argv.includes("--save")) {
  const out = join(root, ".perf", "playback-measure.json");
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`  saved ${out}`);
}
