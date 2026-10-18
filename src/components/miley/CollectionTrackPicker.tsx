"use client";

import { useEffect, useState } from "react";
import type { Track } from "@/lib/miley-types";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";
import { Artwork } from "./TrackList";

export default function CollectionTrackPicker({ kind, collectionId, existingIds, onClose, onAdded }: { kind: "album" | "playlist"; collectionId: number; existingIds: number[]; onClose: () => void; onAdded: () => void }) {
  const { user, library } = useMusic();
  const [catalog, setCatalog] = useState<Track[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/music/tracks?limit=100", { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || "The public catalog is unavailable."); if (alive) setCatalog(data.items || []); }).catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "Tracks could not be loaded."); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  const own = library?.tracks || [];
  const tracks = [...new Map([...own, ...catalog].map((track) => [track.id, track])).values()].filter((track) => !existingIds.includes(track.id));
  const toggle = (id: number) => setSelected((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  const addTracks = async () => {
    setBusy(true); setError("");
    try { const response = await fetch(`/api/music/${kind}s/${collectionId}/tracks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackIds: selected }) }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Tracks could not be added."); onAdded(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Tracks could not be added."); }
    finally { setBusy(false); }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card collection-picker" role="dialog" aria-modal="true" aria-labelledby="add-tracks-title"><div className="modal-heading"><div><span className="eyebrow">Your music & public releases</span><h2 id="add-tracks-title">Add tracks</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={onClose}><MusicIcon name="close" /></button></div><p className="muted-line">Choose tracks you own or public, rights-confirmed releases available on MiLey.</p>
    {error && <p className="form-error" role="alert">{error}</p>}{loading ? <div className="loading-skeleton" style={{ height: 120 }} /> : !tracks.length ? <p className="empty-copy">There are no additional tracks available to add.</p> : <div className="collection-picker-list">{tracks.map((track) => <label className="collection-picker-row" key={track.id}><input type="checkbox" checked={selected.includes(track.id)} onChange={() => toggle(track.id)} /><Artwork src={track.artworkUrl} title={track.title} /><span><strong>{track.title}</strong><small>{track.artist}{track.visibility === "private" ? " · private upload" : " · public release"}</small></span></label>)}</div>}
    {user?.emailVerified && <button className="primary-button" type="button" disabled={busy || !selected.length} onClick={() => void addTracks()}>{busy ? "Adding…" : `Add ${selected.length || "selected"} ${selected.length === 1 ? "track" : "tracks"}`}<MusicIcon name="plus" /></button>}
  </section></div>;
}
