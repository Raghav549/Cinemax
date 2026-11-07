"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type Hls from "hls.js";
import { hasNativeShell, setNativePlayerFullscreen } from "@/lib/open-external";
import { lockPlayerLandscape, requestBrowserImmersive, unlockPlayerOrientation } from "@/lib/playback/immersive";

interface VideoPlayerProps {
  src: string;
  title: string;
  poster?: string;
  /** Catalogue id, or a stable id for ad-hoc share-link playback (resume keys). */
  movieId: number | string;
  subtitleUrl?: string | null;
  subtitleLanguage?: string | null;
  onClose: () => void;
  /** Request landscape/immersive playback as the player opens (Watch Now). */
  openImmersive?: boolean;
  /** Engine chosen by the playback resolver. Overrides URL-extension sniffing (signed manifests). */
  engine?: "video" | "hls" | "dash";
}

/** Controls fade away ~1s after the last interaction while playing. */
const CONTROLS_HIDE_DELAY_MS = 1000;
/**
 * How long the source may go without delivering *any* bytes before the player
 * stops waiting and shows the actionable error. The clock restarts on every
 * network progress event, so a slow server or connection that is still sending
 * data is never cut off - only a source that has gone silent is reported.
 */
const SOURCE_SILENCE_MS = 15000;
/** Upper bound for automatic, back-off reconnects after a network failure. */
const MAX_AUTO_RECONNECTS = 6;

/**
 * Why playback stopped - so the message names the real cause instead of
 * blaming the app's network for everything.
 */
type PlaybackErrorKind = "offline" | "source" | "format" | "generic";

const ERROR_COPY: Record<PlaybackErrorKind, { title: string; copy: string }> = {
  offline: {
    title: "You’re offline",
    copy: "Your device has no internet connection right now. Playback resumes automatically when the connection returns, or try again once you’re back online.",
  },
  source: {
    title: "The video server isn’t responding",
    copy: "Cinemax connected directly to the source, but it stopped sending data. The hosting server may be down or overloaded. Try again, or return to the title page.",
  },
  format: {
    title: "This video can’t be played here",
    copy: "The source refused the request or returned a format this device can’t decode. Try again, or return to the title page.",
  },
  generic: {
    title: "This stream needs another moment",
    copy: "The source may be temporarily unavailable or the connection may have dropped. Try again, or return to the title page.",
  },
};

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

type FitMode = "contain" | "cover" | "fill";
type PlaybackSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;
/** The only values offered - every HTML media engine supports this range. */
const SUPPORTED_SPEEDS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
type SubtitleChoice = "off" | "external" | `hls:${number}`;
interface QualityOption { index: number; label: string; height: number; bitrate: number; }
interface SubtitleOption { value: SubtitleChoice; label: string; }

function subtitleLanguageLabel(language: string | null | undefined): string {
  if (!language) return "Subtitles";
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(language) || language; }
  catch { return language; }
}

function subtitleLanguageTag(language: string | null | undefined): string {
  return language && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language) ? language : "en";
}

