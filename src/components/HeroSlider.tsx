"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCatalogue } from "./CatalogueProvider";
import Artwork from "./Artwork";
import Icon from "./Icon";
import CinematicButton, { CinematicLink } from "./CinematicButton";
import Logo from "./Logo";
import useReducedMotion from "@/hooks/useReducedMotion";
import { isOfficialExternal, isUpcomingMovie, isVerifiedPlayable, type CatalogueMovie } from "@/lib/catalogue";

interface Feature {
  id: string;
  title: string;
  imageUrl: string | null;
  movieId: number | null;
  movie?: CatalogueMovie;
  metadata: string[];
}

export default function HeroSlider() {
  const { slides, movies, loading, error, refresh } = useCatalogue();
  const [selection, setSelection] = useState({ current: 0, previous: -1 });
  const [interacting, setInteracting] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const reducedMotion = useReducedMotion();

  const playableMovies = useMemo(() => movies.filter((movie) => isVerifiedPlayable(movie) || isOfficialExternal(movie)), [movies]);
  const moviesById = useMemo(() => new Map(movies.map((movie) => [movie.id, movie])), [movies]);
  const moviesByTitle = useMemo(
    () => new Map(movies.map((movie) => [movie.title.toLowerCase(), movie])),
    [movies]
  );

  const features = useMemo<Feature[]>(() => {
    if (slides.length) {
      return slides.map((slide) => {
        const movie =
          (slide.movieId === null ? undefined : moviesById.get(slide.movieId)) ??
          moviesByTitle.get((slide.title || "").toLowerCase());
        return {
          id: `slide-${slide.id}`,
          title: slide.title || movie?.title || "",
          imageUrl: slide.imageUrl || movie?.backdropUrl || movie?.posterUrl || null,
          movieId: slide.movieId ?? movie?.id ?? null,
          movie,
          metadata: movie
            ? [
                movie.year ? String(movie.year) : "",
                ...(movie.genre ?? "")
                  .split(",")
                  .map((item) => item.trim())
                  .slice(0, 3),
              ].filter(Boolean)
            : (slide.subtitle ?? "").split(/\s*[•·]\s*/).filter(Boolean),
        };
      });
    }
    const featured = playableMovies.filter((movie) => movie.featured);
    return (featured.length ? featured : playableMovies).slice(0, 5).map((movie) => ({
      id: `movie-${movie.id}`,
      title: movie.title,
      imageUrl: movie.backdropUrl || movie.posterUrl,
      movieId: movie.id,
      movie,
      metadata: [
        movie.year ? String(movie.year) : "",
        ...(movie.genre ?? "")
          .split(",")
          .map((item) => item.trim())
          .slice(0, 3),
      ].filter(Boolean),
    }));
  }, [slides, playableMovies, moviesById, moviesByTitle]);

  const current = Math.max(0, Math.min(selection.current, features.length - 1));
  const feature = features[current];
  const paused = interacting || userPaused || reducedMotion || !pageVisible;

  const choose = useCallback(
    (index: number) => {
      setSelection((previous) => ({
        current: (index + features.length) % features.length,
        previous: Math.min(previous.current, features.length - 1),
      }));
    },
    [features.length]
  );

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (features.length < 2 || paused) return;
    const timer = window.setInterval(() => {
      setSelection((previous) => ({
        current: (previous.current + 1) % features.length,
        previous: previous.current,
      }));
    }, 9000);
    return () => window.clearInterval(timer);
  }, [features.length, paused]);

  if (loading && !feature)
    return (
      <section className="hero-card hero-loading" aria-label="Loading featured titles" aria-busy="true">
        <div className="hero-loading-atmosphere" />
        <div className="hero-copy">
          <div className="shimmer hero-skeleton-title" />
          <div className="shimmer hero-skeleton-meta" />
          <div className="shimmer hero-skeleton-button" />
        </div>
      </section>
    );

  if (!feature)
    return (
      <section className="hero-card hero-empty" aria-label="Cinemax library">
        <Artwork src="/cinemax-atmosphere.webp" className="hero-image" kind="backdrop" priority />
        <div className="hero-vignette" />
        <div className="hero-copy">
          <Logo className="hero-empty-logo" />
          <h1 className="hero-title">{error ? "Library unavailable" : "Your library is ready"}</h1>
          <p className="hero-empty-copy">{error || "Add your first titles in the Cinemax studio."}</p>
          <div className="hero-actions">
            {error ? (
              <CinematicButton onClick={refresh} icon={<Icon name="refresh" />}>
                Try again
              </CinematicButton>
            ) : (
              <CinematicLink href="/gate-keeper" icon={<Icon name="plus" />}>
                Open studio
              </CinematicLink>
            )}
          </div>
        </div>
      </section>
    );

  const upcoming = feature.movie ? isUpcomingMovie(feature.movie) : false;
  const external = feature.movie ? isOfficialExternal(feature.movie) : false;

  return (
    <section
      className="hero-card"
      aria-label="Featured titles"
      aria-roledescription="carousel"
      tabIndex={0}
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteracting(false);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          choose(current + (event.key === "ArrowRight" ? 1 : -1));
        }
      }}
      onTouchStart={(event) => {
        const point = event.touches[0];
        if (point) touch.current = { x: point.clientX, y: point.clientY };
      }}
      onTouchEnd={(event) => {
        const point = event.changedTouches[0];
        if (
          touch.current &&
          point &&
          Math.abs(point.clientX - touch.current.x) > 55 &&
          Math.abs(point.clientY - touch.current.y) < 60
        )
          choose(current + (point.clientX < touch.current.x ? 1 : -1));
        touch.current = null;
      }}
    >
      <div className="hero-image-fallback" aria-hidden="true" />
      {features
        .filter((_, index) => index === current || index === selection.previous)
        .map((item) => (
          <div className="hero-scene" key={item.id} data-active={item.id === feature.id} aria-hidden="true">
            <Artwork src={item.imageUrl} className="hero-image" kind="backdrop" priority={item.id === feature.id} />
          </div>
        ))}
      <div className="hero-vignette" />
      <div className="hero-colour-reflection" aria-hidden="true" />
      <div className="hero-copy" key={feature.id}>
        <h1 className={`hero-title ${feature.title.length > 28 ? "hero-title-long" : ""}`}>{feature.title}</h1>
        {feature.metadata.length > 0 && (
          <div className="hero-meta">
            {feature.metadata.map((item, index) => (
              <span key={`${item}-${index}`}>{item}</span>
            ))}
          </div>
        )}
        <div className="hero-actions">
          {feature.movieId ? (
            upcoming ? (
              <CinematicLink href={`/movie/${feature.movieId}`} variant="secondary" icon={<Icon name="info" />}>
                More Details
              </CinematicLink>
            ) : external ? (
              <>
                <CinematicLink href={`/movie/${feature.movieId}?play=1`} icon={<Icon name="external" />}>
                  Watch on Official Service
                </CinematicLink>
                <CinematicLink href={`/movie/${feature.movieId}`} variant="secondary" icon={<Icon name="info" />}>
                  More Details
                </CinematicLink>
              </>
            ) : (
              <>
                <CinematicLink href={`/movie/${feature.movieId}?play=1`} icon={<Icon name="play" filled />}>
                  Watch Now
                </CinematicLink>
                <CinematicLink href={`/movie/${feature.movieId}`} variant="secondary" icon={<Icon name="info" />}>
                  More Details
                </CinematicLink>
              </>
            )
          ) : (
            <CinematicLink href="/categories" icon={<Icon name="explore" />}>
              Explore
            </CinematicLink>
          )}
        </div>
      </div>
      {features.length > 1 && (
        <div className="hero-pagination">
          <div className="hero-dots" aria-label="Choose a featured title">
            {features.map((item, index) => (
              <button
                className="hero-dot"
                key={item.id}
                type="button"
                aria-label={`Show ${item.title}`}
                aria-current={index === current ? "true" : undefined}
                onClick={() => choose(index)}
              >
                <span />
              </button>
            ))}
          </div>
          <div className="hero-preview-track" aria-label="Featured titles">
            {features.slice(0, 5).map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="hero-preview"
                aria-label={`Feature ${item.title}`}
                aria-current={index === current ? "true" : undefined}
                onClick={() => choose(index)}
              >
                <Artwork src={item.imageUrl} kind="backdrop" sizes="140px" />
                <span>{item.title}</span>
              </button>
            ))}
          </div>
          <div className="hero-controls">
            <span className="hero-slide-count">
              <strong>{String(current + 1).padStart(2, "0")}</strong>
              <span>/ {String(features.length).padStart(2, "0")}</span>
            </span>
            <button
              className="icon-button hero-arrow"
              type="button"
              aria-label="Previous featured title"
              onClick={() => choose(current - 1)}
            >
              <Icon name="chevron-left" />
            </button>
            <button
              className="icon-button hero-arrow"
              type="button"
              aria-label="Next featured title"
              onClick={() => choose(current + 1)}
            >
              <Icon name="chevron-right" />
            </button>
            {!reducedMotion && (
              <button
                className="icon-button hero-pause"
                type="button"
                aria-label={userPaused ? "Resume featured slideshow" : "Pause featured slideshow"}
                aria-pressed={userPaused}
                onClick={() => setUserPaused((previous) => !previous)}
              >
                <Icon name={userPaused ? "play" : "pause"} />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
