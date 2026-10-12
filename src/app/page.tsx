"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import HeroSlider from "@/components/HeroSlider";
import BottomNav from "@/components/BottomNav";
import AutoSeed from "@/components/AutoSeed";
import MovieCard, { type MovieCardData } from "@/components/MovieCard";
import MovieRow from "@/components/MovieRow";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";

interface Movie extends MovieCardData {
  category: string | null;
  featured: boolean | null;
}
interface Category { id: number; name: string; slug: string; }

const FILTER_CHIPS = [
  { label: "For you", value: "all" },
  { label: "Movies", value: "movies" },
  { label: "Series", value: "series" },
  { label: "Anime", value: "anime" },
  { label: "Action", value: "action" },
  { label: "Drama", value: "drama" },
  { label: "Sci-fi", value: "sci-fi" },
  { label: "Thriller", value: "thriller" },
  { label: "Comedy", value: "comedy" },
  { label: "Documentary", value: "documentary" },
];

function CategoryIcon({ category }: { category: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, ReactNode> = {
    trending: <><path d="M4 16.5 9 11l3.5 3.5L20 6.8" /><path d="M14.5 6.8H20v5.5" /></>,
    "new-releases": <><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></>,
    movies: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M8 4v16M16 4v16M3 9h5M16 9h5M3 15h5M16 15h5" /></>,
    series: <><rect x="4" y="7" width="16" height="14" rx="2" /><path d="m8 3 4 4 4-4M10 12l5 2-5 2v-4Z" /></>,
    anime: <><circle cx="12" cy="12" r="9" /><path d="M8 14.5s1.3 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>,
    action: <><path d="M13 2 4 13h7l-1 9 10-12h-7l1-8Z" /></>,
    drama: <><path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6" /></>,
    "sci-fi": <><circle cx="12" cy="12" r="3" /><path d="M3 12c2-5.5 16-5.5 18 0-2 5.5-16 5.5-18 0ZM12 3c5.5 2 5.5 16 0 18-5.5-2-5.5-16 0-18Z" /></>,
    thriller: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M12 8v4m0 4h.01" /></>,
    comedy: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.4 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>,
    horror: <><path d="M12 3a8 8 0 0 0-8 8v9l4-2 4 2 4-2 4 2v-9a8 8 0 0 0-8-8Z" /><path d="M9 10h.01M15 10h.01M9 15h6" /></>,
    documentary: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  };
  return <svg viewBox="0 0 24 24" {...common} aria-hidden="true">{paths[category] ?? <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m10 9 5 3-5 3V9Z" /></>}</svg>;
}

function categoryTokens(value: string | null | undefined): string[] {
  return (value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function ShimmerRows() {
  return <>
    {[1, 2, 3].map((row) => (
      <div className="shimmer-row" key={row} aria-hidden="true">
        <div className="shimmer shimmer-row-title" />
        <div className="shimmer-row-posters">
          {[1, 2, 3, 4, 5].map((poster) => <div className="shimmer shimmer-poster" key={poster} />)}
        </div>
      </div>
    ))}
  </>;
}

function EmptyLibrary({ connected }: { connected: boolean }) {
  return (
    <div className="content-empty">
      <div>
        <span className="empty-orb" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="3" /><path d="m10 9 5 3-5 3V9Z" />
          </svg>
        </span>
        <h2 className="empty-title">{connected ? "Your screen is ready for a story" : "Let’s connect your library"}</h2>
        <p className="empty-copy">{connected ? "There are no titles here just yet. Add a collection in the Cinemax studio and your next favourite will be waiting." : "The catalogue could not be reached. Check the database connection, then refresh to bring your library into focus."}</p>
        {connected ? (
          <Link className="hero-button" href="/gate-keeper" style={{ minHeight: 39, marginTop: 17 }}>Open the Cinemax studio</Link>
        ) : (
          <button className="hero-button" type="button" onClick={() => window.location.reload()} style={{ minHeight: 39, marginTop: 17, cursor: "pointer" }}>Try again</button>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allMovies, setAllMovies] = useState<Movie[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryConnected, setLibraryConnected] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const [categoryResult, movieResult] = await Promise.allSettled([
        fetch("/api/categories", { signal: controller.signal }),
        fetch("/api/movies?limit=300", { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;

      let connected = true;
      if (categoryResult.status === "fulfilled" && categoryResult.value.ok) {
        const data = await categoryResult.value.json().catch(() => null);
        if (Array.isArray(data)) setCategories(data);
        else connected = false;
      } else connected = false;

      if (movieResult.status === "fulfilled" && movieResult.value.ok) {
        const data = await movieResult.value.json().catch(() => null);
        if (Array.isArray(data)) setAllMovies(data);
        else connected = false;
      } else connected = false;

      setLibraryConnected(connected);
      setLibraryLoading(false);
    };
    void load();
    return () => controller.abort();
  }, []);

  const filters = useMemo(() => {
    const known = new Set(FILTER_CHIPS.map((item) => item.value));
    const dynamic = categories
      .filter((category) => !known.has(category.slug.toLowerCase()))
      .map((category) => ({ label: category.name, value: category.slug.toLowerCase() }));
    return [...FILTER_CHIPS, ...dynamic];
  }, [categories]);

  const filteredMovies = useMemo(() => {
    if (activeFilter === "all") return [];
    return allMovies.filter((movie) => {
      const categoryMatches = categoryTokens(movie.category).includes(activeFilter);
      const type = (movie.type ?? "").toLowerCase();
      const genreMatches = categoryTokens(movie.genre).includes(activeFilter);
      if (activeFilter === "movies") return categoryMatches || type === "movie";
      if (activeFilter === "series") return categoryMatches || type === "series";
      if (activeFilter === "anime") return categoryMatches || type === "anime";
      return categoryMatches || genreMatches;
    });
  }, [activeFilter, allMovies]);

  const categoryRows = useMemo(() => {
    if (categories.length > 0) return categories;
    const slugs = [...new Set(allMovies.flatMap((movie) => categoryTokens(movie.category)))];
    return slugs.map((slug, index) => ({ id: index + 1, slug, name: slug.replace(/(^|-)[a-z]/g, (chunk) => chunk.toUpperCase()) }));
  }, [allMovies, categories]);

  const moviesByCategory = useMemo(() => {
    const grouped: Record<string, Movie[]> = {};
    for (const category of categoryRows) {
      const slug = category.slug.toLowerCase();
      grouped[slug] = allMovies.filter((movie) => {
        const tokens = categoryTokens(movie.category);
        const type = (movie.type ?? "").toLowerCase();
        if (slug === "movies") return tokens.includes(slug) || type === "movie";
        if (slug === "series" || slug === "anime") return tokens.includes(slug) || type === slug;
        return tokens.includes(slug);
      });
    }
    return grouped;
  }, [allMovies, categoryRows]);

  const isFiltered = activeFilter !== "all";
  const categoryIsLoading = libraryLoading && allMovies.length === 0;

  return (
    <main className="home-shell">
      <AutoSeed />
      <Header />
      <div className="home-content">
        <div className="home-intro">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> Your front row starts here</div>
            <p className="home-heading">Big stories. <span>Beautifully at home.</span></p>
          </div>
          <Link className="home-intro-link" href="/categories">
            All collections
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
          </Link>
        </div>

        <div className="hero-shell"><HeroSlider /></div>

        <section className="browse-section" aria-label="Browse by mood or format">
          <div className="browse-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> Made for your mood</div>
              <h2 className="browse-title">What are you in the mood for?</h2>
              <p className="browse-subtitle">A world of stories, curated around you.</p>
            </div>
          </div>
          <div className="filter-chips hide-scrollbar" role="group" aria-label="Filter the catalogue">
            {filters.map((chip) => (
              <button
                key={chip.value}
                className="filter-chip"
                type="button"
                aria-pressed={activeFilter === chip.value}
                onClick={() => setActiveFilter(chip.value)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </section>

        {isFiltered ? (
          <section className="filtered-results" aria-live="polite">
            <p className="filtered-summary">{filteredMovies.length} {filteredMovies.length === 1 ? "title" : "titles"} · {filters.find((item) => item.value === activeFilter)?.label}</p>
            {categoryIsLoading ? <ShimmerRows /> : filteredMovies.length > 0 ? (
              <div className="movie-grid">
                {filteredMovies.map((movie) => <MovieCard key={movie.id} movie={movie} />)}
              </div>
            ) : (
              <div className="content-empty"><div>
                <span className="empty-orb" aria-hidden="true"><CategoryIcon category={activeFilter} /></span>
                <h2 className="empty-title">Nothing in this collection yet</h2>
                <p className="empty-copy">Try another mood. We’ll keep a seat open for this one.</p>
              </div></div>
            )}
          </section>
        ) : (
          <>
            {allMovies.length > 0 && <ContinueWatchingRow movies={allMovies} />}
            {categoryIsLoading ? <ShimmerRows /> : allMovies.length === 0 ? (
              <EmptyLibrary connected={libraryConnected} />
            ) : categoryRows.length > 0 ? (
              categoryRows.map((category) => (
                <MovieRow
                  key={category.id}
                  title={category.name}
                  category={category.slug}
                  movies={moviesByCategory[category.slug.toLowerCase()] ?? []}
                  icon={<CategoryIcon category={category.slug.toLowerCase()} />}
                  kicker={category.slug === "trending" ? "Popular right now" : category.slug === "new-releases" ? "Fresh from the premiere" : "Curated for you"}
                />
              ))
            ) : (
              <EmptyLibrary connected={libraryConnected} />
            )}
          </>
        )}

        <footer className="home-footer">
          <span className="home-footer-brand">CINEMAX · A WORLD BEYOND PLAY</span>
          <span>Stories look better together.</span>
        </footer>
      </div>
      <BottomNav />
    </main>
  );
}
