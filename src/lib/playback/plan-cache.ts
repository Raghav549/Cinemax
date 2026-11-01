import type { LinkResolution } from "@/lib/providers/types";

/**
 * One playback-plan request per title, shared by everyone who asks for it.
 *
 * The plan for a catalogue title is fetched from `/api/movies/:id/playback`,
 * which inspects the provider page on the server. Before this module the plan
 * was requested only once the player overlay had already mounted, so the viewer
 * watched a spinner for the whole round trip, and pressing play twice (or
 * opening the same title again) repeated the work.
 *
 * Now the request can start on intent - the pointer touching the play button -
 * and every consumer of the same title shares the same promise. Failures are
 * never cached: a provider hiccup must not disable a title for a minute.
 */

export interface PlaybackPlanBody {
  resolution?: LinkResolution;
  error?: string;
}

/** How long a delivered plan is reused before it is fetched again. */
export const PLAN_TTL_MS = 60 * 1000;

const plans = new Map<string, { at: number; promise: Promise<PlaybackPlanBody> }>();

function requestPlan(movieId: string): Promise<PlaybackPlanBody> {
  return fetch(`/api/movies/${movieId}/playback`, {
    // The route marks successful plans `private, max-age`; honouring the browser
    // cache is free, and in-memory reuse below already covers the common case.
    cache: "default",
    headers: { accept: "application/json" },
  }).then(async (response) => {
    const body = (await response.json().catch(() => null)) as PlaybackPlanBody | null;
    if (!response.ok || !body?.resolution) {
      plans.delete(movieId);
      throw new Error(body?.error || "This title’s playback link could not be checked.");
    }
    return body;
  });
}

/** The shared plan promise for a title; rejects with a viewer-readable message. */
export function playbackPlan(movieId: number | string): Promise<PlaybackPlanBody> {
  const key = String(movieId);
  const cached = plans.get(key);
  if (cached && Date.now() - cached.at < PLAN_TTL_MS) return cached.promise;
  const promise = requestPlan(key);
  // Prefetch callers may never await this; keep the rejection handled while
  // still letting real consumers observe it.
  promise.catch(() => undefined);
  plans.set(key, { at: Date.now(), promise });
  return promise;
}

/** Warm the plan for a title the viewer is about to play. Never throws. */
export function prefetchPlaybackPlan(movieId: number | string): void {
  void playbackPlan(movieId).catch(() => undefined);
}

/** Drop a cached plan (used when a playback attempt fails at the player). */
export function forgetPlaybackPlan(movieId: number | string): void {
  plans.delete(String(movieId));
}
