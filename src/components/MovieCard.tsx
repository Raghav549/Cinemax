"use client";
import Link from "next/link";

interface Movie {
  id: number;
  title: string;
  year: number | null;
  rating: string | null;
  posterUrl: string | null;
  genre: string | null;
  duration: string | null;
}

export default function MovieCard({ movie }: { movie: Movie }) {
  return (
    <Link
      href={`/movie/${movie.id}`}
      className="movie-card"
      style={{ flexShrink: 0, width: 140, textDecoration: "none", color: "inherit" }}
    >
      {/* Poster */}
      <div
        style={{
          width: "100%",
          aspectRatio: "2/3",
          borderRadius: 16,
          overflow: "hidden",
          position: "relative",
          border: "1px solid rgba(255,255,255,0.06)",
          background: "#111",
        }}
      >
        {movie.posterUrl ? (
          <img
            src={movie.posterUrl}
            alt={movie.title}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.1)",
              fontSize: 32,
            }}
          >
            🎬
          </div>
        )}

        {/* Rating badge */}
        {movie.rating && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(0,0,0,0.7)",
              borderRadius: 8,
              padding: "3px 7px",
              fontSize: 10,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <span style={{ color: "#facc15" }}>★</span>
            {movie.rating}
          </div>
        )}
      </div>

      {/* Title + Meta — with clear spacing */}
      <div style={{ marginTop: 10, paddingRight: 4 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: "rgba(255,255,255,0.9)",
            lineHeight: 1.3,
          }}
        >
          {movie.title}
        </p>
        <p
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "rgba(255,255,255,0.35)",
            marginTop: 3,
            letterSpacing: "0.05em",
          }}
        >
          {movie.year} • {movie.duration}
        </p>
      </div>
    </Link>
  );
}
