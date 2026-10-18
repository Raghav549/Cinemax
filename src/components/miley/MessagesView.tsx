"use client";

import RemoteImage from "./RemoteImage";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import MusicIcon from "./Icon";
import EmptyState from "./EmptyState";
import { useMusic } from "./MusicProvider";

type Other = { id: number; username: string; displayName: string; avatarUrl: string; isPrivate: boolean };
type ThreadSummary = { id: number; other: Other; lastMessage: string; lastSenderId: number; lastMessageAt: string; unreadCount: number };
type Message = { id: number; senderId: number; body: string; createdAt: string; mine: boolean };

function timeLabel(value: string) { const date = new Date(value); if (!Number.isFinite(date.getTime())) return ""; return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date); }
function dateLabel(value: string) { const date = new Date(value); if (!Number.isFinite(date.getTime())) return ""; return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date); }

export default function MessagesView() {
  const { user, userLoading, showNotice } = useMusic();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [other, setOther] = useState<Other | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [firstBody, setFirstBody] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [threadVisible, setThreadVisible] = useState(false);
  const messageEnd = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLInputElement>(null);

  const loadThreads = useCallback(async () => {
    if (!user) { setThreads([]); setLoadingList(false); return; }
    try {
      const response = await fetch("/api/social/messages", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Messages could not be loaded.");
      setThreads(result.items || []);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Messages could not be loaded."); }
    finally { setLoadingList(false); }
  }, [user]);

  const loadThread = useCallback(async (id: number, quiet = false) => {
    if (!quiet) setLoadingThread(true);
    try {
      const response = await fetch(`/api/social/messages/${id}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "This conversation is unavailable.");
      setOther(result.other || null); setMessages(result.items || []);
      setThreads((previous) => previous.map((thread) => thread.id === id ? { ...thread, unreadCount: 0 } : thread));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This conversation is unavailable."); }
    finally { if (!quiet) setLoadingThread(false); }
  }, []);

  useEffect(() => { void loadThreads(); }, [loadThreads]);
  useEffect(() => { if (!user) return; const interval = window.setInterval(() => void loadThreads(), 12_000); return () => window.clearInterval(interval); }, [loadThreads, user]);
  useEffect(() => { if (activeId !== null) void loadThread(activeId); else { setOther(null); setMessages([]); } }, [activeId, loadThread]);
  useEffect(() => { if (activeId === null) return; const interval = window.setInterval(() => void loadThread(activeId, true), 5_000); return () => window.clearInterval(interval); }, [activeId, loadThread]);
  useEffect(() => { messageEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);
  useEffect(() => { const to = new URLSearchParams(window.location.search).get("to"); if (to) { setNewUsername(to.replace(/^@/, "")); setNewOpen(true); } }, []);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault(); const clean = body.trim(); if (!clean || activeId === null) return;
    setSending(true); setError("");
    try {
      const response = await fetch(`/api/social/messages/${activeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: clean }) });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Message could not be sent.");
      setBody(""); setMessages((previous) => [...previous, result.item]); await loadThread(activeId, true); await loadThreads();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Message could not be sent."); }
    finally { setSending(false); composeRef.current?.focus(); }
  };

  const startConversation = async (event: FormEvent) => {
    event.preventDefault(); setSending(true); setError("");
    try {
      const response = await fetch("/api/social/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: newUsername.trim().replace(/^@/, ""), body: firstBody }) });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Message could not be sent.");
      setNewOpen(false); setFirstBody(""); setBody(""); await loadThreads(); setActiveId(result.conversationId); setThreadVisible(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Message could not be sent."); }
    finally { setSending(false); }
  };

  if (userLoading) return <main className="miley-page messages-page" id="main-content"><div className="loading-skeleton" style={{ height: 420 }} /></main>;
  if (!user) return <main className="miley-page messages-page" id="main-content"><div className="messages-login-card"><span className="eyebrow">A quieter way to talk</span><h1>Messages.</h1><p>Sign in and verify your email to message people who mutually follow each other.</p><Link className="primary-button" href="/login?next=%2Fmessages">Sign in</Link></div></main>;

  return <main className="miley-page messages-page" id="main-content" tabIndex={-1}>
    <div className="messages-heading"><div><span className="page-eyebrow">Private conversations</span><h1>Messages</h1><p>Only mutual follows can start a chat. Messages are not end-to-end encrypted.</p></div><button type="button" className="primary-button messages-new-button" onClick={() => setNewOpen(true)} disabled={!user.emailVerified}><MusicIcon name="plus" /> New message</button></div>
    {error && <div className="chat-alert" role="alert"><MusicIcon name="shield" /><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError("")}><MusicIcon name="close" /></button></div>}
    {!user.emailVerified && <div className="status-banner"><MusicIcon name="lock" /><div><strong>Verify your email to send messages</strong><p>Conversations are limited to people who mutually follow each other.</p><Link className="text-link" href="/settings">Verify account <MusicIcon name="arrow" /></Link></div></div>}
    <section className={`chat-layout ${threadVisible ? "thread-visible" : ""}`} aria-label="Messages inbox">
      <aside className="chat-sidebar"><div className="chat-sidebar-heading"><div><h2>Inbox</h2><span>{threads.length} {threads.length === 1 ? "conversation" : "conversations"}</span></div><button type="button" className="chat-new-icon" aria-label="New message" title="New message" onClick={() => setNewOpen(true)} disabled={!user.emailVerified}><MusicIcon name="edit" /></button></div>
        <div className="chat-search-box"><MusicIcon name="search" /><input type="search" placeholder="Your conversations" aria-label="Search conversations" onChange={(event) => { const query = event.target.value.toLowerCase(); document.querySelectorAll<HTMLElement>("[data-chat-row]").forEach((node) => { node.hidden = !node.dataset.search?.includes(query); }); }} /></div>
        <div className="chat-thread-list" role="list">
          {threads.map((thread) => <button key={thread.id} type="button" data-chat-row data-search={`${thread.other.displayName} ${thread.other.username} ${thread.lastMessage}`.toLowerCase()} className={`chat-thread-row ${activeId === thread.id ? "is-active" : ""}`} onClick={() => { setActiveId(thread.id); setThreadVisible(true); }}>
            <span className="chat-avatar">{thread.other.avatarUrl ? <RemoteImage src={thread.other.avatarUrl} alt="" /> : thread.other.displayName.slice(0,1).toUpperCase()}</span><span className="chat-thread-copy"><strong>{thread.other.displayName}</strong><small>@{thread.other.username}</small><span>{thread.lastSenderId === user.id ? "You: " : ""}{thread.lastMessage}</span></span><span className="chat-thread-side"><time>{dateLabel(thread.lastMessageAt)}</time>{thread.unreadCount > 0 && <i>{thread.unreadCount}</i>}</span>
          </button>)}
          {loadingList && <div className="chat-list-loading">Loading conversations…</div>}
          {!loadingList && !threads.length && <div className="chat-empty-inbox"><span className="chat-empty-symbol"><MusicIcon name="messages" /></span><strong>No conversations yet</strong><p>Start a conversation with someone you mutually follow.</p><button type="button" className="text-button" onClick={() => setNewOpen(true)} disabled={!user.emailVerified}>Write a message</button></div>}
        </div>
        <p className="chat-safety-caption"><MusicIcon name="lock" /> Conversations use standard server-stored messages. They are not end-to-end encrypted.</p>
      </aside>
      <section className="chat-thread" aria-label={other ? `Conversation with ${other.displayName}` : "Conversation"}>
        {activeId !== null && other ? <>
          <header className="chat-thread-header"><button type="button" className="chat-back-button" onClick={() => setThreadVisible(false)} aria-label="Back to inbox"><MusicIcon name="chevron" /></button><Link className="chat-avatar" href={`/profile/${encodeURIComponent(other.username)}`}>{other.avatarUrl ? <RemoteImage src={other.avatarUrl} alt="" /> : other.displayName.slice(0,1).toUpperCase()}</Link><span><strong>{other.displayName}</strong><Link href={`/profile/${encodeURIComponent(other.username)}`}>@{other.username}</Link></span><Link href={`/profile/${encodeURIComponent(other.username)}`} className="chat-profile-link">View profile</Link></header>
          <div className="chat-message-list" aria-live="polite">
            <div className="chat-context"><span className="chat-avatar">{other.avatarUrl ? <RemoteImage src={other.avatarUrl} alt="" /> : other.displayName.slice(0,1).toUpperCase()}</span><strong>{other.displayName}</strong><Link href={`/profile/${encodeURIComponent(other.username)}`}>@{other.username}</Link><p>You both follow each other. That is why messages are open.</p></div>
            {loadingThread && !messages.length && <div className="chat-list-loading">Loading conversation…</div>}
            {messages.map((message) => <div key={message.id} className={`message-bubble-wrap ${message.mine ? "is-mine" : ""}`}><div className="message-bubble">{message.body}<time>{timeLabel(message.createdAt)}</time></div></div>)}
            <div ref={messageEnd} />
          </div>
          <form className="chat-composer" onSubmit={sendMessage}><label className="sr-only" htmlFor="message-compose">Write a message</label><input ref={composeRef} id="message-compose" maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} placeholder={`Message ${other.displayName}…`} disabled={sending || !user.emailVerified} /><button type="submit" className="chat-send-button" disabled={sending || !body.trim() || !user.emailVerified} aria-label="Send message"><MusicIcon name="send" /></button></form>
        </> : <div className="chat-thread-empty"><EmptyState title="Your messages, your pace" description="Choose a conversation or start a new one with someone who mutually follows you. Do not send sensitive information: messages are not end-to-end encrypted." icon="messages" action={<button type="button" className="secondary-button" onClick={() => setNewOpen(true)} disabled={!user.emailVerified}>Start a conversation</button>} /></div>}
      </section>
    </section>

    {newOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewOpen(false); }}><section className="modal-card chat-new-modal" role="dialog" aria-modal="true" aria-labelledby="new-message-title"><div className="modal-heading"><div><span className="eyebrow">Mutual follow required</span><h2 id="new-message-title">New message</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setNewOpen(false)}><MusicIcon name="close" /></button></div><p className="muted-line">Enter the exact username of someone who follows you and whom you follow.</p><form className="auth-form" onSubmit={startConversation}><div className="form-field"><label className="form-label" htmlFor="chat-username">Username</label><input id="chat-username" className="form-input" value={newUsername} onChange={(event) => setNewUsername(event.target.value.replace(/^@/, ""))} placeholder="username" minLength={3} maxLength={30} required /></div><div className="form-field"><label className="form-label" htmlFor="first-message">Message</label><textarea id="first-message" className="form-textarea" value={firstBody} onChange={(event) => setFirstBody(event.target.value)} maxLength={2000} required placeholder="Say hello…" /></div><button type="submit" className="primary-button" disabled={sending || !user.emailVerified}>{sending ? "Sending…" : "Send message"}<MusicIcon name="send" /></button></form></section></div>}
  </main>;
}
