"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Playlist, Track } from "@/lib/miley-types";
import { uploadImage } from "@/lib/upload-image";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";
import TrackList, { Artwork } from "./TrackList";
import EmptyState from "./EmptyState";
import CollectionTrackPicker from "./CollectionTrackPicker";

type PlaylistData = Playlist & { ownerUsername?: string };
export default function PlaylistDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { user, playQueue, showNotice } = useMusic();
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", visibility: "private", artworkUrl: "" });
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await fetch(`/api/music/playlists/${id}`, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Playlist not found."); setPlaylist(result.playlist); setTracks(result.tracks || []); setEditForm({ title: result.playlist.title, description: result.playlist.description || "", visibility: result.playlist.visibility, artworkUrl: result.playlist.artworkUrl || "" }); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Playlist could not be loaded."); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <main className="miley-page" id="main-content"><div className="loading-skeleton" style={{ height: 320 }} /></main>;
  if (!playlist) return <main className="miley-page" id="main-content"><EmptyState title="Playlist unavailable" description={error || "This playlist could not be found."} icon="playlist" action={<Link className="secondary-button" href="/explore">Explore music</Link>} /></main>;
  const isOwner = user?.id === playlist.ownerId;

  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { const artworkUrl = artFile ? await uploadImage(artFile, "artwork") : editForm.artworkUrl; const response = await fetch(`/api/music/playlists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editForm, artworkUrl }) }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Playlist could not be saved."); setEditOpen(false); setArtFile(null); await load(); showNotice("Playlist saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Playlist could not be saved."); }
    finally { setBusy(false); }
  };
  const deletePlaylist = async () => {
    if (!window.confirm(`Delete playlist “${playlist.title}”? The tracks will remain in your library.`)) return;
    setBusy(true);
    try { const response = await fetch(`/api/music/playlists/${id}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Playlist could not be deleted."); router.push("/library?tab=playlists"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Playlist could not be deleted."); setBusy(false); }
  };
  const removeTrack = async (track: Track) => {
    if (!window.confirm(`Remove “${track.title}” from this playlist? The song will remain in your library.`)) return;
    const response = await fetch(`/api/music/playlists/${id}/tracks`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: track.id }) }); const result = await response.json(); if (!response.ok) { setError(result?.error || "Track could not be removed."); return; } await load();
  };
  const moveTrack = async (index: number, offset: number) => {
    const nextIndex = index + offset; if (nextIndex < 0 || nextIndex >= tracks.length) return;
    const reordered = [...tracks]; [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]]; setTracks(reordered); setBusy(true);
    try { const response = await fetch(`/api/music/playlists/${id}/tracks`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackIds: reordered.map((track) => track.id) }) }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Track order could not be saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Track order could not be saved."); await load(); }
    finally { setBusy(false); }
  };
  const share = async () => { try { await navigator.clipboard.writeText(window.location.href); showNotice("Playlist link copied."); } catch { showNotice("Copy this page's URL to share the playlist."); } };

  return <main className="miley-page collection-detail-page" id="main-content" tabIndex={-1}>{error && <div className="status-banner is-error" role="alert"><MusicIcon name="shield" /><div><strong>Playlist</strong><p>{error}</p></div></div>}
    <section className="collection-hero"><Artwork src={playlist.artworkUrl} title={playlist.title} className="collection-artwork" /><div className="collection-hero-copy"><span className="page-eyebrow">{playlist.visibility === "public" ? "Public playlist" : "Private playlist"}</span><h1>{playlist.title}</h1><p>{playlist.ownerUsername ? <>Curated by <Link href={`/profile/${encodeURIComponent(playlist.ownerUsername)}`}>@{playlist.ownerUsername}</Link></> : "Your MiLey collection"}</p><p>{playlist.description || "No description yet."}</p><div className="channel-meta-chips"><span>{tracks.length} {tracks.length === 1 ? "track" : "tracks"}</span><span>{playlist.visibility === "public" ? "Anyone can listen" : "Only you can view"}</span></div><div className="collection-actions"><button type="button" className="primary-button" disabled={!tracks.length} onClick={() => void playQueue(tracks)}><MusicIcon name="play" /> Play playlist</button><button type="button" className="secondary-button" onClick={() => void share()}><MusicIcon name="globe" /> Copy link</button>{isOwner && <><button type="button" className="secondary-button" onClick={() => setAddOpen(true)}><MusicIcon name="plus" /> Add tracks</button><button type="button" className="quiet-button" onClick={() => setEditOpen(true)}><MusicIcon name="edit" /> Edit</button><button type="button" className="quiet-button is-danger-text" onClick={() => void deletePlaylist()}>Delete playlist</button></>}</div></div></section>
    <section className="section-block"><div className="section-heading"><div><h2>Tracklist</h2><p>{isOwner ? "Reorder or remove tracks without deleting them from your library." : "Only playable public tracks are shown."}</p></div></div>{tracks.length ? <><TrackList tracks={tracks} /><div className="collection-manage-list">{isOwner && tracks.map((track, index) => <div className="collection-manage-row" key={track.id}><span>{String(index+1).padStart(2,"0")}</span><strong>{track.title}</strong><div><button className="track-icon" type="button" disabled={busy || index === 0} onClick={() => void moveTrack(index,-1)} aria-label={`Move ${track.title} up`}><MusicIcon name="chevron" className="rotate-up" /></button><button className="track-icon" type="button" disabled={busy || index === tracks.length-1} onClick={() => void moveTrack(index,1)} aria-label={`Move ${track.title} down`}><MusicIcon name="chevron" className="rotate-down" /></button><button className="track-icon is-danger" type="button" onClick={() => void removeTrack(track)} aria-label={`Remove ${track.title} from playlist`}><MusicIcon name="trash" /></button></div></div>)}</div></> : <EmptyState title="This playlist is empty" description={isOwner ? "Add tracks from your library or public catalog releases." : "There are no playable tracks in this public playlist."} icon="playlist" action={isOwner ? <button type="button" className="secondary-button" onClick={() => setAddOpen(true)}>Add tracks</button> : undefined} />}</section>
    {addOpen && <CollectionTrackPicker kind="playlist" collectionId={playlist.id} existingIds={tracks.map((track) => track.id)} onClose={() => setAddOpen(false)} onAdded={() => void load()} />}
    {editOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-playlist-title"><div className="modal-heading"><div><span className="eyebrow">Your collection</span><h2 id="edit-playlist-title">Edit playlist</h2></div><button type="button" className="icon-button" onClick={() => setEditOpen(false)} aria-label="Close"><MusicIcon name="close" /></button></div><form className="auth-form" onSubmit={save}><div><label className="form-label" htmlFor="playlist-edit-title">Name</label><input id="playlist-edit-title" className="form-input" maxLength={120} value={editForm.title} onChange={(event) => setEditForm((previous) => ({ ...previous, title: event.target.value }))} required /></div><div><label className="form-label" htmlFor="playlist-edit-description">Description</label><textarea id="playlist-edit-description" className="form-textarea" maxLength={1000} value={editForm.description} onChange={(event) => setEditForm((previous) => ({ ...previous, description: event.target.value }))} /></div><div className="form-grid"><div><label className="form-label" htmlFor="playlist-edit-visibility">Visibility</label><select id="playlist-edit-visibility" className="form-select" value={editForm.visibility} onChange={(event) => setEditForm((previous) => ({ ...previous, visibility: event.target.value }))}><option value="private">Private</option><option value="public">Public</option></select></div><div><label className="form-label" htmlFor="playlist-edit-artwork">New artwork · optional</label><input id="playlist-edit-artwork" className="form-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setArtFile(event.target.files?.[0] || null)} /></div></div><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save playlist"}</button></form></section></div>}
  </main>;
}
