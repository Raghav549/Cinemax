"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import useReducedMotion from "@/hooks/useReducedMotion";

const SESSION_KEY = "miley:intro:v1";
const EVENT = "miley:intro-phase";
type Phase = "open" | "closing" | "done";
let currentPhase: Phase = "open";
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", callback); };
}
function getSnapshot(): Phase {
  try { if (window.sessionStorage.getItem(SESSION_KEY) === "1") return "done"; } catch { /* private browsing */ }
  return currentPhase;
}
function setPhase(phase: Phase) {
  currentPhase = phase;
  if (phase === "done") {
    try { window.sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* in-memory fallback */ }
    document.documentElement.dataset.mileyIntro = "seen";
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
    const app = document.getElementById("miley-app");
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const splash = dialog.current;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    splash?.focus({ preventScroll: true });
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
    const delay = phase === "closing" ? (reducedMotion ? 0 : 360) : (reducedMotion ? 160 : 1680);
    const timer = window.setTimeout(() => setPhase(phase === "open" ? "closing" : "done"), delay);
    return () => window.clearTimeout(timer);
  }, [phase, reducedMotion, visible]);

  if (!visible) return null;
  return (
    <div ref={dialog} className={`miley-splash ${phase === "closing" ? "is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="Opening MiLey" tabIndex={-1}>
      <div className="miley-splash-halo" aria-hidden="true" />
      <div className="miley-splash-orbit orbit-one" aria-hidden="true" />
      <div className="miley-splash-orbit orbit-two" aria-hidden="true" />
      <div className="miley-splash-lockup">
        <Logo className="miley-splash-logo" />
        <p className="miley-splash-tagline">A little closer to the music.</p>
      </div>
      <div className="miley-splash-visualizer" aria-hidden="true">
        {[10, 18, 13, 23, 15, 20, 11, 18, 25, 13, 20, 10, 16].map((height, index) => <i key={index} style={{ "--bar-height": `${height}px`, "--bar-delay": `${index * -73}ms` } as React.CSSProperties} />)}
      </div>
      <button type="button" className="miley-splash-skip" onClick={() => setPhase("closing")}>Skip intro <span aria-hidden="true">↗</span></button>
    </div>
  );
}
