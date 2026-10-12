"use client";

import { useState } from "react";
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
  // Admins may use any licensed image host. Responsive TMDB sources avoid an image-proxy allowlist and full-original downloads.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...sources} alt={alt} className={className} width={kind === "poster" ? 500 : 1280} height={kind === "poster" ? 750 : 720} sizes={sizes} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={() => setFailed(true)} />;
}

export default function Artwork({ src, alt = "", className = "", kind = "poster", priority = false, sizes }: { src: string | null | undefined; alt?: string; className?: string; kind?: "poster" | "backdrop"; priority?: boolean; sizes?: string }) {
  if (!src) return <div className={`artwork-placeholder ${kind === "backdrop" ? "artwork-backdrop-placeholder" : ""} ${className}`} role={alt ? "img" : undefined} aria-label={alt || undefined}>{kind === "poster" && <CinemaxEmblem />}</div>;
  return <ArtworkImage key={src} src={src} alt={alt} className={className} kind={kind} priority={priority} sizes={sizes ?? (kind === "poster" ? "(max-width: 640px) 40vw, (max-width: 1000px) 25vw, 200px" : "100vw")} />;
}
