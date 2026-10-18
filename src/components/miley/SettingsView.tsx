"use client";

import RemoteImage from "./RemoteImage";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMusic } from "./MusicProvider";
import MusicIcon from "./Icon";
import { uploadImage } from "@/lib/upload-image";
import EmptyState from "./EmptyState";

type SettingData = { playback: { autoplay: boolean; rememberQueue: boolean; dataSaver: boolean; playbackSpeed: number; volume: number; sleepTimerMinutes: number }; notifications: { follows: boolean; followRequests: boolean; channelSubscriptions: boolean; channelReleases: boolean; messages: boolean }; accessibility: { reducedMotion: boolean; highContrast: boolean } };
type BlockedUser = { username: string; displayName: string; avatarUrl: string; createdAt: string };

export default function SettingsView() {
  const { user, userLoading, refreshUser, refreshPlaybackSettings, signOut, showNotice } = useMusic();
  const [tab, setTab] = useState("profile");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [recommendationsEnabled, setRecommendationsEnabled] = useState(true);
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [settings, setSettings] = useState<SettingData | null>(null);
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessibilityApplied, setAccessibilityApplied] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName); setBio(user.bio || ""); setAvatar(user.avatarUrl || ""); setIsPrivate(user.isPrivate); setRecommendationsEnabled(user.recommendationsEnabled); setHistoryEnabled(user.historyEnabled);
    let active = true;
    fetch("/api/music/settings", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (active) setSettings(data); }).catch(() => undefined);
    fetch("/api/social/blocks", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (active) setBlocks(data.items || []); }).catch(() => undefined);
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.reducedMotion = settings.accessibility.reducedMotion ? "true" : "false";
    document.documentElement.dataset.highContrast = settings.accessibility.highContrast ? "true" : "false";
    setAccessibilityApplied(true);
    return () => { delete document.documentElement.dataset.reducedMotion; delete document.documentElement.dataset.highContrast; };
  }, [settings]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      let avatarUrl = avatar.trim(); if (avatarFile) avatarUrl = await uploadImage(avatarFile, "avatar");
      const response = await fetch("/api/social/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, bio, avatarUrl, isPrivate, recommendationsEnabled, historyEnabled }) });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Profile could not be saved.");
      setAvatarFile(null); await refreshUser(); showNotice("Profile and privacy settings saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Profile could not be saved."); }
    finally { setBusy(false); }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault(); if (!settings) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/music/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Settings could not be saved.");
      showNotice("Preferences saved."); await Promise.all([refreshUser(), refreshPlaybackSettings()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Settings could not be saved."); }
    finally { setBusy(false); }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (newPassword !== confirmPassword || newPassword.length < 10 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) { setError("Use matching passwords with at least 10 characters, including uppercase, lowercase, and a number."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Password could not be changed.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); await refreshUser(); showNotice("Password changed. Other sessions have been signed out.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Password could not be changed."); }
    finally { setBusy(false); }
  };

  const unblock = async (username: string) => {
    try { const response = await fetch(`/api/social/blocks/${encodeURIComponent(username)}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Could not unblock this account."); setBlocks((previous) => previous.filter((item) => item.username !== username)); showNotice(`@${username} unblocked.`); }
    catch (cause) { showNotice(cause instanceof Error ? cause.message : "Could not unblock this account."); }
  };

  const deleteAccount = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (deleteConfirmation !== "DELETE") { setError("Type DELETE exactly to confirm account removal."); return; }
    if (!window.confirm("Permanently delete your MiLey account and its associated social data? This cannot be undone.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/auth/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }) });
      const result = await response.json(); if (!response.ok) throw new Error(result?.error || "Account could not be deleted.");
      await signOut();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Account could not be deleted."); }
    finally { setBusy(false); }
  };

  if (userLoading) return <main className="miley-page" id="main-content"><div className="loading-skeleton" style={{ height: 300 }} /></main>;
  if (!user) return <main className="miley-page" id="main-content"><div className="page-heading-row"><div><span className="page-eyebrow">Account and privacy</span><h1 className="page-title">Settings.</h1></div></div><EmptyState title="Sign in to manage settings" description="Change account details, privacy, playback, accessibility, and security settings from your account." icon="settings" action={<Link href="/login?next=%2Fsettings" className="primary-button">Sign in</Link>} /></main>;

  const tabs = [{ id: "profile", label: "Profile & privacy", icon: "profile" as const }, { id: "playback", label: "Playback & accessibility", icon: "music" as const }, { id: "notifications", label: "Notifications", icon: "bell" as const }, { id: "blocked", label: "Blocked accounts", icon: "shield" as const }, { id: "security", label: "Security", icon: "lock" as const }];
  const setPreference = <K extends keyof SettingData>(group: K, key: keyof SettingData[K], value: boolean | number) => setSettings((previous) => previous ? { ...previous, [group]: { ...previous[group], [key]: value } } as SettingData : previous);

  return <main className="miley-page settings-page" id="main-content" tabIndex={-1}>
    <div className="page-heading-row"><div><span className="page-eyebrow">Control what you share</span><h1 className="page-title">Settings.</h1><p className="page-subtitle">Privacy and account options belong to you. They are enforced by the server, not only hidden in the interface.</p></div></div>
    <div className="settings-layout"><nav className="settings-nav" aria-label="Settings sections">{tabs.map((item) => <button key={item.id} type="button" className={`settings-nav-item ${tab === item.id ? "is-active" : ""}`} aria-current={tab === item.id ? "page" : undefined} onClick={() => { setTab(item.id); setError(""); }}><MusicIcon name={item.icon} />{item.label}<MusicIcon name="chevron" /></button>)}<button className="settings-nav-item settings-signout" type="button" onClick={() => void signOut()}><MusicIcon name="logout" />Sign out</button></nav>
      <section className="settings-content" aria-live="polite">
        {error && <div className="status-banner is-error" role="alert"><MusicIcon name="shield" /><div><strong>Could not save changes</strong><p>{error}</p></div></div>}
        {tab === "profile" && <section className="settings-card"><div className="settings-card-heading"><span className="eyebrow">Your profile</span><h2>Profile & privacy</h2><p>Private accounts require approval before someone can follow you. Public profile fields never include your exact birth date.</p></div><form className="auth-form" onSubmit={saveProfile}>
          <div className="form-field"><label className="form-label" htmlFor="settings-avatar">Profile image</label><div className="avatar-setting-row"><span className="profile-avatar-preview">{avatar ? <RemoteImage src={avatar} alt="Current profile" /> : displayName.slice(0,1).toUpperCase()}</span><div className="avatar-setting-input"><input className="form-input" id="settings-avatar" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} /><span className="form-help">Stored in MiLey; only JPEG, PNG, or WebP files.</span></div></div></div>
          <div className="form-field"><label className="form-label" htmlFor="settings-display-name">Display name</label><input className="form-input" id="settings-display-name" maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></div>
          <div className="form-field"><label className="form-label" htmlFor="settings-bio">Bio</label><textarea className="form-textarea" id="settings-bio" maxLength={280} value={bio} onChange={(event) => setBio(event.target.value)} /><span className="form-help">{bio.length}/280 characters</span></div>
          <div className="settings-toggle-list"><label className="setting-toggle"><span><strong>Private account</strong><small>Limit your profile and social details to approved followers. Explicitly public channel releases remain public; set each track or channel to private to restrict it.</small></span><input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} /><i /></label><label className="setting-toggle"><span><strong>Personalized music suggestions</strong><small>Use your saved genres and library only. Recommendations never use age or gender.</small></span><input type="checkbox" checked={recommendationsEnabled} onChange={(event) => setRecommendationsEnabled(event.target.checked)} /><i /></label><label className="setting-toggle"><span><strong>Listening history</strong><small>Save playback progress to your account. Turn this off to stop future history writes.</small></span><input type="checkbox" checked={historyEnabled} onChange={(event) => setHistoryEnabled(event.target.checked)} /><i /></label></div>
          <p className="form-help">Account: {user.email} · @{user.username} · {user.emailVerified ? "email verified" : "email not verified"}</p><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save profile & privacy"}</button>
        </form></section>}
        {tab === "playback" && <section className="settings-card"><div className="settings-card-heading"><span className="eyebrow">A better listening space</span><h2>Playback & accessibility</h2><p>Controls are saved to your account. Your browser may not support every media feature.</p></div>{settings ? <form className="auth-form" onSubmit={saveSettings}>
          <div className="settings-toggle-list"><label className="setting-toggle"><span><strong>Autoplay next track</strong><small>Continue the current queue after a track ends.</small></span><input type="checkbox" checked={settings.playback.autoplay} onChange={(event) => setPreference("playback", "autoplay", event.target.checked)} /><i /></label><label className="setting-toggle"><span><strong>Remember queue in this browser</strong><small>When enabled, public tracks in the current queue are stored in this browser for resume; private uploads are excluded and it is not synced between devices.</small></span><input type="checkbox" checked={settings.playback.rememberQueue} onChange={(event) => setPreference("playback", "rememberQueue", event.target.checked)} /><i /></label><label className="setting-toggle"><span><strong>Data saver</strong><small>Preference saved for future adaptive stream sources. Current uploads are served at their stored bitrate.</small></span><input type="checkbox" checked={settings.playback.dataSaver} onChange={(event) => setPreference("playback", "dataSaver", event.target.checked)} /><i /></label><label className="setting-toggle"><span><strong>Reduce motion</strong><small>Turn off interface animations where supported.</small></span><input type="checkbox" checked={settings.accessibility.reducedMotion} onChange={(event) => setPreference("accessibility", "reducedMotion", event.target.checked)} /><i /></label><label className="setting-toggle"><span><strong>Higher contrast</strong><small>Increase boundaries and contrast across MiLey screens.</small></span><input type="checkbox" checked={settings.accessibility.highContrast} onChange={(event) => setPreference("accessibility", "highContrast", event.target.checked)} /><i /></label></div><p className="form-help">Accessibility settings {accessibilityApplied ? "are active on this page" : "will apply after saving"}. OS-level focus and contrast settings are respected.</p><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save playback & accessibility"}</button></form> : <div className="loading-skeleton" style={{ height: 130 }} />}</section>}
        {tab === "notifications" && <section className="settings-card"><div className="settings-card-heading"><span className="eyebrow">Updates</span><h2>Notifications</h2><p>Choose which activity MiLey should record for your account. Push notifications are not configured; these preferences do not promise device alerts.</p></div>{settings ? <form className="auth-form" onSubmit={saveSettings}><div className="settings-toggle-list">{(["follows", "followRequests", "channelSubscriptions", "channelReleases", "messages"] as const).map((key) => <label className="setting-toggle" key={key}><span><strong>{key === "follows" ? "New followers" : key === "followRequests" ? "Follow requests" : key === "channelSubscriptions" ? "New channel subscribers" : key === "channelReleases" ? "Channel releases" : "Messages"}</strong><small>{key === "messages" ? "Add an in-app notification when someone sends a message; your inbox remains available either way." : "In-app notifications stored for this account; no device or email alerts are configured."}</small></span><input type="checkbox" checked={settings.notifications[key]} onChange={(event) => setPreference("notifications", key, event.target.checked)} /><i /></label>)}</div><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save notification preferences"}</button></form> : <div className="loading-skeleton" style={{ height: 130 }} />}</section>}
        {tab === "blocked" && <section className="settings-card"><div className="settings-card-heading"><span className="eyebrow">Your boundaries</span><h2>Blocked accounts</h2><p>Blocking removes follows in both directions and prevents profile visibility and messaging.</p></div>{blocks.length ? <div className="blocked-list">{blocks.map((item) => <div className="blocked-row" key={item.username}><Link className="chat-avatar" href={`/profile/${encodeURIComponent(item.username)}`}>{item.avatarUrl ? <RemoteImage src={item.avatarUrl} alt="" /> : item.displayName.slice(0,1).toUpperCase()}</Link><div><strong>{item.displayName}</strong><small>@{item.username}</small></div><button type="button" className="quiet-button" onClick={() => void unblock(item.username)}>Unblock</button></div>)}</div> : <EmptyState title="No blocked accounts" description="Accounts you block will be listed here. You can also block someone from their profile." icon="shield" />}</section>}
        {tab === "security" && <div className="settings-security-stack"><section className="settings-card"><div className="settings-card-heading"><span className="eyebrow">Sign-in protection</span><h2>Change password</h2><p>Use a unique password. Changing it signs out all other active sessions.</p></div><form className="auth-form" onSubmit={changePassword}><div><label className="form-label" htmlFor="current-password">Current password</label><input className="form-input" id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></div><div><label className="form-label" htmlFor="new-password">New password</label><input className="form-input" id="new-password" type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><span className="form-help">10+ characters, uppercase, lowercase, and a number; 72 UTF-8 bytes maximum.</span></div><div><label className="form-label" htmlFor="confirm-password">Confirm new password</label><input className="form-input" id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div><button type="submit" className="primary-button" disabled={busy}>Change password</button></form></section>
          <section className="settings-card danger-zone"><div className="settings-card-heading"><span className="eyebrow">Permanent action</span><h2>Delete account</h2><p>Account deletion removes MiLey account and social records. Stored audio is deleted before the account; if storage is unavailable, deletion is paused so the service does not lose the cleanup reference.</p></div><form className="auth-form" onSubmit={deleteAccount}><div><label className="form-label" htmlFor="delete-password">Confirm password</label><input className="form-input" id="delete-password" type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} required /></div><div><label className="form-label" htmlFor="delete-confirm">Type DELETE</label><input className="form-input" id="delete-confirm" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} required autoComplete="off" /></div><button type="submit" className="danger-button" disabled={busy}>Permanently delete account</button></form></section></div>}
      </section>
    </div>
  </main>;
}
