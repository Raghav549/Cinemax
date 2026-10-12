"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import MovieCard, { type MovieCardData } from "./MovieCard";
import Icon from "./Icon";
import useReducedMotion from "@/hooks/useReducedMotion";

export default function MovieRow({ title, category, movies, progressByMovie }: { title: string; category: string; movies: MovieCardData[]; icon?: ReactNode; kicker?: string; progressByMovie?: Record<number, number> }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const track = scrollRef.current;
    if (!track) return;
    const update = () => setEdges({ start: track.scrollLeft <= 2, end: track.scrollLeft + track.clientWidth >= track.scrollWidth - 2 });
    const observer = new ResizeObserver(update);
    observer.observe(track);
    track.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); track.removeEventListener("scroll", update); };
  }, [movies.length]);
  if (!movies.length) return null;
  const scroll = (direction: number) => {
    const track = scrollRef.current;
    track?.scrollBy({ left: direction * Math.max(track.clientWidth * .8, 250), behavior: reducedMotion ? "instant" : "smooth" });
  };
  return <section className="movie-row" aria-label={title}>
    <div className="movie-row-head"><h2 className="movie-row-title">{title}</h2><div className="movie-row-actions">
      {category && category !== "continue" && <Link className="movie-row-more" href={`/category/${encodeURIComponent(category)}`}>View all <Icon name="chevron-right" /></Link>}
      <button className="icon-button row-arrow" type="button" aria-label={`Scroll ${title} left`} disabled={edges.start} onClick={() => scroll(-1)}><Icon name="chevron-left" /></button>
      <button className="icon-button row-arrow" type="button" aria-label={`Scroll ${title} right`} disabled={edges.end} onClick={() => scroll(1)}><Icon name="chevron-right" /></button>
    </div></div>
    <div className="movie-track hide-scrollbar" ref={scrollRef} role="list" aria-label={`${title} titles`} tabIndex={0} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); scroll(event.key === "ArrowLeft" ? -1 : 1); } }}>{movies.map((movie) => <MovieCard key={movie.id} movie={movie} progress={progressByMovie?.[movie.id]} />)}</div>
  </section>;
}
