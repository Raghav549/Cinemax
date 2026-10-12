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
const initial: Catalogue = { movies: [], categories: [], slides: [], loading: true, error: "" };
const Context = createContext<Catalogue & { refresh: () => void } | null>(null);

async function readList<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("The library is temporarily unavailable. Please try again.");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("The library could not be loaded. Please try again.");
  return data as T[];
}

export default function CatalogueProvider({ children }: { children: ReactNode }) {
  const [catalogue, setCatalogue] = useState<Catalogue>(initial);
  useEffect(() => {
    let controller: AbortController;
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
      setCatalogue({
        movies: movies.status === "fulfilled" ? movies.value : [],
        categories: categories.status === "fulfilled" ? categories.value : [],
        slides: slides.status === "fulfilled" ? slides.value : [],
        loading: false,
        error: movies.status === "rejected" ? "The library is temporarily unavailable. Please try again." : "",
      });
    };
    void load();
    window.addEventListener(CATALOGUE_REFRESH_EVENT, load);
    return () => {
      controller?.abort();
      window.removeEventListener(CATALOGUE_REFRESH_EVENT, load);
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
