"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import MoreIcon from "./MoreIcon";
import { useCatalogue } from "./CatalogueProvider";
import { matchesCollection } from "@/lib/catalogue";
import { BOTTOM_NAV_ITEMS, CATEGORY_BROWSER_SECTIONS, activeBottomNavIndex } from "@/lib/navigation";

const HIDDEN_PREFIXES = ["/gate-keeper"];

/**
 * One shallow, single-curve light streak that hugs the top edge of the dock.
 *
 * Geometry: a single quadratic Bézier, stretched with
 * `preserveAspectRatio="none"`. Its endpoints sit at y=19.5 and the apex at
 * y=6 in a 24-unit-tall viewBox — i.e. the visible ends float ~5px above the
 * bar and the crest ~16px above it, a rise of just 13.5 units over the whole
 * width. That keeps it a smooth, nearly horizontal arc at any width: never
 * wavy, never closed. (A quadratic's apex is the midpoint of its chord and
 * control point, which is why the control sits at y = −7.5.) It can only ever
 * paint above the navigation bar because the SVG is anchored to the bar itself
 * (`bottom: calc(100% + 1px)`), so it tracks the real dock width *and* height
 * on every screen size and safe-area inset.
 *
 * Light: six strokes over that one path — a wide bloom, a tight halo, the
 * multicolour band, the polished core and a travelling reflection in two
 * weights (no SVG filters, so the whole thing is a handful of GPU-composited
 * vector paints). The gradients run emerald → cyan → blue → violet → magenta →
 * pink while their opacity ramps from 0 up to a single illuminated section and
 * back down to 0, so the streak dissolves into the dark at both ends instead of
 * stopping abruptly.
 */
const NAV_ARC_PATH = "M 0 19.5 Q 500 -7.5 1000 19.5";

