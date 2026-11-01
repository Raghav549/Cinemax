"use client";

import { memo, useState } from "react";
import { CinemaxEmblem } from "./Logo";

export function artworkSources(src: string, kind: "poster" | "backdrop") {
  const tmdb = src.match(/^https:\/\/image\.tmdb\.org\/t\/p\/(?:original|w\d+)\/(.+)$/);
  if (!tmdb) return { src };
  const widths = kind === "poster" ? [185, 342, 500, 780] : [300, 780, 1280];
  return {
    src: `https://image.tmdb.org/t/p/${kind === "poster" ? "w500" : "w1280"}/${tmdb[1]}`,
    srcSet: widths.map((width) => `https://image.tmdb.org/t/p/w${width}/${tmdb[1]} ${width}w`).join(", "),
  };
}

function ArtworkImage({ src, alt, className, kind, priority, sizes }: { src: string; alt: string; className: string; kind: "poster" | "backdrop"; priority: boolean; sizes: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`artwork-placeholder ${kind === "backdrop" ? "artwork-backdrop-placeholder" : ""} ${className}`} role={alt ? "img" : undefined} aria-label={alt || undefined}>{kind === "poster" && <CinemaxEmblem />}</div>;
  const sources = artworkSources(src, kind);
  // `next/image` is deliberately not used: admins may point a title at any
  // licensed image host, and the optimizer only accepts hosts that are listed in
  // `images.remotePatterns` at build time - an allowlist that would silently
  // break every poster an admin adds later. The opt-in below is what
  // next/image would have generated anyway: `srcSet` with real widths (w500
  // default, 185-780 for posters), `sizes` matching the rail layout, declared
  // intrinsic dimensions on the card box, lazy/eager + fetchPriority split and
  // async decode. The Android shell serves these URLs directly from the CDN, so
  // there is no /_next/image hop to pay for either.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...sources} alt={alt} className={className} width={kind === "poster" ? 500 : 1280} height={kind === "poster" ? 750 : 720} sizes={sizes} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "low"} decoding="async" draggable={false} onError={() => setFailed(true)} />;
}

function Artwork({ src, alt = "", className = "", kind = "poster", priority = false, sizes }: { src: string | null | undefined; alt?: string; className?: string; kind?: "poster" | "backdrop"; priority?: boolean; sizes?: string }) {
  if (!src) return <div className={`artwork-placeholder ${kind === "backdrop" ? "artwork-backdrop-placeholder" : ""} ${className}`} role={alt ? "img" : undefined} aria-label={alt || undefined}>{kind === "poster" && <CinemaxEmblem />}</div>;
  return <ArtworkImage key={src} src={src} alt={alt} className={className} kind={kind} priority={priority} sizes={sizes ?? (kind === "poster" ? "(max-width: 640px) 40vw, (max-width: 1000px) 25vw, 200px" : "100vw")} />;
}

export default memo(Artwork);
