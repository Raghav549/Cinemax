"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import HeroSlider from "@/components/HeroSlider";
import AutoSeed from "@/components/AutoSeed";
import MovieCard from "@/components/MovieCard";
import MovieRow from "@/components/MovieRow";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import { useCatalogue } from "@/components/CatalogueProvider";
import { FILTERS, matchesCollection, isPlayableMovie } from "@/lib/catalogue";
import { RowSkeletons } from "@/components/Skeletons";
import EmptyState from "@/components/EmptyState";
import Icon, { collectionIcon } from "@/components/Icon";
import Logo from "@/components/Logo";

const HOME_RAILS = [
  { id: "trending", slug: "trending", name: "Trending" },
  { id: "movies", slug: "movies", name: "Movies" },
  { id: "new-releases", slug: "new-releases", name: "Latest Releases" },
  { id: "top-rated", slug: "top-rated", name: "Top Rated" },
  { id: "hindi", slug: "hindi", name: "Hindi Cinema" },
  { id: "open-access", slug: "open-access", name: "Open-Access Films" },
  { id: "public-domain", slug: "public-domain", name: "Public-Domain Cinema" },
  { id: "dramas", slug: "dramas", name: "Dramas & Series" },
  { id: "action", slug: "action", name: "Action" },
  { id: "sci-fi", slug: "sci-fi", name: "Sci-Fi" },
  { id: "thriller", slug: "thriller", name: "Thriller" },
  { id: "comedy", slug: "comedy", name: "Comedy" },
  { id: "animation", slug: "animation", name: "Animation & Anime" },
  { id: "documentary", slug: "documentary", name: "Documentaries" },
  { id: "coming-soon", slug: "coming-soon", name: "Coming Soon" },
];

export default function HomePage() {
  const { movies, categories, loading } = useCatalogue();
  const [filter, setFilter] = useState("all");

  const filters = useMemo(() => {
    const known = new Set(FILTERS.map((item) => item.value));
    const extras = categories
      .filter((item) => !known.has(item.slug))
      .slice(0, 8)
      .map((item) => ({ label: item.name, value: item.slug }));
    return [...FILTERS, ...extras];
  }, [categories]);

  const rows = useMemo(() => {
    return HOME_RAILS.map((rail) => ({
      ...rail,
      movies: movies.filter((movie) => matchesCollection(movie, rail.slug)),
    })).filter((row) => row.movies.length > 0);
  }, [movies]);

  const playableMovies = useMemo(() => movies.filter((movie) => isPlayableMovie(movie)), [movies]);
  const filtered = useMemo(() => movies.filter((movie) => matchesCollection(movie, filter)), [movies, filter]);

  return (
    <main className="home-shell" id="main-content" tabIndex={-1}>
      <AutoSeed />
      <HeroSlider />
      <div className="home-content">
        {(movies.length > 0 || loading) && (
          <div className="browse-bar">
            <div className="filter-chips hide-scrollbar" role="group" aria-label="Filter the catalogue">
              {filters.map((chip) => (
                <button
                  className="filter-chip"
                  type="button"
                  key={chip.value}
                  aria-pressed={filter === chip.value}
                  onClick={() => setFilter(chip.value)}
                >
                  {chip.value === "all" && <Icon name="sparkles" />}
                  {chip.label}
                </button>
              ))}
            </div>
            <Link className="browse-all" href="/categories" aria-label="Explore all collections">
              <Icon name="explore" />
            </Link>
          </div>
        )}
        {filter !== "all" ? (
          <section className="filtered-results" aria-label="Filtered titles">
            <div className="filtered-summary">
              <h2>{filters.find((item) => item.value === filter)?.label}</h2>
              <span role="status">
                {filtered.length} {filtered.length === 1 ? "title" : "titles"}
              </span>
            </div>
            {loading ? (
              <RowSkeletons />
            ) : filtered.length ? (
              <div className="movie-grid" role="list">
                {filtered.map((movie) => (
                  <MovieCard key={movie.id} movie={movie} />
                ))}
              </div>
            ) : (
              <EmptyState title="No titles here yet" description="Try another collection." icon={collectionIcon(filter)} />
            )}
          </section>
        ) : (
          <>
            <ContinueWatchingRow movies={playableMovies} />
            {loading && !movies.length ? (
              <RowSkeletons />
            ) : rows.length ? (
              rows.map((row) => <MovieRow key={row.id} title={row.name} category={row.slug} movies={row.movies} />)
            ) : (
              playableMovies.length > 0 && <MovieRow title="Movies" category="movies" movies={playableMovies} />
            )}
          </>
        )}
        <footer className="site-footer">
          <Logo />
          <div>
            <Link href="/categories">Explore</Link>
            <Link href="/watchlist">Watchlist</Link>
            <Link href="/gate-keeper">Studio</Link>
          </div>
          <span>© {new Date().getFullYear()} Cinemax</span>
        </footer>
      </div>
    </main>
  );
}
