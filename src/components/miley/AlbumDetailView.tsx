"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Album, Track } from "@/lib/miley-types";
import { uploadImage } from "@/lib/upload-image";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";
import TrackList, { Artwork } from "./TrackList";
import EmptyState from "./EmptyState";
import CollectionTrackPicker from "./CollectionTrackPicker";

type AlbumData = Album & { channelName: string; channelHandle: string };
export default function AlbumDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { user, playQueue, showNotice } = useMusic();
  const [album, setAlbum] = useState<AlbumData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", genre: "", language: "", releaseDate: "", visibility: "private", artworkUrl: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await fetch(`/api/music/albums/${id}`, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Album not found."); setAlbum(result.album); setTracks(result.tracks || []); setEditForm({ title: result.album.title, description: result.album.description || "", genre: result.album.genre || "", language: result.album.language || "", releaseDate: result.album.releaseDate || "", visibility: result.album.visibility, artworkUrl: result.album.artworkUrl || "" }); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Album could not be loaded."); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <main className="miley-page" id="main-content"><div className="loading-skeleton" style={{ height: 320 }} /></main>;
  if (!album) return <main className="miley-page" id="main-content"><EmptyState title="Album unavailable" description={error || "This album could not be found."} icon="album" action={<Link className="secondary-button" href="/explore">Explore music</Link>} /></main>;
  const isOwner = user?.id === album.ownerId;

  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { const artworkUrl = artFile ? await uploadImage(artFile, "artwork") : editForm.artworkUrl; const response = await fetch(`/api/music/albums/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editForm, artworkUrl }) }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Album could not be saved."); setEditOpen(false); setArtFile(null); await load(); showNotice("Album details saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Album could not be saved."); }
    finally { setBusy(false); }
  };
  const removeAlbum = async () => {
    if (!window.confirm(`Delete album “${album.title}”? Its tracks will remain in your library.`)) return;
    setBusy(true);
    try { const response = await fetch(`/api/music/albums/${id}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Album could not be deleted."); router.push("/library?tab=albums"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Album could not be deleted."); setBusy(false); }
  };
  const removeTrack = async (track: Track) => {
    if (!window.confirm(`Remove “${track.title}” from this album? The track will remain in your library.`)) return;
    const response = await fetch(`/api/music/albums/${id}/tracks`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: track.id }) }); const result = await response.json(); if (!response.ok) { setError(result?.error || "Track could not be removed."); return; } await load();
  };
  const moveTrack = async (index: number, offset: number) => {
    const nextIndex = index + offset; if (nextIndex < 0 || nextIndex >= tracks.length) return;
    const reordered = [...tracks]; [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setTracks(reordered); setBusy(true);
    try { const response = await fetch(`/api/music/albums/${id}/tracks`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackIds: reordered.map((track) => track.id) }) }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Track order could not be saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Track order could not be saved."); await load(); }
    finally { setBusy(false); }
  };

  return <main className="miley-page collection-detail-page" id="main-content" tabIndex={-1}>{error && <div className="status-banner is-error" role="alert"><MusicIcon name="shield" /><div><strong>Album</strong><p>{error}</p></div></div>}
    <section className="collection-hero"><Artwork src={album.artworkUrl} title={album.title} className="collection-artwork" /><div className="collection-hero-copy"><span className="page-eyebrow">{album.visibility === "public" ? "MiLey album" : "Private draft"}</span><h1>{album.title}</h1><p><Link href={`/channel/${encodeURIComponent(album.channelHandle)}`}>{album.channelName}</Link>{album.releaseDate ? ` · ${album.releaseDate}` : ""}</p><p>{album.description || "No album description yet."}</p><div className="channel-meta-chips">{album.genre && <span>{album.genre}</span>}{album.language && <span>{album.language}</span>}<span>{tracks.length} {tracks.length === 1 ? "track" : "tracks"}</span></div><div className="collection-actions"><button type="button" className="primary-button" disabled={!tracks.length} onClick={() => void playQueue(tracks)}><MusicIcon name="play" /> Play album</button>{isOwner && <><button type="button" className="secondary-button" onClick={() => setAddOpen(true)}><MusicIcon name="plus" /> Add tracks</button><button type="button" className="quiet-button" onClick={() => setEditOpen(true)}><MusicIcon name="edit" /> Edit</button><button type="button" className="quiet-button is-danger-text" onClick={() => void removeAlbum()}>Delete album</button></>}</div></div></section>
    <section className="section-block"><div className="section-heading"><div><h2>Tracklist</h2><p>{isOwner ? "Reorder or remove tracks without deleting them from your library." : "Only public, rights-confirmed tracks are playable."}</p></div><span className="eyebrow">{tracks.length} tracks</span></div>{tracks.length ? <><TrackList tracks={tracks} /><div className="collection-manage-list">{isOwner && tracks.map((track, index) => <div className="collection-manage-row" key={track.id}><span>{String(index+1).padStart(2,"0")}</span><strong>{track.title}</strong><div><button className="track-icon" type="button" disabled={busy || index === 0} onClick={() => void moveTrack(index,-1)} aria-label={`Move ${track.title} up`}><MusicIcon name="chevron" className="rotate-up" /></button><button className="track-icon" type="button" disabled={busy || index === tracks.length-1} onClick={() => void moveTrack(index,1)} aria-label={`Move ${track.title} down`}><MusicIcon name="chevron" className="rotate-down" /></button><button className="track-icon is-danger" type="button" onClick={() => void removeTrack(track)} aria-label={`Remove ${track.title} from album`}><MusicIcon name="trash" /></button></div></div>)}</div></> : <EmptyState title="No tracks in this album" description={isOwner ? "Add tracks from your library or public catalog releases." : "This album has no publicly available tracks."} icon="music" action={isOwner ? <button type="button" className="secondary-button" onClick={() => setAddOpen(true)}>Add tracks</button> : undefined} />}</section>
    {addOpen && <CollectionTrackPicker kind="album" collectionId={album.id} existingIds={tracks.map((track) => track.id)} onClose={() => setAddOpen(false)} onAdded={() => void load()} />}
    {editOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-album-title"><div className="modal-heading"><div><span className="eyebrow">Creator tools</span><h2 id="edit-album-title">Edit album</h2></div><button type="button" className="icon-button" onClick={() => setEditOpen(false)} aria-label="Close"><MusicIcon name="close" /></button></div><form className="auth-form" onSubmit={save}><div><label className="form-label" htmlFor="album-edit-title">Title</label><input id="album-edit-title" className="form-input" maxLength={200} value={editForm.title} onChange={(event) => setEditForm((previous) => ({ ...previous, title: event.target.value }))} required /></div><div><label className="form-label" htmlFor="album-edit-description">Description</label><textarea id="album-edit-description" className="form-textarea" maxLength={1000} value={editForm.description} onChange={(event) => setEditForm((previous) => ({ ...previous, description: event.target.value }))} /></div><div className="form-grid"><div><label className="form-label" htmlFor="album-edit-genre">Genre</label><input id="album-edit-genre" className="form-input" value={editForm.genre} onChange={(event) => setEditForm((previous) => ({ ...previous, genre: event.target.value }))} /></div><div><label className="form-label" htmlFor="album-edit-language">Language</label><input id="album-edit-language" className="form-input" value={editForm.language} onChange={(event) => setEditForm((previous) => ({ ...previous, language: event.target.value }))} /></div><div><label className="form-label" htmlFor="album-edit-date">Release date</label><input id="album-edit-date" className="form-input" type="date" value={editForm.releaseDate} onChange={(event) => setEditForm((previous) => ({ ...previous, releaseDate: event.target.value }))} /></div><div><label className="form-label" htmlFor="album-edit-visibility">Visibility</label><select id="album-edit-visibility" className="form-select" value={editForm.visibility} onChange={(event) => setEditForm((previous) => ({ ...previous, visibility: event.target.value }))}><option value="private">Private draft</option><option value="public">Public</option></select></div></div><div><label className="form-label" htmlFor="album-edit-artwork">New artwork · optional</label><input id="album-edit-artwork" className="form-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setArtFile(event.target.files?.[0] || null)} /></div><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save album"}</button></form></section></div>}
  </main>;
}
