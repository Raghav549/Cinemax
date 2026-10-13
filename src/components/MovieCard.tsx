"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Artwork from "./Artwork";
import Icon from "./Icon";
import { useWatchlist } from "./WatchlistProvider";
import { getTrailerPreview, TRAILER_PREVIEW_EVENT, type TrailerPreview } from "@/lib/trailer-preview";

export interface MovieCardData {
  id: number;
  title: string;
  year: number | null;
  rating: string | null;
  posterUrl: string | null;
  backdropUrl?: string | null;
  trailerUrl?: string | null;
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

  // Inline trailer preview (admin-provided trailerUrl only — never videoUrl).
  const preview: TrailerPreview | null = useMemo(() => getTrailerPreview(movie.trailerUrl), [movie.trailerUrl]);
  const [previewing, setPreviewing] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPreview = useCallback(() => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    const video = videoRef.current;
    if (video) {
      try { video.pause(); } catch { /* already detached */ }
      video.removeAttribute("src");
      try { video.load(); } catch { /* nothing loaded */ }
    }
    hlsRef.current?.destroy();
    hlsRef.current = null;
    setPreviewing(false);
  }, []);

  const startPreview = useCallback(() => {
    if (!preview) return;
    // Only one card may preview at a time across the whole page.
    window.dispatchEvent(new CustomEvent(TRAILER_PREVIEW_EVENT, { detail: movie.id }));
    setPreviewing(true);
  }, [preview, movie.id]);

  // Another card starting its preview stops this one.
  useEffect(() => {
    const onOtherPreview = (event: Event) => {
      if ((event as CustomEvent<number>).detail !== movie.id) stopPreview();
    };
    window.addEventListener(TRAILER_PREVIEW_EVENT, onOtherPreview);
    return () => window.removeEventListener(TRAILER_PREVIEW_EVENT, onOtherPreview);
  }, [movie.id, stopPreview]);

  // Stop when the card scrolls out of view; clean everything up on unmount.
  useEffect(() => {
    if (!previewing || !posterRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.intersectionRatio < 0.35) stopPreview(); },
      { threshold: [0, 0.35, 1] }
    );
    observer.observe(posterRef.current);
    return () => observer.disconnect();
  }, [previewing, stopPreview]);
  useEffect(() => stopPreview, [stopPreview]);

  // Drive the direct-video element: native file, native HLS, or hls.js.
  useEffect(() => {
    if (!previewing || !preview || preview.kind !== "direct") return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    const fail = () => { if (!cancelled) stopPreview(); };
    const play = () => { video.play().catch(fail); };

    if (preview.engine === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
      void import("hls.js")
        .then((library) => {
          if (cancelled) return;
          const HlsPlayer = library.default;
          if (!HlsPlayer.isSupported()) { fail(); return; }
          const hls = new HlsPlayer({ enableWorker: false, capLevelToPlayerSize: true, startLevel: 0 });
          hlsRef.current = hls;
          hls.on(HlsPlayer.Events.ERROR, (_event, data) => { if (data.fatal) fail(); });
          hls.loadSource(preview.src);
          hls.attachMedia(video);
          hls.on(HlsPlayer.Events.MANIFEST_PARSED, play);
        })
        .catch(fail);
    } else {
      video.src = preview.src;
      play();
    }
    return () => { cancelled = true; };
  }, [previewing, preview, stopPreview]);

  const onMouseEnter = () => {
    if (!preview || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(startPreview, 400);
  };
  const onMouseLeave = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    if (previewing) stopPreview();
  };

  return (
    <article
      className="movie-card"
      role="listitem"
      data-status={movie.catalogStatus ?? "verified_playable"}
      data-previewing={previewing || undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Link
        className="movie-card-link"
        href={href}
        aria-label={`${progressValue !== undefined ? "Continue watching" : "View"} ${movie.title}`}
      >
        <div className="movie-poster" ref={posterRef}>
          <Artwork className="movie-poster-image" src={movie.posterUrl} alt={`${movie.title} poster`} />
          {previewing && preview ? (
            <span className="movie-trailer-preview" aria-hidden="true">
              {preview.kind === "direct" ? (
                <video
                  ref={videoRef}
                  className="movie-trailer-video"
                  muted
                  playsInline
                  loop
                  preload="metadata"
                  poster={movie.backdropUrl || movie.posterUrl || undefined}
                  onError={stopPreview}
                />
              ) : (
                <iframe
                  className="movie-trailer-frame"
                  src={preview.src}
                  title=""
                  tabIndex={-1}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              )}
              <span className="movie-trailer-badge">Trailer</span>
            </span>
          ) : null}
          {upcoming ? (
            <span className="movie-type-badge movie-badge-upcoming">Coming Soon</span>
          ) : (
            movie.type && movie.type.toLowerCase() !== "movie" && <span className="movie-type-badge">{movie.type}</span>
          )}
          {!upcoming && !previewing && (
            <span className="movie-hover-play" aria-hidden="true">
              <Icon name="play" filled />
            </span>
          )}
          {movie.rating && !upcoming && !previewing && (
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
      {preview && (
        <button
          className="movie-trailer-button"
          type="button"
          aria-label={previewing ? `Stop trailer preview for ${movie.title}` : `Play trailer preview for ${movie.title}`}
          aria-pressed={previewing}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (previewing) stopPreview(); else startPreview();
          }}
        >
          <Icon name="play" filled />
          <span>{previewing ? "Stop" : "Trailer"}</span>
        </button>
      )}
      <MovieSaveButton movieId={movie.id} title={movie.title} />
    </article>
  );
}

export default memo(MovieCard);
