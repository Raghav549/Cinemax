"use client";

import RemoteImage from "./RemoteImage";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MusicIconName } from "./Icon";
import MusicIcon from "./Icon";
import { useMusic } from "./MusicProvider";
import EmptyState from "./EmptyState";

type Notification = { id: number; kind: string; resourceId: number | null; createdAt: string; readAt: string | null; actor: { username: string; displayName: string; avatarUrl: string } | null };
type FollowRequest = { request: { id: number; requesterId: number; createdAt: string }; username: string; displayName: string; avatarUrl: string };
function ago(dateValue: string) { const date = new Date(dateValue); if (!Number.isFinite(date.getTime())) return ""; const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000)); if (seconds < 60) return "just now"; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function copy(kind: string, actor?: string) { const who = actor || "Someone"; switch (kind) { case "new_follower": return `${who} started following you.`; case "follow_request": return `${who} requested to follow you.`; case "follow_accepted": return `${who} accepted your follow request.`; case "channel_subscription": return `${who} subscribed to your creator channel.`; case "channel_release": return `${who} published a new music release.`; case "message": return `${who} sent you a message.`; default: return `${who} interacted with your MiLey account.`; } }
function icon(kind: string): MusicIconName { return kind.includes("follow") ? "profile" : kind.includes("channel") ? "channels" : kind === "message" ? "messages" : "bell"; }

export default function NotificationsView() {
  const { user, userLoading, showNotice } = useMusic();
  const [items, setItems] = useState<Notification[]>([]);
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const load = async () => {
    try {
      const [notificationResponse, requestResponse] = await Promise.all([fetch("/api/social/notifications", { cache: "no-store" }), fetch("/api/social/follow-requests", { cache: "no-store" })]);
      const [notificationData, requestData] = await Promise.all([notificationResponse.json(), requestResponse.json()]);
      if (!notificationResponse.ok) throw new Error(notificationData?.error || "Notifications could not be loaded.");
      setItems(notificationData.items || []); setRequests(requestData.items || []); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Notifications could not be loaded."); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (user) void load(); else setLoading(false); }, [user]);

  const markAll = async () => {
    try { const response = await fetch("/api/social/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Notifications could not be updated."); setItems((previous) => previous.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Notifications could not be updated."); }
  };
  const respond = async (requestId: number, action: "accept" | "reject") => {
    setBusyId(requestId); setError("");
    try { const response = await fetch("/api/social/follow-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, action }) }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Follow request could not be updated."); setRequests((previous) => previous.filter((item) => item.request.id !== requestId)); showNotice(action === "accept" ? "Follow request accepted." : "Follow request declined."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Follow request could not be updated."); }
    finally { setBusyId(null); }
  };

  if (userLoading) return <main className="miley-page" id="main-content"><div className="loading-skeleton" style={{ height: 260 }} /></main>;
  if (!user) return <main className="miley-page" id="main-content"><div className="page-heading-row"><div><span className="page-eyebrow">Stay in the loop</span><h1 className="page-title">Notifications.</h1></div></div><EmptyState title="Sign in to see notifications" description="Follow requests, new follows, and in-app activity belong to your account." icon="bell" action={<Link className="primary-button" href="/login?next=%2Fnotifications">Sign in</Link>} /></main>;

  const unread = items.filter((item) => !item.readAt).length;
  return <main className="miley-page notifications-page" id="main-content" tabIndex={-1}><div className="page-heading-row"><div><span className="page-eyebrow">Your MiLey circle</span><h1 className="page-title">Notifications.</h1><p className="page-subtitle">In-app updates from people and channels you chose to connect with.</p></div>{unread > 0 && <button className="secondary-button" type="button" onClick={() => void markAll()}>Mark all read</button>}</div>
    {error && <div className="status-banner is-error" role="alert"><MusicIcon name="shield" /><div><strong>Notifications</strong><p>{error}</p></div></div>}
    {requests.length > 0 && <section className="section-block"><div className="section-heading"><div><h2>Follow requests</h2><p>Accepting lets this account follow your private profile.</p></div></div><div className="follow-request-list">{requests.map((item) => <article className="follow-request-card" key={item.request.id}><Link className="chat-avatar" href={`/profile/${encodeURIComponent(item.username)}`}>{item.avatarUrl ? <RemoteImage src={item.avatarUrl} alt="" /> : item.displayName.slice(0,1).toUpperCase()}</Link><div className="follow-request-copy"><strong>{item.displayName}</strong><Link href={`/profile/${encodeURIComponent(item.username)}`}>@{item.username}</Link><small>{ago(item.request.createdAt)}</small></div><div className="follow-request-actions"><button type="button" className="primary-button" disabled={busyId === item.request.id} onClick={() => void respond(item.request.id, "accept")}>Accept</button><button type="button" className="quiet-button" disabled={busyId === item.request.id} onClick={() => void respond(item.request.id, "reject")}>Decline</button></div></article>)}</div></section>}
    {loading ? <div className="loading-skeleton" style={{ height: 200 }} /> : items.length ? <section className="section-block"><div className="section-heading"><div><h2>Recent activity</h2><p>{unread ? `${unread} unread` : "You're all caught up."}</p></div></div><div className="notification-list">{items.map((item) => <article className={`notification-row ${item.readAt ? "" : "is-unread"}`} key={item.id}><span className="notification-icon"><MusicIcon name={icon(item.kind)} /></span>{item.actor ? <Link className="notification-avatar" href={`/profile/${encodeURIComponent(item.actor.username)}`}>{item.actor.avatarUrl ? <RemoteImage src={item.actor.avatarUrl} alt="" /> : item.actor.displayName.slice(0,1).toUpperCase()}</Link> : <span className="notification-avatar is-placeholder"><MusicIcon name="profile" /></span>}<p>{copy(item.kind, item.actor?.displayName)}{item.actor && <Link href={`/profile/${encodeURIComponent(item.actor.username)}`} className="notification-handle"> @{item.actor.username}</Link>}</p><time>{ago(item.createdAt)}</time>{!item.readAt && <i aria-label="Unread" />}</article>)}</div></section> : !requests.length ? <EmptyState title="All quiet here" description="When someone follows you, requests to follow a private profile, or interacts with your channel, they will appear here." icon="bell" /> : null}
    <p className="notifications-footnote">Notification settings control saved preferences. Push or email alerts are not enabled by default.</p>
  </main>;
}
