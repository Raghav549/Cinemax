"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import VideoPlayer from "./VideoPlayer";
import ProviderLanding from "./ProviderLanding";
import Icon from "./Icon";
import { hasNativeShell, setNativePlayerFullscreen } from "@/lib/open-external";
import { resolveShareLink, type LinkResolution } from "@/lib/providers";
import type { CatalogueMovie } from "@/lib/catalogue";

/**
 * Unified in-app viewing experience for catalogue titles and share links.
 *
 * The playback strategy comes from the provider registry:
 *
 *   · `direct` - MP4/WebM/HLS/DASH plays in the Cinemax player;
 *   · `embed`  - the provider's own official player, with its controls kept
 *                intact (nothing layered over them);
 *   · `external` - DRM/subscription/unsupported links show the polished
 *                in-app provider page with a "Play on the official service"
 *                action instead of pretending the link can be embedded.
 *
 * Opening the overlay pushes one history entry so the Android back gesture
 * (and browser back) unwinds the viewing experience - exit immersive first,
 * then close the player - instead of leaving the movie page unexpectedly.
 */

/** Resolve a stored playback source (a catalogue `videoUrl`) with the registry. */
export function resolvePlaybackSource(videoUrl: string | null | undefined): LinkResolution | null {
  if (!videoUrl || !videoUrl.trim()) return null;
  // Catalogue sources are studio-curated (and validated by the API), so an
  // unknown-but-http(s) URL is still attempted as a direct media source - the
  // pre-registry behaviour. Pasted share links never take this path.
  const resolution = resolveShareLink(videoUrl, { allowUnknownDirect: true });
  return resolution.ok ? resolution : null;
}

export interface PlaybackTarget {
  id: number | string;
  title: string;
  poster?: string | null;
  /** Catalogue movies carry posterUrl/backdropUrl; ad-hoc targets carry `poster`. */
  posterUrl?: string | null;
  backdropUrl?: string | null;
  subtitleUrl?: string | null;
  subtitleLanguage?: string | null;
  videoUrl: string | null;
}

function EmbedShell({ resolution, title, onClose }: { resolution: LinkResolution; title: string; onClose: () => void }) {
  const plan = resolution.playback;

  // On Android the WebView rotates to landscape/immersive while an embed is
  // open. The provider's own controls stay in charge inside the frame.
  useEffect(() => {
    if (!hasNativeShell()) return;
    setNativePlayerFullscreen(true);
    return () => {
      setNativePlayerFullscreen(false);
    };
  }, []);

  if (plan.strategy !== "embed") return null;
  // Twitch-style embeds need `parent` = the embedding hostname; substitute it
  // at mount time so the adapter itself stays pure.
  const src = plan.src.replace(/__CINEMAX_PARENT__/g, encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : ""));

  return (
    <div className="video-player-shell" role="dialog" aria-modal="true" aria-label={`Now playing ${title}`}>
      <div className="player-topbar">
        <div className="player-title-wrap">
          <button className="player-icon-button" type="button" aria-label="Close player" onClick={onClose}><Icon name="chevron-left" /></button>
          <span className="player-title">{title}</span>
        </div>
        <button className="player-icon-button" type="button" aria-label="Close player" onClick={onClose}><Icon name="close" /></button>
      </div>
      <iframe
        className="embedded-video"
        src={src}
        title={`${resolution.provider.name} player — ${title}`}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <p className="embedded-video-hint">Use {resolution.provider.name}’s controls for subtitles and quality · <button type="button" className="embedded-video-link" onClick={onClose}>Back to details</button></p>
    </div>
  );
}

