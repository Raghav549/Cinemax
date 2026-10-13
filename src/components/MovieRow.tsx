"use client";

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import MovieCard, { type MovieCardData } from "./MovieCard";
import Icon from "./Icon";
import useReducedMotion from "@/hooks/useReducedMotion";

interface TrackEdges { start: boolean; end: boolean; }

function MovieRow({ title, category, movies, progressByMovie }: { title: string; category: string; movies: MovieCardData[]; icon?: ReactNode; kicker?: string; progressByMovie?: Record<number, number> }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const animationFrame = useRef<number | null>(null);
  const latestEdges = useRef<TrackEdges>({ start: true, end: false });
  const [edges, setEdges] = useState<TrackEdges>({ start: true, end: false });
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const track = scrollRef.current;
    if (!track) return;
    const update = () => {
      animationFrame.current = null;
      const next = {
        start: track.scrollLeft <= 2,
        end: track.scrollLeft + track.clientWidth >= track.scrollWidth - 2,
      };
      const previous = latestEdges.current;
      // Native scroll events can fire dozens of times a frame. More importantly,
      // most of them do not change an arrow's disabled state, so do not ask React
      // to reconcile an entire poster rail for them.
      if (next.start === previous.start && next.end === previous.end) return;
      latestEdges.current = next;
      setEdges(next);
    };
    const scheduleUpdate = () => {
      if (animationFrame.current !== null) return;
      animationFrame.current = window.requestAnimationFrame(update);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);
    observer?.observe(track);
    track.addEventListener("scroll", scheduleUpdate, { passive: true });
    scheduleUpdate();
    return () => {
      observer?.disconnect();
      track.removeEventListener("scroll", scheduleUpdate);
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
    };
  }, [movies.length]);

  const scroll = useCallback((direction: number) => {
    const track = scrollRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.8, 250), behavior: reducedMotion ? "auto" : "smooth" });
  }, [reducedMotion]);

  if (!movies.length) return null;
  return <section className="movie-row" data-category={category} aria-label={title}>
    <div className="movie-row-head"><h2 className="movie-row-title">{title}</h2><div className="movie-row-actions">
      {category && category !== "continue" && <Link className="movie-row-more" href={`/category/${encodeURIComponent(category)}`}>View all <Icon name="chevron-right" /></Link>}
      <button className="icon-button row-arrow" type="button" aria-label={`Scroll ${title} left`} disabled={edges.start} onClick={() => scroll(-1)}><Icon name="chevron-left" /></button>
      <button className="icon-button row-arrow" type="button" aria-label={`Scroll ${title} right`} disabled={edges.end} onClick={() => scroll(1)}><Icon name="chevron-right" /></button>
    </div></div>
    <div className="movie-track hide-scrollbar" ref={scrollRef} role="list" aria-label={`${title} titles`} tabIndex={0} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); scroll(event.key === "ArrowLeft" ? -1 : 1); } }}>{movies.map((movie) => <MovieCard key={movie.id} movie={movie} progress={progressByMovie?.[movie.id]} />)}</div>
  </section>;
}

export default memo(MovieRow);
