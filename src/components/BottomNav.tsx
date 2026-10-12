"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { NAVIGATION, CATEGORY_NAVIGATION, activeCategoryIndex, activeNavigationIndex } from "@/lib/navigation";

/*
 * The premium Cinemax dock: a gradient pill with the category shortcuts
 * (Web | Movies | Dramas), an expand chevron that reveals the full navigation,
 * a circular category-discovery control beside it, and the animated curved
 * "magic line" beneath - one continuous light trace that sweeps on its own.
 *
 * Everything routes to the existing catalogue routes and navigation pages; the
 * dock adds presentation, not behaviour. The four original destinations (Home,
 * Search, Explore, Watchlist) remain reachable through the expand panel, so no
 * functional destination is lost by the redesign.
 */

const MAGIC_LINE_PATH = "M0 28 C 200 6 400 6 600 24 C 800 42 1000 42 1200 20";

function MagicLine() {
  return <svg className="magic-line" viewBox="0 0 1200 44" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="cinemax-magic-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#4FD8FF" />
        <stop offset=".5" stopColor="#5E96FF" />
        <stop offset="1" stopColor="#9B7BFF" />
      </linearGradient>
    </defs>
    {/* A wide, very soft bed of light under the whole trace. */}
    <path d={MAGIC_LINE_PATH} className="magic-line-bed" vectorEffect="non-scaling-stroke" fill="none" />
    {/* The fine core stroke: predominantly blue with a cyan highlight. */}
    <path d={MAGIC_LINE_PATH} className="magic-line-core" vectorEffect="non-scaling-stroke" fill="none" />
    {/* The travelling light: a soft broad glow plus a bright head, seamless loop. */}
    <path d={MAGIC_LINE_PATH} className="magic-line-sweep-glow" pathLength={100} vectorEffect="non-scaling-stroke" fill="none" />
    <path d={MAGIC_LINE_PATH} className="magic-line-sweep" pathLength={100} vectorEffect="non-scaling-stroke" fill="none" />
  </svg>;
}

export default function BottomNav() {
  const pathname = usePathname();
  const categoryActive = activeCategoryIndex(pathname);
  const moreActive = activeNavigationIndex(pathname);
  const [expanded, setExpanded] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  // Collapse as soon as the route changes (a selection was made), so the panel
  // never lingers open. Adjusted during render - the React-recommended way to
  // reset state on an external change without a cascading effect.
  const [routeFor, setRouteFor] = useState(pathname);
  if (pathname !== routeFor) {
    setRouteFor(pathname);
    setExpanded(false);
  }

  // Collapse when the user taps outside the dock or presses Escape.
  useEffect(() => {
    if (!expanded) return;
    const onPointer = (event: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(event.target as Node)) setExpanded(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  return <div className="bottom-nav-wrap">
    <div className="nav-dock" ref={dockRef}>
      <div className="nav-dock-row">
        <nav className="nav-pill" aria-label="Primary navigation">
          <div className="nav-pill-more" id="nav-more" aria-hidden={!expanded} data-open={expanded}>
            <div className="nav-pill-more-inner">
              {NAVIGATION.map((item, index) => (
                <Link key={item.href} href={item.href} tabIndex={expanded ? 0 : -1}
                  className="nav-more-link" aria-current={index === moreActive ? "page" : undefined}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="nav-pill-items">
            {CATEGORY_NAVIGATION.map((item, index) => (
              <span key={item.href} className="nav-pill-cell">
                {index > 0 && <span className="nav-pill-sep" aria-hidden="true" />}
                <Link href={item.href} className="nav-pill-link"
                  aria-current={index === categoryActive ? "page" : undefined}>
                  {item.label}
                </Link>
              </span>
            ))}
            <span className="nav-pill-sep" aria-hidden="true" />
            <button type="button" className="nav-pill-chevron" aria-expanded={expanded}
              aria-controls="nav-more" aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
              onClick={() => setExpanded((value) => !value)}>
              <Icon name="chevron-down" />
            </button>
          </div>
        </nav>
        <Link href="/categories" className="nav-orb" aria-label="Discover categories">
          <Icon name="discover" />
        </Link>
      </div>
    </div>
    <MagicLine />
  </div>;
}
