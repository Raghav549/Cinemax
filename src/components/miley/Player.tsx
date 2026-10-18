"use client";

import { useEffect, useState } from "react";
import MusicIcon from "./Icon";
import { Artwork, default as TrackList } from "./TrackList";
import { useMusic } from "./MusicProvider";

function stamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export function MiniPlayer() {
  const { track, isPlaying, isLoadingTrack, currentTime, duration, togglePlayback, next, setExpanded, seek, playError } = useMusic();
  if (!track) return null;
  const total = duration || track.durationSeconds || 0;
  return <div className="mini-player" role="region" aria-label={`Now playing ${track.title}`}>
    <div className="mini-player-progress" aria-hidden="true"><span style={{ width: `${total ? Math.min(100, currentTime / total * 100) : 0}%` }} /></div>
    <button className="mini-player-open" type="button" onClick={() => setExpanded(true)} aria-label={`Open player for ${track.title}`}>
      <Artwork src={track.artworkUrl} title={track.title} className="mini-player-art" />
      <span className="mini-player-copy"><strong>{track.title}</strong><span>{track.artist}</span></span>
    </button>
    <button type="button" className="mini-player-control" onClick={() => void togglePlayback()} aria-label={isPlaying ? "Pause" : "Play"} disabled={isLoadingTrack}>
      <MusicIcon name={isLoadingTrack ? "pause-circle" : isPlaying ? "pause" : "play"} />
    </button>
    <button type="button" className="mini-player-control mini-next" onClick={() => void next()} aria-label="Next track"><MusicIcon name="next" /></button>
    <input className="mini-player-seek" type="range" min={0} max={Math.max(1, total)} step="1" value={Math.min(currentTime, total || 0)} onChange={(event) => seek(Number(event.target.value))} aria-label="Seek in current track" />
    {playError && <span className="sr-only" role="status">{playError}</span>}
  </div>;
}

export function FullPlayer() {
  const { track, queue, currentIndex, isPlaying, isLoadingTrack, currentTime, duration, volume, speed, repeatMode, shuffle, sleepTimerMinutes, expanded, setExpanded, togglePlayback, next, previous, seek, setVolume, setSpeed, cycleRepeat, toggleShuffle, setSleepTimer, toggleFavorite, favoriteIds, playQueue, stop, playError, showNotice } = useMusic();
  const [panel, setPanel] = useState<"player" | "queue" | "lyrics">("player");
  useEffect(() => { if (!expanded) setPanel("player"); }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
      if (event.key === "ArrowRight" && !event.target?.toString().includes("HTMLInputElement")) void next();
      if (event.key === "ArrowLeft" && !event.target?.toString().includes("HTMLInputElement")) void previous();
      if (event.key === " ") { const target = event.target as HTMLElement; if (!target.closest("button, input, textarea, select")) { event.preventDefault(); void togglePlayback(); } }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, next, previous, setExpanded, togglePlayback]);
  if (!expanded || !track) return null;
  const total = duration || track.durationSeconds || 0;
  const liked = favoriteIds.has(track.id);
  return <div className="player-overlay" role="dialog" aria-modal="true" aria-label={`Now playing ${track.title}`}>
    <div className="player-overlay-glow" aria-hidden="true" />
    <header className="player-topbar">
      <button type="button" className="player-top-action" aria-label="Close player" onClick={() => setExpanded(false)}><MusicIcon name="close" /></button>
      <div className="player-top-title"><span>NOW PLAYING</span><strong>{panel === "queue" ? "Your queue" : panel === "lyrics" ? "Lyrics" : "MiLey"}</strong></div>
      <button type="button" className={`player-top-action ${panel === "queue" ? "is-active" : ""}`} aria-label="Open queue" onClick={() => setPanel(panel === "queue" ? "player" : "queue")}><MusicIcon name="queue" /></button>
    </header>
    {panel === "queue" ? <section className="player-queue-panel"><div className="panel-heading"><div><span className="eyebrow">Up next</span><h2>Queue <span>{queue.length}</span></h2></div><button type="button" className="text-button" onClick={stop}>Clear queue</button></div><TrackList tracks={queue} /></section> : panel === "lyrics" ? <section className="player-lyrics"><span className="eyebrow">Words to the music</span><h2>{track.title}</h2>{track.lyrics?.trim() ? <pre>{track.lyrics}</pre> : <p>Lyrics have not been added for this track.</p>}</section> : <div className="player-content">
      <div className={`player-art-stage ${isPlaying ? "is-playing" : ""}`}><Artwork src={track.artworkUrl} title={track.title} className="player-artwork" /><span className="player-art-ring ring-a" /><span className="player-art-ring ring-b" /><span className="player-art-orbit"><i /></span></div>
      <div className="player-details"><div className="player-details-copy"><span className="eyebrow">{track.channelName || "MiLey library"}</span><h1>{track.title}</h1><p>{track.artist}</p></div><button type="button" className={`player-like ${liked ? "is-liked" : ""}`} aria-label={liked ? "Remove from favorites" : "Add to favorites"} aria-pressed={liked} onClick={() => void toggleFavorite(track)}><MusicIcon name={liked ? "heart-fill" : "heart"} /></button></div>
      <div className="player-timeline"><input type="range" min={0} max={Math.max(1, total)} step="1" value={Math.min(currentTime, total || 0)} onChange={(event) => seek(Number(event.target.value))} aria-label="Playback position" /><div><span>{stamp(currentTime)}</span><span>{total ? `−${stamp(Math.max(0, total - currentTime))}` : "—:—"}</span></div></div>
      {playError && <p className="player-error" role="status">{playError}</p>}
      <div className="player-controls"><button type="button" className={`player-control-soft ${shuffle ? "is-active" : ""}`} aria-label={`Shuffle ${shuffle ? "on" : "off"}`} aria-pressed={shuffle} onClick={toggleShuffle}><MusicIcon name="shuffle" /></button><button type="button" className="player-control" aria-label="Previous track" onClick={() => void previous()}><MusicIcon name="previous" /></button><button type="button" className="player-play" aria-label={isPlaying ? "Pause" : "Play"} onClick={() => void togglePlayback()} disabled={isLoadingTrack}>{isLoadingTrack ? <span className="loader-dot" /> : <MusicIcon name={isPlaying ? "pause" : "play"} />}</button><button type="button" className="player-control" aria-label="Next track" onClick={() => void next()}><MusicIcon name="next" /></button><button type="button" className={`player-control-soft ${repeatMode !== "off" ? "is-active" : ""}`} aria-label={`Repeat ${repeatMode}`} aria-pressed={repeatMode !== "off"} onClick={cycleRepeat}><MusicIcon name={repeatMode === "one" ? "repeat-one" : "repeat"} /></button></div>
      <div className="player-secondary-controls"><div className="player-volume"><MusicIcon name="volume" /><input type="range" min={0} max={1} step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Playback volume" /></div><label className="player-speed">Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><label className="player-sleep">Sleep<select value={sleepTimerMinutes} onChange={(event) => { const minutes = Number(event.target.value); setSleepTimer(minutes); if (minutes) showNotice(`Sleep timer set for ${minutes} minutes.`); }}><option value="0">Off</option><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option><option value="90">90 min</option></select></label></div>
      <div className="player-footer-actions"><button type="button" className="text-button" onClick={() => setPanel("lyrics")}>Lyrics</button><span>{currentIndex >= 0 ? `${currentIndex + 1} of ${queue.length}` : "Ready to listen"}</span><button type="button" className="text-button" onClick={() => setPanel("queue")}>Queue</button></div>
    </div>}
  </div>;
}