function qualityLabel(height: number, bitrate: number, duplicateResolution: boolean): string {
  const resolution = height > 0 ? `${height}p` : "Source bitrate";
  if (!duplicateResolution || !bitrate) return resolution;
  return `${resolution} · ${Math.round(bitrate / 1000)} kbps`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function IconButton({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean }) {
  return (
    <button className="player-icon-button" type="button" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

export default function VideoPlayer({ src, title, poster, movieId, subtitleUrl, subtitleLanguage, onClose, openImmersive = true, engine }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressWriteRef = useRef(0);
  const playbackFrameRef = useRef<number | null>(null);
  const pendingPlaybackRef = useRef({ currentTime: 0, bufferedEnd: 0 });
  const seekFrameRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const seekingRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const showSettingsRef = useRef(false);
  const dashRef = useRef<{ destroy?: () => void; reset?: () => void } | null>(null);
  const interactingRef = useRef(false);
  const fullscreenBusyRef = useRef(false);
  const immersiveRequestedRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [fitMode, setFitMode] = useState<FitMode>("contain");
  const [showSettings, setShowSettings] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [locked, setLocked] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [errored, setErrored] = useState(false);
  const [errorKind, setErrorKind] = useState<PlaybackErrorKind>("generic");
  const [retryCount, setRetryCount] = useState(0);
  /** Brief status shown over the spinner while an automatic reconnect is pending. */
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const erroredRef = useRef(false);
  /** Position to continue from after a reconnect or a retry (survives re-attach). */
  const recoverTimeRef = useRef<number | null>(null);
  const [buffering, setBuffering] = useState(false);
  // True from the moment a source is attached until the first frame is actually
  // ready - so the indicator shows during genuine preparation, not on a timer.
  const [preparing, setPreparing] = useState(false);
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [quality, setQuality] = useState(-1);
  const [sourceQuality, setSourceQuality] = useState("");
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [hlsSubtitleOptions, setHlsSubtitleOptions] = useState<SubtitleOption[]>([]);
  const [subtitleChoice, setSubtitleChoice] = useState<SubtitleChoice>("off");
  const [resumeNotice, setResumeNotice] = useState("");

  const isHlsSource = useMemo(() => (engine ? engine === "hls" : /\.m3u8(?:$|[?#])/i.test(src)), [engine, src]);
  const isDashSource = useMemo(() => (engine ? engine === "dash" : /\.mpd(?:$|[?#])/i.test(src)), [engine, src]);
  const hasExternalSubtitles = Boolean(subtitleUrl);
  const subtitleOptions = useMemo(() => [
    ...(hasExternalSubtitles ? [{ value: "external" as const, label: subtitleLanguageLabel(subtitleLanguage) }] : []),
    ...hlsSubtitleOptions,
  ], [hasExternalSubtitles, hlsSubtitleOptions, subtitleLanguage]);

  useEffect(() => { showSettingsRef.current = showSettings; }, [showSettings]);


  const scheduleHideControls = useCallback((delay = CONTROLS_HIDE_DELAY_MS) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      const video = videoRef.current;
      // The visibility state machine never hides mid-gesture, with settings
      // open, or while playback is paused - only after the interaction is over
      // and the film is actually running.
      if (!video || video.paused || showSettingsRef.current || interactingRef.current) return;
      setControlsVisible(false);
    }, delay);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHideControls();
  }, [scheduleHideControls]);
  // The auto-hide timer pauses while the settings sheet is open and restarts
  // when it closes - no timer pile-up, no controls vanishing mid-adjustment.
  useEffect(() => {
    if (showSettings) {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    } else {
      scheduleHideControls();
    }
  }, [showSettings, scheduleHideControls]);

  const saveProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const key = `cinemax:playback:${movieId}`;
    try {
      if (video.currentTime > 15 && video.duration - video.currentTime > 15) {
        window.localStorage.setItem(key, JSON.stringify({
          currentTime: Math.floor(video.currentTime),
          duration: Math.floor(video.duration),
          updatedAt: Date.now(),
        }));
        window.dispatchEvent(new Event("cinemax:resume-change"));
      } else if (video.duration - video.currentTime <= 15) {
        window.localStorage.removeItem(key);
        window.dispatchEvent(new Event("cinemax:resume-change"));
      }
    } catch {
      // Resume playback is a convenience; storage restrictions must never interrupt playback.
    }
  }, [movieId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let isCancelled = false;
    let hls: Hls | null = null;
    let mediaRecoveries = 0;
    // Warm the connection to the media host before the first segment request -
    // one of the few things under Cinemax's control that shortens time-to-first-frame.
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.setAttribute("data-cinemax-player", "preconnect");
    try {
      preconnect.href = new URL(src, window.location.href).origin;
      if (preconnect.href !== window.location.origin) document.head.appendChild(preconnect);
      else preconnect.remove();
    } catch { preconnect.remove(); }
    const resumeKey = `cinemax:playback:${movieId}`;

    resumeAppliedRef.current = false;
    erroredRef.current = false;
    setErrored(false);
    setBuffering(false);
    setPreparing(true);
    setReconnecting(false);

    // ------------------------------------------------------------ recovery
    // Every automatic recovery below is bounded (back-off, a hard cap) and
    // position-preserving. Nothing here reloads the page or the overlay: the
    // media element and the engine are re-pointed at the same provider URL.
    let autoReconnects = 0;
    let resumeAfterReconnect = false;

    const clearSilenceWatch = () => {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    };
    const clearReconnect = () => {
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    };
    const clearOfflineWait = () => {
      if (offlineTimerRef.current) { clearTimeout(offlineTimerRef.current); offlineTimerRef.current = null; }
    };
    const fail = (kind: PlaybackErrorKind) => {
      if (isCancelled) return;
      clearSilenceWatch();
      clearReconnect();
      clearOfflineWait();
      // "Try again" (or the connection returning) continues from here.
      if (video.currentTime > 0) recoverTimeRef.current = video.currentTime;
      erroredRef.current = true;
      setReconnecting(false);
      setPreparing(false);
      setBuffering(false);
      setErrorKind(isOffline() ? "offline" : kind);
      setErrored(true);
    };

    /**
     * Source-silence watchdog. It is (re)armed whenever the element is waiting
     * for data and reset by every network progress event, so a slow source that
     * is still delivering bytes is never cut off; only a source that has gone
     * completely silent for SOURCE_SILENCE_MS is reported - as a source problem,
     * or as "offline" when the device itself has no connection.
     */
    let receivedAnything = false;
    const armSilenceWatch = () => {
      clearSilenceWatch();
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (isCancelled) return;
        if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
        if (video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
        if (isOffline()) { awaitConnection(); return; }
        // A source that never answered at all is down: say so now. One that
        // was streaming and went silent mid-way gets the bounded reconnects.
        if (!receivedAnything && autoReconnects === 0) { fail("source"); return; }
        scheduleReconnect("source");
      }, autoReconnects > 0 ? SOURCE_SILENCE_MS / 2 : SOURCE_SILENCE_MS);
    };

    let reattach: (() => void) | null = null;
    /** Back-off reconnect to the same provider URL; the position is kept. */
    const scheduleReconnect = (kind: PlaybackErrorKind, limit = MAX_AUTO_RECONNECTS) => {
      if (isCancelled || reconnectTimerRef.current) return;
      if (isOffline()) { awaitConnection(); return; }
      if (autoReconnects >= limit) { fail(kind); return; }
      const delay = Math.min(8000, 1000 * 2 ** autoReconnects);
      autoReconnects += 1;
      setReconnecting(true);
      setBuffering(true);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (isCancelled) return;
        if (isOffline()) { awaitConnection(); return; }
        reattach?.();
      }, delay);
    };

    /**
     * Offline: do not burn the retry budget against a dead link. Wait for the
     * browser's own `online` signal and reconnect once, immediately.
     */
    let waitingForConnection = false;
    const awaitConnection = () => {
      if (isCancelled || waitingForConnection) return;
      waitingForConnection = true;
      clearSilenceWatch();
      clearReconnect();
      setReconnecting(true);
      setBuffering(true);
      setErrorKind("offline");
      // Still offline after a while: say so plainly instead of spinning. The
      // `online` listener below stays armed and resumes playback by itself.
      offlineTimerRef.current = setTimeout(() => {
        offlineTimerRef.current = null;
        if (!isCancelled && waitingForConnection) { waitingForConnection = false; fail("offline"); }
      }, SOURCE_SILENCE_MS);
    };
    const onOnline = () => {
      if (isCancelled) return;
      if (erroredRef.current) {
        // The error surface is up (offline or a dropped source): one automatic
        // retry now that the device is connected again.
        erroredRef.current = false;
        setErrored(false);
        setErrorKind("generic");
        setRetryCount((count) => count + 1);
        return;
      }
      if (!waitingForConnection) return;
      waitingForConnection = false;
      clearOfflineWait();
      autoReconnects = Math.min(autoReconnects, 1);
      reattach?.();
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible" || isCancelled) return;
      // Coming back to the foreground (Android pauses the WebView's media and
      // network while the app is hidden): fire a pending reconnect now instead
      // of after the remaining back-off.
      if (reconnectTimerRef.current) {
        clearReconnect();
        if (isOffline()) awaitConnection();
        else reattach?.();
      }
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    armSilenceWatch();
    setQuality(-1);
    setQualityOptions([]);
    setSourceQuality("");
    setHlsSubtitleOptions([]);

    const updateQualityOptions = (instance: Hls) => {
      const levels = instance.levels.map((level, index) => ({
        index,
        height: level.height || 0,
        bitrate: level.bitrate || 0,
      })).sort((a, b) => a.height - b.height || a.bitrate - b.bitrate);
      const resolutionCounts = new Map<number, number>();
      levels.forEach((level) => resolutionCounts.set(level.height, (resolutionCounts.get(level.height) ?? 0) + 1));
      setQualityOptions(levels.map((level) => ({
        ...level,
        label: qualityLabel(level.height, level.bitrate, (resolutionCounts.get(level.height) ?? 0) > 1),
      })));
    };
    const updateSubtitleOptions = (instance: Hls) => {
      setHlsSubtitleOptions(instance.subtitleTracks.map((track, index) => ({
        value: `hls:${index}` as const,
        label: track.name || track.lang || `Subtitle ${index + 1}`,
      })));
    };

    const reattachPlainSource = () => {
      if (isCancelled) return;
      const at = video.currentTime;
      recoverTimeRef.current = at > 0 ? at : recoverTimeRef.current;
      resumeAfterReconnect = !video.paused || video.readyState === HTMLMediaElement.HAVE_NOTHING;
      setReconnecting(true);
      video.src = src;
      video.load();
      armSilenceWatch();
    };

    const attachSource = async () => {
      if (!isDashSource && !isHlsSource) reattach = reattachPlainSource;
      if (isDashSource) {
        // MPEG-DASH through dash.js, loaded lazily so it never weighs on
        // startup for the MP4/HLS majority.
        try {
          const dashLibrary = await import("dashjs");
          if (isCancelled) return;
          const dashModule = (dashLibrary as { default?: Record<string, unknown> }).default ?? (dashLibrary as unknown as Record<string, unknown>);
          const mediaPlayer = (dashModule as { MediaPlayer: () => { create: () => { initialize: (el: HTMLVideoElement, src: string, auto: boolean) => void; on: (name: string, cb: () => void) => void; destroy?: () => void; reset?: () => void; updateSettings: (s: unknown) => void } } }).MediaPlayer().create();
          if (isCancelled) { try { mediaPlayer.destroy?.(); } catch { /* already gone */ } return; }
          dashRef.current = mediaPlayer;
          try { mediaPlayer.updateSettings({ streaming: { buffer: { fastSwitchEnabled: true } } }); } catch { /* defaults are fine */ }
          mediaPlayer.on("error", () => {
            if (isCancelled) return;
            fail(isOffline() ? "offline" : "source");
          });
          mediaPlayer.initialize(video, src, true);
        } catch {
          fail("generic");
        }
        return;
      }
      if (!isHlsSource) {
        // The browser fetches the file straight from the provider: no proxy,
        // no custom loader, no interception - the same request a browser tab
        // would make for this URL.
        video.src = src;
        video.load();
        return;
      }

      try {
        const hlsLibrary = await import("hls.js");
        if (isCancelled) return;
        const HlsPlayer = hlsLibrary.default;
        if (HlsPlayer.isSupported()) {
          // Manifest and segment requests are issued by hls.js's default XHR
          // loader directly against the provider's URLs (credentials off, no
          // extra headers, no rewriting): the provider's own CDN serves them.
          hls = new HlsPlayer({
            enableWorker: true,
            lowLatencyMode: false,
            capLevelToPlayerSize: true,
            maxBufferLength: 24,
            maxMaxBufferLength: 60,
            backBufferLength: 40,
            fragLoadingMaxRetry: 4,
            manifestLoadingMaxRetry: 3,
            levelLoadingMaxRetry: 3,
          });
          hlsRef.current = hls;
          hls.on(HlsPlayer.Events.MEDIA_ATTACHED, () => hls?.loadSource(src));
          // Any manifest/segment arriving means the source is alive: the
          // silence watchdog restarts and the reconnect budget is restored.
          hls.on(HlsPlayer.Events.MANIFEST_LOADED, () => { if (!isCancelled && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) armSilenceWatch(); });
          hls.on(HlsPlayer.Events.LEVEL_LOADED, () => { if (!isCancelled && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) armSilenceWatch(); });
          hls.on(HlsPlayer.Events.FRAG_LOADED, () => {
            if (isCancelled) return;
            receivedAnything = true;
            autoReconnects = 0;
            setReconnecting(false);
            if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) armSilenceWatch();
          });
          hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
            if (!hls) return;
            updateQualityOptions(hls);
            updateSubtitleOptions(hls);
            // The player is opened by an explicit user gesture. If browser autoplay policy
            // still blocks the async HLS attach, the regular play button remains available.
            void video.play().catch(() => undefined);
          });
          hls.on(HlsPlayer.Events.LEVELS_UPDATED, () => { if (hls) updateQualityOptions(hls); });
          hls.on(HlsPlayer.Events.SUBTITLE_TRACKS_UPDATED, () => { if (hls) updateSubtitleOptions(hls); });
          hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
            // Non-fatal errors are retried by hls.js itself (per-request retry
            // budgets above); only a fatal one reaches the recovery below.
            if (!data.fatal || !hls || isCancelled) return;
            if (data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR) {
              const status = (data.response as { code?: number } | undefined)?.code ?? 0;
              // The provider answered and refused (expired/signed URL, geo or
              // referrer policy, removed title): that is not a connectivity
              // problem and no amount of reconnecting changes it.
              if ([401, 403, 404, 410, 451].includes(status)) { fail("format"); return; }
              scheduleReconnect("source");
            } else if (data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
              mediaRecoveries += 1;
              hls.recoverMediaError();
            } else {
              fail(data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR ? "format" : "generic");
            }
          });
          reattach = () => {
            if (isCancelled || !hls) return;
            setReconnecting(true);
            // Same manifest, same provider, resumed from the current position;
            // hls.js re-requests only what is missing.
            hls.startLoad(video.currentTime > 0 ? video.currentTime : -1);
            armSilenceWatch();
          };
          hls.attachMedia(video);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari/iOS uses native HLS and its own adaptive rendition selector.
          video.src = src;
          video.load();
        } else {
          fail("format");
        }
      } catch {
        fail("generic");
      }
    };

    const onMetadata = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      if (!isHlsSource && video.videoHeight > 0) setSourceQuality(`${video.videoHeight}p`);
      if (recoverTimeRef.current !== null) {
        // A reconnect or retry after a network failure continues where
        // playback stopped.
        const at = recoverTimeRef.current;
        recoverTimeRef.current = null;
        resumeAppliedRef.current = true;
        if (Number.isFinite(video.duration) && at < video.duration) video.currentTime = at;
        return;
      }
      if (resumeAppliedRef.current || !Number.isFinite(video.duration) || video.duration <= 0) return;
      resumeAppliedRef.current = true;
      try {
        const saved = window.localStorage.getItem(resumeKey);
        if (!saved) return;
        const progress = JSON.parse(saved) as { currentTime?: number; duration?: number };
        if (typeof progress.currentTime !== "number" || typeof progress.duration !== "number") return;
        const withinSameRuntime = Math.abs(progress.duration - video.duration) < Math.max(90, video.duration * 0.08);
        const resumeAt = Math.min(progress.currentTime, video.duration - 15);
        if (withinSameRuntime && resumeAt > 15 && video.duration - resumeAt > 15) {
          video.currentTime = resumeAt;
          setCurrentTime(resumeAt);
          setResumeNotice(`Picking up at ${formatTime(resumeAt)}`);
          if (resumeToastTimerRef.current) clearTimeout(resumeToastTimerRef.current);
          resumeToastTimerRef.current = setTimeout(() => setResumeNotice(""), 3000);
        }
      } catch {
        // Ignore an outdated/corrupt resume marker.
      }
    };
    const onTime = () => {
      pendingPlaybackRef.current.currentTime = video.currentTime;
      pendingPlaybackRef.current.bufferedEnd = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
      if (playbackFrameRef.current === null) {
        playbackFrameRef.current = window.requestAnimationFrame(() => {
          playbackFrameRef.current = null;
          const snapshot = pendingPlaybackRef.current;
          setCurrentTime(snapshot.currentTime);
          setBufferedEnd(snapshot.bufferedEnd);
        });
      }
      if (Date.now() - progressWriteRef.current > 5000) {
        progressWriteRef.current = Date.now();
        saveProgress();
      }
    };
    const onPlay = () => { setPlaying(true); setBuffering(false); setPreparing(false); showControls(); };
    // Bytes are arriving from the source: it is slow at worst, not dead.
    const onProgress = () => {
      if (video.buffered.length > 0) receivedAnything = true;
      if (silenceTimerRef.current && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) armSilenceWatch();
    };
    const onPause = () => {
      setPlaying(false);
      setBuffering(false);
      // The auto-hide timer is cancelled while paused: controls stay visible.
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
      setControlsVisible(true);
      saveProgress();
    };
    const onWaiting = () => {
      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = setTimeout(() => setBuffering(true), 220);
      // A mid-playback stall is watched the same way as start-up: a source
      // that stops sending for good is reported; one that is merely slow is not.
      if (!video.paused && !silenceTimerRef.current && !reconnectTimerRef.current && !waitingForConnection) armSilenceWatch();
    };
    const onCanPlay = () => {
      receivedAnything = true;
      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
      clearSilenceWatch();
      setBuffering(false);
      setPreparing(false);
      if (reconnectTimerRef.current === null && !waitingForConnection) {
        setReconnecting(false);
        if (!isHlsSource && !isDashSource) autoReconnects = 0;
      }
      if (resumeAfterReconnect) {
        resumeAfterReconnect = false;
        void video.play().catch(() => undefined);
      }
    };
    const onSeeking = () => { if (!seekingRef.current) setBuffering(true); };
    const onSeeked = () => { if (!seekingRef.current) setBuffering(false); };
    const onError = () => {
      // HLS and DASH surface their own recoverable error paths above.
      if (isHlsSource || isDashSource || isCancelled) return;
      clearSilenceWatch();
      const code = video.error?.code ?? 0;
      if (code === MediaError.MEDIA_ERR_ABORTED) return; // a load we cancelled ourselves
      if (code === MediaError.MEDIA_ERR_NETWORK) {
        // The connection to the provider dropped mid-stream: reconnect with
        // back-off from the same position rather than giving up at once.
        scheduleReconnect("source");
        return;
      }
      if (isOffline()) { awaitConnection(); return; }
      if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED && receivedAnything) {
        // Browsers report a connection lost *before* the metadata was parsed
        // under this code too. Bytes had been arriving, so give the provider a
        // couple of bounded reconnects before calling the source unplayable.
        scheduleReconnect("format", 2);
        return;
      }
      // MEDIA_ERR_DECODE / MEDIA_ERR_SRC_NOT_SUPPORTED: the provider refused the
      // request or the bytes cannot be decoded - reconnecting changes nothing.
      fail("format");
    };
    const onEnded = () => {
      setPlaying(false);
      setBuffering(false);
      setPreparing(false);
      setControlsVisible(true);
      try { window.localStorage.removeItem(resumeKey); } catch { /* storage is optional */ }
    };
    const onPipEnter = () => setPipActive(true);
    const onPipLeave = () => setPipActive(false);

    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("progress", onProgress);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onWaiting);
    video.addEventListener("loadeddata", onCanPlay);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onCanPlay);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEnded);
    video.addEventListener("enterpictureinpicture", onPipEnter);
    video.addEventListener("leavepictureinpicture", onPipLeave);

    void attachSource();
    return () => {
      isCancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
      clearSilenceWatch();
      clearReconnect();
      clearOfflineWait();
      if (playbackFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      }
      if (seekFrameRef.current !== null) {
        window.cancelAnimationFrame(seekFrameRef.current);
        seekFrameRef.current = null;
      }
      saveProgress();
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onWaiting);
      video.removeEventListener("loadeddata", onCanPlay);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onCanPlay);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("enterpictureinpicture", onPipEnter);
      video.removeEventListener("leavepictureinpicture", onPipLeave);
      if (hlsRef.current === hls) hlsRef.current = null;
      hls?.destroy();
      const dash = dashRef.current;
      dashRef.current = null;
      try { dash?.destroy?.(); } catch { try { dash?.reset?.(); } catch { /* engine already gone */ } }
      if (preconnect.isConnected) preconnect.remove();
      video.removeAttribute("src");
      video.load();
    };
  }, [isDashSource, isHlsSource, movieId, retryCount, saveProgress, showControls, src]);

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (resumeToastTimerRef.current) clearTimeout(resumeToastTimerRef.current);
    saveProgress();
  }, [saveProgress]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || locked) return;
    if (video.paused) void video.play().catch(() => setErrored(true));
    else video.pause();
    showControls();
  }, [locked, showControls]);

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || locked || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    showControls();
  }, [locked, showControls]);

  const seekToPointer = useCallback((clientX: number, rail: HTMLElement, immediate = false) => {
    const video = videoRef.current;
    if (!video || locked || !Number.isFinite(video.duration) || rail.clientWidth <= 0) return;
    const rect = rail.getBoundingClientRect();
    const nextTime = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * video.duration;
    pendingSeekRef.current = nextTime;
    const apply = () => {
      seekFrameRef.current = null;
      const value = pendingSeekRef.current;
      if (value === null) return;
      pendingSeekRef.current = null;
      video.currentTime = value;
      setCurrentTime(value);
    };
    if (immediate) {
      if (seekFrameRef.current !== null) {
        window.cancelAnimationFrame(seekFrameRef.current);
        seekFrameRef.current = null;
      }
      apply();
    } else if (seekFrameRef.current === null) {
      seekFrameRef.current = window.requestAnimationFrame(apply);
    }
    showControls();
  }, [locked, showControls]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    showControls();
  }, [showControls]);

  const setVolumeValue = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(1, value));
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
    showControls();
  }, [showControls]);

  const dispatchNativeFullscreen = useCallback((active: boolean) => {
    setNativePlayerFullscreen(active);
  }, []);

  const exitPlayerFullscreen = useCallback(async () => {
    if (fullscreenBusyRef.current) return;
    fullscreenBusyRef.current = true;
    try {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
      } catch {
        // The native shell still restores orientation and system bars below.
      }
      unlockPlayerOrientation();
      setNativeFullscreen(false);
      setIsFullscreen(false);
      dispatchNativeFullscreen(false);
      showControls();
    } finally {
      fullscreenBusyRef.current = false;
    }
  }, [dispatchNativeFullscreen, showControls]);

  const enterPlayerFullscreen = useCallback(async () => {
    const element = wrapRef.current;
    if (!element || fullscreenBusyRef.current) return;
    if (document.fullscreenElement) {
      // Watch Now may already have fullscreened the document from its click
      // handler, before this player was mounted.
      setIsFullscreen(true);
      void lockPlayerLandscape();
      return;
    }
    if (nativeFullscreen) return;
    fullscreenBusyRef.current = true;
    const nativeShell = hasNativeShell();
    if (nativeShell) {
      // Keep the WebView mounted while Android rotates and hides system bars.
      setNativeFullscreen(true);
      setIsFullscreen(true);
      dispatchNativeFullscreen(true);
      fullscreenBusyRef.current = false;
      return;
    }
    try {
      const entered = await requestBrowserImmersive(element);
      if (entered) setIsFullscreen(true);
    } finally {
      fullscreenBusyRef.current = false;
    }
  }, [dispatchNativeFullscreen, nativeFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement || nativeFullscreen) {
      await exitPlayerFullscreen();
      return;
    }
    await enterPlayerFullscreen();
    showControls();
  }, [enterPlayerFullscreen, exitPlayerFullscreen, nativeFullscreen, showControls]);

  // Browser fullscreen must be requested synchronously from Watch Now; an
  // effect runs after user activation has expired and is rejected by mobile
  // browsers. Android's native bridge does not have that browser restriction.
  useEffect(() => {
    if (!openImmersive || immersiveRequestedRef.current) return;
    immersiveRequestedRef.current = true;
    if (!hasNativeShell()) return;
    const frame = window.requestAnimationFrame(() => { void enterPlayerFullscreen(); });
    return () => window.cancelAnimationFrame(frame);
  }, [enterPlayerFullscreen, openImmersive]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const browserFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(browserFullscreen || nativeFullscreen);
      if (!browserFullscreen && !nativeFullscreen) unlockPlayerOrientation();
    };
    const onNativeExit = () => {
      setNativeFullscreen(false);
      setIsFullscreen(false);
      unlockPlayerOrientation();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
    const onExitRequest = () => { void exitPlayerFullscreen(); };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();
    window.addEventListener("cinemax:native-fullscreen-exit", onNativeExit);
    window.addEventListener("cinemax:request-exit-player-fullscreen", onExitRequest);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("cinemax:native-fullscreen-exit", onNativeExit);
      window.removeEventListener("cinemax:request-exit-player-fullscreen", onExitRequest);
    };
  }, [exitPlayerFullscreen, nativeFullscreen]);

  useEffect(() => () => {
    // Closing the overlay must restore browser/native orientation even if the route
    // changes while playback is fullscreen.
    unlockPlayerOrientation();
    dispatchNativeFullscreen(false);
  }, [dispatchNativeFullscreen]);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !("requestPictureInPicture" in video)) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch { /* Picture-in-picture is not supported by every mobile browser. */ }
    showControls();
  }, [showControls]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (locked || target?.matches("input,textarea,select,[contenteditable=true]")) return;
      if (target?.closest("button,[role=slider]") && event.key !== "Escape") return;
      if (!videoRef.current) return;
      switch (event.key) {
        case " ":
        case "k": event.preventDefault(); togglePlay(); break;
        case "ArrowLeft": event.preventDefault(); seekBy(-10); break;
        case "ArrowRight": event.preventDefault(); seekBy(10); break;
        case "ArrowUp": event.preventDefault(); setVolumeValue(volume + 0.1); break;
        case "ArrowDown": event.preventDefault(); setVolumeValue(volume - 0.1); break;
        case "m": toggleMute(); break;
        case "f": void toggleFullscreen(); break;
        case "Escape":
          if (showSettings) setShowSettings(false);
          else if (isFullscreen) void exitPlayerFullscreen();
          else onClose();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitPlayerFullscreen, isFullscreen, locked, onClose, setVolumeValue, seekBy, showSettings, toggleFullscreen, toggleMute, togglePlay, volume]);

  const setPlaybackSpeed = (value: PlaybackSpeed) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = value;
    // Display the speed the engine actually applied, not the one requested.
    const applied = video.playbackRate;
    setSpeed((SUPPORTED_SPEEDS as PlaybackSpeed[]).includes(applied as PlaybackSpeed) ? (applied as PlaybackSpeed) : 1);
    showControls();
  };

  const setQualityLevel = (level: number) => {
    const hls = hlsRef.current;
    if (!hls || (level !== -1 && !hls.levels[level])) return;
    // -1 returns hls.js to adaptive Auto. A concrete level is applied to both
    // the current and next fragment so a manual choice takes effect promptly.
    hls.currentLevel = level;
    hls.nextLevel = level;
    setQuality(level);
    showControls();
  };

  const setSubtitle = (choice: SubtitleChoice) => {
    const hls = hlsRef.current;
    if (hls) hls.subtitleTrack = choice.startsWith("hls:") ? Number(choice.slice(4)) : -1;
    const video = videoRef.current;
    if (video) {
      Array.from(video.textTracks).forEach((track) => {
        track.mode = choice === "external" && track.kind === "subtitles" ? "showing" : "disabled";
      });
    }
    setSubtitleChoice(choice);
  };

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const buffered = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;
  const hasAdaptiveQualities = isHlsSource && qualityOptions.length > 1;
  const singleQualityLabel = qualityOptions[0]?.label || sourceQuality;
  const qualityChoices = hasAdaptiveQualities ? [{ index: -1, label: "Auto", height: 0, bitrate: 0 }, ...qualityOptions] : [];

  const retry = () => {
    erroredRef.current = false;
    setErrored(false);
    setErrorKind("generic");
    setRetryCount((count) => count + 1);
  };

  if (errored) {
    return (
      <div className="video-player-shell" role="dialog" aria-modal="true" aria-label={`Playback error: ${title}`}>
        <div className="player-error">
          <span className="player-error-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></svg>
          </span>
          <h2 className="player-error-title">{ERROR_COPY[errorKind].title}</h2>
          <p className="player-error-copy">{ERROR_COPY[errorKind].copy}</p>
          <div className="player-error-actions">
            <button className="primary" type="button" onClick={retry}>Try again</button>
            <button type="button" onClick={onClose}>Back to title</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`video-player-shell${isFullscreen ? " is-fullscreen" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing ${title}`}
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      <div className="video-screen" onClick={togglePlay}>
        <video
          ref={videoRef}
          poster={poster}
          autoPlay
          playsInline
          preload="metadata"
          style={{ objectFit: fitMode, filter: `brightness(${brightness}%)` }}
          className="video-element"
          onContextMenu={(event) => event.preventDefault()}
        >
          {subtitleUrl && (
            <track
              kind="subtitles"
              src={subtitleUrl}
              srcLang={subtitleLanguageTag(subtitleLanguage)}
              label={subtitleLanguageLabel(subtitleLanguage)}
              onLoad={() => {
                const video = videoRef.current;
                if (video && subtitleChoice === "external" && video.textTracks[0]) video.textTracks[0].mode = "showing";
              }}
            />
          )}
        </video>

        {(preparing || buffering) && (
          <div className="player-buffering" role="status" aria-label={reconnecting ? (errorKind === "offline" ? "Waiting for the connection to return" : "Reconnecting to the video source") : playing ? "Buffering" : "Preparing playback"}>
            <svg className="player-buffering-ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="cinemax-buffer-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#FFFFFF" />
                  <stop offset=".5" stopColor="#B7B6C1" />
                  <stop offset="1" stopColor="#FF4FA3" />
                </linearGradient>
              </defs>
              <circle className="player-buffering-track" cx="24" cy="24" r="20" fill="none" />
              <circle className="player-buffering-arc" cx="24" cy="24" r="20" fill="none" />
            </svg>
          </div>
        )}
        {resumeNotice && <div className="player-notice" role="status">{resumeNotice}</div>}

        {locked && (
          <div style={{ position: "absolute", inset: 0, zIndex: 6, display: "grid", placeItems: "center" }} onClick={(event) => event.stopPropagation()}>
            <button className="detail-action-button" type="button" onClick={() => setLocked(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              Tap to unlock
            </button>
          </div>
        )}

        <div className={`player-center-controls${controlsVisible ? "" : " hidden"}`} onClick={(event) => event.stopPropagation()}>
          <button className="player-center-button" type="button" aria-label="Back 10 seconds" onClick={() => seekBy(-10)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11a9 9 0 1 0 2.5-6.2L3 7" /><path d="M3 3v4h4" /><text x="8.2" y="15.4" fill="currentColor" stroke="none" fontSize="6" fontWeight="800">10</text></svg>
          </button>
          <button className="player-center-button primary" type="button" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay}>
            {playing ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1.5" /><rect x="14" y="4" width="4" height="16" rx="1.5" /></svg> : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7-11-7Z" /></svg>}
          </button>
          <button className="player-center-button" type="button" aria-label="Forward 10 seconds" onClick={() => seekBy(10)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11a9 9 0 1 1-2.5-6.2L21 7" /><path d="M21 3v4h-4" /><text x="8.2" y="15.4" fill="currentColor" stroke="none" fontSize="6" fontWeight="800">10</text></svg>
          </button>
        </div>
      </div>

      <div className={`player-topbar${controlsVisible ? "" : " hidden"}`} onClick={(event) => event.stopPropagation()}>
        <div className="player-title-wrap">
          <IconButton label="Close player" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </IconButton>
          <span className="player-title">{title}</span>
        </div>
        <div className="player-control-group">
          <IconButton label={pipActive ? "Exit picture in picture" : "Picture in picture"} onClick={() => void togglePip()} pressed={pipActive}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4" width="19" height="15" rx="2.4" /><rect x="12.5" y="11" width="7" height="5" rx=".8" /></svg>
          </IconButton>
          <IconButton label={locked ? "Unlock player controls" : "Lock player controls"} onClick={() => setLocked((value) => !value)} pressed={locked}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          </IconButton>
          <IconButton label={showSettings ? "Close playback settings" : "Open playback settings"} onClick={() => setShowSettings((value) => !value)} pressed={showSettings}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.9 1.9 0 1 1-3.8 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.8 1.8 0 0 0-.9-3H3a1.9 1.9 0 1 1 0-3.8h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.8 1.8 0 0 0 3-.9V2.4a1.9 1.9 0 1 1 3.8 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.9 1.9 0 1 1 0 3.8H21a1.8 1.8 0 0 0-1.6 3Z" /></svg>
          </IconButton>
        </div>
      </div>

      <div className={`player-control-dock${controlsVisible ? "" : " hidden"}`} onClick={(event) => event.stopPropagation()}>
        <div
          className="player-progress"
          role="slider"
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration || 0)}
          aria-valuenow={Math.floor(currentTime)}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          tabIndex={0}
          onPointerDown={(event) => {
            if (locked) return;
            seekingRef.current = true;
            // Dragging the seek bar pins the controls; the hide timer restarts
            // only after the gesture ends.
            interactingRef.current = true;
            if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
            event.currentTarget.setPointerCapture?.(event.pointerId);
            seekToPointer(event.clientX, event.currentTarget);
          }}
          onPointerMove={(event) => {
            if (seekingRef.current) seekToPointer(event.clientX, event.currentTarget);
          }}
          onPointerUp={(event) => {
            if (!seekingRef.current) return;
            seekToPointer(event.clientX, event.currentTarget, true);
            seekingRef.current = false;
            interactingRef.current = false;
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
            scheduleHideControls();
          }}
          onPointerCancel={() => {
            seekingRef.current = false;
            interactingRef.current = false;
            scheduleHideControls();
          }}
          onClick={(event) => seekToPointer(event.clientX, event.currentTarget, true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") seekBy(-5);
            if (event.key === "ArrowRight") seekBy(5);
          }}
        >
          <div className="player-progress-rail">
            <span className="player-progress-buffer" style={{ width: `${buffered}%` }} />
            <span className="player-progress-fill" style={{ width: `${progress}%` }} />
            <span className="player-progress-thumb" style={{ left: `${progress}%` }} />
          </div>
        </div>

        <div className="player-bottom-row">
          <div className="player-control-group">
            <IconButton label={playing ? "Pause" : "Play"} onClick={togglePlay}>
              {playing ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1.5" /><rect x="14" y="4" width="4" height="16" rx="1.5" /></svg> : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7-11-7Z" /></svg>}
            </IconButton>
            <IconButton label="Back 10 seconds" onClick={() => seekBy(-10)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11a9 9 0 1 0 2.5-6.2L3 7" /><path d="M3 3v4h4" /><text x="8.2" y="15.4" fill="currentColor" stroke="none" fontSize="6" fontWeight="800">10</text></svg></IconButton>
            <IconButton label="Forward 10 seconds" onClick={() => seekBy(10)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11a9 9 0 1 1-2.5-6.2L21 7" /><path d="M21 3v4h-4" /><text x="8.2" y="15.4" fill="currentColor" stroke="none" fontSize="6" fontWeight="800">10</text></svg></IconButton>
            <IconButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
              {muted ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m2.5-10.5a9.5 9.5 0 0 1 0 13" /></svg>}
            </IconButton>
            <input aria-label="Volume" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
              onChange={(event) => setVolumeValue(Number(event.target.value))}
              onPointerDown={() => { interactingRef.current = true; if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; } }}
              onPointerUp={() => { interactingRef.current = false; scheduleHideControls(); }}
              style={{ width: 62, accentColor: "var(--accent)" }} />
            <span className="player-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <div className="player-control-group">
            <button className="player-setting-option" type="button" aria-label="Playback speed" onClick={() => setShowSettings((value) => !value)}>{speed}×</button>
            <IconButton label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={() => void toggleFullscreen()}>
              {isFullscreen ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>}
            </IconButton>
          </div>
        </div>
      </div>

      {showSettings && !locked && (
        <div className="player-popover" role="dialog" aria-label="Playback settings" onClick={(event) => event.stopPropagation()}>
          <span className="player-setting-label">Stream quality</span>
          {hasAdaptiveQualities ? (
            <div className="player-setting-group" role="group" aria-label="Choose stream quality">
              {qualityChoices.map((option) => (
                <button key={option.index} className="player-setting-option" type="button" aria-pressed={quality === option.index} onClick={() => setQualityLevel(option.index)}>
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="player-setting-help">{singleQualityLabel ? `Only ${singleQualityLabel} is supplied by this source.` : isHlsSource ? "This stream supplies one rendition; adaptive quality switching is unavailable." : "Only the available source rendition can be used."}</p>
          )}

          <span className="player-setting-label">Subtitles</span>
          {subtitleOptions.length > 0 ? (
            <div className="player-setting-group" role="group" aria-label="Choose subtitles">
              <button className="player-setting-option" type="button" aria-pressed={subtitleChoice === "off"} onClick={() => setSubtitle("off")}>Off</button>
              {subtitleOptions.map((option) => (
                <button key={option.value} className="player-setting-option" type="button" aria-pressed={subtitleChoice === option.value} onClick={() => setSubtitle(option.value)}>{option.label}</button>
              ))}
            </div>
          ) : <p style={{ margin: "-2px 0 17px", color: "rgba(255,255,255,.38)", fontSize: 9 }}>No subtitle tracks were supplied for this title.</p>}

          <span className="player-setting-label">Playback speed</span>
          <div className="player-setting-group">
            {(SUPPORTED_SPEEDS as PlaybackSpeed[]).map((value) => (
              <button key={value} className="player-setting-option" type="button" aria-pressed={speed === value} onClick={() => setPlaybackSpeed(value)}>{value}×</button>
            ))}
          </div>

          <span className="player-setting-label">Picture</span>
          <div className="player-setting-group">
            {([{ value: "contain", label: "Fit" }, { value: "cover", label: "Fill" }, { value: "fill", label: "Stretch" }] as { value: FitMode; label: string }[]).map((option) => (
              <button key={option.value} className="player-setting-option" type="button" aria-pressed={fitMode === option.value} onClick={() => setFitMode(option.value)}>{option.label}</button>
            ))}
          </div>

          <span className="player-setting-label">Brightness · {brightness}%</span>
          <input aria-label="Screen brightness" type="range" min={40} max={140} value={brightness} onChange={(event) => setBrightness(Number(event.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />
        </div>
      )}
    </div>
  );
}
