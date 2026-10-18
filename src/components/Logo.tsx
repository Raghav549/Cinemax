"use client";

import type { SVGProps } from "react";

export function MiLeyEmblem({ className = "", ...props }: SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg className={`miley-emblem ${className}`} viewBox="0 0 56 56" fill="none" role="img" aria-label="MiLey" {...props}>
      <defs>
        <linearGradient id="miley-pink" x1="11" y1="8" x2="46" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F6B9CD" /><stop offset=".52" stopColor="#E69BB7" /><stop offset="1" stopColor="#B96F90" />
        </linearGradient>
        <linearGradient id="miley-glass" x1="9" y1="6" x2="45" y2="49" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".12" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r="26" fill="#161116" stroke="#543344" strokeWidth="1.4" />
      <circle cx="28" cy="28" r="23.2" fill="url(#miley-glass)" />
      <path d="M12.8 18.2c0-2.2 1.8-4 4-4h22.4a4 4 0 0 1 4 4v19.6a4 4 0 0 1-4 4H16.8a4 4 0 0 1-4-4V18.2Z" fill="#100C10" fillOpacity=".72" stroke="#E6A2BA" strokeOpacity=".24" />
      <path d="M18 30.7V24c0-1.2 1-2.2 2.2-2.2 1.2 0 2.2 1 2.2 2.2v6.7m0-4.7c0-2.3 1.4-4.2 3.1-4.2s3.1 1.9 3.1 4.2v4.7m0-4.7c0-2.3 1.4-4.2 3.1-4.2s3.1 1.9 3.1 4.2v4.7m0-4.7c0-2.3 1.2-4.2 2.8-4.2s2.8 1.9 2.8 4.2v5.6" stroke="url(#miley-pink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.5 16h20.8" stroke="#FFF6FA" strokeOpacity=".14" strokeLinecap="round" />
    </svg>
  );
}

// Kept as an export alias so archived cinema detail routes remain buildable while the product migrates.
export const CinemaxEmblem = MiLeyEmblem;

export default function Logo({ className = "", emblemOnly = false }: { className?: string; emblemOnly?: boolean }) {
  return (
    <span className={`miley-logo ${className}`}>
      <MiLeyEmblem className="miley-logo-mark" />
      {!emblemOnly && <span className="miley-wordmark">Mi<span className="miley-wordmark-accent">Ley</span></span>}
    </span>
  );
}
