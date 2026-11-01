"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatalogueMovie, Category, FeaturedSlide } from "@/lib/catalogue";

export const CATALOGUE_REFRESH_EVENT = "cinemax:catalogue-refresh";
/** Legacy key written by earlier builds. It is only ever removed, never read. */
const LEGACY_CACHE_KEY = "cinemax:catalogue:v1";
/** How old the in-memory catalogue may be before a focus/visibility return revalidates it. */
const REVALIDATE_AFTER_MS = 30_000;

interface Catalogue {
  movies: CatalogueMovie[];
  categories: Category[];
  slides: FeaturedSlide[];
  loading: boolean;
  error: string;
}

const initial: Catalogue = { movies: [], categories: [], slides: [], loading: true, error: "" };
const Context = createContext<Catalogue & { refresh: () => void } | null>(null);

/**
 * Reuses the previous objects for records the API returned unchanged, and the
 * previous array when *everything* is unchanged.
 *
 * A revalidation (tab focus after 30s) gets freshly decoded objects from
 * `fetch`, so without this every poster card on the page would be reconciled
 * even though nothing about the library changed. Identity is what lets the
 * memoised rows and cards skip that work, so it must be preserved exactly when
 * the data is the same.
 */
function reconcile<T>(previous: T[], next: T[]): T[] {
  if (previous === next) return previous;
  if (previous.length !== next.length) return next;
  let identical = true;
  const merged = next.map((item, index) => {
    const current = previous[index];
    if (current === item) return current;
    if (JSON.stringify(current) === JSON.stringify(item)) return current;
    identical = false;
    return item;
  });
  return identical ? previous : merged;
}

async function readList<T>(url: string, signal: AbortSignal): Promise<T[]> {
  // `no-store`: the admin panel is the source of truth, so a browser/HTTP cache
  // must never resurrect a movie or slide the admin has deleted.
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("The library is temporarily unavailable. Please try again.");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("The library could not be loaded. Please try again.");
  return data as T[];
}

export default function CatalogueProvider({ children }: { children: ReactNode }) {
  const [catalogue, setCatalogue] = useState<Catalogue>(initial);
  const lastLoadedAt = useRef(0);

  useEffect(() => {
    // Earlier builds persisted the whole catalogue to sessionStorage, which is
    // exactly how a deleted title survived a page refresh. That copy is
    // dropped on sight; the catalogue now lives only in memory for this mount
    // and every full load goes back to the database-backed API.
    try { window.sessionStorage.removeItem(LEGACY_CACHE_KEY); } catch { /* Private browsing. */ }

    let controller: AbortController | undefined;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const [movies, categories, slides] = await Promise.allSettled([
        readList<CatalogueMovie>("/api/movies?limit=500", signal),
        readList<Category>("/api/categories", signal),
        readList<FeaturedSlide>("/api/slides", signal),
      ]);
      if (signal.aborted) return;
      lastLoadedAt.current = Date.now();
      const error = movies.status === "rejected" ? "The library is temporarily unavailable. Please try again." : "";
      setCatalogue((previous) => {
        const nextMovies = reconcile(previous.movies, movies.status === "fulfilled" ? movies.value : []);
        const nextCategories = reconcile(previous.categories, categories.status === "fulfilled" ? categories.value : []);
        const nextSlides = reconcile(previous.slides, slides.status === "fulfilled" ? slides.value : []);
        // Nothing changed: keep the previous state object so the context value
        // keeps its identity and no consumer re-renders for it.
        if (nextMovies === previous.movies && nextCategories === previous.categories
          && nextSlides === previous.slides && !previous.loading && previous.error === error) {
          return previous;
        }
        return { movies: nextMovies, categories: nextCategories, slides: nextSlides, loading: false, error };
      });
    };
    const refreshFromEvent = () => { void load(); };
    // Returning to the app/tab after a while revalidates against the database,
    // so admin edits and deletions made elsewhere show up without a hard reload.
    const revalidateIfStale = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastLoadedAt.current > REVALIDATE_AFTER_MS) void load();
    };
    void load();
    window.addEventListener(CATALOGUE_REFRESH_EVENT, refreshFromEvent);
    window.addEventListener("focus", revalidateIfStale);
    document.addEventListener("visibilitychange", revalidateIfStale);
    return () => {
      controller?.abort();
      window.removeEventListener(CATALOGUE_REFRESH_EVENT, refreshFromEvent);
      window.removeEventListener("focus", revalidateIfStale);
      document.removeEventListener("visibilitychange", revalidateIfStale);
    };
  }, []);

  const refresh = useCallback(() => {
    setCatalogue((previous) => ({ ...previous, loading: true, error: "" }));
    window.dispatchEvent(new Event(CATALOGUE_REFRESH_EVENT));
  }, []);
  const value = useMemo(() => ({ ...catalogue, refresh }), [catalogue, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCatalogue() {
  const catalogue = useContext(Context);
  if (!catalogue) throw new Error("useCatalogue must be used within CatalogueProvider");
  return catalogue;
}
