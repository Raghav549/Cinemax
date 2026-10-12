"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: "M3 10.2 12 3l9 7.2v9.3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-9.3ZM9 21v-7h6v7" },
  { href: "/search", label: "Search", icon: "M10.8 18.2a7.4 7.4 0 1 0 0-14.8 7.4 7.4 0 0 0 0 14.8ZM16.3 16.3 21 21" },
  { href: "/categories", label: "Explore", icon: "M3 4h8v7H3zM14 4h7v7h-7zM3 14h8v7H3zM14 14h7v7h-7z" },
  { href: "/watchlist", label: "My list", icon: "M6 3.5h12v17l-6-3.7-6 3.7v-17Z" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : item.href === "/categories" ? pathname === "/categories" || pathname.startsWith("/category/") : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} className="bottom-nav-link" aria-current={active ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={item.icon} />
            </svg>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
