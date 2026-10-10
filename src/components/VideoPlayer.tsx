"use client";
import { useRef, useState, useEffect, useCallback } from "react";

interface VideoPlayerProps {
  src: string;
  title: string;
  poster?: string;
  onClose: () => void;
}

type FitMode = "contain" | "cover" | "fill";
type PlaybackSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

function formatTime(s: number): string {
  if (!s || isNaN(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function VideoPlayer({ src, title, poster, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [pipActive, setPipActive] = useState(false);
  const [errored, setErrored] = useState(false);

  /* ── show controls then auto-hide ── */
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, 3500);
  }, []);

  /* Controls start visible (initial state); just schedule the first auto-hide. */
  useEffect(() => {
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, 3500);
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  /* ── video element event listeners ── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay  = () => { setPlaying(true);  showControls(); };
    const onPause = () => { setPlaying(false); setControlsVisible(true); };
    const onTime  = () => {
      setCurrentTime(v.currentTime);
      if (v.buffered.length > 0) setBufferedEnd(v.buffered.end(v.buffered.length - 1));
    };
    const onMeta  = () => setDuration(v.duration || 0);
    const onEnd   = () => { setPlaying(false); setControlsVisible(true); };
    const onErr   = () => setErrored(true);
    const onPipEnter = () => setPipActive(true);
    const onPipLeave = () => setPipActive(false);

    v.addEventListener("play",           onPlay);
    v.addEventListener("pause",          onPause);
    v.addEventListener("timeupdate",     onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("ended",          onEnd);
    v.addEventListener("error",          onErr);
    v.addEventListener("enterpictureinpicture",  onPipEnter);
    v.addEventListener("leavepictureinpicture",  onPipLeave);

    return () => {
      v.removeEventListener("play",           onPlay);
      v.removeEventListener("pause",          onPause);
      v.removeEventListener("timeupdate",     onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("ended",          onEnd);
      v.removeEventListener("error",          onErr);
      v.removeEventListener("enterpictureinpicture",  onPipEnter);
      v.removeEventListener("leavepictureinpicture",  onPipLeave);
    };
  }, [showControls]);

  /* ── fullscreen change listener ── */
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /* ── actions ── */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || locked) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
    showControls();
  }, [locked, showControls]);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* ignore */ }
    showControls();
  }, [showControls]);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch { /* not supported */ }
    showControls();
  }, [showControls]);

  const skip = useCallback((sec: number) => {
    const v = videoRef.current;
    if (!v || locked) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + sec));
    showControls();
  }, [locked, showControls]);

  const setVolumeValue = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(1, val));
    v.volume = clamped;
    v.muted = clamped === 0;
    setVolume(clamped);
    setMuted(clamped === 0);
    showControls();
  }, [showControls]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    showControls();
  }, [showControls]);

  const setPlaybackSpeed = useCallback((s: PlaybackSpeed) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = s;
    setSpeed(s);
    setShowSettings(false);
    showControls();
  }, [showControls]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * (v.duration || 0);
    showControls();
  }, [locked, showControls]);

  const handleProgressMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoveredTime(ratio * (duration || 0));
  }, [duration]);

  /* ── keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (locked) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft":   e.preventDefault(); skip(-10); break;
        case "ArrowRight":  e.preventDefault(); skip(10); break;
        case "ArrowUp":     e.preventDefault(); setVolumeValue(volume + 0.1); break;
        case "ArrowDown":   e.preventDefault(); setVolumeValue(volume - 0.1); break;
        case "m":           toggleMute(); break;
        case "f":           toggleFullscreen(); break;
        case "Escape":      if (showSettings) setShowSettings(false); else onClose(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [locked, showSettings, volume, togglePlay, skip, setVolumeValue, toggleMute, toggleFullscreen, onClose]);

  /* ── derived values ── */
  const progressPct  = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct  = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  const btnBase: React.CSSProperties = {
    background: "none", border: "none", color: "#fff",
    cursor: "pointer", padding: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8, flexShrink: 0,
  };

  /* ── error state ── */
  if (errored) return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>Could not load video</p>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>The video URL may be invalid or unavailable.</p>
      <button onClick={onClose} style={{ marginTop: 8, padding: "12px 28px", borderRadius: 14, background: "#fff", color: "#000", fontWeight: 800, fontSize: 12, border: "none", cursor: "pointer" }}>Go Back</button>
    </div>
  );

  /* ── render ── */
  return (
    <div
      ref={wrapRef}
      onMouseMove={showControls}
      onTouchStart={showControls}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#000", display: "flex", flexDirection: "column", userSelect: "none" }}
    >
      {/* ── VIDEO ── */}
      <div
        onClick={togglePlay}
        style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer" }}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          autoPlay
          playsInline
          style={{ width: "100%", height: "100%", objectFit: fitMode, background: "#000", filter: `brightness(${brightness}%)`, display: "block" }}
        />

        {/* Locked overlay */}
        {locked && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <button
              onClick={() => setLocked(false)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderRadius: 20, background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Tap to Unlock
            </button>
          </div>
        )}

        {/* Center skip buttons — only when controls visible and not locked */}
        {controlsVisible && !locked && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 52, pointerEvents: "none" }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); skip(-10); }}
              style={{ ...btnBase, pointerEvents: "auto", width: 52, height: 52, borderRadius: "50%", background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
                <path d="M12.5 3a9 9 0 1 0 9 9" strokeWidth="0"/>
                <path d="M2 3v5h5" fill="white"/>
                <path d="M2 8 C2 4.5 4.5 2 8 2" fill="none" stroke="white" strokeWidth="2"/>
                <text x="12" y="15.5" textAnchor="middle" fontSize="6" fontWeight="bold" fill="white" fontFamily="system-ui">10</text>
              </svg>
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              style={{ ...btnBase, pointerEvents: "auto", width: 68, height: 68, borderRadius: "50%", background: "rgba(255,255,255,0.18)", border: "2px solid rgba(255,255,255,0.4)" }}
            >
              {playing
                ? <svg width="30" height="30" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>
                : <svg width="30" height="30" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
              }
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); skip(10); }}
              style={{ ...btnBase, pointerEvents: "auto", width: 52, height: 52, borderRadius: "50%", background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
                <path d="M11.5 3a9 9 0 1 1-9 9" strokeWidth="0"/>
                <path d="M22 3v5h-5" fill="white"/>
                <path d="M22 8 C22 4.5 19.5 2 16 2" fill="none" stroke="white" strokeWidth="2"/>
                <text x="12" y="15.5" textAnchor="middle" fontSize="6" fontWeight="bold" fill="white" fontFamily="system-ui">10</text>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ── CONTROLS BAR ── */}
      {controlsVisible && !locked && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
        >
          {/* Top bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)", pointerEvents: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
              <button onClick={onClose} style={btnBase}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button onClick={togglePip} title="Picture in Picture" style={{ ...btnBase, color: pipActive ? "#fbbf24" : "#fff" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="12" y="9" width="8" height="6" rx="1"/></svg>
              </button>
              <button onClick={() => setLocked(true)} title="Lock screen" style={btnBase}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </button>
              <button onClick={() => setShowSettings(!showSettings)} title="Settings" style={{ ...btnBase, background: showSettings ? "rgba(255,255,255,0.15)" : "none", borderRadius: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
            </div>
          </div>

          {/* Bottom controls */}
          <div style={{ padding: "0 12px 16px", background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)", pointerEvents: "auto" }}>
            {/* Seek bar */}
            <div
              onClick={handleProgressClick}
              onMouseMove={handleProgressMove}
              onMouseLeave={() => setHoveredTime(null)}
              style={{ height: 32, display: "flex", alignItems: "center", cursor: "pointer", position: "relative" }}
            >
              <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${bufferedPct}%`, borderRadius: 2, background: "rgba(255,255,255,0.25)" }} />
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${progressPct}%`, borderRadius: 2, background: "#fff" }} />
                <div style={{ position: "absolute", top: "50%", left: `${progressPct}%`, transform: "translate(-50%,-50%)", width: 14, height: 14, borderRadius: "50%", background: "#fff", boxShadow: "0 0 8px rgba(0,0,0,0.6)", transition: "transform 0.1s" }} />
              </div>
              {hoveredTime !== null && duration > 0 && (
                <div style={{ position: "absolute", bottom: 28, left: `${(hoveredTime / duration) * 100}%`, transform: "translateX(-50%)", background: "rgba(0,0,0,0.85)", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, pointerEvents: "none", whiteSpace: "nowrap", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {formatTime(hoveredTime)}
                </div>
              )}
            </div>

            {/* Buttons row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
              {/* Left group */}
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button onClick={togglePlay} style={btnBase}>
                  {playing
                    ? <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>
                    : <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                  }
                </button>
                <button onClick={() => skip(-10)} style={btnBase}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5"/></svg>
                </button>
                <button onClick={() => skip(10)} style={btnBase}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 20 9"/></svg>
                </button>
                <button onClick={toggleMute} style={btnBase}>
                  {muted
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  }
                </button>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => setVolumeValue(parseFloat(e.target.value))}
                  style={{ width: 56, accentColor: "#fff", cursor: "pointer" }}
                />
                <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginLeft: 4, whiteSpace: "nowrap" }}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Right group */}
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button
                  onClick={() => { setShowSettings(!showSettings); }}
                  style={{ ...btnBase, fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 6, background: speed !== 1 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)" }}
                >
                  {speed}x
                </button>
                <button onClick={toggleFullscreen} style={btnBase}>
                  {isFullscreen
                    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SETTINGS PANEL ── */}
      {showSettings && !locked && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", right: 12, top: 56, width: 220, background: "rgba(12,12,12,0.97)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 18, zIndex: 10000, backdropFilter: "blur(24px)" }}
        >
          <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>Playback Speed</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            {([0.5, 0.75, 1, 1.25, 1.5, 2] as PlaybackSpeed[]).map((s) => (
              <button key={s} onClick={() => setPlaybackSpeed(s)} style={{ padding: "7px 12px", borderRadius: 9, fontSize: 12, fontWeight: 800, border: "none", cursor: "pointer", background: speed === s ? "#fff" : "rgba(255,255,255,0.07)", color: speed === s ? "#000" : "rgba(255,255,255,0.55)" }}>
                {s}x
              </button>
            ))}
          </div>

          <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>Zoom Mode</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            {([{ v: "contain", l: "Fit" }, { v: "cover", l: "Fill" }, { v: "fill", l: "Stretch" }] as { v: FitMode; l: string }[]).map((f) => (
              <button key={f.v} onClick={() => { setFitMode(f.v); setShowSettings(false); showControls(); }} style={{ flex: 1, padding: "8px 0", borderRadius: 9, fontSize: 11, fontWeight: 800, border: "none", cursor: "pointer", background: fitMode === f.v ? "#fff" : "rgba(255,255,255,0.07)", color: fitMode === f.v ? "#000" : "rgba(255,255,255,0.55)" }}>
                {f.l}
              </button>
            ))}
          </div>

          <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>Brightness</p>
          <input type="range" min={30} max={150} value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#fff" }} />
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 6, fontWeight: 600 }}>{brightness}%</p>
        </div>
      )}
    </div>
  );
}
