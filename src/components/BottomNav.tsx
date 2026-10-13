"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { NAVIGATION, CATEGORY_NAVIGATION, MORE_NAVIGATION, activeCategoryIndex, activeNavigationIndex } from "@/lib/navigation";

/*
 * The premium Cinemax dock, following the reference layout:
 *
 *   · a gradient navigation pill (Web | Movies | Dramas | chevron) with a
 *     restrained glow, thin vertical dividers and smooth expand/collapse;
 *   · a circular discovery control beside it (an explorer button - never a
 *     microphone and never an account/profile avatar) that opens a working
 *     discovery sheet of the catalogue's real collections;
 *   · the curved blue/cyan "magic line" with a lightweight moving light sweep;
 *   · the bottom navigation row below the curve - Home (the Cinemax logo
 *     asset), Search and Categories - replacing the old nav-line design
 *     entirely rather than layering on top of it.
 *
 * Every destination routes to the existing catalogue routes; the dock adds
 * presentation, not behaviour.
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

function NavItem({ item, current }: { item: (typeof NAVIGATION)[number]; current: boolean }) {
  return <Link href={item.href} className="nav-menu-link" aria-current={current ? "page" : undefined}>
    <span className="nav-menu-icon" aria-hidden="true">
      {item.icon === "logo"
        // The actual Cinemax logo asset (transparent emblem) as the Home icon.
        // The transparent Cinemax symbol SVG is used as-is (next/image would
        // route SVGs through the optimizer, which blocks them by default).
        ? /* eslint-disable-next-line @next/next/no-img-element */
          <img src="/brand/cinemax-symbol.svg" alt="" width={26} height={26} className="nav-menu-logo" />
        : <Icon name={item.icon} />}
    </span>
    <span>{item.label}</span>
  </Link>;
}

export default function BottomNav() {
  const pathname = usePathname();
  const categoryActive = activeCategoryIndex(pathname);
  const moreActive = activeNavigationIndex(pathname);
  const [expanded, setExpanded] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  // Collapse as soon as the route changes (a selection was made), so the panels
  // never linger open. Adjusted during render - the React-recommended way to
  // reset state on an external change without a cascading effect.
  const [routeFor, setRouteFor] = useState(pathname);
  if (pathname !== routeFor) {
    setRouteFor(pathname);
    setExpanded(false);
    setDiscoverOpen(false);
  }

  // Collapse when the user taps outside the dock or presses Escape.
  useEffect(() => {
    if (!expanded && !discoverOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(event.target as Node)) {
        setExpanded(false);
        setDiscoverOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        setDiscoverOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded, discoverOpen]);

  return <div className="bottom-nav-wrap">
    <div className="nav-dock" ref={dockRef}>
      <div className="nav-dock-row">
        <nav className="nav-pill" aria-label="Primary navigation">
          <div className="nav-pill-more" id="nav-more" aria-hidden={!expanded} data-open={expanded}>
            <div className="nav-pill-more-inner">
              {MORE_NAVIGATION.map((item) => (
                <Link key={item.href} href={item.href} tabIndex={expanded ? 0 : -1} className="nav-more-link">
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              ))}
              <span className="nav-pill-sep nav-pill-sep-wide" aria-hidden="true" />
              {CATEGORY_NAVIGATION.map((item) => (
                <Link key={item.href} href={item.href} tabIndex={expanded ? 0 : -1} className="nav-more-chip">{item.label}</Link>
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
              onClick={() => { setExpanded((value) => !value); setDiscoverOpen(false); }}>
              <Icon name="chevron-down" />
            </button>
          </div>
        </nav>
        <button
          type="button"
          className="nav-orb"
          aria-label="Discover categories"
          aria-expanded={discoverOpen}
          aria-controls="nav-discover"
          onClick={() => { setDiscoverOpen((value) => !value); setExpanded(false); }}
        >
          <Icon name="discover" />
        </button>
        <div className="nav-discover" id="nav-discover" data-open={discoverOpen} aria-hidden={!discoverOpen}>
          <div className="nav-discover-inner">
            <p className="nav-discover-title">Discover</p>
            <div className="nav-discover-grid">
              {CATEGORY_NAVIGATION.map((item) => (
                <Link key={`pill-${item.slug}`} href={item.href} tabIndex={discoverOpen ? 0 : -1} className="nav-more-chip">{item.label}</Link>
              ))}
              <Link href="/category/trending" tabIndex={discoverOpen ? 0 : -1} className="nav-more-chip">Trending</Link>
              <Link href="/category/new-releases" tabIndex={discoverOpen ? 0 : -1} className="nav-more-chip">New releases</Link>
              <Link href="/category/anime" tabIndex={discoverOpen ? 0 : -1} className="nav-more-chip">Anime</Link>
              <Link href="/category/action" tabIndex={discoverOpen ? 0 : -1} className="nav-more-chip">Action</Link>
              <Link href="/category/sci-fi" tabIndex={discoverOpen ? 0 : -1} className="nav-more-chip">Sci-Fi</Link>
            </div>
            <div className="nav-discover-links">
              <Link href="/categories" tabIndex={discoverOpen ? 0 : -1} className="nav-more-link"><Icon name="categories" /><span>All collections</span></Link>
              <Link href="/watchlist" tabIndex={discoverOpen ? 0 : -1} className="nav-more-link"><Icon name="bookmark" /><span>Watchlist</span></Link>
              <Link href="/watch" tabIndex={discoverOpen ? 0 : -1} className="nav-more-link"><Icon name="link" /><span>Watch a link</span></Link>
            </div>
          </div>
        </div>
      </div>
    </div>
    <MagicLine />
    <nav className="nav-menu" aria-label="App sections">
      {NAVIGATION.map((item) => (
        <NavItem key={item.href} item={item} current={item.href === "/" ? pathname === "/" : activeNavigationIndex(pathname) === NAVIGATION.indexOf(item)} />
      ))}
    </nav>
  </div>;
}
