"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Logo, { CinemaxEmblem } from "./Logo";
import Icon from "./Icon";
import useReducedMotion from "@/hooks/useReducedMotion";

const SESSION_KEY = "cinemax:prism-intro:v1";
const EVENT = "cinemax:intro-phase";
type Phase = "open" | "closing" | "done";
let currentPhase: Phase = "open";
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", callback); };
}
function getSnapshot(): Phase {
  try { if (window.sessionStorage.getItem(SESSION_KEY) === "1") return "done"; } catch { /* Private browsing. */ }
  return currentPhase;
}
function setPhase(phase: Phase) {
  currentPhase = phase;
  if (phase === "done") {
    try { window.sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* In-memory guard still works. */ }
    document.documentElement.dataset.cinemaxIntro = "seen";
  }
  window.dispatchEvent(new Event(EVENT));
}

export default function SplashScreen() {
  const pathname = usePathname();
  const phase = useSyncExternalStore(subscribe, getSnapshot, (): Phase => "open");
  const reducedMotion = useReducedMotion();
  const dialog = useRef<HTMLDivElement>(null);
  const visible = pathname === "/" && phase !== "done";

  useEffect(() => {
    if (!visible) return;
    const app = document.getElementById("cinemax-app");
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const splash = dialog.current;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    dialog.current?.focus({ preventScroll: true });
    return () => {
      if (app) app.inert = false;
      document.body.style.overflow = previousOverflow;
      if (splash?.contains(document.activeElement)) {
        if (previousFocus && previousFocus !== document.body && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
        else document.getElementById("main-content")?.focus({ preventScroll: true });
      }
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const delay = phase === "closing" ? (reducedMotion ? 0 : 460) : (reducedMotion ? 180 : 2150);
    const timer = window.setTimeout(() => setPhase(phase === "open" ? "closing" : "done"), delay);
    return () => window.clearTimeout(timer);
  }, [phase, reducedMotion, visible]);

  if (!visible) return null;
  return <div ref={dialog} className={`splash-screen ${phase === "closing" ? "is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="Opening Cinemax" tabIndex={-1}>
    <div className="splash-atmosphere" aria-hidden="true" />
    <div className="splash-ring splash-ring-one" aria-hidden="true" />
    <div className="splash-ring splash-ring-two" aria-hidden="true" />
    <div className="splash-streak splash-streak-one" aria-hidden="true" />
    <div className="splash-streak splash-streak-two" aria-hidden="true" />
    <div className="splash-lockup">
      <div className="splash-emblem"><CinemaxEmblem /><span className="splash-logo-sheen" aria-hidden="true" /></div>
      <Logo className="splash-wordmark" />
      <div className="splash-reflection" aria-hidden="true"><CinemaxEmblem /></div>
    </div>
    <button className="splash-skip" type="button" onClick={() => setPhase("closing")}>Skip intro <Icon name="arrow-right" /></button>
  </div>;
}
