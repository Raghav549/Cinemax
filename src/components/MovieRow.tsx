"use client";

import { useRef } from "react";
import Link from "next/link";
import MovieCard, { type MovieCardData } from "./MovieCard";

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

export default function MovieRow({
  title,
  category,
  movies,
  icon,
  kicker,
  progressByMovie,
}: {
  title: string;
  category: string;
  movies: MovieCardData[];
  icon?: React.ReactNode;
  kicker?: string;
  progressByMovie?: Record<number, number>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  if (movies.length === 0) return null;

  const scroll = (direction: -1 | 1) => {
    const track = scrollRef.current;
    if (track) track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.76, 240), behavior: "smooth" });
  };

  return (
    <section className="movie-row" aria-label={title}>
      <div className="movie-row-head">
        <div className="movie-row-title-wrap">
          {icon && <span className="movie-row-icon">{icon}</span>}
          <div style={{ minWidth: 0 }}>
            {kicker && <p className="movie-row-kicker">{kicker}</p>}
            <h2 className="movie-row-title">{title}</h2>
          </div>
        </div>
        <div className="movie-row-actions">
          {category && category !== "continue" && (
            <Link className="movie-row-more" href={`/category/${category}`}>
              See all <Arrow direction="right" />
            </Link>
          )}
          <button className="row-arrow" type="button" aria-label={`Scroll ${title} left`} onClick={() => scroll(-1)}><Arrow direction="left" /></button>
          <button className="row-arrow" type="button" aria-label={`Scroll ${title} right`} onClick={() => scroll(1)}><Arrow direction="right" /></button>
        </div>
      </div>
      <div className="movie-track hide-scrollbar" ref={scrollRef} role="list" aria-label={`${title} titles`}>
        {movies.map((movie) => <MovieCard key={movie.id} movie={movie} progress={progressByMovie?.[movie.id]} />)}
      </div>
    </section>
  );
}
