"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Album, Playlist, Track } from "@/lib/miley-types";
import { uploadImage } from "@/lib/upload-image";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";
import TrackList, { Artwork } from "./TrackList";
import EmptyState from "./EmptyState";

const LIBRARY_TABS = ["tracks", "favorites", "history", "playlists", "albums", "creator", "notes"] as const;
type Tab = typeof LIBRARY_TABS[number];
type LibraryData = { tracks: Track[]; playlists: Playlist[]; albums: Album[]; favorites: Track[]; recentTracks: Track[]; channel: { id: number; handle: string; name: string } | null };
type UploadFile = { file: File; title: string; artist: string; durationSeconds?: number | null; status: "ready" | "uploading" | "done" | "error"; progress: number; error?: string };

function fmtDuration(seconds: number | null | undefined) { if (!seconds) return "duration unavailable"; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
function mimeFor(file: File): string {
  const known = file.type.toLowerCase().split(";")[0];
  if (known.startsWith("audio/")) return known;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", opus: "audio/opus", webm: "audio/webm" };
  return map[ext || ""] || known;
}
function hashFile(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => crypto.subtle.digest("SHA-256", buffer)).then((hash) => Array.from(new Uint8Array(hash), (part) => part.toString(16).padStart(2, "0")).join(""));
}
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    const finish = (value: number | null) => { URL.revokeObjectURL(url); audio.remove(); resolve(value); };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? Math.floor(audio.duration) : null);
    audio.onerror = () => finish(null);
    audio.src = url;
    window.setTimeout(() => finish(null), 12000);
  });
}
function xhrUpload(url: string, file: File, contentType: string, onProgress: (value: number) => void, saveXhr: (xhr: XMLHttpRequest | null) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    saveXhr(xhr);
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => { saveXhr(null); if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(`Storage rejected the upload (HTTP ${xhr.status}). Check the bucket CORS policy.`)); };
    xhr.onerror = () => { saveXhr(null); reject(new Error("Upload failed. Check your network and the storage CORS configuration.")); };
    xhr.onabort = () => { saveXhr(null); reject(new Error("Upload cancelled.")); };
    xhr.ontimeout = () => { saveXhr(null); reject(new Error("Upload timed out. You can retry this track.")); };
    xhr.timeout = 180_000;
    xhr.send(file);
  });
}

