"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import Icon from "./Icon";
import { NAVIGATION, activeNavigationIndex } from "@/lib/navigation";

export default function BottomNav() {
  const active = activeNavigationIndex(usePathname());
  return <div className="bottom-nav-wrap">
    <nav className="bottom-nav" aria-label="Primary navigation" style={{ "--nav-index": active } as CSSProperties}>
      <span className="bottom-nav-indicator" aria-hidden="true" />
      {NAVIGATION.map((item, index) => <Link key={item.href} href={item.href} className="bottom-nav-link" aria-current={index === active ? "page" : undefined}><span className="nav-icon"><Icon name={item.icon} /></span><span>{item.label}</span></Link>)}
    </nav>
  </div>;
}
