"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import HeroSlider from "@/components/HeroSlider";
import MovieCard from "@/components/MovieCard";
import MovieRow from "@/components/MovieRow";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import { useCatalogue } from "@/components/CatalogueProvider";
import { matchesCollection, isPlayableMovie, isUpcomingMovie } from "@/lib/catalogue";
import { PLATFORM_BY_ID, movieIsOnPlatform, type PlatformId } from "@/lib/platforms";
import { RowSkeletons } from "@/components/Skeletons";
import EmptyState from "@/components/EmptyState";
import Icon, { collectionIcon } from "@/components/Icon";
import Logo from "@/components/Logo";
import PlatformRail from "@/components/PlatformRail";
import PlatformLogo from "@/components/PlatformLogo";

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
  const { movies, loading } = useCatalogue();
  const [platform, setPlatform] = useState<PlatformId | null>(null);

  const rows = useMemo(() => {
    return HOME_RAILS.map((rail) => ({
      ...rail,
      movies: movies.filter((movie) => matchesCollection(movie, rail.slug)),
    })).filter((row) => row.movies.length > 0);
  }, [movies]);

  // A platform only reports titles that are available now: announced releases
  // are still "upcoming" and are listed by the Coming Soon collection instead.
  // The same predicate drives the rail, its counts and /category/platform-*.
  const availableOn = useMemo(
    () => (movie: (typeof movies)[number], id: PlatformId) =>
      movieIsOnPlatform(movie, id) && !isUpcomingMovie(movie),
    []
  );

  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const movie of movies) {
      // One pass per movie keeps this O(titles) rather than O(titles x platforms).
      for (const [id, item] of PLATFORM_BY_ID) {
        if (availableOn(movie, id as PlatformId)) counts[item.id] = (counts[item.id] ?? 0) + 1;
      }
    }
    return counts;
  }, [movies, availableOn]);

  const playableMovies = useMemo(() => movies.filter((movie) => isPlayableMovie(movie)), [movies]);

  const platformMovies = useMemo(
    () => (platform ? movies.filter((movie) => availableOn(movie, platform)) : []),
    [movies, platform, availableOn]
  );

  const activePlatform = platform ? PLATFORM_BY_ID.get(platform) : undefined;

  return (
    <main className="home-shell" id="main-content" tabIndex={-1}>
      <HeroSlider />
      <div className="home-content">
        {(movies.length > 0 || loading) && (
          <PlatformRail active={platform} counts={platformCounts} onSelect={setPlatform} />
        )}
        {platform && activePlatform ? (
          <section className="platform-results" aria-label={`${activePlatform.name} titles`}>
            <div className="platform-results-head">
              <span className="platform-results-mark">
                <PlatformLogo id={activePlatform.id} eager />
              </span>
              <div className="platform-results-copy">
                <h2>{activePlatform.name}</h2>
                <span role="status">
                  {loading
                    ? "Loading titles…"
                    : `${platformMovies.length} ${platformMovies.length === 1 ? "title" : "titles"} in the library`}
                </span>
              </div>
              <button className="platform-results-reset" type="button" onClick={() => setPlatform(null)}>
                <Icon name="close" />
                <span>Show everything</span>
              </button>
            </div>
            {loading ? (
              <RowSkeletons />
            ) : platformMovies.length ? (
              <div className="movie-grid" role="list">
                {platformMovies.map((movie) => (
                  <MovieCard key={movie.id} movie={movie} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={`Nothing on ${activePlatform.name} yet`}
                description="Titles become available here as soon as the studio lists this platform for them."
                icon="film"
              >
                <button className="cinematic-button button-secondary platform-empty-reset" type="button" onClick={() => setPlatform(null)}>
                  <span className="button-content">
                    <Icon name="arrow-left" />
                    <span>Back to the library</span>
                  </span>
                </button>
              </EmptyState>
            )}
          </section>
        ) : (
          <>
            <ContinueWatchingRow movies={playableMovies} />
            {loading && !movies.length ? (
              <RowSkeletons />
            ) : rows.length ? (
              rows.map((row) => <MovieRow key={row.id} title={row.name} category={row.slug} movies={row.movies} />)
            ) : playableMovies.length > 0 ? (
              <MovieRow title="Movies" category="movies" movies={playableMovies} />
            ) : (
              <EmptyState
                title="Your library is ready"
                description="Titles added in the studio appear here."
                icon={collectionIcon("movies")}
              />
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
