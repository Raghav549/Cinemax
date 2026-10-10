"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

interface Movie {
  id: number;
  title: string;
  year: number | null;
  rating: string | null;
  posterUrl: string | null;
  genre: string | null;
  duration: string | null;
}

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const catName = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  useEffect(() => {
    fetch(`/api/movies?category=${encodeURIComponent(slug)}&limit=50`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setMovies(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  return (
    <div style={{ background: "#000", minHeight: "100vh", paddingBottom: 100 }}>
      <div style={{ padding: "24px 20px 0" }}>
        <Link href="/categories" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 13, marginBottom: 16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Categories
        </Link>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 28 }}>{catName}</h1>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[1,2,3,4].map((i) => <div key={i} className="shimmer" style={{ aspectRatio: "2/3", borderRadius: 16 }} />)}
          </div>
        ) : movies.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 14 }}>No movies in this category yet</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {movies.map((movie) => (
              <Link key={movie.id} href={`/movie/${movie.id}`} style={{ textDecoration: "none", color: "inherit" }}>
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
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3, fontWeight: 600 }}>{movie.year} • {movie.duration}</p>
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
