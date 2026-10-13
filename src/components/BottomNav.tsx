"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { useCatalogue } from "./CatalogueProvider";
import { matchesCollection } from "@/lib/catalogue";
import {
  BOTTOM_NAV_ITEMS,
  CATEGORY_BROWSER_SECTIONS,
  PRIMARY_PILL_ITEMS,
  activeBottomNavIndex,
  activePillId,
} from "@/lib/navigation";

const HIDDEN_PREFIXES = ["/gate-keeper"];

function PillLightLine() {
  const uid = useId().replace(/:/g, "");
  const gradId = `cinemax-pill-line-${uid}`;
  return (
    <svg className="nav-pill-lightline" viewBox="0 0 280 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
          <stop offset="20%" stopColor="#38bdf8" stopOpacity="0.82" />
          <stop offset="50%" stopColor="#a855f7" stopOpacity="0.95" />
          <stop offset="80%" stopColor="#ec4899" stopOpacity="0.82" />
          <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M 10 8 Q 140 1.5 270 8"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const MAGIC_LINE_PATH = "M 0 12 Q 600 2 1200 12";

function MagicLine({ activeIndex }: { activeIndex: number }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `cinemax-magic-grad-${uid}`;
  const glowId = `cinemax-magic-glow-${uid}`;
  const centers = [200, 600, 1000];
  const cx = centers[activeIndex] ?? 200;

  return (
    <svg className="magic-line" viewBox="0 0 1200 16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
          <stop offset="18%" stopColor="#4FD8FF" stopOpacity="0.72" />
          <stop offset="50%" stopColor="#5E96FF" stopOpacity="0.95" />
          <stop offset="82%" stopColor="#4FD8FF" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4FD8FF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#4FD8FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={MAGIC_LINE_PATH} className="magic-line-bed" vectorEffect="non-scaling-stroke" fill="none" />
      <path
        d={MAGIC_LINE_PATH}
        className="magic-line-core"
        stroke={`url(#${gradId})`}
        vectorEffect="non-scaling-stroke"
        fill="none"
      />
      <ellipse cx={cx} cy="7" rx="135" ry="5" fill={`url(#${glowId})`} className="magic-line-active-glow" />
    </svg>
  );
}

export default function BottomNav() {
  const pathname = usePathname() || "/";
  const { movies } = useCatalogue();
  const [browserOpen, setBrowserOpen] = useState(false);
  const savedScrollYRef = useRef<number>(0);
  const historyPushedRef = useRef<boolean>(false);

  const openBrowser = useCallback(() => {
    if (typeof window !== "undefined") {
      savedScrollYRef.current = window.scrollY;
      try {
        window.history.pushState({ ...(window.history.state ?? {}), cinemaxCategorySheet: true }, "");
        historyPushedRef.current = true;
      } catch {
        historyPushedRef.current = false;
      }
      document.documentElement.setAttribute("data-cinemax-sheet-open", "true");
    }
    setBrowserOpen(true);
  }, []);

  const closeBrowser = useCallback((opts?: { fromPopState?: boolean; navigating?: boolean }) => {
    const scrollToRestore = savedScrollYRef.current;
    setBrowserOpen(false);

    if (typeof window !== "undefined") {
      document.documentElement.removeAttribute("data-cinemax-sheet-open");

      if (!opts?.fromPopState && !opts?.navigating && historyPushedRef.current) {
        historyPushedRef.current = false;
        try {
          if (window.history.state?.cinemaxCategorySheet) {
            window.history.back();
          }
        } catch {
          // Ignore history errors
        }
      } else {
        historyPushedRef.current = false;
      }

      if (!opts?.navigating) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: scrollToRestore, behavior: "instant" as ScrollBehavior });
        });
      }
    }
  }, []);

  const toggleBrowser = useCallback(() => {
    if (browserOpen) {
      closeBrowser();
    } else {
      openBrowser();
    }
  }, [browserOpen, closeBrowser, openBrowser]);

  const [routeFor, setRouteFor] = useState(pathname);
  if (pathname !== routeFor) {
    setRouteFor(pathname);
    if (browserOpen) {
      setBrowserOpen(false);
    }
  }

  useEffect(() => {
    if (!browserOpen) {
      document.documentElement.removeAttribute("data-cinemax-sheet-open");
      return;
    }

    const onPopState = () => {
      historyPushedRef.current = false;
      closeBrowser({ fromPopState: true });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeBrowser();
      }
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [browserOpen, closeBrowser]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (movies.length === 0) return counts;
    for (const section of CATEGORY_BROWSER_SECTIONS) {
      for (const item of section.items) {
        if (!counts.has(item.slug)) {
          const matched = movies.filter((m) => matchesCollection(m, item.slug)).length;
          counts.set(item.slug, matched);
        }
      }
    }
    return counts;
  }, [movies]);

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const activeIndex = activeBottomNavIndex(pathname);
  const currentPill = activePillId(pathname);

  return (
    <>
      {browserOpen && (
        <div
          className="category-browser-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Browse categories"
          data-testid="category-browser-sheet"
        >
          <div className="category-browser-backdrop" onClick={() => closeBrowser()} aria-hidden="true" />
          <div className="category-browser-sheet" id="cinemax-category-browser">
            <div className="category-browser-handle" aria-hidden="true">
              <span />
            </div>
            <div className="category-browser-header">
              <div>
                <p className="category-browser-eyebrow">Cinemax Catalog</p>
                <h2 className="category-browser-title">Browse Categories</h2>
              </div>
              <button
                type="button"
                className="category-browser-close"
                aria-label="Close category browser"
                onClick={() => closeBrowser()}
              >
                <Icon name="close" />
                <span>Close</span>
              </button>
            </div>

            <div className="category-browser-quickbar">
              <Link
                href="/categories"
                className="category-browser-quicklink"
                onClick={() => closeBrowser({ navigating: true })}
              >
                <Icon name="categories" />
                <span>All Categories</span>
              </Link>
              <Link
                href="/watchlist"
                className="category-browser-quicklink"
                onClick={() => closeBrowser({ navigating: true })}
              >
                <Icon name="bookmark" />
                <span>Watchlist</span>
              </Link>
              <Link
                href="/category/coming-soon"
                className="category-browser-quicklink is-upcoming"
                onClick={() => closeBrowser({ navigating: true })}
              >
                <Icon name="sparkles" />
                <span>Coming Soon</span>
              </Link>
            </div>

            <div className="category-browser-body">
              {CATEGORY_BROWSER_SECTIONS.map((section) => {
                const visibleItems =
                  movies.length === 0
                    ? section.items
                    : section.items.filter((item) => (categoryCounts.get(item.slug) ?? 0) > 0);
                if (visibleItems.length === 0) return null;

                return (
                  <section key={section.id} className="category-browser-section" aria-label={section.title}>
                    <h3 className="category-browser-section-title">{section.title}</h3>
                    <div className="category-browser-chips">
                      {visibleItems.map((item) => {
                        const isActive = pathname === item.href;
                        const count = categoryCounts.get(item.slug);
                        return (
                          <Link
                            key={`${section.id}-${item.slug}`}
                            href={item.href}
                            className={`category-browser-chip ${isActive ? "active" : ""} ${item.slug === "coming-soon" ? "coming-soon-chip" : ""}`}
                            onClick={() => closeBrowser({ navigating: true })}
                          >
                            <span className="category-browser-chip-label">{item.label}</span>
                            {typeof count === "number" && count > 0 && (
                              <span className="category-browser-chip-count">{count}</span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="bottom-nav-wrap">
        <div className="nav-dock">
          <div className="nav-dock-row">
            <nav className="nav-pill" aria-label="Primary navigation">
              <div className="nav-pill-items">
                {PRIMARY_PILL_ITEMS.map((item, index) => {
                  const active = currentPill === item.id;
                  return (
                    <span key={item.id} className="nav-pill-cell">
                      {index > 0 && <span className="nav-pill-sep" aria-hidden="true" />}
                      <Link
                        href={item.href}
                        className="nav-pill-link"
                        aria-current={active ? "page" : undefined}
                      >
                        {item.label}
                      </Link>
                    </span>
                  );
                })}
                <span className="nav-pill-sep" aria-hidden="true" />
                <button
                  type="button"
                  className="nav-pill-chevron"
                  aria-expanded={browserOpen}
                  aria-controls="cinemax-category-browser"
                  aria-label={browserOpen ? "Collapse navigation" : "Expand navigation"}
                  onClick={toggleBrowser}
                >
                  <Icon name="chevron-down" />
                </button>
              </div>
              <PillLightLine />
            </nav>
          </div>
        </div>
        <MagicLine activeIndex={activeIndex} />
        <nav className="nav-menu" aria-label="App sections">
          {BOTTOM_NAV_ITEMS.map((item, index) => {
            const current = item.href === "/" ? pathname === "/" : index === activeIndex;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="nav-menu-link"
                aria-current={current ? "page" : undefined}
              >
                <span className="nav-menu-icon" aria-hidden="true">
                  {item.id === "home" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/brand/cinemax-symbol.svg"
                      alt=""
                      width={20}
                      height={20}
                      className="nav-menu-logo"
                      decoding="async"
                    />
                  ) : item.id === "search" ? (
                    <Icon name="search" />
                  ) : (
                    <Icon name="categories" />
                  )}
                </span>
                <span className="nav-menu-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
