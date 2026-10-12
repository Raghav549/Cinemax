"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import HeroSlider from "@/components/HeroSlider";
import AutoSeed from "@/components/AutoSeed";
import MovieCard from "@/components/MovieCard";
import MovieRow from "@/components/MovieRow";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import { useCatalogue } from "@/components/CatalogueProvider";
import { FILTERS, matchesCollection, tokens, type CatalogueMovie } from "@/lib/catalogue";
import { RowSkeletons } from "@/components/Skeletons";
import EmptyState from "@/components/EmptyState";
import Icon, { collectionIcon } from "@/components/Icon";
import Logo from "@/components/Logo";

function buildCollectionIndex(movies: CatalogueMovie[]) {
  const index = new Map<string, CatalogueMovie[]>();
  const add = (key: string, movie: CatalogueMovie) => {
    const list = index.get(key);
    if (list) list.push(movie);
    else index.set(key, [movie]);
  };
  for (const movie of movies) {
    // This mirrors matchesCollection for collection rows, but performs the
    // token work once instead of filtering the whole catalogue for every rail.
    const keys = new Set([...tokens(movie.category), ...tokens(movie.genre)]);
    const type = movie.type?.toLowerCase();
    if (type === "movie") keys.add("movies");
    if (type === "series" || type === "anime" || type === "documentary") keys.add(type);
    keys.forEach((key) => add(key, movie));
  }
  return index;
}

export default function HomePage() {
  const { movies, categories, loading } = useCatalogue();
  const [filter, setFilter] = useState("all");
  const filters = useMemo(() => {
    const known = new Set(FILTERS.map((item) => item.value));
    return [...FILTERS, ...categories.filter((item) => !known.has(item.slug)).map((item) => ({ label: item.name, value: item.slug }))];
  }, [categories]);
  const collections = useMemo(() => categories.length ? categories : [...new Set(movies.flatMap((movie) => tokens(movie.category)))].map((slug, index) => ({ id: index, slug, name: slug.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) })), [categories, movies]);
  const collectionIndex = useMemo(() => buildCollectionIndex(movies), [movies]);
  const rows = useMemo(() => collections.map((collection) => ({ ...collection, movies: collectionIndex.get(collection.slug.toLowerCase()) ?? [] })).filter((row) => row.movies.length), [collections, collectionIndex]);
  const filtered = useMemo(() => movies.filter((movie) => matchesCollection(movie, filter)), [movies, filter]);

  return <main className="home-shell" id="main-content" tabIndex={-1}>
    <AutoSeed />
    <HeroSlider />
    <div className="home-content">
      {(movies.length > 0 || loading) && <div className="browse-bar"><div className="filter-chips hide-scrollbar" role="group" aria-label="Filter the catalogue">{filters.map((chip) => <button className="filter-chip" type="button" key={chip.value} aria-pressed={filter === chip.value} onClick={() => setFilter(chip.value)}>{chip.value === "all" && <Icon name="sparkles" />}{chip.label}</button>)}</div><Link className="browse-all" href="/categories" aria-label="Explore all collections"><Icon name="explore" /></Link></div>}
      {filter !== "all" ? <section className="filtered-results" aria-label="Filtered titles"><div className="filtered-summary"><h2>{filters.find((item) => item.value === filter)?.label}</h2><span role="status">{filtered.length} {filtered.length === 1 ? "title" : "titles"}</span></div>{loading ? <RowSkeletons /> : filtered.length ? <div className="movie-grid" role="list">{filtered.map((movie) => <MovieCard key={movie.id} movie={movie} />)}</div> : <EmptyState title="No titles here yet" description="Try another collection." icon={collectionIcon(filter)} />}</section> : <>
        <ContinueWatchingRow movies={movies} />
        {loading && !movies.length ? <RowSkeletons /> : rows.length ? rows.map((row) => <MovieRow key={row.id} title={row.name} category={row.slug} movies={row.movies} />) : movies.length > 0 && <MovieRow title="Movies & series" category="" movies={movies} />}
      </>}
      <footer className="site-footer"><Logo /><div><Link href="/categories">Explore</Link><Link href="/watchlist">Watchlist</Link><Link href="/gate-keeper">Studio</Link></div><span>© {new Date().getFullYear()} Cinemax</span></footer>
    </div>
  </main>;
}
