"use client";
import Link from "next/link";

export default function Header() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 20px",
        background: "linear-gradient(to bottom, #000000 70%, transparent)",
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "#000", fontWeight: 900, fontSize: 13 }}>CX</span>
        </div>
        <span style={{ color: "#fff", fontWeight: 900, fontSize: 18, letterSpacing: 2 }}>
          CINEMAX
        </span>
      </Link>
      <Link
        href="/search"
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(20,20,20,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          textDecoration: "none",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </Link>
    </header>
  );
}
