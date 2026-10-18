"use client";

import RemoteImage from "./RemoteImage";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Album, Playlist, Track, Channel } from "@/lib/miley-types";
import MusicIcon from "./Icon";
import { useMusic } from "./MusicProvider";
import TrackList, { Artwork } from "./TrackList";
import EmptyState from "./EmptyState";

const LANGUAGES = ["Hindi", "English", "Bhojpuri", "Punjabi", "Bengali", "Tamil", "Telugu", "Marathi", "Other"];
type SearchResult = { tracks: Track[]; albums: Array<Album & { channelName?: string; channelHandle?: string }>; channels: Array<Channel & { ownerUsername?: string }>; playlists: Array<Playlist & { ownerUsername?: string }> };

export default function ExploreView() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("all");
  const [genre, setGenre] = useState("all");
  const [result, setResult] = useState<SearchResult>({ tracks: [], albums: [], channels: [], playlists: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { playQueue } = useMusic();

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const trimmed = query.trim();
      const url = trimmed.length >= 2 ? `/api/music/search?q=${encodeURIComponent(trimmed)}` : "/api/music/tracks?limit=40";
      fetch(url, { cache: "no-store" }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Search is unavailable.");
        const next: SearchResult = trimmed.length >= 2
          ? { tracks: data.tracks || [], albums: data.albums || [], channels: data.channels || [], playlists: data.playlists || [] }
          : { tracks: data.items || [], albums: [], channels: [], playlists: [] };
        if (alive) setResult(next);
      }).catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "Search is unavailable."); })
        .finally(() => { if (alive) setLoading(false); });
    }, query.trim().length >= 2 ? 230 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  const genres = useMemo(() => [...new Set(result.tracks.map((item) => item.genre?.trim()).filter((item): item is string => Boolean(item)))].sort(), [result.tracks]);
  const filteredTracks = result.tracks.filter((item) => (language === "all" || item.language?.toLowerCase() === language.toLowerCase()) && (genre === "all" || item.genre === genre));
  const searchActive = query.trim().length >= 2;
  const hasResults = filteredTracks.length + result.albums.length + result.channels.length + result.playlists.length > 0;

  return <main className="miley-page" id="main-content" tabIndex={-1}>
    <div className="page-heading-row"><div><span className="page-eyebrow">Find your next favorite</span><h1 className="page-title">Explore sounds<br />and the people behind them.</h1><p className="page-subtitle">Search real songs, creator channels, albums and playlists. Results only include content actually shared on MiLey.</p></div></div>
    <div className="explore-toolbar">
      <label className="explore-search"><MusicIcon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs, artists, albums, channels…" aria-label="Search music" /></label>
      <select className="filter-select" aria-label="Filter by language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">All languages</option>{LANGUAGES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <select className="filter-select" aria-label="Filter by genre" value={genre} onChange={(event) => setGenre(event.target.value)}><option value="all">All genres</option>{genres.map((item) => <option key={item} value={item}>{item}</option>)}</select>
    </div>
    <div className="filter-chips hide-scrollbar" aria-label="Popular languages">{LANGUAGES.map((item) => <button key={item} className="filter-chip" type="button" aria-pressed={language.toLowerCase() === item.toLowerCase()} onClick={() => setLanguage(language.toLowerCase() === item.toLowerCase() ? "all" : item)}>{item}</button>)}</div>
    {error && <div className="status-banner is-error" role="status"><MusicIcon name="shield" /><div><strong>Search is unavailable</strong><p>{error}</p></div></div>}
    {searchActive && <p className="explore-result-count" aria-live="polite">{loading ? "Searching the available catalog…" : hasResults ? `Results for “${query.trim()}”` : "No matching catalog items found."}</p>}
    {loading && <div className="loading-skeleton" style={{ height: 110, marginTop: 20 }} />}
    {!loading && !error && !searchActive && result.tracks.length === 0 && <EmptyState title="No public tracks yet" description="When creators publish music they have rights to share, it will appear here. You can also create a MiLey channel and upload your own authorized releases." icon="disc" />}
    {!loading && filteredTracks.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Songs</h2><p>{filteredTracks.length} real {filteredTracks.length === 1 ? "track" : "tracks"}</p></div><button type="button" className="text-button" onClick={() => void playQueue(filteredTracks)}>Play results</button></div><TrackList tracks={filteredTracks} /></section>}
    {!loading && result.channels.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Channels</h2><p>Creator channels matching your search</p></div></div><div className="channel-grid">{result.channels.map((channel) => <Link href={`/channel/${encodeURIComponent(channel.handle)}`} className="media-card channel-card" key={channel.id}><div className="channel-card-banner">{channel.bannerUrl && <RemoteImage src={channel.bannerUrl} alt="" loading="lazy" />}</div><span className="channel-card-avatar">{channel.imageUrl ? <RemoteImage src={channel.imageUrl} alt="" loading="lazy" /> : channel.name.slice(0,1).toUpperCase()}</span><span className="channel-card-meta"><h3>{channel.name}</h3><p>@{channel.handle}</p></span></Link>)}</div></section>}
    {!loading && result.albums.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Albums</h2><p>Published albums from MiLey creators</p></div></div><div className="album-grid">{result.albums.map((album) => <Link href={`/album/${album.id}`} className="media-card" key={album.id}><Artwork src={album.artworkUrl} title={album.title} /><p className="media-card-title">{album.title}</p><p className="media-card-subtitle">{album.channelName || "MiLey creator"}</p></Link>)}</div></section>}
    {!loading && result.playlists.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Playlists</h2><p>Public playlists made by real listeners</p></div></div><div className="playlist-grid">{result.playlists.map((playlist) => <Link href={`/playlist/${playlist.id}`} className="media-card" key={playlist.id}><Artwork src={playlist.artworkUrl} title={playlist.title} /><p className="media-card-title">{playlist.title}</p><p className="media-card-subtitle">{playlist.ownerUsername ? `@${playlist.ownerUsername}` : "MiLey listener"}</p></Link>)}</div></section>}
    {!loading && searchActive && !hasResults && !error && <EmptyState title="No results this time" description="Try another spelling, artist name, language, or channel handle. MiLey does not generate placeholder results." icon="search" />}
    <div className="section-block"><div className="section-heading"><div><h2>Language filters</h2><p>Filters show only songs whose creators supplied matching catalog metadata.</p></div></div><div className="filter-chips hide-scrollbar">{LANGUAGES.map((item) => <button key={item} className="filter-chip" type="button" aria-pressed={language.toLowerCase() === item.toLowerCase()} onClick={() => setLanguage(language.toLowerCase() === item.toLowerCase() ? "all" : item)}>{item}</button>)}</div></div>
  </main>;
}
