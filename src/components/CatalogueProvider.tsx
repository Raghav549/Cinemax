"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CatalogueMovie, Category, FeaturedSlide } from "@/lib/catalogue";

export const CATALOGUE_REFRESH_EVENT = "cinemax:catalogue-refresh";
interface Catalogue {
  movies: CatalogueMovie[];
  categories: Category[];
  slides: FeaturedSlide[];
  loading: boolean;
  error: string;
}
interface CachedCatalogue {
  savedAt: number;
  movies: CatalogueMovie[];
  categories: Category[];
  slides: FeaturedSlide[];
}

const CACHE_KEY = "cinemax:catalogue:v1";
const CACHE_TTL = 60_000;
const initial: Catalogue = { movies: [], categories: [], slides: [], loading: true, error: "" };
const Context = createContext<Catalogue & { refresh: () => void } | null>(null);
let memoryCache: CachedCatalogue | null = null;

async function readList<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("The library is temporarily unavailable. Please try again.");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("The library could not be loaded. Please try again.");
  return data as T[];
}

function validCache(value: unknown): CachedCatalogue | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CachedCatalogue>;
  if (typeof candidate.savedAt !== "number" || Date.now() - candidate.savedAt > CACHE_TTL) return null;
  if (!Array.isArray(candidate.movies) || !Array.isArray(candidate.categories) || !Array.isArray(candidate.slides)) return null;
  return candidate as CachedCatalogue;
}

function readCache(): CachedCatalogue | null {
  if (memoryCache && Date.now() - memoryCache.savedAt <= CACHE_TTL) return memoryCache;
  try {
    const cached = validCache(JSON.parse(window.sessionStorage.getItem(CACHE_KEY) ?? "null"));
    if (cached) memoryCache = cached;
    return cached;
  } catch {
    return null;
  }
}

function writeCache(value: CachedCatalogue) {
  memoryCache = value;
  try { window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch { /* Storage is an optional fast path. */ }
}

export default function CatalogueProvider({ children }: { children: ReactNode }) {
  const [catalogue, setCatalogue] = useState<Catalogue>(initial);
  useEffect(() => {
    let controller: AbortController | undefined;
    const load = async (force = false) => {
      controller?.abort();
      if (!force) {
        const cached = readCache();
        if (cached) {
          setCatalogue({ ...cached, loading: false, error: "" });
          return;
        }
      }
      controller = new AbortController();
      const signal = controller.signal;
      const [movies, categories, slides] = await Promise.allSettled([
        readList<CatalogueMovie>("/api/movies?limit=500", signal),
        readList<Category>("/api/categories", signal),
        readList<FeaturedSlide>("/api/slides", signal),
      ]);
      if (signal.aborted) return;
      const next = {
        movies: movies.status === "fulfilled" ? movies.value : [],
        categories: categories.status === "fulfilled" ? categories.value : [],
        slides: slides.status === "fulfilled" ? slides.value : [],
      };
      if (movies.status === "fulfilled") writeCache({ savedAt: Date.now(), ...next });
      setCatalogue({
        ...next,
        loading: false,
        error: movies.status === "rejected" ? "The library is temporarily unavailable. Please try again." : "",
      });
    };
    const refreshFromEvent = () => { void load(true); };
    void load();
    window.addEventListener(CATALOGUE_REFRESH_EVENT, refreshFromEvent);
    return () => {
      controller?.abort();
      window.removeEventListener(CATALOGUE_REFRESH_EVENT, refreshFromEvent);
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
