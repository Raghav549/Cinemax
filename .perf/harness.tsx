/**
 * Render-cost harness — a development measurement tool, never shipped.
 *
 * It mounts the real catalogue/watchlist providers and the real MovieRow and
 * PlatformRail into jsdom, then replays what a phone actually does: an initial
 * load, a scroll gesture, a tab return that revalidates the catalogue with
 * unchanged data, and one with a genuinely edited title.
 *
 * Counters sit in component bodies so they stay accurate in a production build
 * (React's <Profiler> is a no-op there).
 */
import { createElement, Profiler, useMemo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import MovieRow from "../src/components/MovieRow";
import PlatformRail from "../src/components/PlatformRail";
import CatalogueProvider, { useCatalogue } from "../src/components/CatalogueProvider";
import WatchlistProvider, { useWatchlist } from "../src/components/WatchlistProvider";
import type { CatalogueMovie } from "../src/lib/catalogue";

const renders = new Map<string, number>();
const seenIdentities = new Map<string, unknown>();

function count(label: string) {
  renders.set(label, (renders.get(label) ?? 0) + 1);
}

function trackIdentity(label: string, value: unknown) {
  const previous = seenIdentities.get(label);
  seenIdentities.set(label, value);
  return previous === value;
}

function Counted({ label, children }: { label: string; children?: ReactNode }) {
  count(label);
  return createElement("div", { "data-counted": label }, children as never);
}

/** Stands in for the Home screen: it consumes the catalogue and feeds the rails. */
function HomeLike() {
  count("home");
  const { movies: catalogue } = useCatalogue();
  const trending = useMemo(() => catalogue.filter((movie) => movie.platforms?.includes("netflix")), [catalogue]);
  const stableArray = trackIdentity("trendingArray", trending);
  return createElement(
    "div",
    null,
    createElement(MovieRow, { title: "Trending", category: "trending", movies: trending }),
    createElement(Counted, { label: "platformRail" },
      createElement(PlatformRail, { active: null, counts: { netflix: 12, tubi: 3 }, onSelect: () => {} }))
  );
}

/** One watchlist consumer, i.e. every save button on the page. */
function WatchProbe() {
  count("watchlistConsumer");
  const { savedIds } = useWatchlist();
  return createElement("span", { "data-probe": String(savedIds.size) });
}

/** Commit durations. <Profiler> only reports under a development build, which is
 * why run.mjs also has a --dev mode; in production only the counters are read. */
const commits: { step: string; phase: string; ms: number; rendered: Record<string, number> }[] = [];
let step = "initial load";

function App() {
  return createElement(
    CatalogueProvider,
    null,
    createElement(WatchlistProvider, null,
      createElement(WatchProbe),
      createElement(Profiler, {
        id: "home",
        onRender: (_id: string, phase: string, actualDuration: number) => {
          commits.push({ step, phase, ms: Number(actualDuration.toFixed(2)), rendered: Object.fromEntries(renders) });
        },
      }, createElement(HomeLike)))
  );
}

declare global {
  interface Window { __perf: unknown; __provided: number; }
}

/** Waits for the network stub to land, then returns the cost of flushing the
 * resulting React work (i.e. the render the user actually pays for). */
async function settle(ms = 60) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  const applyStart = performance.now();
  flushSync(() => {});
  return performance.now() - applyStart;
}

async function run() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  const mountStart = performance.now();
  flushSync(() => root.render(createElement(App)));
  const mountMs = performance.now() - mountStart;
  await settle();

  const afterMount = Object.fromEntries(renders);
  const cardsAfterMount = host.querySelectorAll(".movie-card").length;

  // 60 scroll events, dispatched the way a gesture does.
  const track = host.querySelector(".movie-track") as HTMLElement | null;
  const scrollStart = performance.now();
  if (track) for (let i = 0; i < 60; i += 1) track.dispatchEvent(new Event("scroll"));
  const scrollMs = performance.now() - scrollStart;

  // A tab return revalidates with the same library: nothing should re-render.
  step = "refetch, unchanged library";
  window.dispatchEvent(new Event("cinemax:catalogue-refresh"));
  const noopMs = await settle();
  const afterNoopRefetch = Object.fromEntries(renders);

  // The admin edits one title: the row must pick it up.
  step = "refetch, one title edited";
  window.__provided = 1;
  window.dispatchEvent(new Event("cinemax:catalogue-refresh"));
  const editedMs = await settle();
  const afterEditedRefetch = Object.fromEntries(renders);
  const editedTitleShown = [...host.querySelectorAll(".movie-card")].some((card) => card.textContent?.includes("Edited title"));

  window.__perf = {
    mountMs: Number(mountMs.toFixed(2)),
    scrollMs: Number(scrollMs.toFixed(2)),
    noopRefetchMs: Number(noopMs.toFixed(2)),
    editedRefetchMs: Number(editedMs.toFixed(2)),
    renders: { afterMount, afterNoopRefetch, afterEditedRefetch },
    rerendersOnNoopRefetch: {
      home: (afterNoopRefetch.home ?? 0) - (afterMount.home ?? 0),
      watchlistConsumer: (afterNoopRefetch.watchlistConsumer ?? 0) - (afterMount.watchlistConsumer ?? 0),
      platformRail: (afterNoopRefetch.platformRail ?? 0) - (afterMount.platformRail ?? 0),
    },
    editedTitleShown,
    commitDurations: commits,
    identicalTrendingArrayAfterNoop: trackIdentity("trendingArray", seenIdentities.get("trendingArray")),
    dom: {
      cards: cardsAfterMount,
      saveButtons: host.querySelectorAll(".movie-save").length,
      platformDiscs: host.querySelectorAll(".platform-orbit-disc").length,
      images: host.querySelectorAll("img").length,
      lazy: host.querySelectorAll('img[loading="lazy"]').length,
      eager: host.querySelectorAll('img[loading="eager"]').length,
      withDimensions: [...host.querySelectorAll("img")].filter((image) => image.getAttribute("width") && image.getAttribute("height")).length,
      decodingAsync: [...host.querySelectorAll("img")].filter((image) => image.getAttribute("decoding") === "async").length,
    },
  };
}

void run().catch((error: unknown) => {
  window.__perf = { error: error instanceof Error ? `${error.message}\n${error.stack}` : String(error) };
});
