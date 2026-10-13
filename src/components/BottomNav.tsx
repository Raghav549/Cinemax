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
        <MagicLine activeIndex={activeIndex} />
        <nav className="nav-menu" aria-label="App sections">
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
