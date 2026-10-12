"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import VideoPlayer from "./VideoPlayer";
import Icon from "./Icon";
import type { CatalogueMovie } from "@/lib/catalogue";

export interface PlayableVideo { mode: "direct" | "embed"; src: string; }

export function classifyVideo(value: string): PlayableVideo | null {
  const raw = value.trim();
  if (!raw || /^magnet:/i.test(raw)) return null;
  if (/\.(mp4|webm|ogg|mov|mkv|m4v|m3u8)(?:[?#]|$)/i.test(raw)) return { mode: "direct", src: raw };
  const youtube = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (youtube) return { mode: "embed", src: `https://www.youtube-nocookie.com/embed/${youtube[1]}?autoplay=1&rel=0&playsinline=1` };
  const vimeo = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { mode: "embed", src: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&color=8b5cf6` };
  if (raw.includes("/embed/") || raw.includes("player.")) return { mode: "embed", src: raw };
  return { mode: "direct", src: raw };
}

export default function PlaybackOverlay({ movie, video, onClose }: { movie: CatalogueMovie; video: PlayableVideo; onClose: () => void }) {
  const layer = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const app = document.getElementById("cinemax-app");
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    layer.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !layer.current?.querySelector(".player-popover")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key !== "Tab" || !layer.current) return;
      const focusable = [...layer.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select, iframe, [tabindex="0"]')].filter((item) => item.getClientRects().length && window.getComputedStyle(item).visibility !== "hidden");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); layer.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === layer.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (app) app.inert = false;
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<div ref={layer} className="playback-layer" tabIndex={-1}>
    {video.mode === "direct" ? <VideoPlayer src={video.src} title={movie.title} movieId={movie.id} poster={movie.backdropUrl || movie.posterUrl || undefined} subtitleUrl={movie.subtitleUrl} subtitleLanguage={movie.subtitleLanguage} onClose={onClose} /> : <div className="video-player-shell" role="dialog" aria-modal="true" aria-label={`Now playing ${movie.title}`}>
      <div className="player-topbar"><div className="player-title-wrap"><button className="player-icon-button" type="button" aria-label="Close player" onClick={onClose}><Icon name="chevron-left" /></button><span className="player-title">{movie.title}</span></div><button className="player-icon-button" type="button" aria-label="Close player" onClick={onClose}><Icon name="close" /></button></div>
      <iframe className="embedded-video" src={video.src} title={movie.title} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowFullScreen />
      <p className="embedded-video-hint">Use the provider’s controls for subtitles and quality.</p>
    </div>}
  </div>, document.body);
}
