"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import Artwork from "./Artwork";
import Icon from "./Icon";
import { resolveTrailerUrl, type ResolvedTrailer } from "@/lib/trailer";

interface DetailTrailerBackdropProps {
  movie: {
    id: number;
    title: string;
    trailerUrl?: string | null;
    posterUrl?: string | null;
    backdropUrl?: string | null;
  };
  active?: boolean;
  muted: boolean;
  onToggleMute: () => void;
}

function DetailTrailerBackdropComponent({
  movie,
  active = true,
  muted,
  onToggleMute,
}: DetailTrailerBackdropProps) {
  const trailerKey = `${movie.id}:${movie.trailerUrl ?? ""}`;
  const [erroredKey, setErroredKey] = useState<string | null>(null);
  const hasError = erroredKey === trailerKey;
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const isPlaying = playingKey === trailerKey;
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Safely resolve the trailer URL (YouTube, direct media, or Vimeo).
  // Only the admin-provided `trailerUrl` is used — never `videoUrl`.
  const trailer = useMemo<ResolvedTrailer | null>(() => {
    return resolveTrailerUrl(movie.trailerUrl);
  }, [movie.trailerUrl]);

  // Handle direct video playback & mute changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || trailer?.kind !== "direct") return;

    video.muted = muted;

    if (active) {
      video.play().then(() => setPlayingKey(trailerKey)).catch(() => {
        // Autoplay may be restricted or media failed
      });
    } else {
      video.pause();
    }
  }, [active, muted, trailer, trailerKey]);

  // Handle YouTube / Vimeo iframe postMessage controls
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || (trailer?.kind !== "youtube" && trailer?.kind !== "vimeo")) return;

    try {
      const targetWindow = iframe.contentWindow;
      if (!targetWindow) return;

      if (trailer.kind === "youtube") {
        // Send mute/unmute command
        targetWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: muted ? "mute" : "unMute",
            args: [],
          }),
          "*"
        );

        // Send play/pause command based on active state
        targetWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: active ? "playVideo" : "pauseVideo",
            args: [],
          }),
          "*"
        );
      } else if (trailer.kind === "vimeo") {
        targetWindow.postMessage(
          JSON.stringify({
            method: muted ? "setVolume" : "setVolume",
            value: muted ? 0 : 1,
          }),
          "*"
        );
      }
    } catch {
      // Cross-origin postMessage safety
    }
  }, [active, muted, trailer]);

  // Cleanup on unmount or movie change — guarantees trailer audio/video never leaks
  useEffect(() => {
    const video = videoRef.current;
    const iframe = iframeRef.current;
    return () => {
      if (video) {
        try {
          video.pause();
          video.removeAttribute("src");
          video.load();
        } catch {
          // Ignore
        }
      }
      if (iframe) {
        try {
          iframe.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: "stopVideo", args: [] }),
            "*"
          );
          iframe.src = "about:blank";
        } catch {
          // Ignore
        }
      }
    };
  }, [movie.id]);

  const canPlayTrailer = Boolean(trailer && !hasError && active);

  return (
    <>
      {/* 1. Base artwork fallback (always present underneath to prevent flicker) */}
      <Artwork
        className="detail-backdrop-image"
        src={movie.backdropUrl || movie.posterUrl}
        kind="backdrop"
        priority
      />

      {/* 2. Full-screen background trailer layer */}
      {canPlayTrailer && (
        <div className="detail-trailer-container" aria-hidden="true">
          {trailer?.kind === "direct" ? (
            <video
              ref={videoRef}
              src={trailer.src}
              autoPlay
              muted={muted}
              playsInline
              loop
              preload="auto"
              className="detail-trailer-media"
              onPlaying={() => setPlayingKey(trailerKey)}
              onError={() => {
                setErroredKey(trailerKey);
              }}
            />
          ) : trailer?.kind === "youtube" || trailer?.kind === "vimeo" ? (
            <iframe
              ref={iframeRef}
              src={trailer.embedUrl}
              title={`${movie.title} trailer`}
              className="detail-trailer-media"
              allow="autoplay; encrypted-media"
              tabIndex={-1}
              onLoad={() => setPlayingKey(trailerKey)}
              onError={() => {
                setErroredKey(trailerKey);
              }}
            />
          ) : null}
        </div>
      )}

      {/* 3. Subtle dark overlay/gradient for readability */}
      <div className="detail-backdrop-fade" aria-hidden="true" />

      {/* 4. Small movie poster thumbnail in the corner of the trailer area */}
      {movie.posterUrl && (
        <div className="detail-poster-thumbnail" aria-hidden="true">
          <Artwork
            className="detail-poster-thumbnail-img"
            src={movie.posterUrl}
            kind="poster"
            alt=""
          />
        </div>
      )}

      {/* 5. Cinemax sound toggle floating control under corner poster thumbnail */}
      {canPlayTrailer && (
        <button
          className="detail-poster-audio-btn"
          type="button"
          aria-label={muted ? "Unmute trailer audio" : "Mute trailer audio"}
          title={muted ? "Unmute trailer audio" : "Mute trailer audio"}
          onClick={onToggleMute}
        >
          <Icon name={muted ? "volume-x" : "volume-2"} />
          <span className="detail-poster-audio-label">{muted ? "Muted" : "Sound On"}</span>
        </button>
      )}
    </>
  );
}

export default memo(DetailTrailerBackdropComponent);
