"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCatalogue } from "@/components/CatalogueProvider";
import { useWatchlist } from "@/components/WatchlistProvider";
import MovieRow from "@/components/MovieRow";
import Artwork from "@/components/Artwork";
import PlaybackOverlay, { resolvePlaybackSource } from "@/components/PlaybackOverlay";
import CinematicButton, { CinematicLink } from "@/components/CinematicButton";
import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import { DetailSkeleton, RelatedSkeleton } from "@/components/Skeletons";
import { matchesCollection, tokens, type CatalogueMovie } from "@/lib/catalogue";

function subscribeResumeChanges(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("cinemax:resume-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("cinemax:resume-change", callback);
  };
}

function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function LoadingState() {
  return <main className="movie-detail-page" id="main-content" tabIndex={-1} aria-busy="true" aria-label="Loading title"><div className="detail-backdrop detail-loading"><div className="hero-image-fallback" /><div className="detail-hero-copy"><div className="shimmer hero-skeleton-title" /><div className="shimmer hero-skeleton-meta" /><div className="shimmer hero-skeleton-button" /></div></div><div className="detail-content detail-content-loading"><DetailSkeleton /></div></main>;
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
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledAutoplay = useRef<string | null>(null);
  // Reuse the home index's copy of this title so Watch Now (and ?play=1) never
  // waits on a metadata round-trip the catalogue already answered. The detail
  // fetch below still enriches credits/related data in the background.
  const indexedMovie = useMemo(() => catalogue.find((item) => String(item.id) === id) ?? null, [catalogue, id]);
  const movie = (detail.id === id ? detail.movie : null) ?? indexedMovie;
  const loading = detail.id !== id && !indexedMovie;
  const video = useMemo(() => movie ? resolvePlaybackSource(movie.videoUrl) : null, [movie]);
  const inWatchlist = movie ? savedIds.has(movie.id) : false;
  const notify = useCallback((text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ id, text });
    noticeTimer.current = setTimeout(() => setNotice({ id, text: "" }), 3200);
  }, [id]);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // Current resume marker: the Watch Now action becomes "Resume watching" with
  // the saved timestamp and updates live when playback progress changes.
  const resumeSnapshot = useSyncExternalStore(subscribeResumeChanges, () => {
    try {
      return window.localStorage.getItem(`cinemax:playback:${id}`) ?? "";
    } catch {
      return "";
    }
  }, () => "");
  const resumeAt = useMemo(() => {
    try {
      if (!resumeSnapshot) return 0;
      const saved = JSON.parse(resumeSnapshot) as { currentTime?: number };
      return typeof saved.currentTime === "number" && saved.currentTime > 15 ? Math.floor(saved.currentTime) : 0;
    } catch {
      return 0;
    }
  }, [resumeSnapshot]);

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
    if (!movie || !video || handledAutoplay.current === id) return;
    // Open the player on the first frame where the source is known - no timer,
    // no intermediate screen. Nothing claims playback has started; the player
    // shows its own preparing state until the first frame is ready.
    handledAutoplay.current = id;
    setPlayingFor(movie.id);
  }, [autoplay, id, movie, video]);

  useEffect(() => {
    const collection = tokens(movie?.category)[0];
    if (!movie || !collection) return;
    const controller = new AbortController();
    fetch(`/api/movies?category=${encodeURIComponent(collection)}&limit=12`, { signal: controller.signal }).then((response) => response.ok ? response.json() : []).then((items: CatalogueMovie[]) => {
      if (!controller.signal.aborted) setRelatedRead({ id, movies: Array.isArray(items) ? items : [] });
    }).catch(() => {
      if (!controller.signal.aborted) setRelatedRead({ id, movies: [] });
    });
    return () => controller.abort();
  }, [id, movie]);

  useEffect(() => {
    if (!autoplay || !movie || handledAutoplay.current === id) return;
    if (video || detail.id !== id) return;
    // Fully loaded and there is genuinely no playable source: say so once,
    // instead of leaving ?play=1 silently doing nothing.
    handledAutoplay.current = id;
    const timer = window.setTimeout(() => notify("Streaming isn’t available for this title yet."), 0);
    return () => window.clearTimeout(timer);
  }, [autoplay, detail.id, id, movie, notify, video]);

  const closePlayer = useCallback(() => setPlayingFor(null), []);
  const related = useMemo(() => {
    if (!movie) return [];
    const collection = tokens(movie.category)[0] || tokens(movie.genre)[0];
    const indexed = catalogue.filter((item) => item.id !== movie.id && matchesCollection(item, collection));
    return [...indexed, ...(relatedRead.id === id ? relatedRead.movies.filter((item) => item.id !== movie.id) : [])].filter((item, index, all) => all.findIndex((movie) => movie.id === item.id) === index).slice(0, 10);
  }, [catalogue, movie, relatedRead, id]);
  // Skeleton only for related data that genuinely has not arrived yet: the
  // network read for this id is still outstanding and nothing is available to
  // show. Once the read resolves - or client-side matches already fill the row
  // - the real content takes over.
  const relatedLoading = !!movie && !!tokens(movie.category)[0] && relatedRead.id !== id && related.length === 0;

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
    {playingFor === movie.id && video && <PlaybackOverlay movie={movie} onClose={closePlayer} />}
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
          <CinematicButton onClick={() => { if (video && playingFor !== movie.id) setPlayingFor(movie.id); }} disabled={!video} icon={<Icon name="play" filled />}>
            {video ? (resumeAt > 0 ? `Resume watching · ${formatClock(resumeAt)}` : "Watch Now") : "Coming soon"}
          </CinematicButton>
          <CinematicButton variant="secondary" onClick={() => void toggle(movie.id)} disabled={pendingIds.has(movie.id)} aria-pressed={inWatchlist} aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"} icon={<Icon name={inWatchlist ? "check" : "plus"} />}>{inWatchlist ? "Saved" : "Watchlist"}</CinematicButton>
          <button className="icon-button detail-share" type="button" aria-label="Share this title" onClick={() => void shareMovie()}><Icon name="share" /></button>
        </div>
        <div className="detail-notice" role="status">{notice.id === id ? notice.text : ""}</div>
      </div>
    </section>
    <div className="detail-content">
      {information.length > 0 && <dl className="detail-info-grid">{information.map((item) => <div className="detail-info-tile" key={item.label}><dt className="detail-info-label">{item.label}</dt><dd className="detail-info-value">{item.value}</dd></div>)}</dl>}
      <div className="detail-about">
        <div>{movie.description && <section className="detail-section"><h2 className="detail-section-title">Synopsis</h2><p className={`detail-synopsis${!synopsisExpanded && movie.description.length > 320 ? " is-clamped" : ""}`}>{movie.description}</p>{movie.description.length > 320 && <button className="detail-read-more" type="button" aria-expanded={synopsisExpanded} onClick={() => setSynopsisExpanded((value) => !value)}>{synopsisExpanded ? "Show less" : "Read more"}</button>}</section>}{genres.length > 0 && <div className="detail-chip-row">{genres.map((genre) => <Link href={`/category/${encodeURIComponent(genre.toLowerCase().replace(/\s+/g, "-"))}`} className="detail-chip" key={genre}>{genre}</Link>)}</div>}</div>
        {(movie.director || movie.cast) && <dl className="detail-credits">{movie.director && <div><dt className="detail-info-label">Director</dt><dd>{movie.director}</dd></div>}{movie.cast && <div><dt className="detail-info-label">Cast</dt><dd>{movie.cast}</dd></div>}</dl>}
      </div>
    </div>
    <div className="detail-related">
      {relatedLoading ? <RelatedSkeleton /> : related.length > 0 ? <MovieRow title={movie.type?.toLowerCase() === "series" ? "Episodes & related titles" : "More like this"} category="" movies={related} /> : null}
    </div>
  </main>;
}

export default function MoviePage(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<LoadingState />}><MovieDetails {...props} /></Suspense>;
}
