"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface Slide {
  id: number;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  movieId: number | null;
}

export default function HeroSlider() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/slides")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setSlides(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const next = useCallback(() => {
    if (slides.length > 0) setCurrent((c) => (c + 1) % slides.length);
  }, [slides.length]);

  const prev = useCallback(() => {
    if (slides.length > 0) setCurrent((c) => (c - 1 + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(next, 5500);
    return () => clearInterval(timer);
  }, [next, slides.length]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
    touchStartX.current = null;
  };

  if (loading) {
    return (
      <div style={{ padding: "0 16px" }}>
        <div className="shimmer" style={{ height: 420, borderRadius: 22 }} />
      </div>
    );
  }

  if (slides.length === 0) {
    return (
      <div style={{ padding: "0 16px" }}>
        <div style={{ height: 420, borderRadius: 22, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5">
            <rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
          </svg>
          <p style={{ color: "rgba(255,255,255,0.15)", fontSize: 13, fontWeight: 600 }}>No featured slides yet</p>
        </div>
      </div>
    );
  }

  const slide = slides[current];

  return (
    <div style={{ padding: "0 16px" }}>
      {/* Slide Card */}
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          position: "relative",
          height: 420,
          borderRadius: 22,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.09)",
          userSelect: "none",
        }}
      >
        {/* Background image */}
        <img
          key={slide.id}
          src={slide.imageUrl || ""}
          alt={slide.title}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "opacity 0.6s ease",
          }}
        />

        {/* Gradient layers */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.1) 100%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(0,0,0,0.3) 0%, transparent 60%)" }} />

        {/* Slide number badge */}
        <div style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", borderRadius: 10, padding: "5px 10px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {current + 1} / {slides.length}
        </div>

        {/* Content */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 22px" }}>
          {/* Category pill */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)", borderRadius: 20, padding: "4px 12px", marginBottom: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase" }}>Featured</span>
          </div>

          <h2 style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, textTransform: "uppercase", letterSpacing: -0.5, marginBottom: 8, textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
            {slide.title}
          </h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 20, fontWeight: 600, lineHeight: 1.4 }}>
            {slide.subtitle}
          </p>

          {/* Actions - only Watch button, no + */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {slide.movieId ? (
              <Link
                href={`/movie/${slide.movieId}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "13px 26px",
                  borderRadius: 14,
                  background: "#fff",
                  color: "#000",
                  fontWeight: 900,
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="black">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Watch Now
              </Link>
            ) : null}
            <Link
              href="/search"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "13px 20px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textDecoration: "none",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
              Explore
            </Link>
          </div>
        </div>

        {/* Side nav arrows for desktop */}
        {slides.length > 1 && (
          <>
            <button onClick={prev} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: 10, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <button onClick={next} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: 10, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          </>
        )}
      </div>

      {/* Dot indicators */}
      {slides.length > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 14 }}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              style={{
                width: i === current ? 22 : 6,
                height: 6,
                borderRadius: 3,
                background: i === current ? "#fff" : "rgba(255,255,255,0.18)",
                border: "none",
                cursor: "pointer",
                transition: "all 0.35s",
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
