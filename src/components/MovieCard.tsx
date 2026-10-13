"use client";

import { memo } from "react";
import Link from "next/link";
import Artwork from "./Artwork";
import Icon from "./Icon";
import { useWatchlist } from "./WatchlistProvider";

export interface MovieCardData {
  id: number;
  title: string;
  year: number | null;
  rating: string | null;
  posterUrl: string | null;
  genre: string | null;
  duration: string | null;
  type?: string | null;
  catalogStatus?: string | null;
  releaseDate?: string | null;
  sourceType?: string | null;
}

const MovieSaveButton = memo(function MovieSaveButton({ movieId, title }: { movieId: number; title: string }) {
  const { savedIds, pendingIds, toggle } = useWatchlist();
  const saved = savedIds.has(movieId);
  return (
    <button
      className={`movie-save ${saved ? "is-saved" : ""}`}
      type="button"
      aria-label={`${saved ? "Remove" : "Save"} ${title}${saved ? " from" : " to"} watchlist`}
      aria-pressed={saved}
      disabled={pendingIds.has(movieId)}
      onClick={() => void toggle(movieId)}
    >
      <Icon name={saved ? "check" : "plus"} />
    </button>
  );
});

function MovieCard({ movie, progress }: { movie: MovieCardData; progress?: number }) {
  const progressValue = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));
  const upcoming = movie.catalogStatus === "upcoming";
  const href = `/movie/${movie.id}${progressValue !== undefined && !upcoming ? "?play=1" : ""}`;

  return (
    <article className="movie-card" role="listitem" data-status={movie.catalogStatus ?? "verified_playable"}>
      <Link
        className="movie-card-link"
        href={href}
        aria-label={`${progressValue !== undefined ? "Continue watching" : "View"} ${movie.title}`}
      >
        <div className="movie-poster">
          <Artwork className="movie-poster-image" src={movie.posterUrl} alt={`${movie.title} poster`} />
          {upcoming ? (
            <span className="movie-type-badge movie-badge-upcoming">Coming Soon</span>
          ) : (
            movie.type && movie.type.toLowerCase() !== "movie" && <span className="movie-type-badge">{movie.type}</span>
          )}
          {!upcoming && (
            <span className="movie-hover-play" aria-hidden="true">
              <Icon name="play" filled />
            </span>
          )}
          {movie.rating && !upcoming && (
            <span className="movie-rating-badge">
              <Icon name="star" filled />
              {movie.rating}
            </span>
          )}
          {upcoming && movie.releaseDate && (
            <span className="movie-rating-badge movie-release-badge">{movie.releaseDate}</span>
          )}
          {progressValue !== undefined && (
            <span className="movie-progress" aria-label={`${Math.round(progressValue)} percent watched`}>
              <span style={{ width: `${progressValue}%` }} />
            </span>
          )}
        </div>
        <div className="movie-card-copy">
          <h3 className="movie-card-title">{movie.title}</h3>
          <p className="movie-card-meta">
            {[movie.year, movie.genre?.split(",")[0]?.trim() || movie.duration || (upcoming ? "Upcoming" : "")]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </Link>
      <MovieSaveButton movieId={movie.id} title={movie.title} />
    </article>
  );
}

export default memo(MovieCard);
