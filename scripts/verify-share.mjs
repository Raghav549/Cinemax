#!/usr/bin/env node
/**
 * Sharing rules — run with `npm run verify:share`.
 *
 * `src/lib/share.ts` decides what a share contains on both platforms: the same
 * payload goes to Android's share sheet through the bridge and to the browser's
 * Web Share API. Nothing at runtime would notice if that payload quietly lost
 * its preview image, claimed a YouTube link was a video file, or stopped
 * falling back to copying the link — it would just look like a plain text share.
 *
 * This script compiles the module with the TypeScript compiler the project
 * already depends on and exercises it in a sandboxed context, with a fake
 * browser/window, so the checks run on a plain checkout with no browser and no
 * device:
 *
 *   1. trailer classification (a real video file vs a page that must stay a link),
 *   2. the payload a share carries: one link, one card, the description as text,
 *      and nothing that would render a second card in the receiving app,
 *   3. the native bridge taking precedence over the browser API,
 *   4. the Web Share call (link + text, no pre-share download),
 *   5. cancellation and the clipboard fallback,
 *   6. the official domain everywhere, and no deployment hostname in any field.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "src", "lib", "share.ts"), "utf8");

const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
}).outputText;

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

const ORIGIN = "https://cinemaxtv.space";

const movie = {
  id: 42,
  title: "Dune: Part Two",
  year: 2024,
  genre: "Science Fiction, Adventure",
  type: "movie",
  description:
    "Paul Atreides unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family.",
  posterUrl: `${ORIGIN}/poster.jpg`,
  trailerUrl: "https://www.youtube.com/watch?v=8g18jFHCLXk",
};

/**
 * Loads the module into a fresh sandbox so each case controls window, navigator
 * and fetch exactly as a browser would present them.
 */
