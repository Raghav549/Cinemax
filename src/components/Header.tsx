"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/categories", label: "Explore" },
  { href: "/watchlist", label: "My list" },
];

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M7.3 5.2v13.6L19 12 7.3 5.2Z" fill="currentColor" />
      </svg>
    </span>
  );
}

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="site-header-wrap">
      <div className="site-header">
        <Link href="/" className="brand-lockup" aria-label="Cinemax home">
          <BrandMark />
          <span>
            <span className="brand-word">CINEMAX</span>
            <span className="brand-tagline">A world beyond play</span>
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map((link) => {
            const active = link.href === "/" ? pathname === "/" : link.href === "/categories" ? pathname === "/categories" || pathname.startsWith("/category/") : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} className="desktop-nav-link" aria-current={active ? "page" : undefined}>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="header-actions">
          <Link href="/search" className="header-icon-link" aria-label="Search movies and shows" aria-current={pathname === "/search" ? "page" : undefined} title="Search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.3 4.3" />
            </svg>
          </Link>
          <Link href="/watchlist" className="header-icon-link" aria-label="Open your list" title="My list">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.7L6 21V4.5Z" />
            </svg>
          </Link>
          <span className="header-profile" aria-label="Cinemax profile">CX</span>
        </div>
      </div>
    </header>
  );
}
