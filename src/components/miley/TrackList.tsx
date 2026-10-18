"use client";

import RemoteImage from "./RemoteImage";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Track } from "@/lib/miley-types";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function Cover({ src, small = false }: { src?: string; small?: boolean }) {
  const [failedSrc, setFailedSrc] = useState("");
  const failed = Boolean(src && failedSrc === src);
  return <span className={`track-cover ${small ? "is-small" : ""}`}>
    {src && !failed ? <RemoteImage src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} /> : <MusicIcon name="music" />}
  </span>;
}

function PlaylistPicker({ track, onClose }: { track: Track; onClose: () => void }) {
  const { showNotice } = useMusic();
  const [items, setItems] = useState<Array<{ id: number; title: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/music/playlists", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Sign in to manage playlists.");
      if (alive) setItems(data.items || []);
    }).catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "Could not load playlists."); });
    return () => { alive = false; };
  }, []);
  const add = async (playlistId: number) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/music/playlists/${playlistId}/tracks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: track.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not add track.");
      showNotice("Added to playlist."); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add track."); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card playlist-picker" role="dialog" aria-modal="true" aria-labelledby="playlist-picker-title">
      <div className="modal-heading"><div><span className="eyebrow">Your collection</span><h2 id="playlist-picker-title">Add to a playlist</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><MusicIcon name="close" /></button></div>
      <p className="muted-line">{track.title} · {track.artist}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="playlist-picker-list">
        {items.map((item) => <button key={item.id} type="button" disabled={busy} onClick={() => void add(item.id)}><MusicIcon name="playlist" /><span>{item.title}</span><MusicIcon name="plus" /></button>)}
        {!items.length && !error && <p className="empty-copy">You have no playlists yet. Create one in Your Library.</p>}
      </div>
    </section>
  </div>;
}

export default function TrackList({ tracks, canManage = false, onDelete, onEdit }: { tracks: Track[]; canManage?: boolean; onDelete?: (track: Track) => void; onEdit?: (track: Track) => void }) {
  const { track: current, isPlaying, play, togglePlayback, favoriteIds, toggleFavorite } = useMusic();
  const [picker, setPicker] = useState<Track | null>(null);
  const queue = tracks;
  if (!tracks.length) return null;
  return <>
    <div className="track-list" role="list">
      {tracks.map((item, index) => {
        const active = current?.id === item.id;
        return <article className={`track-row ${active ? "is-current" : ""}`} role="listitem" key={item.id}>
          <div className="track-main">
            <button type="button" className="track-art-button" onClick={() => active ? void togglePlayback() : void play(item, queue)} aria-label={`${active && isPlaying ? "Pause" : "Play"} ${item.title} by ${item.artist}`}>
              <span className="track-row-index">{active && isPlaying ? <span className="mini-eq" aria-hidden="true"><i /><i /><i /></span> : <span>{String(index + 1).padStart(2, "0")}</span>}</span>
              <Cover src={item.artworkUrl} />
            </button>
            <span className="track-meta"><button type="button" className="track-title-button" onClick={() => active ? void togglePlayback() : void play(item, queue)}>{item.title}</button><span>{item.artist}{item.channelHandle ? <> · <Link href={`/channel/${encodeURIComponent(item.channelHandle)}`}>@{item.channelHandle}</Link></> : null}</span></span>
            {item.genre && <span className="track-genre">{item.genre}</span>}
            <span className="track-duration">{formatDuration(item.durationSeconds)}</span>
          </div>
          <div className="track-actions">
            <button type="button" className={`track-icon ${favoriteIds.has(item.id) ? "is-liked" : ""}`} aria-label={favoriteIds.has(item.id) ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`} aria-pressed={favoriteIds.has(item.id)} onClick={() => void toggleFavorite(item)}><MusicIcon name={favoriteIds.has(item.id) ? "heart-fill" : "heart"} /></button>
            <button type="button" className="track-icon" aria-label={`Add ${item.title} to playlist`} onClick={() => setPicker(item)}><MusicIcon name="plus" /></button>
            {canManage && onEdit && <button type="button" className="track-icon" aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}><MusicIcon name="edit" /></button>}
            {canManage && onDelete && <button type="button" className="track-icon is-danger" aria-label={`Delete ${item.title}`} onClick={() => onDelete(item)}><MusicIcon name="trash" /></button>}
          </div>
        </article>;
      })}
    </div>
    {picker && <PlaylistPicker track={picker} onClose={() => setPicker(null)} />}
  </>;
}

export function Artwork({ src, title, className = "" }: { src?: string; title: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState("");
  const failed = Boolean(src && failedSrc === src);
  return <div className={`miley-artwork ${className}`}>
    {src && !failed ? <RemoteImage src={src} alt={`${title} cover art`} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} /> : <div className="artwork-fallback" aria-label={`${title} artwork unavailable`}><MusicIcon name="disc" /><span>MiLey</span></div>}
  </div>;
}
