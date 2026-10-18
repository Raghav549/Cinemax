"use client";

import RemoteImage from "./RemoteImage";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import MusicIcon from "./Icon";
import { useMusic } from "./MusicProvider";

const primaryLinks = [
  { href: "/", label: "Home", icon: "home" as const },
  { href: "/explore", label: "Explore", icon: "search" as const },
  { href: "/channels", label: "Channels", icon: "channels" as const },
  { href: "/messages", label: "Messages", icon: "messages" as const },
  { href: "/library", label: "Library", icon: "library" as const },
];

export default function MiLeyHeader({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname() || "/";
  const { user, userLoading } = useMusic();
  return <header className={`miley-header ${compact ? "is-compact" : ""}`}>
    <Link href="/" className="miley-header-brand" aria-label="MiLey home"><Logo /></Link>
    {!compact && <nav className="miley-header-nav" aria-label="Main navigation">
      {primaryLinks.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <Link href={item.href} key={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><MusicIcon name={item.icon} /><span>{item.label}</span></Link>;
      })}
    </nav>}
    <div className="miley-header-actions">
      <Link href="/explore" className="header-search-link" aria-label="Search music"><MusicIcon name="search" /><span>Search music</span><kbd>/</kbd></Link>
      {!userLoading && user && <Link href="/notifications" className="header-quick-icon" aria-label="Notifications"><MusicIcon name="bell" /></Link>}
      {!userLoading && user ? <Link href={`/profile/${encodeURIComponent(user.username)}`} className="header-profile" aria-label={`Profile @${user.username}`}>
        {user.avatarUrl ? <RemoteImage src={user.avatarUrl} alt="" /> : <span>{user.displayName.slice(0, 1).toUpperCase()}</span>}
      </Link> : <Link href="/login" className="header-signin">Sign in</Link>}
    </div>
  </header>;
}
