"use client";

import { useEffect } from "react";

/**
 * Marks the document while the user is actually scrolling.
 *
 * Several decorative loops in the shell (the dock's light arc, the More mark,
 * the loading sheen) are always-on. On Android each frame they paint competes
 * with the scroller, which is what makes a long page stutter. Rather than
 * weaken the design, the CSS pauses those loops while the finger is moving and
 * resumes them the moment it stops.
 *
 * Cost control: the listener is passive, it lives at the capture phase on
 * `window` so it also sees the horizontal rails, and it writes the attribute at
 * most twice per gesture — one rAF-guarded write when scrolling starts, one
 * after 160 ms of quiet. There is deliberately no per-frame state or re-render.
 */
export default function ScrollActivity() {
  useEffect(() => {
    const root = document.documentElement;
    let idleTimer = 0;
    let scheduled = false;

    const stop = () => {
      idleTimer = 0;
      if (root.hasAttribute("data-cinemax-scrolling")) root.removeAttribute("data-cinemax-scrolling");
    };

    const start = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        if (!root.hasAttribute("data-cinemax-scrolling")) {
          root.setAttribute("data-cinemax-scrolling", "true");
        }
      });
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(stop, 160);
    };

    window.addEventListener("scroll", start, { passive: true, capture: true });
    window.addEventListener("touchmove", start, { passive: true, capture: true });

    return () => {
      window.removeEventListener("scroll", start, { capture: true });
      window.removeEventListener("touchmove", start, { capture: true });
      window.clearTimeout(idleTimer);
      root.removeAttribute("data-cinemax-scrolling");
    };
  }, []);

  return null;
}
