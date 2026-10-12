"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatalogueMovie } from "@/lib/catalogue";
import { useCatalogue } from "./CatalogueProvider";
import Icon from "./Icon";

export type SavedMovie = CatalogueMovie & { watchlistId?: number };
interface WatchlistContext {
  movies: SavedMovie[];
  savedIds: ReadonlySet<number>;
  pendingIds: ReadonlySet<number>;
  loading: boolean;
  error: string;
  toggle: (movieId: number) => Promise<boolean | null>;
  refresh: () => Promise<void>;
}
const Context = createContext<WatchlistContext | null>(null);

async function readWatchlist(signal?: AbortSignal): Promise<SavedMovie[]> {
  const response = await fetch("/api/watchlist", { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Your watchlist could not be loaded.");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("Your watchlist could not be loaded.");
  return data as SavedMovie[];
}

export default function WatchlistProvider({ children }: { children: ReactNode }) {
  const { movies: catalogue } = useCatalogue();
  const [movies, setMovies] = useState<SavedMovie[]>([]);
  const [savedIds, setSavedIds] = useState<ReadonlySet<number>>(new Set());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locks = useRef(new Set<number>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const readVersion = useRef(0);
  const initialRead = useRef<Promise<void> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  const apply = useCallback((list: SavedMovie[]) => {
    setMovies(list);
    setSavedIds(new Set(list.map((movie) => movie.id)));
    setError("");
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    initialRead.current = readWatchlist(controller.signal)
      .then((list) => { if (!controller.signal.aborted) apply(list); })
      .catch(() => { if (!controller.signal.aborted) setError("Your watchlist could not be loaded. Please try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      mounted.current = false;
      controller.abort();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [apply]);

  const notify = useCallback((message: string) => {
    if (!mounted.current) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => { if (mounted.current) setNotice(""); }, 3000);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const version = readVersion.current;
    try {
      await initialRead.current;
      const list = await readWatchlist();
      if (mounted.current && version === readVersion.current) apply(list);
    }
    catch { setError("Your watchlist could not be loaded. Please try again."); }
    finally { if (mounted.current) setLoading(false); }
  }, [apply]);

  const toggle = useCallback(async (movieId: number): Promise<boolean | null> => {
    if (locks.current.has(movieId)) return null;
    locks.current.add(movieId);
    setPendingIds(new Set(locks.current));
    const execute = async (): Promise<boolean | null> => {
    try {
      if (!mounted.current) return null;
      // Finish the first read before mutation so the anonymous session cookie is stable.
      await initialRead.current;
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.added !== "boolean") throw new Error("Could not update watchlist");
      if (!mounted.current) return data.added;
      readVersion.current += 1;
      setSavedIds((previous) => {
        const next = new Set(previous);
        if (data.added) next.add(movieId); else next.delete(movieId);
        return next;
      });
      // Update only after the API confirms the mutation. No invented catalogue records.
      if (!data.added) setMovies((previous) => previous.filter((movie) => movie.id !== movieId));
      else {
        const movie = catalogue.find((item) => item.id === movieId);
        if (movie) setMovies((previous) => previous.some((item) => item.id === movieId) ? previous : [...previous, movie]);
      }
      notify(data.added ? "Added to your watchlist" : "Removed from your watchlist");
      try { const list = await readWatchlist(); if (mounted.current) apply(list); }
      catch { /* The mutation succeeded. Keep confirmed state if its follow-up read fails. */ }
      return data.added;
    } catch {
      notify("Couldn’t update your watchlist. Please try again.");
      return null;
    } finally {
      locks.current.delete(movieId);
      if (mounted.current) setPendingIds(new Set(locks.current));
    }
    };
    // A short queue keeps rapid saves of different titles from overwriting one
    // another with out-of-order follow-up reads. No optimistic removals.
    const result = queue.current.then(execute, execute);
    queue.current = result.then(() => undefined, () => undefined);
    return result;
  }, [apply, catalogue, notify]);

  const value = useMemo(() => ({ movies, savedIds, pendingIds, loading, error, toggle, refresh }), [movies, savedIds, pendingIds, loading, error, toggle, refresh]);
  return <Context.Provider value={value}>{children}<div className={`app-toast ${notice ? "is-visible" : ""}`} role="status" aria-live="polite">{notice && <><Icon name="bookmark" /><span>{notice}</span></>}</div></Context.Provider>;
}

export function useWatchlist() {
  const value = useContext(Context);
  if (!value) throw new Error("useWatchlist must be used within WatchlistProvider");
  return value;
}
