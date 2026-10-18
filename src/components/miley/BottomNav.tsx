"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import MusicIcon from "./Icon";

const destinations = [
  { href: "/", label: "Home", icon: "home" as const },
  { href: "/explore", label: "Explore", icon: "search" as const },
  { href: "/channels", label: "Channels", icon: "channels" as const },
  { href: "/messages", label: "Messages", icon: "messages" as const },
  { href: "/library", label: "Library", icon: "library" as const },
];

export default function MiLeyBottomNav() {
  const pathname = usePathname() || "/";
  return <div className="miley-bottom-nav-wrap">
    <nav className="miley-bottom-nav" aria-label="Main navigation">
      {destinations.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <Link href={item.href} key={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}>
          <span className="bottom-nav-icon"><MusicIcon name={item.icon} /></span><span>{item.label}</span>
        </Link>;
      })}
    </nav>
  </div>;
}
