"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import Header from "@/components/Header";

interface Movie {
  id: number;
  title: string;
  year: number | null;
  rating: string | null;
  posterUrl: string | null;
  genre: string | null;
  duration: string | null;
  watchlistId: number;
}

export default function WatchlistPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setMovies(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const remove = async (movieId: number) => {
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId }),
    });
    setMovies((prev) => prev.filter((m) => m.id !== movieId));
  };

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", paddingBottom: 100 }}>
      <Header />
      <div className="secondary-page-content" style={{ padding: "24px 20px 0" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, marginBottom: 16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Home
        </Link>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 4 }}>My Watchlist</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 28, fontWeight: 500 }}>
          {movies.length} saved movie{movies.length !== 1 ? "s" : ""}
        </p>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1,2,3].map((i) => <div key={i} className="shimmer" style={{ height: 90, borderRadius: 16 }} />)}
          </div>
        ) : movies.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" style={{ margin: "0 auto 16px" }}>
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 15, fontWeight: 600, marginBottom: 20 }}>Your list is empty</p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                borderRadius: 14,
                background: "#fff",
                color: "#000",
                fontWeight: 800,
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              Browse Movies
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {movies.map((movie) => (
              <div
                key={movie.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: 12,
                  borderRadius: 16,
                  background: "rgba(20,20,20,0.6)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {/* Poster thumbnail */}
                <Link href={`/movie/${movie.id}`} style={{ flexShrink: 0, width: 60, textDecoration: "none" }}>
                  <div style={{ width: 60, aspectRatio: "2/3", borderRadius: 10, overflow: "hidden", background: "#111", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {movie.posterUrl ? (
                      <img src={movie.posterUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "rgba(255,255,255,0.1)" }}>🎬</div>
                    )}
                  </div>
                </Link>

                {/* Info */}
                <Link href={`/movie/${movie.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>
                    {movie.title}
                  </p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
                    {movie.year} • {movie.genre?.split(",")[0]} • {movie.duration}
                  </p>
                  {movie.rating && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <span style={{ color: "#facc15", fontSize: 10 }}>★</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{movie.rating}</span>
                    </div>
                  )}
                </Link>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Link
                    href={`/movie/${movie.id}`}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textDecoration: "none",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z" /></svg>
                  </Link>
                  <button
                    onClick={() => remove(movie.id)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.15)",
                      color: "#ef4444",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
