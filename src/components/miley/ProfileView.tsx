"use client";

import RemoteImage from "./RemoteImage";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Playlist, Track, Channel } from "@/lib/miley-types";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";
import TrackList, { Artwork } from "./TrackList";
import EmptyState from "./EmptyState";

type Profile = { id: number; username: string; displayName: string; avatarUrl: string; bio: string; isPrivate: boolean; emailVerified: boolean; followers: number; following: number; isFollowing: boolean; followsYou: boolean; followRequestPending: boolean; canViewContent: boolean; email?: string; birthDate?: string; gender?: string };
type ChannelInfo = Pick<Channel, "id" | "ownerId" | "name" | "handle" | "imageUrl" | "bannerUrl" | "description" | "visibility" | "genre" | "language">;

export default function ProfileView({ username }: { username: string }) {
  const router = useRouter();
  const { user, showNotice } = useMusic();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/social/profiles/${encodeURIComponent(username)}`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Profile not found.");
      if (active) { setProfile(result.profile); setTracks(result.tracks || []); setPlaylists(result.playlists || []); setChannel(result.channel || null); }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Profile could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [username]);

  const changeFollow = async () => {
    if (!user || !profile) { showNotice("Sign in to follow MiLey listeners."); return; }
    if (profile.id === user.id) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/social/follows/${encodeURIComponent(profile.username)}`, { method: profile.isFollowing || profile.followRequestPending ? "DELETE" : "POST" });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Follow could not be updated.");
      setProfile((previous) => previous ? { ...previous, isFollowing: result.following, followRequestPending: result.requested, followers: previous.followers + (result.following ? 1 : previous.isFollowing ? -1 : 0) } : previous);
      showNotice(result.requested ? "Follow request sent." : result.following ? "Following." : "Follow removed.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Follow could not be updated."); }
    finally { setBusy(false); }
  };

  const blockProfile = async () => {
    if (!profile || !user || !window.confirm(`Block @${profile.username}? This removes follows in both directions and hides both profiles.`)) return;
    setBusy(true);
    try { const response = await fetch("/api/social/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: profile.username }) }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "This account could not be blocked."); router.push("/explore"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "This account could not be blocked."); setBusy(false); }
  };

  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault(); if (!profile) return;
    setBusy(true);
    try { const response = await fetch("/api/social/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "user", targetId: profile.id, reason: reportReason }) }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Report could not be sent."); setReportOpen(false); setReportReason(""); showNotice("Report submitted for review."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Report could not be sent."); }
    finally { setBusy(false); }
  };

  if (loading) return <main className="miley-page" id="main-content"><div className="loading-skeleton" style={{ height: 280 }} /></main>;
  if (!profile) return <main className="miley-page" id="main-content"><EmptyState title="Profile unavailable" description={error || "This profile could not be found."} icon="profile" action={<Link className="secondary-button" href="/explore">Explore music</Link>} /></main>;

  const self = user?.id === profile.id;
  const mutual = profile.isFollowing && profile.followsYou;
  return <main className="miley-page profile-page" id="main-content" tabIndex={-1}>
    {error && <div className="status-banner is-error" role="alert"><MusicIcon name="shield" /><div><strong>Profile action</strong><p>{error}</p></div></div>}
    <section className="profile-hero"><div className="profile-cover" />{channel?.bannerUrl && <RemoteImage className="profile-cover-image" src={channel.bannerUrl} alt="" />}<div className="profile-hero-content"><span className="profile-avatar-large">{profile.avatarUrl ? <RemoteImage src={profile.avatarUrl} alt={`${profile.displayName}'s profile`} /> : profile.displayName.slice(0,1).toUpperCase()}</span><div className="profile-heading-copy"><span className="page-eyebrow">MiLey listener {profile.emailVerified && <MusicIcon name="verified" />}</span><h1>{profile.displayName}</h1><p>@{profile.username}{profile.isPrivate && <span className="profile-private"><MusicIcon name="lock" /> Private account</span>}</p><div className="profile-bio">{profile.bio || "No bio yet."}</div></div><div className="profile-actions">{self ? <Link className="secondary-button" href="/settings"><MusicIcon name="edit" /> Edit profile</Link> : <>
      <button type="button" className={profile.isFollowing ? "secondary-button" : "primary-button"} disabled={busy || !user} onClick={() => void changeFollow()}>{profile.isFollowing ? "Following" : profile.followRequestPending ? "Cancel request" : profile.isPrivate ? "Request to follow" : "Follow"}</button>
      {mutual && <Link className="secondary-button" href={`/messages?to=${encodeURIComponent(profile.username)}`}><MusicIcon name="send" /> Message</Link>}
      {user && <div className="profile-more-actions"><button type="button" className="quiet-button" onClick={() => setReportOpen(true)}>Report</button><button type="button" className="quiet-button is-danger-text" disabled={busy} onClick={() => void blockProfile()}>Block</button></div>}
      {!user && <Link className="secondary-button" href={`/login?next=${encodeURIComponent(`/profile/${profile.username}`)}`}>Sign in to follow</Link>}
    </>}</div></div><div className="profile-stats"><span><strong>{profile.followers}</strong> followers</span><span><strong>{profile.following}</strong> following</span>{channel && <Link href={`/channel/${encodeURIComponent(channel.handle)}`}><strong>Creator channel</strong> @{channel.handle}</Link>}</div></section>
    {profile.canViewContent ? <>
      {channel && <section className="section-block profile-channel-card"><div className="section-heading"><div><span className="page-eyebrow">Creator channel</span><h2>{channel.name}</h2><p>{channel.description || "Creator releases and channel updates."}</p></div><Link className="text-link" href={`/channel/${encodeURIComponent(channel.handle)}`}>Visit channel <MusicIcon name="arrow" /></Link></div></section>}
      <section className="section-block"><div className="section-heading"><div><h2>Public tracks</h2><p>Only tracks shared publicly by this account are shown.</p></div></div>{tracks.length ? <TrackList tracks={tracks} /> : <EmptyState title="No public tracks" description="This listener has not published any public music." icon="music" />}</section>
      {playlists.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Public playlists</h2><p>Curated by @{profile.username}.</p></div></div><div className="playlist-grid">{playlists.map((item) => <Link className="media-card" href={`/playlist/${item.id}`} key={item.id}><Artwork src={item.artworkUrl} title={item.title} /><p className="media-card-title">{item.title}</p><p className="media-card-subtitle">Public playlist</p></Link>)}</div></section>}
    </> : <section className="profile-private-empty"><EmptyState title="This profile is private" description="Follow requests are reviewed by the account owner. Public profile details stay limited until they approve you." icon="lock" /></section>}
    {reportOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="report-profile-title"><div className="modal-heading"><div><span className="eyebrow">Community safety</span><h2 id="report-profile-title">Report profile</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setReportOpen(false)}><MusicIcon name="close" /></button></div><form className="auth-form" onSubmit={submitReport}><div><label className="form-label" htmlFor="report-reason">What should our moderators review?</label><textarea id="report-reason" className="form-textarea" value={reportReason} onChange={(event) => setReportReason(event.target.value)} minLength={5} maxLength={1000} required /></div><p className="form-help">Please report a specific concern. Reports are visible to authorized service moderators, not other users.</p><button type="submit" className="primary-button" disabled={busy || reportReason.trim().length < 5}>Submit report</button></form></section></div>}
  </main>;
}
