"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Slide {
  id: number;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  movieId: number | null;
  fallback?: boolean;
}

const FALLBACK_SLIDES: Slide[] = [
  {
    id: -1,
    title: "The night is yours.",
    subtitle: "A world of stories, made for the way you want to watch.",
    imageUrl: "/cinemax-hero.jpg",
    movieId: null,
    fallback: true,
  },
];

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

export default function HeroSlider() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const activeSlides = slides.length > 0 ? slides : FALLBACK_SLIDES;
  const slide = activeSlides[current] ?? activeSlides[0];

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/slides", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Slides unavailable");
        return response.json();
      })
      .then((data: unknown) => {
        if (Array.isArray(data) && data.length > 0) {
          setSlides(data as Slide[]);
          setCurrent(0);
        }
      })
      .catch(() => {
        // A local, art-directed hero keeps the front door polished while the library is being connected.
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const next = useCallback(() => {
    setCurrent((index) => (index + 1) % activeSlides.length);
    setImageFailed(false);
  }, [activeSlides.length]);
  const previous = useCallback(() => {
    setCurrent((index) => (index - 1 + activeSlides.length) % activeSlides.length);
    setImageFailed(false);
  }, [activeSlides.length]);

  useEffect(() => {
    if (activeSlides.length < 2 || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(next, 7000);
    return () => window.clearInterval(timer);
  }, [activeSlides.length, next, paused]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };
  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const x = touchStartX.current;
    const y = touchStartY.current;
    const endX = event.changedTouches[0]?.clientX;
    const endY = event.changedTouches[0]?.clientY;
    if (x !== null && y !== null && endX !== undefined && endY !== undefined && Math.abs(endX - x) > 48 && Math.abs(endY - y) < 80) {
      endX < x ? next() : previous();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  if (loading) return <div className="hero-loading shimmer" aria-label="Loading featured titles" />;

  return (
    <section
      aria-label="Featured stories"
      className="hero-card"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="hero-image-fallback" />
      {slide.imageUrl && !imageFailed && (
        <img
          key={slide.id}
          className="hero-image"
          src={slide.imageUrl}
          alt=""
          fetchPriority={current === 0 ? "high" : "auto"}
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      )}
      <div className="hero-vignette" />
      <div className="hero-glow" />

      <div className="hero-topline" aria-live="polite">
        <span className="hero-topline-pill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          {slide.fallback ? "Your next story" : "Featured on Cinemax"}
        </span>
        <span className="hero-slide-count">{String(current + 1).padStart(2, "0")} <span aria-hidden="true">/</span> {String(activeSlides.length).padStart(2, "0")}</span>
      </div>

      <div key={`copy-${slide.id}`} className="hero-copy">
        <div className="hero-kicker">A world beyond play</div>
        <h1 className="hero-title">{slide.title}</h1>
        {slide.subtitle && <p className="hero-subtitle">{slide.subtitle}</p>}
        <div className="hero-meta" aria-label="Featured collection">
          <span>Made for movie nights</span><span className="hero-meta-dot" /><span>Find your next favourite</span>
        </div>
        <div className="hero-actions">
          {slide.movieId ? (
            <Link className="hero-button" href={`/movie/${slide.movieId}`}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6L19 12 8 5.2Z" /></svg>
              Watch now
            </Link>
          ) : (
            <Link className="hero-button" href="/search">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6L19 12 8 5.2Z" /></svg>
              Explore titles
            </Link>
          )}
          {slide.movieId ? (
            <Link className="hero-button hero-button-secondary" href={`/movie/${slide.movieId}`}>
              More details
            </Link>
          ) : (
            <Link className="hero-button hero-button-secondary" href="/categories">Browse collections</Link>
          )}
        </div>
      </div>

      {activeSlides.length > 1 && (
        <>
          <div className="hero-indicators" aria-label="Choose featured story">
            {activeSlides.map((item, index) => (
              <button
                key={item.id}
                className="hero-indicator"
                type="button"
                aria-label={`Show featured story ${index + 1}: ${item.title}`}
                aria-current={index === current}
                onClick={() => { setCurrent(index); setImageFailed(false); }}
              />
            ))}
          </div>
          <div className="hero-controls">
            <button className="hero-arrow" type="button" aria-label="Previous featured story" onClick={previous}><Arrow direction="left" /></button>
            <button className="hero-arrow" type="button" aria-label="Next featured story" onClick={next}><Arrow direction="right" /></button>
          </div>
        </>
      )}
    </section>
  );
}
