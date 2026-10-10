"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import VideoPlayer from "@/components/VideoPlayer";

interface Movie {
  id: number; title: string; description: string | null; year: number | null;
  rating: string | null; duration: string | null; genre: string | null;
  language: string | null; type: string | null; director: string | null;
  cast: string | null; posterUrl: string | null; backdropUrl: string | null;
  videoUrl: string | null; category: string | null;
}

// Returns how to play a given URL
function classifyVideo(url: string): { mode: "direct" | "embed"; src: string } {
  if (!url) return { mode: "embed", src: "" };

  // Direct video files → use our custom player
  if (/\.(mp4|webm|ogg|mov|mkv)(\?|$)/i.test(url)) {
    return { mode: "direct", src: url };
  }
  // HLS / m3u8
  if (/\.m3u8(\?|$)/i.test(url)) {
    return { mode: "direct", src: url };
  }

  // YouTube → iframe embed
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return { mode: "embed", src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0&modestbranding=1&playsinline=1` };

  // Vimeo → iframe embed
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return { mode: "embed", src: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&color=ffffff` };

  // Already an embed URL
  if (url.includes("/embed/") || url.includes("player.")) return { mode: "embed", src: url };

  // Anything else — try direct
  return { mode: "direct", src: url };
}

export default function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [related, setRelated] = useState<Movie[]>([]);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    fetch(`/api/movies/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setMovie(data);
          if (data.category) {
            fetch(`/api/movies?category=${data.category}&limit=8`)
              .then((r) => r.json())
              .then((rel) => {
                if (Array.isArray(rel)) setRelated(rel.filter((m: Movie) => m.id !== data.id).slice(0, 6));
              });
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  // Close player when navigating away
  useEffect(() => { setPlaying(false); }, [id]);

  const toggleWatchlist = async () => {
    if (!movie) return;
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId: movie.id }),
    });
    const data = await res.json();
    setInWatchlist(data.added);
  };

  const handlePlay = () => {
    if (!movie?.videoUrl) {
      alert("No video URL set for this title yet.\n\nAdmin can add one at:\nyour-url/gate-keeper\n\nPaste a YouTube link or direct MP4 URL in the Video URL field.");
      return;
    }
    setPlaying(true);
  };

  /* ─── loading ─── */
  if (loading) return (
    <div style={{ background: "#000", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 44, height: 44, border: "2px solid rgba(255,255,255,0.1)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ─── not found ─── */
  if (!movie) return (
    <div style={{ background: "#000", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <p style={{ fontSize: 22, fontWeight: 900 }}>Not Found</p>
      <Link href="/" style={{ padding: "12px 28px", borderRadius: 14, background: "#fff", color: "#000", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>Go Home</Link>
      <BottomNav />
    </div>
  );

  const video = movie.videoUrl ? classifyVideo(movie.videoUrl) : null;
  const genres = movie.genre ? movie.genre.split(",").map((g) => g.trim()).filter(Boolean) : [];

  const infoItems = [
    movie.year     && { label: "Year",     value: String(movie.year) },
    movie.duration && { label: "Duration", value: movie.duration },
    movie.type     && { label: "Type",     value: movie.type },
    movie.language && { label: "Language", value: movie.language },
    movie.rating   && { label: "Rating",   value: `${movie.rating} ★` },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div style={{ background: "#000", minHeight: "100vh", paddingBottom: 110 }}>

      {/* ═══════════════════════════════════════
          VIDEO PLAYER — renders on top of everything
      ═══════════════════════════════════════ */}
      {playing && video && (
        video.mode === "direct" ? (
          /* Custom player for MP4 / direct files */
          <VideoPlayer
            src={video.src}
            title={movie.title}
            poster={movie.backdropUrl || movie.posterUrl || undefined}
            onClose={() => setPlaying(false)}
          />
        ) : (
          /* Simple full-screen iframe for YouTube/Vimeo */
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#000", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
              <button
                onClick={() => setPlaying(false)}
                style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <p style={{ flex: 1, fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{movie.title}</p>
              <button
                onClick={() => setPlaying(false)}
                style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* iframe fills remaining space */}
            <div style={{ flex: 1, position: "relative", background: "#000" }}>
              <iframe
                src={video.src}
                title={movie.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
              />
            </div>

            {/* Info strip */}
            <div style={{ padding: "12px 16px", background: "#000", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                {movie.year     && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 700 }}>{movie.year}</span>}
                {movie.duration && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 700 }}>· {movie.duration}</span>}
                {movie.rating   && <span style={{ fontSize: 11, color: "#fbbf24",               fontWeight: 800 }}>★ {movie.rating}</span>}
                {movie.language && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", fontWeight: 700 }}>{movie.language}</span>}
              </div>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 6, lineHeight: 1.5 }}>
                Use the player&apos;s own controls for quality, subtitles &amp; language options.
              </p>
            </div>
          </div>
        )
      )}

      {/* ═══════════════════════════════════════
          BACKDROP HERO
      ═══════════════════════════════════════ */}
      <div style={{ position: "relative", width: "100%", height: 380 }}>
        <img
          src={movie.backdropUrl || movie.posterUrl || ""}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        {/* Gradient */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.25) 100%)" }} />

        {/* Back button */}
        <Link
          href="/"
          style={{ position: "absolute", top: 20, left: 16, width: 42, height: 42, borderRadius: 14, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textDecoration: "none" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </Link>

        {/* Big play button in center of backdrop */}
        <button
          onClick={handlePlay}
          style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)", width: 70, height: 70, borderRadius: "50%", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(10px)", border: "2px solid rgba(255,255,255,0.35)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>

      {/* ═══════════════════════════════════════
          CONTENT
      ═══════════════════════════════════════ */}
      <div style={{ padding: "0 18px", marginTop: -110, position: "relative", zIndex: 5 }}>

        {/* Poster + title */}
        <div style={{ display: "flex", gap: 18, alignItems: "flex-end" }}>
          <div style={{ width: 120, flexShrink: 0, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.09)" }}>
            {movie.posterUrl
              ? <img src={movie.posterUrl} alt="" style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block" }} />
              : <div style={{ width: "100%", aspectRatio: "2/3", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, color: "rgba(255,255,255,0.1)" }}>🎬</div>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>{movie.title}</h1>
            {movie.rating && (
              <span style={{ display: "inline-block", background: "#fff", color: "#000", fontWeight: 900, fontSize: 11, padding: "4px 10px", borderRadius: 8 }}>{movie.rating} ★</span>
            )}
          </div>
        </div>

        {/* Info chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
          {infoItems.map((item) => (
            <div key={item.label} style={{ padding: "9px 14px", borderRadius: 13, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>{item.label}</p>
              <p style={{ fontSize: 13, fontWeight: 700 }}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button
            onClick={handlePlay}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "15px 0", borderRadius: 16, background: "#fff", color: "#000", fontWeight: 900, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", border: "none", cursor: "pointer" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z"/></svg>
            {movie.videoUrl ? "Watch Now" : "No Video Yet"}
          </button>
          <button
            onClick={toggleWatchlist}
            style={{ width: 54, height: 54, borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", background: inWatchlist ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill={inWatchlist ? "#fff" : "none"} stroke="#fff" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button
            style={{ width: 54, height: 54, borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>
          </button>
        </div>

        {/* Video status indicator */}
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 12, border: `1px solid ${movie.videoUrl ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}`, background: movie.videoUrl ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: movie.videoUrl ? "#22c55e" : "rgba(255,255,255,0.15)", flexShrink: 0 }} />
          <p style={{ fontSize: 11, color: movie.videoUrl ? "rgba(34,197,94,0.8)" : "rgba(255,255,255,0.25)", fontWeight: 600 }}>
            {movie.videoUrl ? "Video available — tap Watch Now to stream" : "No video linked yet — admin can add a URL"}
          </p>
        </div>

        {/* Genres */}
        {genres.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: 10 }}>Genres</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {genres.map((g) => (
                <span key={g} style={{ padding: "7px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 12, fontWeight: 700 }}>{g}</span>
              ))}
            </div>
          </div>
        )}

        {/* Synopsis */}
        {movie.description && (
          <div style={{ marginTop: 26, padding: 20, borderRadius: 18, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: 10 }}>Synopsis</p>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(255,255,255,0.65)", fontWeight: 400 }}>{movie.description}</p>
          </div>
        )}

        {/* Director & Cast */}
        {(movie.director || movie.cast) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
            {movie.director && (
              <div style={{ padding: 16, borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: 8 }}>Director</p>
                <p style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>{movie.director}</p>
              </div>
            )}
            {movie.cast && (
              <div style={{ padding: 16, borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: 8 }}>Cast</p>
                <p style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.5, color: "rgba(255,255,255,0.8)" }}>{movie.cast}</p>
              </div>
            )}
          </div>
        )}

        {/* More Like This */}
        {related.length > 0 && (
          <div style={{ marginTop: 34 }}>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: 14 }}>More Like This</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {related.map((m) => (
                <Link key={m.id} href={`/movie/${m.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                  <div style={{ width: "100%", aspectRatio: "2/3", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", background: "#111" }}>
                    {m.posterUrl ? <img src={m.posterUrl} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
                  </div>
                  <p style={{ fontSize: 10, fontWeight: 700, marginTop: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,0.7)" }}>{m.title}</p>
                  <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2, fontWeight: 600 }}>{m.year}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