export default function LibraryView() {
  const { user, userLoading, library, libraryLoading, refreshLibrary, showNotice } = useMusic();
  const [tab, setTab] = useState<Tab>("tracks");
  const [error, setError] = useState("");
  const [uploadRows, setUploadRows] = useState<UploadFile[]>([]);
  const [visibility, setVisibility] = useState("private");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [commonGenre, setCommonGenre] = useState("");
  const [commonLanguage, setCommonLanguage] = useState("");
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkUrl, setArtworkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistVisibility, setPlaylistVisibility] = useState("private");
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumDescription, setAlbumDescription] = useState("");
  const [albumGenre, setAlbumGenre] = useState("");
  const [albumLanguage, setAlbumLanguage] = useState("");
  const [albumVisibility, setAlbumVisibility] = useState("private");
  const [noteTrack, setNoteTrack] = useState("");
  const [myNote, setMyNote] = useState<{ track: Track; caption: string; expiresAt: string } | null>(null);
  const [noteCaption, setNoteCaption] = useState("");
  const [noteHours, setNoteHours] = useState("24");
  const [noteSaving, setNoteSaving] = useState(false);
  const [editTrack, setEditTrack] = useState<Track | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (requested && LIBRARY_TABS.includes(requested)) setTab(requested);
  }, []);
  useEffect(() => {
    if (!user) { setMyNote(null); return; }
    let active = true;
    fetch("/api/social/notes", { cache: "no-store" }).then((response) => response.json()).then((payload) => {
      const item = (payload.items || []).find((note: { author?: { id?: number }; track?: Track; caption?: string; expiresAt?: string }) => note.author?.id === user.id);
      if (active) setMyNote(item?.track ? { track: item.track, caption: item.caption || "", expiresAt: item.expiresAt || "" } : null);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [user]);

  const data = library as LibraryData | null;
  const ownTracks = useMemo(() => data?.tracks ?? [], [data?.tracks]);
  const publicOwnTracks = useMemo(() => ownTracks.filter((track) => track.visibility === "public"), [ownTracks]);

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...files].map((file) => ({ file, title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 200), artist: user?.displayName || "", durationSeconds: undefined, status: "ready" as const, progress: 0 }));
    setUploadRows((previous) => [...previous, ...next].slice(0, 40));
    next.forEach((item) => { void readDuration(item.file).then((durationSeconds) => setUploadRows((previous) => previous.map((row) => row.file === item.file ? { ...row, durationSeconds } : row))); });
    setError("");
  };
  const updateUpload = (index: number, patch: Partial<UploadFile>) => setUploadRows((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  const uploadAll = async () => {
    if (!data?.channel) { setError("Create your channel before uploading music."); setTab("creator"); return; }
    if (!rightsConfirmed) { setError("Confirm that you own or have permission to upload every selected recording."); return; }
    if (!uploadRows.some((item) => item.status !== "done")) return;
    setUploading(true); setCancelled(false); setError("");
    try {
      let saved = 0;
      let resolvedArtwork = artworkUrl.trim();
      if (artworkFile) resolvedArtwork = await uploadImage(artworkFile, "artwork");
      for (let index = 0; index < uploadRows.length; index += 1) {
        const item = uploadRows[index];
        if (cancelled) break;
        if (item.status === "done") continue;
        updateUpload(index, { status: "uploading", progress: 0, error: undefined });
        try {
          const contentType = mimeFor(item.file);
          const [sha256, durationSeconds] = await Promise.all([hashFile(item.file), item.durationSeconds === undefined ? readDuration(item.file) : Promise.resolve(item.durationSeconds)]);
          const presignResponse = await fetch("/api/music/uploads/presign", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: item.title, artist: item.artist || user?.displayName || "", fileName: item.file.name, contentType, size: item.file.size, sha256, durationSeconds, artworkUrl: resolvedArtwork, genre: commonGenre, language: commonLanguage, visibility, rightsConfirmed }),
          });
          const signed = await presignResponse.json();
          if (!presignResponse.ok) throw new Error(signed?.error || "Upload could not be prepared.");
          await xhrUpload(signed.uploadUrl, item.file, contentType, (progress) => updateUpload(index, { progress }), (xhr) => { xhrRef.current = xhr; });
          const completeResponse = await fetch("/api/music/uploads/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: signed.uploadId }) });
          const complete = await completeResponse.json();
          if (!completeResponse.ok) throw new Error(complete?.error || "MiLey could not verify this audio file.");
          updateUpload(index, { status: "done", progress: 100 }); saved += 1;
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Track upload failed.";
          updateUpload(index, { status: "error", error: message });
          if (message === "Upload cancelled.") { setCancelled(true); break; }
        }
      }
      if (saved) { await refreshLibrary(); showNotice(`${saved} ${saved === 1 ? "track" : "tracks"} uploaded and verified.`); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setUploading(false); xhrRef.current = null; }
  };
  const cancelUpload = () => { setCancelled(true); xhrRef.current?.abort(); };

  const createPlaylist = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    try {
      const response = await fetch("/api/music/playlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: playlistTitle, description: playlistDescription, visibility: playlistVisibility }) });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Playlist could not be created.");
      setPlaylistOpen(false); setPlaylistTitle(""); await refreshLibrary(); showNotice("Playlist created.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Playlist could not be created."); }
  };
  const createAlbum = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    try {
      let resolvedArtwork = artworkUrl.trim(); if (artworkFile) resolvedArtwork = await uploadImage(artworkFile, "artwork");
      const response = await fetch("/api/music/albums", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: albumTitle, description: albumDescription, genre: albumGenre, language: albumLanguage, visibility: albumVisibility, artworkUrl: resolvedArtwork }) });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Album could not be created.");
      setAlbumOpen(false); setAlbumTitle(""); await refreshLibrary(); showNotice("Album created. Add your tracks from its page.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Album could not be created."); }
  };

  const deleteTrack = async (track: Track) => {
    if (!window.confirm(`Delete “${track.title}” from MiLey? It will also be removed from playlists and albums.`)) return;
    try { const response = await fetch(`/api/music/tracks/${track.id}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Track could not be deleted."); await refreshLibrary(); showNotice("Track deleted."); }
    catch (cause) { showNotice(cause instanceof Error ? cause.message : "Track could not be deleted."); }
  };
  const saveTrackEdit = async (event: FormEvent) => {
    event.preventDefault(); if (!editTrack) return;
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    try {
      const response = await fetch(`/api/music/tracks/${editTrack.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: values.get("title"), artist: values.get("artist"), albumTitle: values.get("albumTitle"), genre: values.get("genre"), language: values.get("language"), artworkUrl: values.get("artworkUrl"), lyrics: values.get("lyrics"), visibility: values.get("visibility") }) });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Track could not be updated.");
      setEditTrack(null); await refreshLibrary(); showNotice("Track details saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Track could not be updated."); }
  };

  const removeNote = async () => {
    try { const response = await fetch("/api/social/notes", { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Music note could not be removed."); setMyNote(null); showNotice("Your music note was removed."); }
    catch (cause) { showNotice(cause instanceof Error ? cause.message : "Music note could not be removed."); }
  };

  const saveNote = async (event: FormEvent) => {
    event.preventDefault(); setNoteSaving(true); setError("");
    try {
      const response = await fetch("/api/social/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: Number(noteTrack), caption: noteCaption, expiresInHours: Number(noteHours) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Music note could not be saved.");
      const track = publicOwnTracks.find((item) => item.id === Number(noteTrack));
      if (track) setMyNote({ track, caption: noteCaption, expiresAt: result.expiresAt });
      showNotice("Your song note is live for mutual follows."); setNoteCaption("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Music note could not be saved."); }
    finally { setNoteSaving(false); }
  };

  if (userLoading) return <main className="miley-page" id="main-content"><div className="loading-skeleton" style={{ height: 180 }} /></main>;
  if (!user) return <main className="miley-page" id="main-content" tabIndex={-1}><div className="page-heading-row"><div><span className="page-eyebrow">Your sound, in one place</span><h1 className="page-title">Your library.</h1><p className="page-subtitle">Save public releases, create playlists, and manage the music you are authorized to share.</p></div></div><EmptyState title="Sign in to open your library" description="Playlists, favorites, listening history, uploads, and creator tools are saved to your MiLey account." icon="library" action={<Link className="primary-button" href="/login?next=%2Flibrary">Sign in</Link>} /></main>;

  const tabList: Array<{ id: Tab; label: string; icon: "music" | "heart" | "clock" | "playlist" | "album" | "channels" | "note" }> = [
    { id: "tracks", label: "Tracks", icon: "music" }, { id: "favorites", label: "Favorites", icon: "heart" }, { id: "history", label: "History", icon: "clock" }, { id: "playlists", label: "Playlists", icon: "playlist" }, { id: "albums", label: "Albums", icon: "album" }, { id: "creator", label: "Creator tools", icon: "channels" }, { id: "notes", label: "Music notes", icon: "note" },
  ];

  return <main className="miley-page" id="main-content" tabIndex={-1}>
    <div className="page-heading-row"><div><span className="page-eyebrow">Your MiLey</span><h1 className="page-title">Your library.</h1><p className="page-subtitle">A home for songs you have saved, playlists you have shaped, and music you have permission to share.</p></div>{user.emailVerified ? <button type="button" className="primary-button" onClick={() => setTab("creator")}><MusicIcon name="upload" /> Upload music</button> : <Link href="/settings" className="secondary-button">Verify your email</Link>}</div>
    {!user.emailVerified && <div className="status-banner"><MusicIcon name="lock" /><div><strong>Email verification is required for publishing</strong><p>You can organize your library, but creator uploads and social publishing stay locked until your email is verified.</p></div></div>}
    <div className="library-tabs" role="tablist" aria-label="Library sections">{tabList.map((item) => <button key={item.id} className="library-tab" type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}><MusicIcon name={item.icon} /> {item.label}</button>)}</div>
    {error && <div className="status-banner is-error" role="status"><MusicIcon name="shield" /><div><strong>Library action</strong><p>{error}</p></div></div>}
    {libraryLoading && <span className="sr-only" role="status">Loading your music library.</span>}

    {tab === "tracks" && <section className="library-panel"><div className="library-panel-heading"><div><h2>Your tracks</h2><p>Private uploads are visible only to you; public releases must pass rights checks.</p></div><span className="eyebrow">{ownTracks.length} saved</span></div>{ownTracks.length ? <TrackList tracks={ownTracks} canManage onEdit={(track) => setEditTrack(track)} onDelete={deleteTrack} /> : <EmptyState title="No tracks in your library" description="Upload music you own or are authorized to share. MiLey never supplies placeholder tracks." icon="music" action={<button type="button" className="secondary-button" onClick={() => setTab("creator")}>Open creator tools</button>} />}</section>}
    {tab === "favorites" && <section className="library-panel"><div className="library-panel-heading"><div><h2>Favorites</h2><p>Your saved public songs.</p></div></div>{data?.favorites?.length ? <TrackList tracks={data.favorites} /> : <EmptyState title="No favorites yet" description="Choose the heart on a song to keep it in your library." icon="heart" />}</section>}
    {tab === "history" && <section className="library-panel"><div className="library-panel-heading"><div><h2>Listening history</h2><p>Recent progress saved to your account. You can switch this off in Settings.</p></div><button type="button" className="text-button" onClick={() => { void fetch("/api/music/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ historyEnabled: false }) }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Settings could not be saved."); showNotice("Listening history paused. You can change it in Settings."); await refreshLibrary(); }).catch((cause) => showNotice(cause instanceof Error ? cause.message : "Settings could not be saved.")); }}>Pause history</button></div>{data?.recentTracks?.length ? <TrackList tracks={data.recentTracks} /> : <EmptyState title="No listening history" description="Tracks you play will appear here while listening history is enabled." icon="clock" />}</section>}
    {tab === "playlists" && <section className="library-panel"><div className="library-panel-heading"><div><h2>Playlists</h2><p>Curate tracks you can access, with private or public visibility.</p></div><button type="button" className="primary-button" onClick={() => setPlaylistOpen(true)}><MusicIcon name="plus" /> New playlist</button></div>{data?.playlists?.length ? <div className="playlist-grid">{data.playlists.map((item) => <Link className="media-card" href={`/playlist/${item.id}`} key={item.id}><Artwork src={item.artworkUrl} title={item.title} /><p className="media-card-title">{item.title}</p><p className="media-card-subtitle">{item.visibility === "public" ? "Public playlist" : "Private playlist"}</p></Link>)}</div> : <EmptyState title="Build your first playlist" description="Add public tracks or your own uploads. Duplicate tracks are handled without creating duplicate entries." icon="playlist" action={<button className="secondary-button" type="button" onClick={() => setPlaylistOpen(true)}>Create playlist</button>} />}</section>}
    {tab === "albums" && <section className="library-panel"><div className="library-panel-heading"><div><h2>Albums</h2><p>Organize your channel releases. Deleting an album does not delete its songs.</p></div><button type="button" className="primary-button" disabled={!data?.channel} onClick={() => setAlbumOpen(true)}><MusicIcon name="plus" /> New album</button></div>{!data?.channel && <p className="form-help">Create a creator channel before making an album.</p>}{data?.albums?.length ? <div className="album-grid">{data.albums.map((item) => <Link className="media-card" href={`/album/${item.id}`} key={item.id}><Artwork src={item.artworkUrl} title={item.title} /><p className="media-card-title">{item.title}</p><p className="media-card-subtitle">{item.visibility === "public" ? "Published album" : "Draft album"}</p></Link>)}</div> : <EmptyState title="No albums yet" description="Create an album, add tracks, set a release date, and decide whether it is public." icon="album" action={data?.channel ? <button type="button" className="secondary-button" onClick={() => setAlbumOpen(true)}>Create album</button> : <Link className="secondary-button" href="/channels">Create channel</Link>} />}</section>}
    {tab === "creator" && <section className="library-panel"><div className="library-panel-heading"><div><h2>Creator tools</h2><p>Durable audio storage is verified before a track enters your catalog.</p></div></div>
      {!data?.channel ? <div className="creator-gate premium-panel"><div className="creator-gate-copy"><span className="eyebrow">One step before upload</span><h2>Your channel is your creator home.</h2><p>MiLey requires a channel before accepting music uploads. Create it first, then return here to publish only recordings you own or are authorized to share.</p><Link className="primary-button" href="/channels"><MusicIcon name="channels" /> Create a channel</Link></div><div className="creator-gate-symbol"><MusicIcon name="disc" /></div></div> : !user.emailVerified ? <div className="status-banner"><MusicIcon name="lock" /><div><strong>Verify your email before uploading</strong><p>Your account must have a verified email before publishing music.</p><Link href="/settings" className="text-link">Open account settings <MusicIcon name="arrow" /></Link></div></div> : <>
        <div className="form-grid" style={{ marginBottom: 17 }}><div className="form-field"><label className="form-label" htmlFor="upload-genre">Genre · optional</label><input id="upload-genre" className="form-input" value={commonGenre} onChange={(event) => setCommonGenre(event.target.value)} placeholder="e.g. Indie pop" /></div><div className="form-field"><label className="form-label" htmlFor="upload-language">Language · optional</label><input id="upload-language" className="form-input" value={commonLanguage} onChange={(event) => setCommonLanguage(event.target.value)} placeholder="e.g. Hindi" /></div><div className="form-field"><label className="form-label" htmlFor="upload-visibility">Default visibility</label><select id="upload-visibility" className="form-select" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="private">Private draft</option><option value="public">Public · publish to catalog</option></select></div><div className="form-field"><label className="form-label" htmlFor="upload-artwork-url">Artwork URL · optional</label><input id="upload-artwork-url" className="form-input" type="url" value={artworkUrl} onChange={(event) => setArtworkUrl(event.target.value)} placeholder="https://…" /></div><div className="form-field"><label className="form-label" htmlFor="upload-artwork-file">Or upload cover art</label><input id="upload-artwork-file" className="form-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setArtworkFile(event.target.files?.[0] || null)} /></div></div>
        <label className="terms-check"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} /><span>I own or have permission to upload this music and, if public, to distribute it. MiLey&apos;s checkbox is an attestation, not a license grant.</span></label>
        <label className="upload-dropzone" style={{ marginTop: 15 }}><input type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/flac,audio/ogg,audio/opus,audio/webm,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.webm" multiple onChange={(event) => handleFiles(event.target.files)} /><span><MusicIcon name="upload" /><strong>Select one or more audio files</strong><span>MP3, M4A, AAC, WAV, FLAC, OGG, Opus or WebM · up to 60 MB each</span></span></label>
        {!!uploadRows.length && <div className="upload-queue">{uploadRows.map((item, index) => <div className="channel-artwork-preview" key={`${item.file.name}-${item.file.lastModified}-${index}`}><span className="track-cover"><MusicIcon name="music" /></span><div className="upload-item-meta"><input className="form-input" aria-label={`Track ${index + 1} title`} value={item.title} maxLength={200} onChange={(event) => updateUpload(index, { title: event.target.value })} /><input className="form-input" aria-label={`Track ${index + 1} artist`} value={item.artist} maxLength={160} onChange={(event) => updateUpload(index, { artist: event.target.value })} /><small>{item.file.name} · {item.durationSeconds === undefined ? "reading metadata…" : fmtDuration(item.durationSeconds)} · {(item.file.size / 1024 / 1024).toFixed(1)} MB</small>{item.status === "uploading" && <div className="upload-progress"><span style={{ width: `${item.progress}%` }} /></div>}{item.status === "error" && <span className="form-error">{item.error}</span>}{item.status === "done" && <span className="form-success">Uploaded and verified</span>}</div><span className={`upload-status ${item.status}`}>{item.status === "uploading" ? `${item.progress}%` : item.status === "done" ? "Ready" : item.status === "error" ? "Retry" : "Queued"}</span><button type="button" className="track-icon is-danger" aria-label={`Remove ${item.file.name}`} onClick={() => setUploadRows((previous) => previous.filter((_, rowIndex) => rowIndex !== index))} disabled={uploading}><MusicIcon name="close" /></button></div>)}</div>}
        <div className="library-action-row"><p className="form-help">Duration is read from the browser when supported. The server checks the file signature and SHA-256 before saving.</p><div>{uploading && <button type="button" className="quiet-button" onClick={cancelUpload}>Cancel upload</button>}<button type="button" className="primary-button" disabled={uploading || !uploadRows.some((item) => item.status !== "done")} onClick={() => void uploadAll()}><MusicIcon name="upload" />{uploading ? "Uploading…" : "Upload selected"}</button></div></div>
      </>}
    </section>}
    {tab === "notes" && <section className="library-panel"><div className="library-panel-heading"><div><h2>Music notes</h2><p>A short song note is visible only when you and the viewer follow each other.</p>{myNote && <span className="form-help">Current note: “{myNote.track.title}” · expires {new Date(myNote.expiresAt).toLocaleString()}</span>}</div>{myNote && <button type="button" className="quiet-button is-danger-text" onClick={() => void removeNote()}>Remove note</button>}</div>{!publicOwnTracks.length ? <EmptyState title="Publish a song first" description="Music notes can only attach a publicly playable track so recipients can actually listen." icon="note" /> : <form onSubmit={saveNote} className="auth-form"><div className="form-field"><label className="form-label" htmlFor="note-track">Attach a public song</label><select id="note-track" className="form-select" value={noteTrack} onChange={(event) => setNoteTrack(event.target.value)} required><option value="">Choose a track</option>{publicOwnTracks.map((track) => <option key={track.id} value={track.id}>{track.title} · {track.artist}</option>)}</select></div><div className="form-field"><label className="form-label" htmlFor="note-caption">Short caption · optional</label><input id="note-caption" className="form-input" maxLength={100} value={noteCaption} onChange={(event) => setNoteCaption(event.target.value)} placeholder="A thought, not a paragraph." /></div><div className="form-field"><label className="form-label" htmlFor="note-hours">Expire after</label><select id="note-hours" className="form-select" value={noteHours} onChange={(event) => setNoteHours(event.target.value)}><option value="1">1 hour</option><option value="6">6 hours</option><option value="12">12 hours</option><option value="24">24 hours</option></select></div><button type="submit" className="primary-button" disabled={noteSaving}>{noteSaving ? "Saving…" : "Share song note"}</button></form>}</section>}

    {playlistOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPlaylistOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-playlist-title"><div className="modal-heading"><div><span className="eyebrow">Your collection</span><h2 id="create-playlist-title">Create playlist</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setPlaylistOpen(false)}><MusicIcon name="close" /></button></div><form onSubmit={createPlaylist} className="auth-form"><div><label className="form-label" htmlFor="playlist-title">Name</label><input id="playlist-title" className="form-input" maxLength={120} value={playlistTitle} onChange={(event) => setPlaylistTitle(event.target.value)} required /></div><div><label className="form-label" htmlFor="playlist-description">Description · optional</label><textarea id="playlist-description" className="form-textarea" maxLength={1000} value={playlistDescription} onChange={(event) => setPlaylistDescription(event.target.value)} /></div><div><label className="form-label" htmlFor="playlist-visibility">Visibility</label><select id="playlist-visibility" className="form-select" value={playlistVisibility} onChange={(event) => setPlaylistVisibility(event.target.value)}><option value="private">Private</option><option value="public">Public</option></select></div><button type="submit" className="primary-button">Create playlist</button></form></section></div>}
    {albumOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAlbumOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-album-title"><div className="modal-heading"><div><span className="eyebrow">Creator releases</span><h2 id="create-album-title">Create album</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setAlbumOpen(false)}><MusicIcon name="close" /></button></div><form onSubmit={createAlbum} className="auth-form"><div><label className="form-label" htmlFor="album-title">Album title</label><input id="album-title" className="form-input" maxLength={200} value={albumTitle} onChange={(event) => setAlbumTitle(event.target.value)} required /></div><div><label className="form-label" htmlFor="album-description">Description</label><textarea id="album-description" className="form-textarea" maxLength={1000} value={albumDescription} onChange={(event) => setAlbumDescription(event.target.value)} /></div><div className="form-grid"><div><label className="form-label" htmlFor="album-genre">Genre</label><input id="album-genre" className="form-input" value={albumGenre} onChange={(event) => setAlbumGenre(event.target.value)} /></div><div><label className="form-label" htmlFor="album-language">Language</label><input id="album-language" className="form-input" value={albumLanguage} onChange={(event) => setAlbumLanguage(event.target.value)} /></div><div><label className="form-label" htmlFor="album-visibility">Visibility</label><select id="album-visibility" className="form-select" value={albumVisibility} onChange={(event) => setAlbumVisibility(event.target.value)}><option value="private">Draft · private</option><option value="public">Public</option></select></div></div><button type="submit" className="primary-button">Create album</button></form></section></div>}
    {editTrack && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditTrack(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-track-title"><div className="modal-heading"><div><span className="eyebrow">Creator tools</span><h2 id="edit-track-title">Edit track</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setEditTrack(null)}><MusicIcon name="close" /></button></div><form onSubmit={saveTrackEdit} className="auth-form"><div className="form-grid"><div><label className="form-label" htmlFor="edit-title">Title</label><input id="edit-title" name="title" className="form-input" defaultValue={editTrack.title} required /></div><div><label className="form-label" htmlFor="edit-artist">Artist</label><input id="edit-artist" name="artist" className="form-input" defaultValue={editTrack.artist} required /></div><div><label className="form-label" htmlFor="edit-album">Album</label><input id="edit-album" name="albumTitle" className="form-input" defaultValue={editTrack.albumTitle} /></div><div><label className="form-label" htmlFor="edit-genre">Genre</label><input id="edit-genre" name="genre" className="form-input" defaultValue={editTrack.genre} /></div><div><label className="form-label" htmlFor="edit-language">Language</label><input id="edit-language" name="language" className="form-input" defaultValue={editTrack.language} /></div><div><label className="form-label" htmlFor="edit-artwork">Artwork URL</label><input id="edit-artwork" name="artworkUrl" className="form-input" defaultValue={editTrack.artworkUrl} /></div><div className="form-field is-wide"><label className="form-label" htmlFor="edit-lyrics">Lyrics · optional</label><textarea id="edit-lyrics" name="lyrics" className="form-textarea" defaultValue={editTrack.lyrics} /></div><div><label className="form-label" htmlFor="edit-visibility">Visibility</label><select id="edit-visibility" name="visibility" className="form-select" defaultValue={editTrack.visibility}><option value="private">Private</option><option value="public">Public</option></select></div></div><button type="submit" className="primary-button">Save track</button></form></section></div>}
  </main>;
}
