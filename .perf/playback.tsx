/**
 * Measurement harness: how long after "play" does the player element exist?
 *
 * The user-visible symptom is the wait between tapping play and the provider's
 * player starting to load. This harness renders the real `PlaybackOverlay` in
 * jsdom, stubs the playback-plan API with a fixed latency, and records when the
 * iframe (embed) or video element actually appears in the document — the moment
 * the browser would begin its own request to the provider.
 *
 * It is measurement, not a test: `node .perf/playback-run.mjs` prints the number.
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import PlaybackOverlay from "@/components/PlaybackOverlay";
import { prefetchPlaybackPlan } from "@/lib/playback/plan-cache";

const API_LATENCY_MS = Number(process.env.CINEMAX_MEASURE_API_LATENCY_MS ?? 900);
/** "warm" models a viewer who touched the play button before pressing it. */
const MODE = process.env.CINEMAX_MEASURE_MODE ?? "cold";
const INTENT_LEAD_MS = Number(process.env.CINEMAX_MEASURE_INTENT_LEAD_MS ?? 600);

/** A catalogue source the registry cannot identify: it needs the server plan. */
const WATCH_PAGE = "https://provider.example/watch/42";

const movie = {
  id: 42,
  title: "Measurement title",
  posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
  backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
  videoUrl: WATCH_PAGE,
};

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

const started = now();
let playerAt: number | null = null;
let serverPlanAt: number | null = null;
let planRequests = 0;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("/playback")) {
    planRequests += 1;
    // A provider page: the server inspects it and answers with the embed plan.
    await new Promise((resolve) => setTimeout(resolve, API_LATENCY_MS));
    serverPlanAt = now() - started;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        resolution: {
          ok: true,
          provider: { id: "web-page", name: "provider.example", tagline: "", accent: "#fff", requirements: { login: false, subscription: false, drm: false } },
          kind: "page",
          contentId: null,
          canonicalUrl: WATCH_PAGE,
          originalUrl: WATCH_PAGE,
          playback: { strategy: "embed", src: "https://player.example/embed/42", embedTitle: "provider.example player" },
          metadataSource: { source: "url" },
        },
      }),
    } as unknown as Response;
  }
  return realFetch ? realFetch(input as RequestInfo, init) : ({ ok: false, json: async () => ({}) } as unknown as Response);
}) as typeof fetch;

if (MODE === "warm") {
  // The movie page warms the plan on pointer/touch intent, this long before the
  // press would land.
  prefetchPlaybackPlan(movie.id);
  await new Promise((resolve) => setTimeout(resolve, INTENT_LEAD_MS));
}

const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);
const mountAt = now() - started;
root.render(
  createElement(PlaybackOverlay, {
    movie,
    onClose: () => undefined,
    openImmersive: false,
  }),
);

// Poll for the player element. jsdom never loads the frame, so the appearance of
// the element is exactly the point where a real browser would start loading it.
for (let waited = 0; waited < 8000; waited += 10) {
  await new Promise((resolve) => setTimeout(resolve, 10));
  const frame = document.querySelector("iframe.embedded-video, video");
  if (frame) {
    playerAt = now() - started;
    break;
  }
}

const element = document.querySelector("iframe.embedded-video, video");
const result = {
  mode: MODE,
  apiLatencyMs: API_LATENCY_MS,
  intentLeadMs: MODE === "warm" ? INTENT_LEAD_MS : 0,
  playerElementAtMs: playerAt === null ? null : Math.round(playerAt),
  afterPressMs: playerAt === null ? null : Math.round(playerAt - mountAt),
  serverPlanAtMs: serverPlanAt === null ? null : Math.round(serverPlanAt),
  planRequests,
  errorShown: document.querySelector(".player-error-title")?.textContent ?? null,
  element: element ? element.tagName.toLowerCase() + (element.className ? `.${String(element.className).split(" ")[0]}` : "") : null,
  source: element?.getAttribute("src") ?? null,
};

globalThis.__playbackMeasurement = result;
root.unmount();
