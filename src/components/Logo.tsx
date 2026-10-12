"use client";

import { useId } from "react";

/** Original folded-aperture emblem: a cinematic C and two interlocking light ribbons. */
export function CinemaxEmblem({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`cinemax-emblem ${className}`} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-ribbon`} x1="10" y1="12" x2="42" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#70E0FF" /><stop offset=".36" stopColor="#4479FF" /><stop offset=".7" stopColor="#8355FF" /><stop offset="1" stopColor="#BE65F7" />
        </linearGradient>
        <linearGradient id={`${id}-fold`} x1="31" y1="19" x2="59" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="#BCA7FF" /><stop offset=".46" stopColor="#E579F1" /><stop offset="1" stopColor="#FF65AE" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="15" y1="22" x2="48" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A2ECFF" /><stop offset="1" stopColor="#97AAFF" stopOpacity=".15" />
        </linearGradient>
      </defs>
      <path className="emblem-ribbon" d="M42.2 5.8 12.8 22.5a10.9 10.9 0 0 0 0 19L42.2 58.2l9.6-11.3L25.7 32l26.1-14.9-9.6-11.3Z" fill={`url(#${id}-ribbon)`} />
      <path className="emblem-fold" d="m39.5 19.8 17.7 10.1a2.4 2.4 0 0 1 0 4.2L39.5 44.2l-7.4-8.5 6.6-3.7-6.6-3.7 7.4-8.5Z" fill={`url(#${id}-fold)`} />
      <path d="M42.1 6.6 13.3 23a10.3 10.3 0 0 0-5.1 8.9" stroke={`url(#${id}-edge)`} strokeWidth="1.1" />
      <path d="m39.5 20.4 17.3 9.9" stroke="#FFE1FF" strokeOpacity=".55" strokeWidth=".8" />
    </svg>
  );
}

export default function Logo({ className = "", emblemOnly = false }: { className?: string; emblemOnly?: boolean }) {
  return (
    <span className={`cinemax-logo ${className}`}>
      <CinemaxEmblem />
      {!emblemOnly && <span className="logo-wordmark">cinema<span className="logo-x">x</span></span>}
    </span>
  );
}