export default function PlaybackOverlay({ movie, onClose, openImmersive = true, resolution: providedResolution }: {
  movie: PlaybackTarget | CatalogueMovie;
  onClose: () => void;
  openImmersive?: boolean;
  /**
   * A precomputed strict resolution for user-pasted share links (no
   * unknown-URL fallback). When omitted, catalogue sources resolve in their
   * lenient mode so studio-configured media URLs keep working.
   */
  resolution?: LinkResolution | null;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const closedRef = useRef(false);
  const closingRef = useRef(false);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  const resolution = useMemo(
    () => (providedResolution !== undefined ? providedResolution : resolvePlaybackSource(movie.videoUrl)),
    [providedResolution, movie.videoUrl],
  );
  const poster = ("poster" in movie ? movie.poster : null) || movie.backdropUrl || movie.posterUrl || undefined;

  // One history entry per viewing session: back unwinds the player before it
  // leaves the page, exactly like Android's expected back contract.
  useEffect(() => {
    closedRef.current = false;
    closingRef.current = false;
    try {
      window.history.pushState({ ...(window.history.state || {}), cinemaxPlayer: true }, "");
    } catch {
      // Sandboxed contexts may refuse history writes; the close button still works.
    }
    const onPopState = () => {
      if (closedRef.current) return;
      if (closingRef.current) {
        // A close already routed through history.back() by requestClose():
        // the pushed entry is consumed - finish the close exactly once.
        closedRef.current = true;
        closeRef.current();
        return;
      }
      // A genuine back press exits immersive playback first, then closes the
      // player - the Android back contract: never leave the movie unexpectedly.
      if (document.fullscreenElement || layer.current?.querySelector(".video-player-shell.is-fullscreen")) {
        try { window.history.pushState({ ...(window.history.state || {}), cinemaxPlayer: true }, ""); } catch { /* ignore */ }
        window.dispatchEvent(new Event("cinemax:request-exit-player-fullscreen"));
        return;
      }
      closedRef.current = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const requestClose = useCallback(() => {
    if (closingRef.current || closedRef.current) return;
    closingRef.current = true;
    // Route the close through history so the pushed entry is consumed exactly
    // once, whether the close came from a button, Escape or a route change.
    try {
      if (window.history.state?.cinemaxPlayer) {
        window.history.back();
        return;
      }
    } catch {
      /* fall through to a direct close */
    }
    closedRef.current = true;
    closeRef.current();
  }, []);

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
        // Escape/back exits fullscreen first, matching Android's native back
        // contract. A second press then closes the player onto the details page.
        if (document.fullscreenElement || layer.current?.querySelector(".video-player-shell.is-fullscreen")) {
          window.dispatchEvent(new Event("cinemax:request-exit-player-fullscreen"));
          return;
        }
        requestClose();
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
      // Leaving by route change must also restore portrait orientation.
      setNativePlayerFullscreen(false);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [requestClose]);

  if (!resolution) {
    return createPortal(<div ref={layer} className="playback-layer" tabIndex={-1}>
      <div className="video-player-shell" role="dialog" aria-modal="true" aria-label={`Playback unavailable: ${movie.title}`}>
        <div className="player-error">
          <span className="player-error-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></svg>
          </span>
          <h2 className="player-error-title">No playable source</h2>
          <p className="player-error-copy">This title’s playback link is not a supported video source. Nothing has been started.</p>
          <div className="player-error-actions">
            <button className="primary" type="button" onClick={requestClose}>Back to title</button>
          </div>
        </div>
      </div>
    </div>, document.body);
  }

  return createPortal(<div ref={layer} className="playback-layer" tabIndex={-1}>
    {resolution.playback.strategy === "direct" ? (
      <VideoPlayer
        src={resolution.playback.src}
        title={movie.title}
        movieId={movie.id}
        poster={poster}
        subtitleUrl={movie.subtitleUrl ?? undefined}
        subtitleLanguage={movie.subtitleLanguage ?? undefined}
        onClose={requestClose}
        openImmersive={openImmersive}
      />
    ) : resolution.playback.strategy === "embed" ? (
      <EmbedShell resolution={resolution} title={movie.title} onClose={requestClose} />
    ) : (
      <ProviderLanding resolution={resolution} onClose={requestClose} closeLabel="Back to title" />
    )}
  </div>, document.body);
}
