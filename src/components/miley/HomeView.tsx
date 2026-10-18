"use client";

import RemoteImage from "./RemoteImage";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Track } from "@/lib/miley-types";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";
import TrackList from "./TrackList";
import EmptyState from "./EmptyState";
import { Artwork } from "./TrackList";

function Section({ title, subtitle, href, children }: { title: string; subtitle?: string; href?: string; children: React.ReactNode }) {
  return <section className="section-block"><div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{href && <Link href={href} className="text-link">See all <MusicIcon name="arrow" /></Link>}</div>{children}</section>;
}

export default function HomeView() {
  const { user, library, libraryLoading, refreshLibrary, play, playQueue, showNotice } = useMusic();
  const [catalog, setCatalog] = useState<Track[]>([]);
  const [notes, setNotes] = useState<Array<{ id: number; caption: string; author: { username: string; displayName: string; avatarUrl: string }; track: Track }>>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/music/tracks?limit=40", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Music catalogue is unavailable.");
      if (active) { setCatalog(result.items || []); setCatalogError(""); }
    }).catch((error) => { if (active) setCatalogError(error instanceof Error ? error.message : "Music catalogue is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    if (user) fetch("/api/social/notes", { cache: "no-store" }).then((response) => response.json()).then((payload) => { if (active) setNotes(payload.items || []); }).catch(() => undefined);
    return () => { active = false; };
  }, [user]);

  useEffect(() => { if (user) void refreshLibrary(); }, [user, refreshLibrary]);

  const recommendations = useMemo(() => {
    if (!user?.recommendationsEnabled || !library?.favorites?.length) return [];
    const preferred = new Set(library.favorites.map((item) => item.genre?.trim().toLowerCase()).filter(Boolean));
    const excluded = new Set([...library.favorites.map((item) => item.id), ...library.recentTracks.map((item) => item.id)]);
    return catalog.filter((item) => !excluded.has(item.id) && preferred.has(item.genre?.trim().toLowerCase() || "")).slice(0, 12);
  }, [catalog, library, user]);

  const recent = library?.recentTracks?.filter((item) => item.positionSeconds && item.durationSeconds && item.positionSeconds < item.durationSeconds - 20) ?? [];
  const favorites = library?.favorites ?? [];
  const hasCatalog = catalog.length > 0;

  return <main className="miley-page home-page" id="main-content" tabIndex={-1}>
    <section className="home-hero" aria-labelledby="welcome-title">
      <div className="home-hero-copy">
        <span className="page-eyebrow">MiLey · music, made personal</span>
        <h1 id="welcome-title">A little closer<br />to the <em>music.</em></h1>
        <p>Listen to music shared by independent creators, keep the songs that stay with you, and find your people along the way.</p>
        <div className="home-hero-actions">
          <Link href="/explore" className="primary-button"><MusicIcon name="search" /> Explore music</Link>
          {user ? <Link href="/library" className="secondary-button"><MusicIcon name="library" /> Your library</Link> : <Link href="/register" className="secondary-button"><MusicIcon name="profile" /> Create an account</Link>}
        </div>
      </div>
      <div className="home-hero-art" aria-hidden="true"><div className="hero-orbit" /><div className="hero-vinyl"><div className="hero-vinyl-center"><MusicIcon name="music" /></div></div></div>
      <span className="home-hero-aside"><MusicIcon name="headphones" /> built around real creator releases</span>
    </section>

    <div className="home-shortcuts" aria-label="Quick links">
      <Link className="shortcut-card" href="/explore"><span className="shortcut-icon"><MusicIcon name="search" /></span><span><strong>Find your sound</strong><small>Search creator releases</small></span></Link>
      <Link className="shortcut-card" href="/channels"><span className="shortcut-icon"><MusicIcon name="channels" /></span><span><strong>Meet the creators</strong><small>Explore real channels</small></span></Link>
      <Link className="shortcut-card" href="/library"><span className="shortcut-icon"><MusicIcon name="playlist" /></span><span><strong>Your collection</strong><small>Favorites, playlists & uploads</small></span></Link>
      <Link className="shortcut-card" href="/podcasts"><span className="shortcut-icon"><MusicIcon name="headphones" /></span><span><strong>Podcasts</strong><small>Authorized shows only</small></span></Link>
    </div>

    {user && <section className="section-block" aria-label="Music notes">
      <div className="section-heading"><div><h2>Notes from your circle</h2><p>Music notes are shared only between mutual follows.</p></div><button className="text-button" type="button" onClick={() => showNotice("Add a song note from Your Library.")}>How it works</button></div>
      <div className="music-note-rail hide-scrollbar">
        <Link className="note-composer" href="/library"><span className="note-add"><MusicIcon name="plus" /></span><span>Share a song note</span></Link>
        {notes.map((note) => <button className="music-note-card" type="button" key={note.id} onClick={() => void play(note.track, [note.track])} aria-label={`Play ${note.track.title} shared by ${note.author.displayName}`}>
          <span className="note-avatar">{note.author.avatarUrl ? <RemoteImage src={note.author.avatarUrl} alt="" /> : note.author.displayName.slice(0, 1).toUpperCase()}</span>
          <span className="note-copy"><strong>{note.author.displayName} · @{note.author.username}</strong><span><span className="note-track-art"><MusicIcon name="music" /></span>{note.track.title}{note.caption ? ` · ${note.caption}` : ""}</span></span>
        </button>)}
        {!notes.length && <p className="empty-copy">When mutual follows share a music note, it will appear here.</p>}
      </div>
    </section>}

    {catalogError && <div className="status-banner is-error" role="status"><MusicIcon name="shield" /><div><strong>Music catalogue is unavailable</strong><p>{catalogError}</p></div></div>}

    {recent.length > 0 && <Section title="Pick up where you left off" subtitle="Your listening history, from this account." href="/library?tab=history"><TrackList tracks={recent.slice(0, 6)} /></Section>}
    {favorites.length > 0 && <Section title="Your favorites" subtitle="The songs you have chosen to keep." href="/library?tab=favorites"><TrackList tracks={favorites.slice(0, 6)} /></Section>}
    {recommendations.length > 0 && <Section title="More in your lane" subtitle="Based on genres in your saved music — never your age or profile details." href="/explore"><TrackList tracks={recommendations} /></Section>}
    {hasCatalog && <Section title="Fresh from MiLey creators" subtitle="Recently published, rights-confirmed tracks from public channels." href="/explore"><TrackList tracks={catalog.slice(0, 8)} /></Section>}
    {library?.playlists?.length ? <Section title="Your playlists" subtitle="Your music, in your own order." href="/library?tab=playlists"><div className="playlist-grid">{library.playlists.slice(0, 5).map((playlist) => <Link className="media-card" href={`/playlist/${playlist.id}`} key={playlist.id}><Artwork src={(playlist as { artworkUrl?: string }).artworkUrl} title={playlist.title} /><p className="media-card-title">{playlist.title}</p><p className="media-card-subtitle">{playlist.visibility === "public" ? "Public playlist" : "Private playlist"}</p></Link>)}</div></Section> : null}

    {!loading && !hasCatalog && !catalogError && <Section title="A real music catalog starts with creators" subtitle="MiLey does not fill shelves with demo songs or made-up artists."><EmptyState title="No public music yet" description="Public, rights-confirmed songs will appear here when a creator publishes them. You can still set up your library or create a channel." icon="disc" action={<Link href={user ? "/library" : "/register"} className="secondary-button">{user ? "Set up your channel" : "Join MiLey"}</Link>} /></Section>}
    {loading && <section className="section-block"><div className="section-heading"><div><h2>Finding your next listen</h2><p>Loading the real MiLey catalog…</p></div></div><div className="loading-skeleton" style={{ height: 180 }} /></section>}
    {libraryLoading && <span className="sr-only" role="status">Your library is loading.</span>}
    <footer className="miley-footer"><Link href="/">MiLey</Link><span>Music shared with care.</span><div><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/licenses">Open-source licenses</Link><Link href="/settings">Settings</Link></div></footer>
  </main>;
}
