"use client";
import { useState, useEffect, useCallback } from "react";
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
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [allMovies, setAllMovies] = useState<Movie[]>([]);

  useEffect(() => {
    fetch("/api/movies?limit=50")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setAllMovies(data); })
      .catch(() => {});
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/movies?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (Array.isArray(data)) setResults(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const moviesToShow = query.trim() ? results : allMovies;
  const genres = ["Action", "Horror", "Comedy", "Drama", "Sci-Fi", "Thriller", "Adventure"];

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", paddingBottom: 100 }}>
      <Header />
      {/* Page Header */}
      <div className="secondary-page-content" style={{ padding: "24px 20px 0" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, marginBottom: 16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </Link>

        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 20 }}>Search</h1>

        {/* Search Input */}
        <div style={{ position: "relative", marginBottom: 24 }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="2"
            style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, genres..."
            className="glass-input"
            style={{ paddingLeft: 48, paddingRight: query ? 44 : 16 }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "rgba(255,255,255,0.08)",
                border: "none",
                color: "rgba(255,255,255,0.4)",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Genre chips */}
        {!query.trim() && (
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: 12 }}>
              Popular Genres
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {genres.map((g) => (
                <button
                  key={g}
                  onClick={() => setQuery(g)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(20,20,20,0.6)",
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Result count */}
        {query.trim() && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 16, fontWeight: 600 }}>
            {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
          </p>
        )}
      </div>

      {/* Results Grid */}
      <div className="secondary-page-content" style={{ padding: "0 20px" }}>
        {loading ? (
          <div className="search-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="shimmer" style={{ aspectRatio: "2/3", borderRadius: 16 }} />
            ))}
          </div>
        ) : (
          <div className="search-grid">
            {moviesToShow.map((movie) => (
              <Link key={movie.id} href={`/movie/${movie.id}`} className="movie-card" style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ width: "100%", aspectRatio: "2/3", borderRadius: 16, overflow: "hidden", position: "relative", border: "1px solid rgba(255,255,255,0.06)", background: "#111" }}>
                  {movie.posterUrl ? (
                    <img src={movie.posterUrl} alt={movie.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.1)", fontSize: 40 }}>🎬</div>
                  )}
                  {movie.rating && (
                    <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", borderRadius: 8, padding: "3px 7px", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ color: "#facc15" }}>★</span>{movie.rating}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{movie.title}</p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3, fontWeight: 600 }}>{movie.year} • {movie.genre?.split(",")[0]}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
