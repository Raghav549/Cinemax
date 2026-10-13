"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCatalogue } from "@/components/CatalogueProvider";
import MovieCard from "@/components/MovieCard";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import { PosterGridSkeleton } from "@/components/Skeletons";
import CinematicButton from "@/components/CinematicButton";
import { matchesCollection, type CatalogueMovie } from "@/lib/catalogue";
import { useRouter } from "next/navigation";
import ShareLinkForm from "@/components/ShareLinkForm";

const FILTERS = [{ label: "All titles", value: "all" }, { label: "Movies", value: "movies" }, { label: "Series", value: "series" }, { label: "Anime", value: "anime" }, { label: "Action", value: "action" }, { label: "Sci-Fi", value: "sci-fi" }, { label: "Comedy", value: "comedy" }, { label: "Drama", value: "drama" }, { label: "Thriller", value: "thriller" }, { label: "Horror", value: "horror" }];

export default function SearchPage() {
  const router = useRouter();
  const { movies: catalogue, loading: catalogueLoading, error: catalogueError, refresh } = useCatalogue();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{ key: string; movies: CatalogueMovie[]; error: string }>({ key: "", movies: [], error: "" });
  const input = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetch(`/api/movies?search=${encodeURIComponent(trimmed)}&limit=500`, { signal: controller.signal });
        if (!result.ok) throw new Error("Search unavailable");
        const data: unknown = await result.json();
        if (!Array.isArray(data)) throw new Error("Search unavailable");
        if (!controller.signal.aborted) setResponse({ key: `${trimmed}:${retry}`, movies: data as CatalogueMovie[], error: "" });
      } catch {
        if (!controller.signal.aborted) setResponse({ key: `${trimmed}:${retry}`, movies: [], error: "Search is temporarily unavailable. Please try again." });
      }
    }, 240);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [trimmed, retry]);

  const requestKey = `${trimmed}:${retry}`;
  const loading = trimmed ? response.key !== requestKey : catalogueLoading;
  const error = trimmed ? (response.key === requestKey ? response.error : "") : catalogueError;
  const movies = useMemo(() => {
    const source = trimmed ? (response.key === requestKey ? response.movies : []) : catalogue;
    return source.filter((movie) => matchesCollection(movie, filter));
  }, [catalogue, trimmed, response, requestKey, filter]);

  return <main className="secondary-page search-page" id="main-content" tabIndex={-1}>
    <div className="secondary-page-content">
      <div className="page-heading"><h1>Search</h1></div>
      <section className="watch-link-strip" aria-label="Play a share link">
        <ShareLinkForm
          id="search-share-link"
          onSubmit={(url) => router.push(`/watch?url=${encodeURIComponent(url)}`)}
          label="Movie or share link"
          placeholder="Paste a movie or share link to watch"
          submitLabel="Watch"
        />
      </section>
      <div className="search-field"><Icon name="search" /><label className="sr-only" htmlFor="catalogue-search">Search the catalogue</label><input id="catalogue-search" type="search" autoFocus ref={input} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} placeholder="Movies, series, people…" maxLength={160} autoComplete="off" spellCheck={false} />{query && <button className="icon-button search-clear" type="button" aria-label="Clear search" onClick={() => { setQuery(""); input.current?.focus(); }}><Icon name="close" /></button>}</div>
      <div className="filter-chips hide-scrollbar search-filters" role="group" aria-label="Filter search results">{FILTERS.map((item) => <button key={item.value} className="filter-chip" type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>
      <div className="section-heading"><h2>{trimmed ? "Search results" : filter === "all" ? "Discover something new" : FILTERS.find((item) => item.value === filter)?.label}</h2><span className="result-count" role="status">{!loading && !error ? `${movies.length} ${movies.length === 1 ? "title" : "titles"}` : loading ? "Searching…" : ""}</span></div>
      {loading ? <PosterGridSkeleton /> : error ? <EmptyState title="Search unavailable" description={error} icon="search"><CinematicButton onClick={() => { if (trimmed) setRetry((count) => count + 1); else refresh(); }} icon={<Icon name="refresh" />}>Try again</CinematicButton></EmptyState> : movies.length ? <div className="content-poster-grid" role="list" aria-label="Search results">{movies.map((movie) => <MovieCard movie={movie} key={movie.id} />)}</div> : <EmptyState title={trimmed ? `No matches for “${trimmed}”` : "No titles in this collection"} description="Try a different title or filter." icon="search"><CinematicButton variant="secondary" onClick={() => { setQuery(""); setFilter("all"); input.current?.focus(); }}>Clear filters</CinematicButton></EmptyState>}
    </div>
  </main>;
}
