"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCatalogue } from "@/components/CatalogueProvider";
import { useWatchlist } from "@/components/WatchlistProvider";
import MovieRow from "@/components/MovieRow";
import Artwork from "@/components/Artwork";
import PlaybackOverlay, { classifyVideo } from "@/components/PlaybackOverlay";
import CinematicButton, { CinematicLink } from "@/components/CinematicButton";
import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import { matchesCollection, tokens, type CatalogueMovie } from "@/lib/catalogue";

function LoadingState() {
  return <main className="movie-detail-page" id="main-content" tabIndex={-1} aria-busy="true" aria-label="Loading title"><div className="detail-backdrop detail-loading"><div className="hero-image-fallback" /><div className="detail-hero-copy"><div className="shimmer hero-skeleton-title" /><div className="shimmer hero-skeleton-meta" /><div className="shimmer hero-skeleton-button" /></div></div></main>;
}

function MovieDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const autoplay = searchParams.get("play") === "1";
  const { movies: catalogue } = useCatalogue();
  const { savedIds, pendingIds, toggle } = useWatchlist();
  const [detail, setDetail] = useState<{ id: string; movie: CatalogueMovie | null; error: boolean }>({ id: "", movie: null, error: false });
  const [retry, setRetry] = useState(0);
  const [relatedRead, setRelatedRead] = useState<{ id: string; movies: CatalogueMovie[] }>({ id: "", movies: [] });
  const [playingFor, setPlayingFor] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string }>({ id: "", text: "" });
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledAutoplay = useRef<string | null>(null);
  const movie = detail.id === id ? detail.movie : null;
  const loading = detail.id !== id;
  const video = useMemo(() => movie?.videoUrl ? classifyVideo(movie.videoUrl) : null, [movie]);
  const inWatchlist = movie ? savedIds.has(movie.id) : false;
  const notify = useCallback((text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ id, text });
    noticeTimer.current = setTimeout(() => setNotice({ id, text: "" }), 3200);
  }, [id]);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/movies/${id}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) { if (!controller.signal.aborted) setDetail({ id, movie: null, error: response.status !== 404 }); return; }
        const data = await response.json();
        if (!controller.signal.aborted) setDetail({ id, movie: data?.id ? data as CatalogueMovie : null, error: !data?.id });
      })
      .catch(() => { if (!controller.signal.aborted) setDetail({ id, movie: null, error: true }); });
    return () => controller.abort();
  }, [id, retry]);

  useEffect(() => {
    if (!autoplay) { handledAutoplay.current = null; return; }
    if (!movie || handledAutoplay.current === id) return;
    const timer = window.setTimeout(() => {
      handledAutoplay.current = id;
      if (video) setPlayingFor(movie.id);
      else notify("Streaming isn’t available for this title yet.");
    }, 160);
    return () => window.clearTimeout(timer);
  }, [autoplay, id, movie, video, notify]);

  useEffect(() => {
    const collection = tokens(movie?.category)[0];
    if (!movie || !collection) return;
    const controller = new AbortController();
    fetch(`/api/movies?category=${encodeURIComponent(collection)}&limit=12`, { signal: controller.signal }).then((response) => response.ok ? response.json() : []).then((items: CatalogueMovie[]) => {
      if (!controller.signal.aborted && Array.isArray(items)) setRelatedRead({ id, movies: items });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [id, movie]);

  const closePlayer = useCallback(() => setPlayingFor(null), []);
  const related = useMemo(() => {
    if (!movie) return [];
    const collection = tokens(movie.category)[0] || tokens(movie.genre)[0];
    const indexed = catalogue.filter((item) => item.id !== movie.id && matchesCollection(item, collection));
    return [...indexed, ...(relatedRead.id === id ? relatedRead.movies.filter((item) => item.id !== movie.id) : [])].filter((item, index, all) => all.findIndex((movie) => movie.id === item.id) === index).slice(0, 10);
  }, [catalogue, movie, relatedRead, id]);

  const shareMovie = async () => {
    if (!movie) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("play");
    try {
      if (navigator.share) await navigator.share({ title: movie.title, text: `${movie.title} on Cinemax`, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); notify("Link copied"); }
    } catch (error) { if (error instanceof Error && error.name !== "AbortError") notify("This browser couldn’t share the link."); }
  };

  if (loading) return <LoadingState />;
  if (!movie) return <main className="movie-detail-page" id="main-content" tabIndex={-1}><EmptyState title={detail.error ? "This title couldn’t be loaded" : "Title not found"} description={detail.error ? "Please try again in a moment." : "It may have been removed from the library."} icon="film">{detail.error ? <CinematicButton onClick={() => setRetry((count) => count + 1)} icon={<Icon name="refresh" />}>Try again</CinematicButton> : <CinematicLink href="/" icon={<Icon name="arrow-left" />}>Back to Home</CinematicLink>}</EmptyState></main>;

  const genres = (movie.genre ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const information = [movie.year && { label: "Year", value: String(movie.year) }, movie.duration && { label: "Runtime", value: movie.duration }, movie.type && { label: "Format", value: movie.type }, movie.language && { label: "Language", value: movie.language }].filter(Boolean) as { label: string; value: string }[];

  return <main className="movie-detail-page" id="main-content" tabIndex={-1}>
    {playingFor === movie.id && video && <PlaybackOverlay movie={movie} video={video} onClose={closePlayer} />}
    <section className="detail-backdrop" aria-label={`${movie.title} details`}>
      <Artwork className="detail-backdrop-image" src={movie.backdropUrl || movie.posterUrl} kind="backdrop" priority />
      <div className="detail-backdrop-fade" />
      <div className="detail-topbar"><Link className="page-back" href="/"><Icon name="arrow-left" />Home</Link></div>
      <div className="detail-hero-copy">
        {movie.type && <span className="detail-format">{movie.type}</span>}
        <h1 className={`detail-title ${movie.title.length > 32 ? "detail-title-long" : ""}`}>{movie.title}</h1>
        <div className="detail-meta">{movie.year && <span>{movie.year}</span>}{movie.duration && <span>{movie.duration}</span>}{genres.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}{movie.rating && <span className="detail-meta-rating"><Icon name="star" filled />{movie.rating}</span>}</div>
        {movie.description && <p className="detail-hero-description">{movie.description}</p>}
        <div className="detail-actions">
          <CinematicButton onClick={() => video && setPlayingFor(movie.id)} disabled={!video} icon={<Icon name="play" filled />}>{video ? "Watch Now" : "Coming soon"}</CinematicButton>
          <CinematicButton variant="secondary" onClick={() => void toggle(movie.id)} disabled={pendingIds.has(movie.id)} aria-pressed={inWatchlist} aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"} icon={<Icon name={inWatchlist ? "check" : "plus"} />}>{inWatchlist ? "Saved" : "Watchlist"}</CinematicButton>
          <button className="icon-button detail-share" type="button" aria-label="Share this title" onClick={() => void shareMovie()}><Icon name="share" /></button>
        </div>
        <div className="detail-notice" role="status">{notice.id === id ? notice.text : ""}</div>
      </div>
    </section>
    <div className="detail-content">
      {information.length > 0 && <dl className="detail-info-grid">{information.map((item) => <div className="detail-info-tile" key={item.label}><dt className="detail-info-label">{item.label}</dt><dd className="detail-info-value">{item.value}</dd></div>)}</dl>}
      <div className="detail-about">
        <div>{movie.description && <section className="detail-section"><h2 className="detail-section-title">Synopsis</h2><p className="detail-synopsis">{movie.description}</p></section>}{genres.length > 0 && <div className="detail-chip-row">{genres.map((genre) => <Link href={`/category/${encodeURIComponent(genre.toLowerCase().replace(/\s+/g, "-"))}`} className="detail-chip" key={genre}>{genre}</Link>)}</div>}</div>
        {(movie.director || movie.cast) && <dl className="detail-credits">{movie.director && <div><dt className="detail-info-label">Director</dt><dd>{movie.director}</dd></div>}{movie.cast && <div><dt className="detail-info-label">Cast</dt><dd>{movie.cast}</dd></div>}</dl>}
      </div>
    </div>
    {related.length > 0 && <div className="detail-related"><MovieRow title="More like this" category="" movies={related} /></div>}
  </main>;
}

export default function MoviePage(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<LoadingState />}><MovieDetails {...props} /></Suspense>;
}
