"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "./Logo";
import Icon from "./Icon";
import { useWatchlist } from "./WatchlistProvider";

const links = [{ href: "/", label: "Home" }, { href: "/categories", label: "Explore" }, { href: "/watchlist", label: "Watchlist" }];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const { savedIds } = useWatchlist();
  const active = pathname === "/categories" || pathname.startsWith("/category/") ? 1 : pathname === "/watchlist" ? 2 : pathname === "/" || pathname.startsWith("/movie/") ? 0 : -1;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !target.closest("input, textarea, select, [contenteditable=true]")) {
        event.preventDefault();
        router.push("/search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return <>
    <div className="header-sentinel" ref={sentinel} aria-hidden="true" />
    <header className="site-header-wrap" data-scrolled={scrolled} data-home={pathname === "/" || pathname.startsWith("/movie/")}>
      <div className="site-header">
        <Link href="/" className="brand-lockup" aria-label="Cinemax home"><Logo /></Link>
        <nav className="desktop-nav" aria-label="Main navigation" style={{ "--nav-index": Math.max(0, active) } as CSSProperties}>
          <span className="desktop-nav-indicator" data-visible={active >= 0} aria-hidden="true" />
          {links.map((link, index) => <Link key={link.href} href={link.href} className="desktop-nav-link" aria-current={active === index ? "page" : undefined}>{link.label}</Link>)}
        </nav>
        <div className="header-actions">
          <Link href="/search" className="header-search" aria-label="Search movies and shows" aria-current={pathname === "/search" ? "page" : undefined}><Icon name="search" /><span>Search titles</span><kbd>/</kbd></Link>
          <Link href="/watchlist" className="header-icon-link" aria-label={`Open watchlist${savedIds.size ? `, ${savedIds.size} saved titles` : ""}`} aria-current={pathname === "/watchlist" ? "page" : undefined}><Icon name="bookmark" />{savedIds.size > 0 && <span className="header-count" aria-hidden="true">{savedIds.size > 99 ? "99+" : savedIds.size}</span>}</Link>
          <Link href="/gate-keeper" className="header-studio" aria-label="Open Cinemax studio" title="Cinemax studio">C</Link>
        </div>
      </div>
    </header>
  </>;
}
