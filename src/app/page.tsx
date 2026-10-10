"use client";
import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import HeroSlider from "@/components/HeroSlider";
import BottomNav from "@/components/BottomNav";
import AutoSeed from "@/components/AutoSeed";

interface Movie {
  id: number;
  title: string;
  year: number | null;
  rating: string | null;
  posterUrl: string | null;
  genre: string | null;
  duration: string | null;
  type: string | null;
  category: string | null;
}

interface Category {
  id: number;
  name: string;
  slug: string;
}

const CAT_ICONS: Record<string, React.ReactNode> = {
  trending:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
  "new-releases":<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  movies:        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/></svg>,
  series:        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 3l-4 4-4-4"/></svg>,
  anime:         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></svg>,
  action:        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  horror:        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></svg>,
  comedy:        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
  drama:         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M2 18h20M6 18V10l6-8 6 8v8"/><path d="M10 18v-5h4v5"/></svg>,
  "sci-fi":      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>,
  thriller:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  documentary:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
};

// Vertical movie card component used in filtered grid
function GridCard({ movie }: { movie: Movie }) {
  return (
    <Link href={`/movie/${movie.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <div style={{ width: "100%", aspectRatio: "2/3", borderRadius: 14, overflow: "hidden", position: "relative", border: "1px solid rgba(255,255,255,0.07)", background: "#0f0f0f" }}>
        {movie.posterUrl ? (
          <img src={movie.posterUrl} alt={movie.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.1)", fontSize: 28 }}>🎬</div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%)" }} />
        {movie.rating && (
          <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", borderRadius: 7, padding: "3px 7px", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", gap: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ color: "#fbbf24" }}>★</span>
            <span>{movie.rating}</span>
          </div>
        )}
        {movie.type && (
          <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", borderRadius: 7, padding: "3px 8px", fontSize: 8, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", border: "1px solid rgba(255,255,255,0.08)" }}>
            {movie.type}
          </div>
        )}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 10px 10px" }}>
          <p style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{movie.title}</p>
          <p style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>{movie.year} · {movie.duration}</p>
        </div>
      </div>
    </Link>
  );
}

// Horizontal scroll row for category sections
function MovieRow({ title, movies, icon }: { title: string; movies: Movie[]; icon?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!movies.length) return null;
  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", gap: 7, color: "#fff" }}>
          {icon && <span style={{ opacity: 0.5, display: "flex" }}>{icon}</span>}
          {title}
        </h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => ref.current?.scrollBy({ left: -280, behavior: "smooth" })} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <button onClick={() => ref.current?.scrollBy({ left: 280, behavior: "smooth" })} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        </div>
      </div>
      <div ref={ref} className="hide-scrollbar" style={{ display: "flex", gap: 12, overflowX: "auto", paddingLeft: 20, paddingRight: 20, paddingBottom: 4 }}>
        {movies.map((m) => (
          <Link key={m.id} href={`/movie/${m.id}`} className="movie-card" style={{ flexShrink: 0, width: 130, textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{ width: "100%", aspectRatio: "2/3", borderRadius: 14, overflow: "hidden", position: "relative", border: "1px solid rgba(255,255,255,0.07)", background: "#0f0f0f" }}>
              {m.posterUrl ? (
                <img src={m.posterUrl} alt={m.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "rgba(255,255,255,0.08)" }}>🎬</div>
              )}
              {m.rating && (
                <div style={{ position: "absolute", top: 7, right: 7, background: "rgba(0,0,0,0.65)", borderRadius: 6, padding: "2px 6px", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", gap: 2 }}>
                  <span style={{ color: "#fbbf24" }}>★</span>{m.rating}
                </div>
              )}
            </div>
            <p style={{ fontSize: 12, fontWeight: 700, marginTop: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3, fontWeight: 600 }}>{m.year} · {m.duration}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

const FILTER_CHIPS = [
  { label: "All", value: "all" },
  { label: "Movies", value: "movies" },
  { label: "Series", value: "series" },
  { label: "Anime", value: "anime" },
  { label: "Action", value: "action" },
  { label: "Horror", value: "horror" },
  { label: "Comedy", value: "comedy" },
  { label: "Drama", value: "drama" },
  { label: "Sci-Fi", value: "sci-fi" },
  { label: "Thriller", value: "thriller" },
  { label: "Documentary", value: "documentary" },
];

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allMovies, setAllMovies] = useState<Movie[]>([]);
  const [filteredMovies, setFilteredMovies] = useState<Movie[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [ready, setReady] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);

  // Load categories
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/categories")
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setCategories(d); setReady(true); })
        .catch(() => setReady(true));
    }, 700);
    return () => clearTimeout(t);
  }, []);

  // Load all movies once
  useEffect(() => {
    fetch("/api/movies?limit=200")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setAllMovies(d); })
      .catch(() => {});
  }, []);

  // Handle filter chip click
  const handleFilter = async (val: string) => {
    setActiveFilter(val);
    if (val === "all") { setFilteredMovies([]); return; }
    setFilterLoading(true);
    try {
      const res = await fetch(`/api/movies?category=${encodeURIComponent(val)}&limit=60`);
      const data = await res.json();
      setFilteredMovies(Array.isArray(data) ? data : []);
    } catch {
      setFilteredMovies([]);
    } finally {
      setFilterLoading(false);
    }
  };

  // Group allMovies by category for "All" view
  const moviesByCategory: Record<string, Movie[]> = {};
  for (const m of allMovies) {
    const c = m.category || "other";
    if (!moviesByCategory[c]) moviesByCategory[c] = [];
    moviesByCategory[c].push(m);
  }

  const isFiltered = activeFilter !== "all";

  return (
    <div style={{ background: "#000", minHeight: "100vh", paddingBottom: 110 }}>
      <AutoSeed />
      <Header />

      {/* Hero Slider */}
      <HeroSlider />

      {/* ── Filter Chips ── */}
      <div className="hide-scrollbar" style={{ display: "flex", gap: 8, padding: "24px 20px 0", overflowX: "auto" }}>
        {FILTER_CHIPS.map((chip) => {
          const active = activeFilter === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => handleFilter(chip.value)}
              style={{
                flexShrink: 0,
                padding: "9px 18px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.06em",
                border: active ? "none" : "1px solid rgba(255,255,255,0.09)",
                background: active ? "#fff" : "rgba(255,255,255,0.03)",
                color: active ? "#000" : "rgba(255,255,255,0.5)",
                cursor: "pointer",
                transition: "all 0.25s",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* ── Filtered Grid View ── */}
      {isFiltered && (
        <div style={{ padding: "24px 20px 0" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>
            {filterLoading ? "Loading..." : `${filteredMovies.length} titles in ${activeFilter}`}
          </p>
          {filterLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[1,2,3,4,5,6].map((i) => (
                <div key={i} className="shimmer" style={{ aspectRatio: "2/3", borderRadius: 14 }} />
              ))}
            </div>
          ) : filteredMovies.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 14 }}>No content in this category yet</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {filteredMovies.map((m) => <GridCard key={m.id} movie={m} />)}
            </div>
          )}
        </div>
      )}

      {/* ── All Categories Rows ── */}
      {!isFiltered && (
        <div style={{ marginTop: 8 }}>
          {ready && categories.length > 0 ? (
            categories.map((cat) => (
              <MovieRow
                key={cat.id}
                title={cat.name}
                movies={moviesByCategory[cat.slug] || []}
                icon={CAT_ICONS[cat.slug]}
              />
            ))
          ) : (
            // shimmer rows before data loads
            [1, 2, 3].map((i) => (
              <div key={i} style={{ padding: "32px 20px 0" }}>
                <div className="shimmer" style={{ height: 16, width: 150, borderRadius: 8, marginBottom: 14 }} />
                <div style={{ display: "flex", gap: 12 }}>
                  {[1,2,3,4].map((j) => (
                    <div key={j} className="shimmer" style={{ width: 130, aspectRatio: "2/3", borderRadius: 14, flexShrink: 0 }} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Unique decorative section divider ── */}
      {!isFiltered && ready && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "40px 20px 0" }}>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(255,255,255,0.06))" }} />
          <Link href="/categories" style={{ padding: "10px 20px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textDecoration: "none", letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            All Categories →
          </Link>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(255,255,255,0.06))" }} />
        </div>
      )}

      <BottomNav />
    </div>
  );
}
