"use client";

import Link from "next/link";

export interface MovieCardData {
  id: number;
  title: string;
  year: number | null;
  rating: string | null;
  posterUrl: string | null;
  genre: string | null;
  duration: string | null;
  type?: string | null;
}

function PosterPlaceholder() {
  return (
    <div className="movie-poster-placeholder" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="m10 9 5 3-5 3V9Z" />
      </svg>
    </div>
  );
}

export default function MovieCard({ movie, progress }: { movie: MovieCardData; progress?: number }) {
  const progressValue = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));

  return (
    <Link href={`/movie/${movie.id}`} className="movie-card" role="listitem" aria-label={`${progressValue !== undefined ? "Continue watching " : "View "}${movie.title}`}>
      <div className="movie-poster">
        {movie.posterUrl ? (
          <img className="movie-poster-image" src={movie.posterUrl} alt={`${movie.title} poster`} loading="lazy" decoding="async" />
        ) : <PosterPlaceholder />}
        {movie.type && <span className="movie-type-badge">{movie.type}</span>}
        {movie.rating && (
          <span className="movie-rating-badge">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 2.9 6.1 6.7.9-4.8 4.7 1.1 6.7-5.9-3.2-5.9 3.2 1.1-6.7-4.8-4.7 6.7-.9L12 2Z" /></svg>
            {movie.rating}
          </span>
        )}
        {progressValue !== undefined && (
          <span className="movie-progress" aria-label={`${Math.round(progressValue)} percent watched`}>
            <span style={{ width: `${progressValue}%` }} />
          </span>
        )}
      </div>
      <div className="movie-card-copy">
        <p className="movie-card-title">{movie.title}</p>
        <p className="movie-card-meta">{[movie.year, movie.duration].filter(Boolean).join(" · ") || movie.genre || "Cinemax pick"}</p>
      </div>
    </Link>
  );
}