function load({ bridge = null, share = null, canShare = null, clipboard = null, fetchImpl = null } = {}) {
  const calls = { share: [], clipboard: [], bridge: [], fetch: [] };
  const windowObject = {
    location: { origin: ORIGIN },
    ...(bridge ? { CinemaxNative: { share: (...args) => calls.bridge.push(args) } } : {}),
  };
  const navigatorObject = {};
  if (share) {
    navigatorObject.share = async (data) => {
      calls.share.push(data);
      return share(data);
    };
  }
  if (canShare) navigatorObject.canShare = (data) => canShare(data);
  if (clipboard) {
    navigatorObject.clipboard = {
      writeText: async (text) => {
        calls.clipboard.push(text);
        return clipboard(text);
      },
    };
  }

  const sandbox = {
    window: windowObject,
    navigator: navigatorObject,
    fetch:
      fetchImpl ||
      (async () => {
        throw new Error("network is not available in this check");
      }),
    File,
    Blob,
    URL,
    URLSearchParams,
    AbortSignal,
    Error,
    Promise,
    String,
    Number,
    Object,
    Array,
    RegExp,
    JSON,
    console,
    module: { exports: {} },
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(compiled, sandbox, { filename: "share.ts" });
  return { api: sandbox.module.exports, calls, windowObject, navigatorObject };
}

/* ------------------------------------------------------------- 1. trailers */

section("Trailer rules");
{
  const { api } = load();

  const direct = api.trailerTarget("https://cdn.example.com/trailers/dune.mp4");
  check(direct?.kind === "video", "a direct video file is treated as a video", direct?.kind);
  check(
    api.trailerTarget("/api/media/trailers/dune.webm")?.kind === "video",
    "a locally served video file is treated as a video"
  );

  const youtube = api.trailerTarget("https://www.youtube.com/watch?v=8g18jFHCLXk");
  check(youtube?.kind === "youtube", "a YouTube trailer stays a YouTube link", youtube?.kind);
  check(youtube?.thumbnail?.includes("i.ytimg.com"), "a YouTube trailer keeps its own still");
  check(youtube?.url.startsWith("https://www.youtube.com/watch?v="), "the YouTube link is canonical");
  check(
    api.trailerTarget("https://youtu.be/8g18jFHCLXk?t=12")?.url === "https://www.youtube.com/watch?v=8g18jFHCLXk",
    "a shortened YouTube link is normalised"
  );

  check(api.trailerTarget("https://vimeo.com/123456789")?.kind === "vimeo", "a Vimeo trailer stays a Vimeo link");
  check(
    api.trailerTarget("https://cdn.example.com/master.m3u8")?.kind === "link",
    "an adaptive stream is a link, never an attachable file"
  );
  check(api.trailerTarget(null) === null, "no trailer means no trailer section");
  check(api.trailerTarget("   ") === null, "a blank trailer value is treated as none");
  check(api.trailerTarget("not a url") !== null, "a non-URL string degrades to a link instead of throwing");
}

/* -------------------------------------------------------------- 2. payload */

section("What a share carries");
{
  const { api } = load();
  const payload = api.buildSharePayload(movie, ORIGIN);

  check(payload.title === "Dune: Part Two on CINEMAX", "the subject names the title and CINEMAX", payload.title);
  check(payload.url === `${ORIGIN}/share/42`, "the link opens the share landing page", payload.url);
  check(payload.imageUrl === `${ORIGIN}/api/share/card/42`, "the preview image is the generated card", payload.imageUrl);
  check(
    payload.text === movie.description,
    "the message is the title's own description",
    payload.text.slice(0, 60)
  );
  check(!payload.text.includes("http"), "the message contains no raw URL (the link travels as the link)");
  check(!payload.text.includes("Trailer:"), "the message carries no trailer line");
  check(!payload.text.includes(movie.title), "the message does not repeat the title the card already shows");
  check(!payload.text.includes("vercel"), "the message carries no deployment hostname");
  check(payload.videoUrl === "", "no second media item is attached next to the card");

  const withVideo = api.buildSharePayload(
    { ...movie, trailerUrl: "https://cdn.example.com/trailers/dune.mp4" },
    ORIGIN
  );
  check(
    withVideo.videoUrl === "",
    "even a real trailer file is not attached: one share is one card",
    withVideo.videoUrl
  );

  check(!/example\.com\/poster/.test(payload.imageUrl), "the payload never falls back to raw artwork as the preview");

  const sparse = api.buildSharePayload({ id: 7, title: "Untitled record" }, ORIGIN);
  check(sparse.text === "Watch Untitled record on CINEMAX.", "a record without a description still reads as a sentence", sparse.text);
  check(!sparse.text.includes("()"), "missing year and genre leave no empty brackets");

  const long = api.buildSharePayload({ ...movie, description: "x".repeat(400) }, ORIGIN);
  check(long.text.length <= 160, "a long description is clipped for the message", `${long.text.length}`);
  check(long.text.endsWith("…"), "a clipped description ends in an ellipsis");

  const described = api.shareDescription(movie);
  check(described.length <= 220, "the description used for social cards is clipped", `${described.length}`);
  check(described.startsWith("Dune: Part Two"), "the description starts with the title");

  // One link, one card: the receiving app must not find a second URL to unfurl.
  const linkCount = [payload.text, payload.url, payload.imageUrl].join(" ").match(/https?:\/\//g)?.length ?? 0;
  check(linkCount === 2, "the payload names exactly one destination and one card image", `${linkCount}`);
}

/* --------------------------------------------------- 3. the native bridge */

section("Android shell — native share sheet");
{
  const { api, calls } = load({ bridge: true, share: true });
  const outcome = await api.shareTitle(movie, ORIGIN);

  check(outcome === "shared", "a bridge share reports success", outcome);
  check(calls.bridge.length === 1, "the bridge is called exactly once");
  const [title, text, url, imageUrl, videoUrl] = calls.bridge[0] ?? [];
  check(title === "Dune: Part Two on CINEMAX", "the bridge receives the subject", title);
  check(text === movie.description, "the bridge receives the description as the text", (text ?? "").slice(0, 40));
  check(!text?.includes("http"), "the bridge text carries no raw URL");
  check(url === `${ORIGIN}/share/42`, "the bridge receives the landing URL", url);
  check(imageUrl === `${ORIGIN}/api/share/card/42`, "the bridge receives the card image", imageUrl);
  check(videoUrl === "", "the bridge receives no second media item at all");
  check(calls.share.length === 0, "the browser share API is not used inside the app");
  check(calls.clipboard.length === 0, "nothing is copied to the clipboard inside the app");
}

/* ------------------------------------------------------ 4. browser share */

section("Browser — Web Share API");
{
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(String(url));
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
      status: 200,
      headers: { "content-type": "image/png", "content-length": "4" },
    });
  };
  const { api, calls } = load({
    share: async () => {},
    canShare: () => true,
    clipboard: async () => {},
    fetchImpl,
  });

  const outcome = await api.shareTitle(movie, ORIGIN);
  check(outcome === "shared", "a supported browser reports success", outcome);
  check(calls.share.length === 1, "navigator.share is called once");
  const data = calls.share[0] ?? {};
  check(data.title === "Dune: Part Two on CINEMAX", "the browser receives the subject");
  check(data.url === `${ORIGIN}/share/42`, "the browser receives the landing URL");
  check(data.text === movie.description, "the browser receives the description as the text");
  check(data.files === undefined, "nothing is downloaded before sharing, so the sheet opens at once");
  check(fetched.length === 0, "sharing performs no network request of its own", `${fetched.length}`);
  check(calls.clipboard.length === 0, "no clipboard fallback when sharing succeeded");
}

