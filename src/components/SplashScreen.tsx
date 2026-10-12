"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const SESSION_KEY = "cinemax_splash_seen";
const SPLASH_EVENT = "cinemax:splash-state";
let dismissedInMemory = false;

function subscribe(callback: () => void) {
  window.addEventListener(SPLASH_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(SPLASH_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  if (dismissedInMemory) return false;
  try { return window.sessionStorage.getItem(SESSION_KEY) !== "1"; }
  catch { return true; }
}

function getServerSnapshot() { return false; }

function rememberSplashShown() {
  try { window.sessionStorage.setItem(SESSION_KEY, "1"); }
  catch { /* Storage can be disabled in private browsing. */ }
}

function markSplashSeen() {
  dismissedInMemory = true;
  rememberSplashShown();
  window.dispatchEvent(new Event(SPLASH_EVENT));
}

export default function SplashScreen() {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!visible) return;
    rememberSplashShown();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(markSplashSeen, reducedMotion ? 350 : 1750);
    return () => window.clearTimeout(timeout);
  }, [visible]);

  const skip = useCallback(() => markSplashSeen(), []);
  if (!visible) return null;

  return (
    <div className="splash-screen" role="status" aria-label="Cinemax is opening">
      <div className="splash-glow" />
      <div className="splash-lockup">
        <span className="splash-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M7.3 5.2v13.6L19 12 7.3 5.2Z" fill="currentColor" /></svg>
        </span>
        <span className="splash-wordmark">CINEMAX</span>
        <span className="splash-caption">A world beyond play</span>
      </div>
      <button className="splash-skip" onClick={skip} type="button">Skip intro</button>
    </div>
  );
}
