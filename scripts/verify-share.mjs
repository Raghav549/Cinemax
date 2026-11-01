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
 *   2. the payload a share carries (title, text, link, card image, video),
 *   3. the native bridge taking precedence over the browser API,
 *   4. the Web Share call, including the generated card as a real file,
 *   5. cancellation and the clipboard fallback,
 *   6. no invented links or placeholder artwork anywhere in the payload.
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

const ORIGIN = "https://cinemax-orpin.vercel.app";

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
  check(payload.text.includes("Dune: Part Two"), "the text names the title", payload.text);
  check(payload.text.includes("2024") && payload.text.includes("Science Fiction"), "the text carries year and genre");
  check(payload.text.includes(payload.url), "the text contains the clickable link");
  check(
    payload.text.includes("https://www.youtube.com/watch?v=8g18jFHCLXk"),
    "the text links the trailer when one exists"
  );
  check(payload.videoUrl === "", "a YouTube trailer is never claimed to be an attached video");

  const withVideo = api.buildSharePayload(
    { ...movie, trailerUrl: "https://cdn.example.com/trailers/dune.mp4" },
    ORIGIN
  );
  check(
    withVideo.videoUrl === "https://cdn.example.com/trailers/dune.mp4",
    "a real video file is offered for attachment",
    withVideo.videoUrl
  );

  check(!/example\.com\/poster/.test(payload.imageUrl), "the payload never falls back to raw artwork as the preview");

  const sparse = api.buildSharePayload({ id: 7, title: "Untitled record" }, ORIGIN);
  check(sparse.text.startsWith("Untitled record — watch it on CINEMAX"), "a sparse record still reads as a sentence");
  check(!sparse.text.includes("()"), "missing year and genre leave no empty brackets");

  const described = api.shareDescription(movie);
  check(described.length <= 220, "the description used for social cards is clipped", `${described.length}`);
  check(described.startsWith("Dune: Part Two"), "the description starts with the title");
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
  check(text?.includes(`${ORIGIN}/share/42`), "the bridge receives the text with the link");
  check(url === `${ORIGIN}/share/42`, "the bridge receives the landing URL", url);
  check(imageUrl === `${ORIGIN}/api/share/card/42`, "the bridge receives the card image", imageUrl);
  check(videoUrl === "", "the bridge receives no video for a YouTube trailer");
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
    canShare: (data) => Array.isArray(data.files) && data.files.length > 0,
    clipboard: async () => {},
    fetchImpl,
  });

  const outcome = await api.shareTitle(movie, ORIGIN);
  check(outcome === "shared", "a supported browser reports success", outcome);
  check(calls.share.length === 1, "navigator.share is called once");
  const data = calls.share[0] ?? {};
  check(data.title === "Dune: Part Two on CINEMAX", "the browser receives the subject");
  check(data.url === `${ORIGIN}/share/42`, "the browser receives the landing URL");
  check(fetched.some((url) => url.endsWith("/api/share/card/42")), "the card image is fetched for attachment");
  check(Array.isArray(data.files) && data.files.length === 1, "the card is attached as a real file", `${data.files?.length}`);
  check(data.files?.[0] instanceof File, "the attachment is a File the share sheet can hand over");
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
console.log(`checks: ${checks}, failures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
