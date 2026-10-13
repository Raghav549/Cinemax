"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ShareLinkForm from "@/components/ShareLinkForm";
import PlaybackOverlay, { type PlaybackTarget } from "@/components/PlaybackOverlay";
import CinematicButton from "@/components/CinematicButton";
import Icon from "@/components/Icon";
import { openExternal } from "@/lib/open-external";
import { displayHost, resolveShareLink, type ShareMetadata } from "@/lib/providers";

/**
 * The share-link viewing experience.
 *
 * Paste (or deep-link) any supported video/share URL: Cinemax identifies the
 * provider, chooses the permitted playback strategy automatically and opens
 * the integrated viewing experience - the Cinemax player for direct/HLS/DASH
 * sources, the provider's own official embed for permitted players, or the
 * polished in-app provider page with a "Play on the official service" action
 * for DRM/subscription services. Unsafe or invalid links are rejected before
 * anything loads.
 */

const EXAMPLES = [
  { label: "YouTube", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" },
  { label: "HLS stream", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  { label: "Netflix", url: "https://www.netflix.com/title/80057281" },
  { label: "Hotstar", url: "https://www.hotstar.com/in/1260000123" },
];

function WatchStage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlParam = searchParams.get("url") ?? "";
  const [activeUrl, setActiveUrl] = useState(urlParam);
  // The link currently dismissed from the integrated viewing overlay: closing
  // the player marks the link as viewed, submitting another link re-opens the
  // experience. Derived from state during render - no auto-open effect needed.
  const [dismissedUrl, setDismissedUrl] = useState("");
  const [lastParam, setLastParam] = useState(urlParam);
  if (urlParam !== lastParam) {
    setLastParam(urlParam);
    setActiveUrl(urlParam);
    setDismissedUrl("");
  }

  const resolution = useMemo(() => (activeUrl ? resolveShareLink(activeUrl) : null), [activeUrl]);

  // Official metadata (oEmbed) is a progressive enhancement fetched through the
  // SSRF-guarded resolve endpoint; playback never waits for it. Results are
  // keyed to the link they describe, so a superseding link can never show a
  // stale title/thumbnail.
  const [metadataState, setMetadataState] = useState<{ url: string; data: ShareMetadata | null }>({ url: "", data: null });
  const resolvedUrl = resolution?.ok ? resolution.originalUrl : "";
  const metadata = metadataState.url === resolvedUrl ? metadataState.data : null;
  useEffect(() => {
    if (!resolution?.ok || !resolution.metadataSource || resolution.metadataSource.source !== "official-oembed") return;
    const url = resolution.originalUrl;
    const controller = new AbortController();
    fetch(`/api/providers/resolve?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { metadata?: ShareMetadata } | null) => {
        if (!controller.signal.aborted) setMetadataState({ url, data: data?.metadata ?? null });
      })
      .catch(() => { /* metadata is optional */ });
    return () => controller.abort();
  }, [resolution]);

  const playbackTarget: PlaybackTarget | null = useMemo(() => {
    if (!resolution?.ok) return null;
    return {
      id: `link:${resolution.provider.id}:${resolution.contentId ?? displayHost(resolution.originalUrl)}`,
      title: metadata?.title || resolution.provider.name,
      poster: metadata?.thumbnailUrl ?? null,
      subtitleUrl: null,
      subtitleLanguage: null,
      videoUrl: resolution.originalUrl,
    };
  }, [metadata, resolution]);

  const submit = useCallback((next: string) => {
    setDismissedUrl("");
    if (next) {
      router.push(`/watch?url=${encodeURIComponent(next)}`);
    } else {
      setActiveUrl("");
      router.push("/watch");
    }
  }, [router]);

  // The integrated viewing experience opens as soon as a link resolves - the
  // provider page (for DRM/subscription links) or the player (for playable
  // sources). One session per link, never a duplicated overlay.
  const viewing = Boolean(resolution?.ok && playbackTarget && resolution.ok && resolution.originalUrl !== dismissedUrl);
  const closePlayer = useCallback(() => setDismissedUrl(activeUrl), [activeUrl]);

  return (
    <main className="secondary-page watch-page" id="main-content" tabIndex={-1}>
      <div className="secondary-page-content">
        <div className="page-heading"><h1>Watch from a link</h1></div>
        <p className="watch-intro">
          Paste a movie or share link and Cinemax will play it where providers allow it - in the Cinemax player or the
          provider’s own official embed. DRM-protected services open on their official app or site instead; Cinemax never
          bypasses subscriptions or paywalls.
        </p>

        <ShareLinkForm id="watch-link-input" initialValue={activeUrl} onSubmit={submit} autoFocus={!activeUrl} />

        {!activeUrl && (
          <div className="watch-examples">
            <span className="watch-examples-label">Try an example:</span>
            {EXAMPLES.map((example) => (
              <button key={example.label} className="filter-chip" type="button" onClick={() => submit(example.url)}>{example.label}</button>
            ))}
          </div>
        )}

        {activeUrl && resolution && !resolution.ok && (
          <section className="watch-result watch-result-error" aria-label="Link problem">
            <span className="player-error-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></svg>
            </span>
            <h2>{resolution.reason === "unsafe-scheme" ? "That link type isn’t allowed" : resolution.reason === "empty" ? "Paste a link to continue" : "That link couldn’t be read"}</h2>
            <p>{resolution.message}</p>
            <p className="watch-source">Cinemax only accepts web video and share links (https, and http for direct media files). JavaScript links, local files and app schemes are blocked.</p>
          </section>
        )}

        {activeUrl && resolution?.ok && playbackTarget && (
          <section className="watch-result" aria-label="Link details">
            <div className="watch-result-row">
              <div className="provider-badge provider-badge-small" style={{ background: `linear-gradient(135deg, ${resolution.provider.accent}, #1b1230)` }} aria-hidden="true">
                <span>{resolution.provider.name.replace(/[^A-Za-z+]/g, "").slice(0, 2).toUpperCase() || "▶"}</span>
              </div>
              <div className="watch-result-copy">
                <h2>{metadata?.title || resolution.provider.name}</h2>
                <p className="watch-result-meta">
                  {resolution.provider.name} · {resolution.playback.strategy === "direct" ? (resolution.playback.engine === "hls" ? "HLS stream" : resolution.playback.engine === "dash" ? "DASH stream" : "video file") : resolution.playback.strategy === "embed" ? "official embed" : "official service"}
                  {resolution.contentId ? ` · ${resolution.contentId}` : ""}
                </p>
                <p className="provider-url"><span className="provider-url-host">{displayHost(resolution.originalUrl)}</span><span className="provider-url-full">{resolution.originalUrl}</span></p>
              </div>
            </div>
            <div className="watch-result-actions">
              <CinematicButton onClick={() => setDismissedUrl("")} icon={<Icon name="play" filled />}>
                {resolution.playback.strategy === "external" ? "Open provider page" : "Play"}
              </CinematicButton>
              {resolution.playback.strategy === "external" && (
                <CinematicButton variant="secondary" onClick={() => openExternal(resolution.canonicalUrl || resolution.originalUrl)} icon={<Icon name="external" />}>
                  {resolution.playback.strategy === "external" ? resolution.playback.actionLabel : "Open link"}
                </CinematicButton>
              )}
              <CinematicButton variant="secondary" onClick={() => submit("")} icon={<Icon name="close" />}>Clear</CinematicButton>
            </div>
          </section>
        )}

        <section className="watch-help" aria-label="Supported link types">
          <h2>What works</h2>
          <ul>
            <li><Icon name="play" filled /> Direct MP4, WebM, HLS (.m3u8) and DASH (.mpd) sources play in the Cinemax player.</li>
            <li><Icon name="film" /> YouTube (videos &amp; Shorts), Vimeo, Dailymotion, Twitch, Facebook, Instagram, TikTok, Streamable, Loom, Wistia, TED and archive.org play through their official embeds.</li>
            <li><Icon name="lock" /> Netflix, Prime Video, Disney+ Hotstar, Disney+, Apple TV+, ZEE5, SonyLIV, JioCinema and MX Player links open a provider page with a Play on … action - these services protect their streams with DRM and memberships.</li>
            <li><Icon name="external" /> Anything else is kept as a link you can open in your browser - Cinemax won’t load unknown pages inside its player.</li>
          </ul>
          <p className="watch-note">Looking for saved titles? <Link href="/">Back to Home</Link> or <Link href="/search">search the catalogue</Link>.</p>
        </section>
      </div>

      {viewing && playbackTarget && (
        <PlaybackOverlay movie={playbackTarget} onClose={closePlayer} resolution={resolution?.ok ? resolution : null} />
      )}
    </main>
  );
}

export default function WatchPage() {
  return <Suspense fallback={<main className="secondary-page watch-page" id="main-content" tabIndex={-1} aria-busy="true"><div className="secondary-page-content"><div className="page-heading"><h1>Watch from a link</h1></div></div></main>}><WatchStage /></Suspense>;
}
