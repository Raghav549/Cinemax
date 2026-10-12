"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import MovieRow from "./MovieRow";
import type { MovieCardData } from "./MovieCard";

interface ResumeEntry { currentTime?: number; duration?: number; }
const RESUME_EVENT = "cinemax:resume-change";
const SERVER_SNAPSHOT = "";

function subscribeToResume(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(RESUME_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(RESUME_EVENT, callback);
  };
}

export default function ContinueWatchingRow({ movies }: { movies: MovieCardData[] }) {
  const getSnapshot = useCallback(() => {
    try {
      return movies.map((movie) => `${movie.id}:${window.localStorage.getItem(`cinemax:playback:${movie.id}`) ?? ""}`).join("\n");
    } catch {
      return "";
    }
  }, [movies]);
  const snapshot = useSyncExternalStore(subscribeToResume, getSnapshot, () => SERVER_SNAPSHOT);
  const progressByMovie = useMemo(() => {
    const progress: Record<number, number> = {};
    for (const line of snapshot.split("\n")) {
      const splitAt = line.indexOf(":");
      if (splitAt < 0) continue;
      const id = Number(line.slice(0, splitAt));
      const raw = line.slice(splitAt + 1);
      if (!Number.isInteger(id) || id <= 0 || !raw) continue;
      try {
        const saved = JSON.parse(raw) as ResumeEntry;
        if (typeof saved.currentTime !== "number" || typeof saved.duration !== "number" || saved.duration <= 0) continue;
        if (saved.currentTime < 30 || saved.duration - saved.currentTime < 20) continue;
        progress[id] = Math.min(99, Math.round((saved.currentTime / saved.duration) * 100));
      } catch {
        // A malformed or unavailable localStorage entry should not affect the library.
      }
    }
    return progress;
  }, [snapshot]);

  const resumable = movies.filter((movie) => progressByMovie[movie.id] !== undefined);
  if (resumable.length === 0) return null;

  return (
    <MovieRow
      title="Pick up where you left off"
      category="continue"
      movies={resumable}
      progressByMovie={progressByMovie}
      kicker="Continue watching"
    />
  );
}