/* --------------------------------------------- 5. cancellation + fallback */

section("Cancellation and fallbacks");
{
  const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
  const { api, calls } = load({
    share: async () => {
      throw abort;
    },
    clipboard: async () => {},
  });
  const outcome = await api.shareTitle(movie, ORIGIN);
  check(outcome === "cancelled", "closing the share sheet is reported as a cancellation", outcome);
  check(calls.clipboard.length === 0, "cancelling never copies to the clipboard instead");

  const { api: fallbackApi, calls: fallbackCalls } = load({ clipboard: async () => {} });
  const fallbackOutcome = await fallbackApi.shareTitle(movie, ORIGIN);
  check(fallbackOutcome === "copied", "a browser without Web Share copies the link", fallbackOutcome);
  check(
    fallbackCalls.clipboard[0]?.includes(`${ORIGIN}/share/42`),
    "the copied text contains the link"
  );

  const { api: blockedApi } = load({ clipboard: async () => { throw new Error("denied"); } });
  const blockedOutcome = await blockedApi.shareTitle(movie, ORIGIN);
  check(blockedOutcome === "unavailable", "a refused clipboard is reported, not hidden", blockedOutcome);

  const { api: rejectedApi, calls: rejectedCalls } = load({
    share: async () => {
      throw new Error("no share targets");
    },
    clipboard: async () => {},
  });
  const rejectedOutcome = await rejectedApi.shareTitle(movie, ORIGIN);
  check(rejectedOutcome === "copied", "a rejected share falls back to the link", rejectedOutcome);
  check(rejectedCalls.clipboard.length === 1, "the fallback runs exactly once");
}

console.log("");
/* ------------------------------------------- 6. the official domain, always */

section("Official domain");
{
  const { api } = load();
  check(api.SHARE_SITE_URL === "https://cinemaxtv.space", "the canonical origin is the official domain", api.SHARE_SITE_URL);
  // Even when the page itself is served from a deployment hostname, the link a
  // share carries is the official one.
  const preview = load();
  preview.windowObject.location.origin = "https://cinemax-orpin.vercel.app";
  const previewPayload = preview.api.buildSharePayload(movie);
  check(
    previewPayload.url === "https://cinemaxtv.space/share/42",
    "a share made from a deployment hostname still points at the official domain",
    previewPayload.url
  );

  for (const [label, value] of [
    ["landing page", api.sharePageUrl(movie.id, api.SHARE_SITE_URL)],
    ["title page", api.titleUrl(movie.id, api.SHARE_SITE_URL)],
    ["card image", api.shareCardUrl(movie.id, api.SHARE_SITE_URL)],
    ["payload", JSON.stringify(api.buildSharePayload(movie, api.SHARE_SITE_URL))],
  ]) {
    check(!/vercel\.app/i.test(value), `the ${label} names no deployment host`, value.slice(0, 48));
    check(value.includes("cinemaxtv.space"), `the ${label} points at the official domain`);
  }
}

console.log(`checks: ${checks}, failures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
