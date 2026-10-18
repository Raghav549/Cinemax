"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Track, UserProfile } from "@/lib/miley-types";

type RepeatMode = "off" | "all" | "one";
type LibrarySnapshot = { tracks: Track[]; playlists: Array<{ id: number; title: string; visibility: string }>; albums: Array<{ id: number; title: string }>; favorites: Track[]; recentTracks: Track[]; channel: { id: number; handle: string; name: string } | null };
type PlayerContextValue = {
  user: UserProfile | null;
  userLoading: boolean;
  authError: string;
  refreshUser: () => Promise<void>;
  refreshPlaybackSettings: () => Promise<void>;
  signOut: () => Promise<void>;
  library: LibrarySnapshot | null;
  libraryLoading: boolean;
  refreshLibrary: () => Promise<void>;
  favoriteIds: ReadonlySet<number>;
  toggleFavorite: (track: Track) => Promise<void>;
  track: Track | null;
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  isLoadingTrack: boolean;
  playError: string;
  currentTime: number;
  duration: number;
  volume: number;
  speed: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  sleepTimerMinutes: number;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  play: (track: Track, queue?: Track[]) => Promise<void>;
  playQueue: (tracks: Track[], index?: number) => Promise<void>;
  togglePlayback: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  setSpeed: (value: number) => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  setSleepTimer: (minutes: number) => void;
  stop: () => void;
  notice: string;
  showNotice: (message: string) => void;
};

const Context = createContext<PlayerContextValue | null>(null);
const QUEUE_KEY = "miley:queue:v1";
const PLAYER_KEY = "miley:player-settings:v1";
const queueKeyFor = (userId?: number | null) => `${QUEUE_KEY}:${userId ? `user:${userId}` : "guest"}`;

