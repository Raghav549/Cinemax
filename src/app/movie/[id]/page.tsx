"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import VideoPlayer from "@/components/VideoPlayer";
import MovieCard, { type MovieCardData } from "@/components/MovieCard";

interface Movie extends MovieCardData {
  id: number;
  description: string | null;
  language: string | null;
  director: string | null;
  cast: string | null;
  backdropUrl: string | null;
  videoUrl: string | null;
  subtitleUrl: string | null;
  subtitleLanguage: string | null;
  category: string | null;
  rightsConfirmed: boolean;
  featured: boolean | null;
}
interface PlayableVideo { mode: "direct" | "embed"; src: string; }

function classifyVideo(value: string): PlayableVideo | null {
  const raw = value.trim();
  if (!raw || /^magnet:/i.test(raw)) return null;
  if (/\.(mp4|webm|ogg|mov|mkv|m4v)(?:[?#]|$)/i.test(raw) || /\.m3u8(?:[?#]|$)/i.test(raw)) {
    return { mode: "direct", src: raw };
  }

  const youtube = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (youtube) return { mode: "embed", src: `https://www.youtube-nocookie.com/embed/${youtube[1]}?autoplay=1&rel=0&playsinline=1` };

  const vimeo = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { mode: "embed", src: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&color=9bf0ce` };
  if (raw.includes("/embed/") || raw.includes("player.")) return { mode: "embed", src: raw };
  return { mode: "direct", src: raw };
}

function LoadingState() {
  return (
    <main className="movie-detail-page">
      <Header />
      <div className="content-empty" style={{ minHeight: "70vh" }}>
        <div className="empty-orb" aria-label="Loading title"><svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" strokeOpacity=".22" /><path d="M21 12a9 9 0 0 0-9-9" /></svg></div>
      </div>
      <BottomNav />
    </main>
  );
}

export default function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = loadedFor !== id;
  const [inWatchlist, setInWatchlist] = useState(false);
  const [related, setRelated] = useState<Movie[]>([]);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/movies/${id}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Title not found");
        return response.json();
      })
      .then((data: Movie & { error?: string }) => {
        if (!data || data.error) throw new Error("Title not found");
        setMovie(data);
        if (data.category) {
          fetch(`/api/movies?category=${encodeURIComponent(data.category)}&limit=12`, { signal: controller.signal })
            .then((response) => response.ok ? response.json() : [])
            .then((items: Movie[]) => {
              if (Array.isArray(items)) setRelated(items.filter((item) => item.id !== data.id).slice(0, 8));
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setMovie(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedFor(id);
      });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/watchlist")
      .then((response) => response.ok ? response.json() : [])
      .then((list: { id: number }[]) => {
        if (!cancelled && Array.isArray(list)) setInWatchlist(list.some((item) => String(item.id) === String(id)));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [id]);

  const video = movie?.videoUrl ? classifyVideo(movie.videoUrl) : null;
  const genres = (movie?.genre ?? "").split(",").map((genre) => genre.trim()).filter(Boolean);
  const setTemporaryNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 3200);
  }, []);

  const handlePlay = () => {
    if (!video) {
      setTemporaryNotice(movie?.videoUrl?.startsWith("/api/stream/") ? "The authorized stream is temporarily unavailable." : "This title is being prepared for streaming.");
      return;
    }
    setPlaying(true);
  };

  const toggleWatchlist = async () => {
    if (!movie) return;
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId: movie.id }),
      });
      const data = await response.json();
      if (response.ok && typeof data.added === "boolean") {
        setInWatchlist(data.added);
        setTemporaryNotice(data.added ? "Saved to your list" : "Removed from your list");
      } else setTemporaryNotice("Could not update your list right now.");
    } catch {
      setTemporaryNotice("Could not update your list right now.");
    }
  };

  const shareMovie = async () => {
    if (!movie) return;
    const shareData = { title: movie.title, text: `Discover ${movie.title} on Cinemax`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        setTemporaryNotice("Link copied — share the story");
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") setTemporaryNotice("This browser could not share the link.");
    }
  };

  if (loading) return <LoadingState />;
  if (!movie) {
    return (
      <main className="movie-detail-page">
        <Header />
        <div className="content-empty" style={{ minHeight: "72vh" }}>
          <div>
            <span className="empty-orb" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 0 1 5.7 1.4c-.4 1.2-2.7 1.4-2.7 3.6m0 3h.01" /></svg></span>
            <h1 className="empty-title">That story isn’t here</h1>
            <p className="empty-copy">The title may have moved. Let’s find another one for tonight.</p>
            <Link className="hero-button" href="/" style={{ marginTop: 18 }}>Return to Cinemax</Link>
          </div>
        </div>
        <BottomNav />
      </main>
    );
  }

  const infoItems = [
    movie.year && { label: "Year", value: String(movie.year) },
    movie.duration && { label: "Runtime", value: movie.duration },
    movie.type && { label: "Format", value: movie.type },
    movie.language && { label: "Language", value: movie.language },
    movie.genre && { label: "Genre", value: movie.genre },
  ].filter(Boolean) as { label: string; value: string }[];
  const background = movie.backdropUrl || movie.posterUrl;

  return (
    <main className="movie-detail-page">
      {playing && video?.mode === "direct" && (
        <VideoPlayer
          src={video.src}
          title={movie.title}
          movieId={movie.id}
          poster={background || undefined}
          subtitleUrl={movie.subtitleUrl}
          subtitleLanguage={movie.subtitleLanguage}
          onClose={() => setPlaying(false)}
        />
      )}
      {playing && video?.mode === "embed" && (
        <div className="video-player-shell" role="dialog" aria-modal="true" aria-label={`Now playing ${movie.title}`}>
          <div className="player-topbar">
            <div className="player-title-wrap">
              <button className="player-icon-button" type="button" aria-label="Close player" onClick={() => setPlaying(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <span className="player-title">{movie.title}</span>
            </div>
            <button className="player-icon-button" type="button" aria-label="Close player" onClick={() => setPlaying(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <iframe
            src={video.src}
            title={movie.title}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            style={{ width: "100%", flex: 1, border: 0, background: "#000" }}
          />
          <div style={{ padding: "12px 20px", color: "rgba(255,255,255,.45)", fontSize: 10 }}>Use the video provider’s controls for subtitles and available quality settings.</div>
        </div>
      )}

      <Header />
      <section className="detail-backdrop" aria-label={`${movie.title} details`}>
        {background && <img className="detail-backdrop-image" src={background} alt="" fetchPriority="high" decoding="async" />}
        <div className="detail-backdrop-fade" />
        <div className="detail-topbar">
          <div className="detail-topbar-inner">
            <Link className="detail-back-link" href="/">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              Back to discovery
            </Link>
            <Link className="detail-brand" href="/">CINEMAX</Link>
          </div>
        </div>

        <div className="detail-hero-copy">
          <div className="detail-eyebrow"><span className="eyebrow-dot" />{movie.featured ? "Cinemax selection" : movie.type || "Now showing"}</div>
          <h1 className="detail-title">{movie.title}</h1>
          <div className="detail-meta">
            {movie.year && <span>{movie.year}</span>}
            {movie.duration && <><span className="hero-meta-dot" /><span>{movie.duration}</span></>}
            {movie.type && <><span className="hero-meta-dot" /><span>{movie.type}</span></>}
            {movie.rating && <><span className="hero-meta-dot" /><span className="detail-meta-rating"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 2.9 6.1 6.7.9-4.8 4.7 1.1 6.7-5.9-3.2-5.9 3.2 1.1-6.7-4.8-4.7 6.7-.9L12 2Z" /></svg>{movie.rating}</span></>}
          </div>
          {movie.description && <p className="detail-hero-description">{movie.description}</p>}
          <div className="detail-actions">
            <button className="detail-play-button" type="button" onClick={handlePlay} disabled={!video}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7-11-7Z" /></svg>
              {video ? "Watch now" : "Coming soon"}
            </button>
            <button className="detail-action-button" type="button" aria-pressed={inWatchlist} aria-label={inWatchlist ? "Remove from your list" : "Add to your list"} onClick={() => void toggleWatchlist()}>
              <svg viewBox="0 0 24 24" fill={inWatchlist ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.7L6 21V4.5Z" /></svg>
              {inWatchlist ? "In my list" : "My list"}
            </button>
            <button className="detail-action-button" type="button" aria-label="Share this title" onClick={() => void shareMovie()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.7 10.7 6.6-4.1m-6.6 6.7 6.6 4.1" /></svg>
              Share
            </button>
          </div>
          {notice && <p className="detail-notice" role="status">{notice}</p>}
        </div>
      </section>

      <div className="detail-content">
        {infoItems.length > 0 && (
          <section className="detail-info-grid" aria-label="Title information">
            {infoItems.map((item) => <div className="detail-info-tile" key={item.label}><p className="detail-info-label">{item.label}</p><p className="detail-info-value">{item.value}</p></div>)}
          </section>
        )}

        {genres.length > 0 && (
          <section className="detail-section">
            <h2 className="detail-section-title">A little about the mood</h2>
            <div className="detail-chip-row">{genres.map((genre) => <span className="detail-chip" key={genre}>{genre}</span>)}</div>
          </section>
        )}

        {movie.description && (
          <section className="detail-section">
            <h2 className="detail-section-title">The story</h2>
            <p className="detail-synopsis">{movie.description}</p>
          </section>
        )}

        {(movie.director || movie.cast) && (
          <section className="detail-section detail-credits">
            {movie.director && <div className="detail-credit-card"><p className="detail-info-label">Director</p><p>{movie.director}</p></div>}
            {movie.cast && <div className="detail-credit-card"><p className="detail-info-label">Featuring</p><p>{movie.cast}</p></div>}
          </section>
        )}

        {related.length > 0 && (
          <section className="detail-section">
            <h2 className="detail-section-title">Made for the same mood</h2>
            <div className="detail-related-grid" role="list">
              {related.map((item) => <MovieCard key={item.id} movie={item} />)}
            </div>
          </section>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
