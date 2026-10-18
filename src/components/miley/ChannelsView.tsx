"use client";

import RemoteImage from "./RemoteImage";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Channel } from "@/lib/miley-types";
import { uploadImage } from "@/lib/upload-image";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";
import EmptyState from "./EmptyState";

const LANGUAGES = ["Hindi", "English", "Bhojpuri", "Punjabi", "Bengali", "Tamil", "Telugu", "Marathi", "Other"];
const GENRES = ["Pop", "Independent", "Classical", "Electronic", "Rock", "Hip-hop", "Devotional", "Folk", "Jazz", "Other"];

type CreatorChannel = Channel & { ownerUsername: string; subscribers: number; publishedTracks: number };

export default function ChannelsView() {
  const { user, userLoading, showNotice } = useMusic();
  const [items, setItems] = useState<CreatorChannel[]>([]);
  const [own, setOwn] = useState<Channel | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("Hindi");
  const [genre, setGenre] = useState("Independent");
  const [visibility, setVisibility] = useState("public");
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [bannerImage, setBannerImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(); if (query.trim()) params.set("q", query.trim());
    fetch(`/api/music/channels?${params.toString()}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Channels are unavailable.");
      if (active) setItems(data.items || []);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Channels are unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);

  useEffect(() => {
    let active = true;
    if (user) fetch("/api/music/channels/mine", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (active) setOwn(data.channel || null); }).catch(() => undefined);
    else setOwn(null);
    return () => { active = false; };
  }, [user]);

  const createChannel = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (!user) throw new Error("Sign in to create a channel.");
      let imageUrl = "", bannerUrl = "";
      if (profileImage) imageUrl = await uploadImage(profileImage, "channel_profile");
      if (bannerImage) bannerUrl = await uploadImage(bannerImage, "channel_banner");
      const response = await fetch("/api/music/channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, handle, description, language, genre, visibility, imageUrl, bannerUrl }) });
      const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Channel could not be created.");
      setOwn(data); setCreateOpen(false); setItems((previous) => [data, ...previous]); showNotice("Your channel is ready.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Channel could not be created."); }
    finally { setBusy(false); }
  };

  return <main className="miley-page" id="main-content" tabIndex={-1}>
    <div className="page-heading-row"><div><span className="page-eyebrow">The people behind the sound</span><h1 className="page-title">Creator channels.</h1><p className="page-subtitle">Discover public releases by independent musicians. Channel subscriptions are separate from following a listener.</p></div>
      {user && <button type="button" className="primary-button" onClick={() => setCreateOpen(true)} disabled={Boolean(own)}><MusicIcon name="plus" />{own ? "Your channel is live" : "Create your channel"}</button>}
    </div>
    {own && <section className="section-block" aria-label="Your channel"><div className="section-heading"><div><h2>Your creator space</h2><p>Manage your releases, artwork, and channel details.</p></div><Link className="text-link" href={`/channel/${encodeURIComponent(own.handle)}`}>Open channel <MusicIcon name="arrow" /></Link></div><div className="media-card channel-card premium-panel"><div className="channel-card-banner">{own.bannerUrl && <RemoteImage src={own.bannerUrl} alt="" />}</div><span className="channel-card-avatar">{own.imageUrl ? <RemoteImage src={own.imageUrl} alt="" /> : own.name.slice(0,1)}</span><span className="channel-card-meta"><h3>{own.name}</h3><p>@{own.handle} · Creator channel</p></span></div></section>}
    <div className="explore-toolbar"><label className="explore-search"><MusicIcon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a channel or creator" aria-label="Search channels" /></label></div>
    {error && <div className="status-banner is-error" role="status"><MusicIcon name="shield" /><div><strong>Channels</strong><p>{error}</p></div></div>}
    {loading && <div className="loading-skeleton" style={{ height: 180 }} />}
    {!loading && !items.length && !error && <EmptyState title="No public channels yet" description="Public creator channels appear here after someone creates one. No artists or subscriber counts are invented." icon="channels" action={user ? <button type="button" className="secondary-button" onClick={() => setCreateOpen(true)}>Create a channel</button> : <Link className="secondary-button" href="/register">Join MiLey</Link>} />}
    {items.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Public channels</h2><p>Subscriber and release totals come from saved MiLey data.</p></div></div><div className="channel-grid">{items.map((item) => <Link href={`/channel/${encodeURIComponent(item.handle)}`} className="media-card channel-card" key={item.id}><div className="channel-card-banner">{item.bannerUrl && <RemoteImage src={item.bannerUrl} alt="" loading="lazy" />}</div><span className="channel-card-avatar">{item.imageUrl ? <RemoteImage src={item.imageUrl} alt="" loading="lazy" /> : item.name.slice(0, 1).toUpperCase()}</span><span className="channel-card-meta"><h3>{item.name}</h3><p>@{item.handle} · {item.subscribers} subscribers</p><p>{item.publishedTracks} public tracks</p></span></Link>)}</div></section>}
    {createOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-channel-title"><div className="modal-heading"><div><span className="eyebrow">Creator onboarding</span><h2 id="create-channel-title">Create a channel</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setCreateOpen(false)}><MusicIcon name="close" /></button></div>
      {!user ? <div className="status-banner"><MusicIcon name="lock" /><div><strong>Sign in first</strong><p>Your channel is saved to your MiLey account.</p><Link className="text-link" href="/login">Sign in <MusicIcon name="arrow" /></Link></div></div> : !user.emailVerified ? <div className="status-banner"><MusicIcon name="lock" /><div><strong>Verify your email</strong><p>A verified account is required before creating a public creator channel.</p><Link className="text-link" href="/settings">Account settings <MusicIcon name="arrow" /></Link></div></div> : <form onSubmit={createChannel} className="auth-form">
        <div className="form-grid"><div className="form-field"><label className="form-label" htmlFor="channel-name">Channel name</label><input id="channel-name" className="form-input" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} required /></div><div className="form-field"><label className="form-label" htmlFor="channel-handle">Unique handle</label><input id="channel-handle" className="form-input" maxLength={32} value={handle} onChange={(event) => setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} pattern="[a-z0-9_]{3,32}" required placeholder="your_channel" /><span className="form-help">miLey.app/channel/@{handle || "your_channel"}</span></div>
          <div className="form-field is-wide"><label className="form-label" htmlFor="channel-description">About</label><textarea id="channel-description" className="form-textarea" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Tell listeners what you create." /></div>
          <div className="form-field"><label className="form-label" htmlFor="channel-language">Primary language</label><select id="channel-language" className="form-select" value={language} onChange={(event) => setLanguage(event.target.value)}>{LANGUAGES.map((item) => <option key={item}>{item}</option>)}</select></div><div className="form-field"><label className="form-label" htmlFor="channel-genre">Main genre</label><select id="channel-genre" className="form-select" value={genre} onChange={(event) => setGenre(event.target.value)}>{GENRES.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="form-field is-wide"><label className="form-label" htmlFor="channel-privacy">Visibility</label><select id="channel-privacy" className="form-select" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="public">Public — discoverable by anyone</option><option value="private">Private — only you can browse</option></select></div>
          <div className="form-field"><label className="form-label" htmlFor="channel-profile-image">Profile image · optional</label><input id="channel-profile-image" className="form-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setProfileImage(event.target.files?.[0] || null)} /></div><div className="form-field"><label className="form-label" htmlFor="channel-banner-image">Banner · optional</label><input id="channel-banner-image" className="form-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setBannerImage(event.target.files?.[0] || null)} /></div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving your channel…" : "Create channel"}</button>
      </form>}
    </section></div>}
    {userLoading && <span className="sr-only" role="status">Checking account.</span>}
  </main>;
}