function safeTrack(value: unknown): value is Track {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return Number.isSafeInteger(item.id) && Number(item.id) > 0 && typeof item.title === "string" && typeof item.artist === "string";
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const historyTimer = useRef(0);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [library, setLibrary] = useState<LibrarySnapshot | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [track, setTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [playError, setPlayError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [speed, setSpeedState] = useState(1);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffle, setShuffle] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [rememberQueue, setRememberQueue] = useState(true);
  const playbackSettingsUser = useRef<number | null>(null);
  const loadedQueueKey = useRef<string | null>(null);
  const [loadedQueueFor, setLoadedQueueFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState("");

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3200);
  }, []);

  const refreshUser = useCallback(async () => {
    setUserLoading(true);
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Account status is unavailable.");
      setUser(payload.user ?? null);
      setAuthError("");
    } catch (error) {
      setUser(null);
      setAuthError(error instanceof Error ? error.message : "Account status is unavailable.");
    } finally { setUserLoading(false); }
  }, []);

  const refreshPlaybackSettings = useCallback(async () => {
    playbackSettingsUser.current = null;
    if (!user) {
      setAutoplay(false);
      setRememberQueue(true);
      return;
    }
    try {
      const response = await fetch("/api/music/settings", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) return;
      const playback = payload?.playback;
      setAutoplay(playback?.autoplay === true);
      setRememberQueue(playback?.rememberQueue !== false);
      if (typeof playback?.volume === "number") {
        const nextVolume = Math.max(0, Math.min(1, playback.volume));
        setVolumeState(nextVolume);
        if (audioRef.current) audioRef.current.volume = nextVolume;
      }
      if (typeof playback?.playbackSpeed === "number") {
        const nextSpeed = Math.max(0.5, Math.min(2, playback.playbackSpeed));
        setSpeedState(nextSpeed);
        if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
      }
      if (playback?.rememberQueue === false) {
        try { localStorage.removeItem(queueKeyFor(user.id)); } catch { /* best-effort cleanup */ }
        setQueue([]);
        setCurrentIndex(-1);
        setTrack(null);
      }
      playbackSettingsUser.current = user.id;
    } catch { /* Account preferences are optional when the service is unavailable. */ }
  }, [user]);

  const refreshLibrary = useCallback(async () => {
    if (!user) { setLibrary(null); return; }
    setLibraryLoading(true);
    try {
      const response = await fetch("/api/music/library", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Library is unavailable.");
      setLibrary(payload as LibrarySnapshot);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Library is unavailable.");
    } finally { setLibraryLoading(false); }
  }, [showNotice, user]);

  useEffect(() => { void refreshUser(); return () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }; }, [refreshUser]);
  useEffect(() => { void refreshPlaybackSettings(); }, [refreshPlaybackSettings]);
  useEffect(() => { if (user) void refreshLibrary(); else setLibrary(null); }, [user, refreshLibrary]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PLAYER_KEY) || "{}");
      if (typeof saved.volume === "number") setVolumeState(Math.max(0, Math.min(1, saved.volume)));
      if (typeof saved.speed === "number") setSpeedState(Math.max(0.5, Math.min(2, saved.speed)));
      if (saved.repeatMode === "off" || saved.repeatMode === "all" || saved.repeatMode === "one") setRepeatMode(saved.repeatMode);
      setShuffle(saved.shuffle === true);
    } catch { /* local resume state is best-effort */ }
  }, []);

  useEffect(() => {
    if (userLoading) return;
    const key = queueKeyFor(user?.id ?? null);
    if (loadedQueueKey.current === key) return;
    const previousKey = loadedQueueKey.current;
    loadedQueueKey.current = key;
    if (previousKey !== null) {
      audioRef.current?.pause();
      audioRef.current?.removeAttribute("src");
      audioRef.current?.load();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
    try {
      const storedQueue = JSON.parse(localStorage.getItem(key) || "null");
      const tracks = Array.isArray(storedQueue?.tracks)
        ? storedQueue.tracks.filter((item: unknown) => safeTrack(item) && item.visibility === "public").slice(0, 250)
        : [];
      const index = Number.isInteger(storedQueue?.currentIndex) ? storedQueue.currentIndex : -1;
      setQueue(tracks);
      if (index >= 0 && index < tracks.length) {
        setTrack(tracks[index]);
        setCurrentIndex(index);
      } else {
        setTrack(null);
        setCurrentIndex(-1);
      }
    } catch {
      setQueue([]);
      setTrack(null);
      setCurrentIndex(-1);
    }
    setLoadedQueueFor(key);
  }, [userLoading, user?.id]);

  useEffect(() => {
    try {
      const key = queueKeyFor(user?.id ?? null);
      if (!userLoading && loadedQueueFor === key) {
        if (rememberQueue || !user) {
          const publicTracks = queue.filter((item) => item.visibility === "public").slice(0, 250);
          const savedCurrentIndex = track ? publicTracks.findIndex((item) => item.id === track.id) : -1;
          localStorage.setItem(key, JSON.stringify({ tracks: publicTracks, currentIndex: savedCurrentIndex }));
        } else {
          localStorage.removeItem(key);
        }
      }
      localStorage.setItem(PLAYER_KEY, JSON.stringify({ volume, speed, repeatMode, shuffle }));
    } catch { /* storage restrictions must not affect playback */ }
  }, [queue, currentIndex, track, volume, speed, repeatMode, shuffle, rememberQueue, user, userLoading, loadedQueueFor]);

  useEffect(() => {
    if (!user || playbackSettingsUser.current !== user.id) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/music/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playback: { volume, playbackSpeed: speed } }),
      }).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [user, volume, speed]);

  const sendHistory = useCallback((selected: Track, position: number) => {
    if (!user?.historyEnabled || !Number.isFinite(position)) return;
    const now = Date.now();
    if (now - historyTimer.current < 25_000 && position > 0) return;
    historyTimer.current = now;
    void fetch("/api/music/history", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: selected.id, positionSeconds: Math.max(0, Math.floor(position)) }),
      keepalive: true,
    }).catch(() => undefined);
  }, [user]);

  const syncNative = useCallback((selected: Track | null, playing: boolean, position: number, total: number) => {
    if (typeof window === "undefined") return;
    const bridge = (window as Window & { MiLeyNative?: { updateNowPlaying?: (title: string, artist: string, artwork: string, playing: boolean, position: number, duration: number) => void; setMediaPlaying?: (playing: boolean) => void }; CinemaxNative?: { setMediaPlaying?: (playing: boolean) => void } }).MiLeyNative;
    if (selected) bridge?.updateNowPlaying?.(selected.title, selected.artist, selected.artworkUrl || "", playing, position, total);
    bridge?.setMediaPlaying?.(playing);
    (window as Window & { CinemaxNative?: { setMediaPlaying?: (playing: boolean) => void } }).CinemaxNative?.setMediaPlaying?.(playing);
  }, []);

  const play = useCallback(async (selected: Track, candidateQueue?: Track[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    const validQueue = candidateQueue?.length ? candidateQueue.filter(safeTrack) : queue.length ? queue : [selected];
    const nextIndex = Math.max(0, validQueue.findIndex((item) => item.id === selected.id));
    setQueue(validQueue);
    setCurrentIndex(nextIndex);
    setTrack(selected);
    setPlayError("");
    setIsLoadingTrack(true);
    setCurrentTime(0);
    try {
      const response = await fetch(`/api/music/tracks/${selected.id}/play`, { method: "POST", cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.playbackUrl !== "string") {
        if (response.status === 401) router.push("/login?next=%2Flibrary");
        throw new Error(payload?.error || "This track cannot be played right now.");
      }
      audio.pause();
      audio.crossOrigin = "anonymous";
      audio.src = payload.playbackUrl;
      audio.volume = volume;
      audio.playbackRate = speed;
      await audio.play();
      setIsPlaying(true);
      setCurrentTime(0);
      setDuration(selected.durationSeconds || 0);
      syncNative(selected, true, 0, selected.durationSeconds || 0);
      sendHistory(selected, 0);
    } catch (error) {
      setIsPlaying(false);
      const message = error instanceof Error ? error.message : "Playback failed.";
      setPlayError(message);
      showNotice(message);
    } finally { setIsLoadingTrack(false); }
  }, [queue, router, sendHistory, showNotice, speed, syncNative, volume]);

  const playQueue = useCallback(async (items: Track[], index = 0) => {
    const clean = items.filter(safeTrack);
    if (!clean.length) return;
    const boundedIndex = Math.max(0, Math.min(clean.length - 1, index));
    await play(clean[boundedIndex], clean);
  }, [play]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); return; }
    if (track && audio.src) {
      try { await audio.play(); setPlayError(""); }
      catch { if (track) await play(track, queue); }
      return;
    }
    if (track) await play(track, queue);
  }, [isPlaying, play, queue, track]);

  const next = useCallback(async () => {
    if (!queue.length) return;
    if (repeatMode === "one" && track) {
      const audio = audioRef.current;
      if (audio) { audio.currentTime = 0; await audio.play().catch(() => undefined); }
      return;
    }
    let index = currentIndex + 1;
    if (shuffle && queue.length > 1) {
      do { index = Math.floor(Math.random() * queue.length); } while (index === currentIndex);
    } else if (index >= queue.length) {
      if (repeatMode === "all") index = 0;
      else if (autoplay) {
        try {
          const response = await fetch("/api/music/tracks?limit=40", { cache: "no-store" });
          const payload = await response.json();
          const candidates: Track[] = Array.isArray(payload?.items) ? payload.items.filter(safeTrack) : [];
          const candidate = candidates.find((item) => !queue.some((queued) => queued.id === item.id));
          if (response.ok && candidate) {
            const extendedQueue = [...queue, candidate];
            await play(candidate, extendedQueue);
            return;
          }
        } catch { /* A catalog outage simply ends autoplay without blocking controls. */ }
        setIsPlaying(false);
        showNotice("There are no more available tracks to continue this queue.");
        return;
      } else { setIsPlaying(false); return; }
    }
    await play(queue[index], queue);
  }, [autoplay, currentIndex, play, queue, repeatMode, showNotice, shuffle, track]);

  const previous = useCallback(async () => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (!queue.length) return;
    const index = currentIndex > 0 ? currentIndex - 1 : repeatMode === "all" ? queue.length - 1 : 0;
    await play(queue[index], queue);
  }, [currentIndex, play, queue, repeatMode]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(seconds)) audio.currentTime = Math.max(0, Math.min(audio.duration || duration || 0, seconds));
  }, [duration]);

  const setVolume = useCallback((value: number) => {
    const normalized = Math.max(0, Math.min(1, value));
    setVolumeState(normalized);
    if (audioRef.current) audioRef.current.volume = normalized;
  }, []);
  const setSpeed = useCallback((value: number) => {
    const normalized = Math.max(0.5, Math.min(2, value));
    setSpeedState(normalized);
    if (audioRef.current) audioRef.current.playbackRate = normalized;
  }, []);
  const cycleRepeat = useCallback(() => setRepeatMode((previousMode) => previousMode === "off" ? "all" : previousMode === "all" ? "one" : "off"), []);
  const toggleShuffle = useCallback(() => setShuffle((previousValue) => !previousValue), []);

  const setSleepTimer = useCallback((minutes: number) => {
    const bounded = Math.max(0, Math.min(180, Math.round(minutes)));
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    setSleepTimerMinutes(bounded);
    if (bounded > 0) {
      sleepTimerRef.current = setTimeout(() => {
        audioRef.current?.pause();
        setSleepTimerMinutes(0);
        showNotice("Sleep timer ended playback.");
      }, bounded * 60_000);
    }
  }, [showNotice]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
    setTrack(null); setCurrentTime(0); setDuration(0); setIsPlaying(false); setPlayError("");
    syncNative(null, false, 0, 0);
  }, [syncNative]);

  const toggleFavorite = useCallback(async (selected: Track) => {
    if (!user) { showNotice("Sign in to save music to your library."); return; }
    const currentlySaved = library?.favorites.some((item) => item.id === selected.id) ?? false;
    try {
      const response = await fetch("/api/music/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: selected.id, favorite: !currentlySaved }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Could not update favorites.");
      if (library) {
        const favorites = currentlySaved ? library.favorites.filter((item) => item.id !== selected.id) : [selected, ...library.favorites];
        setLibrary({ ...library, favorites });
      } else await refreshLibrary();
      showNotice(currentlySaved ? "Removed from favorites." : "Added to favorites.");
    } catch (error) { showNotice(error instanceof Error ? error.message : "Could not update favorites."); }
  }, [library, refreshLibrary, showNotice, user]);

  const signOut = useCallback(async () => {
    stop();
    setQueue([]);
    setCurrentIndex(-1);
    setSleepTimer(0);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    setLibrary(null);
    showNotice("Signed out.");
    router.push("/");
    router.refresh();
  }, [router, setSleepTimer, showNotice, stop]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setCurrentTime(audio.currentTime || 0);
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
      if (track) sendHistory(track, audio.currentTime || 0);
      try {
        if ("mediaSession" in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
          navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: audio.currentTime });
        }
      } catch { /* unsupported on this browser */ }
    };
    const onPlay = () => { setIsPlaying(true); setPlayError(""); syncNative(track, true, audio.currentTime, audio.duration || 0); };
    const onPause = () => { setIsPlaying(false); if (track) sendHistory(track, audio.currentTime || 0); syncNative(track, false, audio.currentTime, audio.duration || 0); };
    const onEnded = () => { if (repeatMode === "one" && track) { audio.currentTime = 0; void audio.play().catch(() => undefined); } else void next(); };
    const onError = () => {
      if (audio.error) {
        setPlayError("This audio source is unavailable. Check the file or connection and try again.");
        setIsPlaying(false);
        setIsLoadingTrack(false);
      }
    };
    const onMeta = () => { if (Number.isFinite(audio.duration)) setDuration(audio.duration); };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("loadedmetadata", onMeta);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("loadedmetadata", onMeta);
    };
  }, [next, repeatMode, sendHistory, syncNative, track]);

  useEffect(() => {
    if (!track || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.albumTitle || track.channelName || "MiLey",
        artwork: track.artworkUrl ? [{ src: track.artworkUrl, sizes: "512x512", type: "image/*" }] : [],
      });
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
      const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
        ["play", () => void togglePlayback()], ["pause", () => audioRef.current?.pause()],
        ["previoustrack", () => void previous()], ["nexttrack", () => void next()],
        ["seekto", (details) => { if (details.seekTime != null) seek(details.seekTime); }],
        ["seekbackward", (details) => seek(Math.max(0, (audioRef.current?.currentTime || 0) - (details.seekOffset || 10)))],
        ["seekforward", (details) => seek((audioRef.current?.currentTime || 0) + (details.seekOffset || 10))],
      ];
      actions.forEach(([action, handler]) => { try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* action unsupported */ } });
    } catch { /* platform media-session APIs are optional */ }
  }, [isPlaying, next, previous, seek, togglePlayback, track]);

  const favoriteIds = useMemo(() => new Set(library?.favorites.map((item) => item.id) ?? []), [library]);
  const value = useMemo<PlayerContextValue>(() => ({
    user, userLoading, authError, refreshUser, refreshPlaybackSettings, signOut, library, libraryLoading, refreshLibrary, favoriteIds, toggleFavorite,
    track, queue, currentIndex, isPlaying, isLoadingTrack, playError, currentTime, duration, volume, speed, repeatMode, shuffle,
    sleepTimerMinutes, expanded, setExpanded, play, playQueue, togglePlayback, next, previous, seek, setVolume, setSpeed,
    cycleRepeat, toggleShuffle, setSleepTimer, stop, notice, showNotice,
  }), [user, userLoading, authError, refreshUser, refreshPlaybackSettings, signOut, library, libraryLoading, refreshLibrary, favoriteIds, toggleFavorite, track,
    queue, currentIndex, isPlaying, isLoadingTrack, playError, currentTime, duration, volume, speed, repeatMode, shuffle,
    sleepTimerMinutes, expanded, play, playQueue, togglePlayback, next, previous, seek, setVolume, setSpeed, cycleRepeat,
    toggleShuffle, setSleepTimer, stop, notice, showNotice]);

  return <Context.Provider value={value}>
    {children}
    <audio ref={audioRef} preload="metadata" aria-hidden="true" tabIndex={-1} />
  </Context.Provider>;
}

export function useMusic() {
  const value = useContext(Context);
  if (!value) throw new Error("useMusic must be used inside MusicProvider");
  return value;
}