function NavGlowArc() {
  const uid = useId().replace(/:/g, "");
  const bandId = `cinemax-arc-band-${uid}`;
  const coreId = `cinemax-arc-core-${uid}`;
  const reflectionId = `cinemax-arc-reflection-${uid}`;

  return (
    <svg
      className="magic-line"
      viewBox="0 0 1000 24"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Emerald → cyan → blue → violet → magenta → pink. The opacity ramp is
            the light's own intensity: it rises out of the dark, holds strongest
            through the violet/magenta section and dissolves again into the dark
            before the streak reaches either edge of the screen. */}
        <linearGradient id={bandId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0f5c46" stopOpacity="0" />
          <stop offset="3%" stopColor="#22d69a" stopOpacity="0.08" />
          <stop offset="9%" stopColor="#2fd8b4" stopOpacity="0.24" />
          <stop offset="17%" stopColor="#33d4ea" stopOpacity="0.42" />
          <stop offset="27%" stopColor="#3fb2f5" stopOpacity="0.6" />
          <stop offset="39%" stopColor="#527ffe" stopOpacity="0.78" />
          <stop offset="51%" stopColor="#8a63ff" stopOpacity="0.9" />
          <stop offset="63%" stopColor="#c65cf5" stopOpacity="0.98" />
          <stop offset="73%" stopColor="#f45ec4" stopOpacity="0.9" />
          <stop offset="81%" stopColor="#ff6fae" stopOpacity="0.66" />
          <stop offset="87%" stopColor="#ff85bd" stopOpacity="0.38" />
          <stop offset="92%" stopColor="#ff97c8" stopOpacity="0.16" />
          <stop offset="96.5%" stopColor="#ff9fca" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#ff9fca" stopOpacity="0" />
        </linearGradient>
        {/* The polished core: the same journey, but tinted highlights rather
            than saturated colour, and never brighter than the band it rides so
            the emerald/green opening and the pink tail keep their hue. */}
        <linearGradient id={coreId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#eafff9" stopOpacity="0" />
          <stop offset="3%" stopColor="#d8fff1" stopOpacity="0.12" />
          <stop offset="9%" stopColor="#d2fff6" stopOpacity="0.26" />
          <stop offset="17%" stopColor="#d6fbff" stopOpacity="0.4" />
          <stop offset="27%" stopColor="#dceeff" stopOpacity="0.5" />
          <stop offset="39%" stopColor="#e4e6ff" stopOpacity="0.62" />
          <stop offset="51%" stopColor="#f0e0ff" stopOpacity="0.74" />
          <stop offset="63%" stopColor="#ffe2fb" stopOpacity="0.86" />
          <stop offset="73%" stopColor="#fff0f8" stopOpacity="0.9" />
          <stop offset="81%" stopColor="#ffe4f1" stopOpacity="0.64" />
          <stop offset="87%" stopColor="#ffdcea" stopOpacity="0.36" />
          <stop offset="92%" stopColor="#ffd8e8" stopOpacity="0.14" />
          <stop offset="96.5%" stopColor="#ffd8e8" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#ffddec" stopOpacity="0" />
        </linearGradient>
        {/* The travelling reflection: white, and only ever visible inside the
            illuminated section, so the glint emerges from the dark, drifts
            across the coloured light and dissolves again — a moving highlight
            rather than a blinking line. */}
        <linearGradient id={reflectionId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="12%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="24%" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="38%" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.44" />
          <stop offset="62%" stopColor="#ffffff" stopOpacity="0.48" />
          <stop offset="74%" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="86%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="94%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="magic-line-bloom" d={NAV_ARC_PATH} stroke={`url(#${bandId})`} />
      <path className="magic-line-halo" d={NAV_ARC_PATH} stroke={`url(#${bandId})`} />
      <path className="magic-line-band" d={NAV_ARC_PATH} stroke={`url(#${bandId})`} />
      <path className="magic-line-sweep-glow" d={NAV_ARC_PATH} stroke={`url(#${reflectionId})`} pathLength={1000} />
      <path className="magic-line-sweep" d={NAV_ARC_PATH} stroke={`url(#${reflectionId})`} pathLength={1000} />
      <path className="magic-line-core" d={NAV_ARC_PATH} stroke={`url(#${coreId})`} />
    </svg>
  );
}

export default function BottomNav() {
  const pathname = usePathname() || "/";
  const { movies, categories } = useCatalogue();
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
    const slugs = new Set<string>();
    for (const section of CATEGORY_BROWSER_SECTIONS) for (const item of section.items) slugs.add(item.slug);
    for (const category of categories) slugs.add(category.slug);
    for (const slug of slugs) {
      counts.set(slug, movies.filter((m) => matchesCollection(m, slug)).length);
    }
    return counts;
  }, [movies, categories]);

  // What the More panel may offer: a destination is shown only when the
  // database actually backs it — an admin-managed category exists, or at
  // least one catalogued title matches it. Nothing is invented for an empty
  // library, and empty sections disappear entirely.
  const browserSections = useMemo(() => {
    const knownSlugs = new Set<string>();
    const sections = CATEGORY_BROWSER_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if ((categoryCounts.get(item.slug) ?? 0) > 0 || categories.some((c) => c.slug === item.slug)) {
          knownSlugs.add(item.slug);
          return true;
        }
        return false;
      }),
    })).filter((section) => section.items.length > 0);
    const extra = categories
      .filter((category) => !knownSlugs.has(category.slug))
      .map((category) => ({ slug: category.slug, label: category.name, href: `/category/${category.slug}` }));
    if (extra.length) sections.push({ id: "your-categories", title: "Your Categories", items: extra });
    return sections;
  }, [categories, categoryCounts]);

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const activeIndex = browserOpen ? 2 : activeBottomNavIndex(pathname);

  return (
    <>
      {browserOpen && (
        <div
          className="category-browser-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="More"
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
                <h2 className="category-browser-title">More</h2>
              </div>
              <button
                type="button"
                className="category-browser-close"
                aria-label="Close More panel"
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
              {(categoryCounts.get("coming-soon") ?? 0) > 0 && (
                <Link
                  href="/category/coming-soon"
                  className="category-browser-quicklink is-upcoming"
                  onClick={() => closeBrowser({ navigating: true })}
                >
                  <Icon name="sparkles" />
                  <span>Coming Soon</span>
                </Link>
              )}
            </div>

            <div className="category-browser-body">
              {browserSections.length === 0 && (
                <p className="category-browser-empty">
                  Nothing to browse yet. Titles and categories added in the studio will appear here.
                </p>
              )}
              {browserSections.map((section) => {
                const visibleItems = section.items;
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
        <nav className="nav-menu" aria-label="App sections">
          <NavGlowArc />
          {BOTTOM_NAV_ITEMS.map((item, index) => {
            if (item.id === "more") {
              return (
                <button
                  key={item.id}
                  type="button"
                  className="nav-menu-link nav-menu-more"
                  aria-expanded={browserOpen}
                  aria-controls="cinemax-category-browser"
                  aria-label={browserOpen ? "Close More panel" : "Open More panel"}
                  onClick={toggleBrowser}
                >
                  <span className="nav-menu-icon" aria-hidden="true">
                    <MoreIcon open={browserOpen} />
                  </span>
                  <span className="nav-menu-label">{item.label}</span>
                </button>
              );
            }
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
                  ) : (
                    <Icon name="search" />
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
