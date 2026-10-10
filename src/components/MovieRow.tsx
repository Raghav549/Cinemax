"use client";
import { useEffect, useState, useRef } from "react";
import MovieCard from "./MovieCard";
import React from "react";

interface Movie {
  id: number;
  title: string;
  year: number | null;
  rating: string | null;
  posterUrl: string | null;
  genre: string | null;
  duration: string | null;
}

export default function MovieRow({
  title,
  category,
  icon,
}: {
  title: string;
  category: string;
  icon?: React.ReactNode;
}) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/movies?category=${encodeURIComponent(category)}&limit=20`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setMovies(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [category]);

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "0 20px", marginTop: 32 }}>
        <div className="shimmer" style={{ height: 20, width: 160, borderRadius: 8, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 14 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="shimmer" style={{ width: 140, aspectRatio: "2/3", borderRadius: 16, flexShrink: 0 }} />
          ))}
        </div>
      </div>
    );
  }

  if (movies.length === 0) return null;

  return (
    <section style={{ marginTop: 36 }}>
      {/* Section Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            fontSize: 17,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#fff",
          }}
        >
          {icon && <span style={{ display: "flex", opacity: 0.6 }}>{icon}</span>}
          {title}
        </h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => scroll("left")}
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(20,20,20,0.8)",
              color: "rgba(255,255,255,0.4)",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ‹
          </button>
          <button
            onClick={() => scroll("right")}
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(20,20,20,0.8)",
              color: "rgba(255,255,255,0.4)",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ›
          </button>
        </div>
      </div>

      {/* Horizontal scroll row */}
      <div
        ref={scrollRef}
        className="hide-scrollbar"
        style={{
          display: "flex",
          gap: 14,
          overflowX: "auto",
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 8,
        }}
      >
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}
      </div>
    </section>
  );
}
