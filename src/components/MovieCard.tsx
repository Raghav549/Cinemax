"use client";

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
}

export default function MovieCard({ movie, progress }: { movie: MovieCardData; progress?: number }) {
  const { savedIds, pendingIds, toggle } = useWatchlist();
  const saved = savedIds.has(movie.id);
  const progressValue = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));
  return <article className="movie-card" role="listitem">
    <Link className="movie-card-link" href={`/movie/${movie.id}${progressValue !== undefined ? "?play=1" : ""}`} aria-label={`${progressValue !== undefined ? "Continue watching" : "View"} ${movie.title}`}>
      <div className="movie-poster">
        <Artwork className="movie-poster-image" src={movie.posterUrl} alt={`${movie.title} poster`} />
        {movie.type && movie.type.toLowerCase() !== "movie" && <span className="movie-type-badge">{movie.type}</span>}
        <span className="movie-hover-play" aria-hidden="true"><Icon name="play" filled /></span>
        {movie.rating && <span className="movie-rating-badge"><Icon name="star" filled />{movie.rating}</span>}
        {progressValue !== undefined && <span className="movie-progress" aria-label={`${Math.round(progressValue)} percent watched`}><span style={{ width: `${progressValue}%` }} /></span>}
      </div>
      <div className="movie-card-copy"><h3 className="movie-card-title">{movie.title}</h3><p className="movie-card-meta">{[movie.year, movie.genre?.split(",")[0]?.trim() || movie.duration].filter(Boolean).join(" · ")}</p></div>
    </Link>
    <button className={`movie-save ${saved ? "is-saved" : ""}`} type="button" aria-label={`${saved ? "Remove" : "Save"} ${movie.title}${saved ? " from" : " to"} watchlist`} aria-pressed={saved} disabled={pendingIds.has(movie.id)} onClick={() => void toggle(movie.id)}><Icon name={saved ? "check" : "plus"} /></button>
  </article>;
}
