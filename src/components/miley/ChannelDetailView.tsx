"use client";

import RemoteImage from "./RemoteImage";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Album, Channel, Playlist, Track } from "@/lib/miley-types";
import { uploadImage } from "@/lib/upload-image";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";
import TrackList, { Artwork } from "./TrackList";
import EmptyState from "./EmptyState";

type ChannelData = Channel & { ownerUsername: string; ownerName: string; subscribers: number; subscribed: boolean };
export default function ChannelDetailView({ handle }: { handle: string }) {
  const { user, playQueue, showNotice } = useMusic();
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVisibility, setEditVisibility] = useState("public");
  const [editGenre, setEditGenre] = useState("");
  const [editLanguage, setEditLanguage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/music/channels/${encodeURIComponent(handle)}`, { cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Channel not found.");
      setChannel(result.channel); setTracks(result.tracks || []); setAlbums(result.albums || []); setPlaylists(result.playlists || []);
      setEditName(result.channel.name); setEditDescription(result.channel.description || ""); setEditVisibility(result.channel.visibility); setEditGenre(result.channel.genre || ""); setEditLanguage(result.channel.language || ""); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Channel could not be loaded."); }
    finally { setLoading(false); }
  }, [handle]);
  useEffect(() => { void load(); }, [load]);

  const isOwner = Boolean(user && channel && user.id === channel.ownerId);
  const subscribe = async () => {
    if (!channel || !user) { showNotice("Sign in to subscribe to a creator channel."); return; }
    setBusy(true); setError("");
    try { const response = await fetch(`/api/music/channels/${encodeURIComponent(handle)}/subscribe`, { method: channel.subscribed ? "DELETE" : "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Subscription could not be updated."); setChannel((previous) => previous ? { ...previous, subscribed: result.subscribed, subscribers: Math.max(0, previous.subscribers + (result.subscribed ? 1 : -1)) } : previous); showNotice(result.subscribed ? "Channel subscribed." : "Channel unsubscribed."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Subscription could not be updated."); }
    finally { setBusy(false); }
  };

  const saveChannel = async (event: FormEvent) => {
    event.preventDefault(); if (!channel) return;
    setBusy(true); setError("");
    try {
      let imageUrl = channel.imageUrl; let bannerUrl = channel.bannerUrl;
      if (imageFile) imageUrl = await uploadImage(imageFile, "channel_profile");
      if (bannerFile) bannerUrl = await uploadImage(bannerFile, "channel_banner");
      const response = await fetch(`/api/music/channels/${encodeURIComponent(handle)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editName, description: editDescription, visibility: editVisibility, genre: editGenre, language: editLanguage, imageUrl, bannerUrl }) });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Channel could not be saved.");
      setEditOpen(false); setImageFile(null); setBannerFile(null); await load(); showNotice("Channel details saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Channel could not be saved."); }
    finally { setBusy(false); }
  };

  if (loading) return <main className="miley-page" id="main-content"><div className="loading-skeleton" style={{ height: 320 }} /></main>;
  if (!channel) return <main className="miley-page" id="main-content"><EmptyState title="Channel unavailable" description={error || "This channel could not be found."} icon="channels" action={<Link className="secondary-button" href="/channels">Browse channels</Link>} /></main>;

  return <main className="miley-page channel-detail-page" id="main-content" tabIndex={-1}>
    {error && <div className="status-banner is-error" role="alert"><MusicIcon name="shield" /><div><strong>Channel</strong><p>{error}</p></div></div>}
    <section className="channel-hero"><div className="channel-hero-banner">{channel.bannerUrl ? <RemoteImage src={channel.bannerUrl} alt="" /> : <div className="channel-hero-gradient" />}</div><div className="channel-hero-content"><span className="channel-hero-avatar">{channel.imageUrl ? <RemoteImage src={channel.imageUrl} alt={`${channel.name} channel art`} /> : <MusicIcon name="channels" />}</span><div className="channel-hero-copy"><span className="page-eyebrow">{channel.visibility === "public" ? "MiLey creator channel" : "Private channel"}</span><h1>{channel.name}</h1><p>@{channel.handle} · by <Link href={`/profile/${encodeURIComponent(channel.ownerUsername)}`}>{channel.ownerName}</Link></p><p>{channel.description || "No channel description yet."}</p><div className="channel-meta-chips">{channel.genre && <span>{channel.genre}</span>}{channel.language && <span>{channel.language}</span>}<span>{channel.subscribers} subscribers</span></div></div><div className="channel-hero-actions">{isOwner ? <><button type="button" className="secondary-button" onClick={() => setEditOpen(true)}><MusicIcon name="edit" /> Edit channel</button><Link href="/library?tab=creator" className="primary-button"><MusicIcon name="upload" /> Upload</Link></> : <><button type="button" className={channel.subscribed ? "secondary-button" : "primary-button"} disabled={busy || !user} onClick={() => void subscribe()}>{channel.subscribed ? "Subscribed" : "Subscribe"}</button><Link href={`/profile/${encodeURIComponent(channel.ownerUsername)}`} className="quiet-button">View creator profile</Link></>}</div></div></section>
    <div className="channel-content-meta"><span><strong>{tracks.length}</strong> {tracks.length === 1 ? "public track" : "public tracks"}</span><span><strong>{albums.length}</strong> {albums.length === 1 ? "album" : "albums"}</span><span>Only verified catalog releases are shown to visitors.</span></div>
    {tracks.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Tracks</h2><p>Public, rights-confirmed releases from this channel.</p></div><button className="text-button" type="button" onClick={() => { const playable = tracks.filter((item) => item.visibility === "public"); if (playable.length) void playQueue(playable); }}>Play all</button></div><TrackList tracks={tracks} canManage={isOwner} /></section>}
    {albums.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Albums</h2><p>Releases organized by this creator.</p></div></div><div className="album-grid">{albums.map((item) => <Link className="media-card" href={`/album/${item.id}`} key={item.id}><Artwork src={item.artworkUrl} title={item.title} /><p className="media-card-title">{item.title}</p><p className="media-card-subtitle">{item.releaseDate || (item.visibility === "public" ? "MiLey release" : "Draft")}</p></Link>)}</div></section>}
    {playlists.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Playlists</h2><p>Public playlists from this channel creator.</p></div></div><div className="playlist-grid">{playlists.map((item) => <Link className="media-card" href={`/playlist/${item.id}`} key={item.id}><Artwork src={item.artworkUrl} title={item.title} /><p className="media-card-title">{item.title}</p><p className="media-card-subtitle">Public playlist</p></Link>)}</div></section>}
    {!tracks.length && !albums.length && <section className="section-block"><EmptyState title="No public releases yet" description={isOwner ? "Upload music you have permission to share, then set it to public when you are ready." : "This creator has not published a public track or album yet."} icon="disc" action={isOwner ? <Link href="/library?tab=creator" className="secondary-button">Open creator tools</Link> : undefined} /></section>}
    {editOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-channel-title"><div className="modal-heading"><div><span className="eyebrow">Creator tools</span><h2 id="edit-channel-title">Edit channel</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setEditOpen(false)}><MusicIcon name="close" /></button></div><form className="auth-form" onSubmit={saveChannel}><div><label className="form-label" htmlFor="edit-channel-name">Name</label><input id="edit-channel-name" className="form-input" maxLength={100} value={editName} onChange={(event) => setEditName(event.target.value)} required /></div><div><label className="form-label" htmlFor="edit-channel-description">Description</label><textarea id="edit-channel-description" className="form-textarea" maxLength={1000} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></div><div className="form-grid"><div><label className="form-label" htmlFor="edit-channel-genre">Genre</label><input id="edit-channel-genre" className="form-input" value={editGenre} onChange={(event) => setEditGenre(event.target.value)} /></div><div><label className="form-label" htmlFor="edit-channel-language">Language</label><input id="edit-channel-language" className="form-input" value={editLanguage} onChange={(event) => setEditLanguage(event.target.value)} /></div></div><div><label className="form-label" htmlFor="edit-channel-visibility">Visibility</label><select id="edit-channel-visibility" className="form-select" value={editVisibility} onChange={(event) => setEditVisibility(event.target.value)}><option value="public">Public</option><option value="private">Private</option></select><span className="form-help">Private channels are not discoverable. Existing public tracks will no longer be served while the channel is private.</span></div><div><label className="form-label" htmlFor="edit-channel-image">New channel image · optional</label><input id="edit-channel-image" className="form-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || null)} /></div><div><label className="form-label" htmlFor="edit-channel-banner">New banner · optional</label><input id="edit-channel-banner" className="form-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBannerFile(event.target.files?.[0] || null)} /></div><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save channel"}</button></form></section></div>}
  </main>;
}
