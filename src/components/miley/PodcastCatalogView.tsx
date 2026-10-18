"use client";

import RemoteImage from "./RemoteImage";

import { useEffect, useState } from "react";
import Link from "next/link";
import MusicIcon from "./Icon";
import EmptyState from "./EmptyState";

type Show = { id: number; title: string; description: string; artworkUrl: string; language: string; rightsReviewedAt: string | null; episodeCount: number; latestEpisode: { id: number; title: string; publishedAt: string | null; durationSeconds: number | null } | null };
export default function PodcastCatalogView() {
  const [items, setItems] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; fetch("/api/podcasts", { cache: "no-store" }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Podcast catalog is unavailable."); if (active) setItems(result.items || []); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Podcast catalog is unavailable."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  return <main className="miley-page podcast-page" id="main-content" tabIndex={-1}><div className="page-heading-row"><div><span className="page-eyebrow">A spoken-word corner</span><h1 className="page-title">Podcasts.</h1><p className="page-subtitle">Only shows reviewed and explicitly authorized by the MiLey operator appear here. No scraped feeds or invented episodes.</p></div></div>
    {error && <div className="status-banner is-error" role="status"><MusicIcon name="shield" /><div><strong>Podcast catalog unavailable</strong><p>{error}</p></div></div>}
    {loading && <div className="loading-skeleton" style={{ height: 180 }} />}
    {!loading && !error && !items.length && <EmptyState title="No authorized podcasts yet" description="There are no operator-approved podcast feeds in this catalog. Shows are not pulled in automatically; a service operator must review distribution permission before a feed is listed." icon="headphones" />}
    {items.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Reviewed shows</h2><p>{items.length} {items.length === 1 ? "authorized show" : "authorized shows"}</p></div><span className="eyebrow"><MusicIcon name="shield" /> rights reviewed</span></div><div className="podcast-grid">{items.map((show) => <Link className="podcast-card" href={`/podcast/${show.id}`} key={show.id}><span className="podcast-artwork">{show.artworkUrl ? <RemoteImage src={show.artworkUrl} alt={`${show.title} cover`} loading="lazy" /> : <MusicIcon name="headphones" />}</span><span className="podcast-card-copy"><span className="podcast-authorized"><MusicIcon name="verified" /> Authorized catalog</span><strong>{show.title}</strong><span>{show.language || "Language not specified"} · {show.episodeCount} {show.episodeCount === 1 ? "episode" : "episodes"}</span>{show.latestEpisode && <small>Latest: {show.latestEpisode.title}</small>}</span><MusicIcon name="arrow" /></Link>)}</div></section>}
  </main>;
}
