"use client";

import { useEffect, useMemo, useState } from "react";
import { useWatchlist } from "@/components/WatchlistProvider";
import MovieCard from "@/components/MovieCard";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import { PosterGridSkeleton } from "@/components/Skeletons";
import CinematicButton, { CinematicLink } from "@/components/CinematicButton";
import { matchesCollection } from "@/lib/catalogue";

export default function WatchlistPage() {
  const { movies, loading, error, refresh } = useWatchlist();
  useEffect(() => {
    // Reconcile changes made in the studio or another tab on each list visit.
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const titles = useMemo(() => {
    const selected = movies.filter((movie) => matchesCollection(movie, filter));
    if (sort === "title") selected.sort((a, b) => a.title.localeCompare(b.title));
    else selected.reverse();
    return selected;
  }, [movies, filter, sort]);
  return <main className="secondary-page watchlist-page" id="main-content" tabIndex={-1}><div className="secondary-page-content">
    <div className="page-heading"><h1>Watchlist</h1>{!loading && !error && <span className="page-count">{movies.length} saved {movies.length === 1 ? "title" : "titles"}</span>}</div>
    {loading ? <PosterGridSkeleton /> : error ? <EmptyState title="Watchlist unavailable" description={error} icon="bookmark"><CinematicButton onClick={() => void refresh()} icon={<Icon name="refresh" />}>Try again</CinematicButton></EmptyState> : !movies.length ? <EmptyState variant="watchlist" title="A little space for your favourites" description="Save a title with the + button. Find it here whenever you’re ready." icon="bookmark"><CinematicLink href="/categories" icon={<Icon name="explore" />}>Explore titles</CinematicLink></EmptyState> : <>
      <div className="collection-toolbar"><div className="filter-chips hide-scrollbar" role="group" aria-label="Filter saved titles">{[{ value: "all", label: "All titles" }, { value: "movies", label: "Movies" }, { value: "series", label: "Series" }, { value: "anime", label: "Anime" }].map((item) => <button className="filter-chip" type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div><label className="sort-field"><Icon name="sort" /><span className="sr-only">Sort watchlist</span><select aria-label="Sort watchlist" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Recently saved</option><option value="title">A–Z</option></select></label></div>
      {titles.length ? <div className="content-poster-grid" role="list" aria-label="Saved titles">{titles.map((movie) => <MovieCard key={movie.id} movie={movie} />)}</div> : <EmptyState title="No saved titles in this collection" description="Your other saved titles are still in All titles." icon="bookmark" />}
    </>}
  </div></main>;
}
