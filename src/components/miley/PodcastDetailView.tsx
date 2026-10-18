"use client";

import RemoteImage from "./RemoteImage";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";
import EmptyState from "./EmptyState";

type Podcast = { id: number; title: string; description: string; artworkUrl: string; language: string; rightsReviewedAt: string | null; subscribed: boolean };
type Episode = { id: number; title: string; description: string; audioUrl: string; artworkUrl: string; durationSeconds: number | null; publishedAt: string | null };
function dateLabel(value: string | null) { if (!value) return "Date not specified"; const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date) : "Date not specified"; }
export default function PodcastDetailView({ id }: { id: string }) {
  const { user, showNotice } = useMusic();
  const [podcast, setPodcast] = useState<Podcast | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const response = await fetch(`/api/podcasts/${id}`, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Podcast not found."); setPodcast(result.podcast); setEpisodes(result.episodes || []); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Podcast could not be loaded."); } finally { setLoading(false); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <main className="miley-page" id="main-content"><div className="loading-skeleton" style={{ height: 260 }} /></main>;
  if (!podcast) return <main className="miley-page" id="main-content"><EmptyState title="Podcast unavailable" description={error || "This show is not in the authorized catalog."} icon="headphones" action={<Link className="secondary-button" href="/podcasts">Browse podcasts</Link>} /></main>;
  const subscribe = async () => { if (!user) { showNotice("Sign in to subscribe to a show."); return; } setBusy(true); try { const response = await fetch(`/api/podcasts/${id}/subscribe`, { method: podcast.subscribed ? "DELETE" : "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Subscription could not be updated."); setPodcast((previous) => previous ? { ...previous, subscribed: result.subscribed } : previous); showNotice(result.subscribed ? "Podcast subscribed." : "Podcast unsubscribed."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Subscription could not be updated."); } finally { setBusy(false); } };
  return <main className="miley-page podcast-page" id="main-content" tabIndex={-1}>{error && <div className="status-banner is-error" role="alert"><MusicIcon name="shield" /><div><strong>Podcast</strong><p>{error}</p></div></div>}
    <section className="podcast-hero"><span className="podcast-artwork podcast-artwork-large">{podcast.artworkUrl ? <RemoteImage src={podcast.artworkUrl} alt={`${podcast.title} cover`} /> : <MusicIcon name="headphones" />}</span><div><span className="podcast-authorized"><MusicIcon name="verified" /> Operator-reviewed distribution permission</span><h1>{podcast.title}</h1><p>{podcast.description || "No description provided."}</p><div className="channel-meta-chips">{podcast.language && <span>{podcast.language}</span>}<span>Reviewed {dateLabel(podcast.rightsReviewedAt)}</span><span>{episodes.length} {episodes.length === 1 ? "episode" : "episodes"}</span></div><button className={podcast.subscribed ? "secondary-button" : "primary-button"} type="button" disabled={busy || !user?.emailVerified} onClick={() => void subscribe()}><MusicIcon name={podcast.subscribed ? "check" : "plus"} />{podcast.subscribed ? "Subscribed" : "Subscribe"}</button>{!user?.emailVerified && <p className="form-help">Sign in and verify your email to save subscriptions.</p>}</div></section>
    <section className="section-block"><div className="section-heading"><div><h2>Episodes</h2><p>Audio controls use the authorized publisher’s HTTPS media source.</p></div></div>{episodes.length ? <div className="podcast-episodes">{episodes.map((episode) => <article className="podcast-episode" key={episode.id}><div className="podcast-episode-heading"><span className="podcast-episode-icon"><MusicIcon name="play" /></span><div><h3>{episode.title}</h3><p>{dateLabel(episode.publishedAt)}{episode.durationSeconds ? ` · ${Math.floor(episode.durationSeconds/60)} min` : ""}</p></div></div>{episode.description && <p className="podcast-episode-description">{episode.description}</p>}{episode.audioUrl ? <audio className="podcast-audio" controls preload="none" src={episode.audioUrl}><a href={episode.audioUrl}>Listen to {episode.title}</a></audio> : <p className="form-help">This episode does not have a valid secure audio source.</p>}</article>)}</div> : <EmptyState title="No published episodes" description="This authorized show does not have any episodes in MiLey yet." icon="headphones" />}</section>
    <p className="notifications-footnote">Podcast audio comes from the external publisher’s media host. Background playback and mobile OS controls depend on browser support and are not guaranteed here.</p>
  </main>;
}
