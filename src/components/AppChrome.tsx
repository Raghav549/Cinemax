"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import CatalogueProvider from "./CatalogueProvider";
import WatchlistProvider from "./WatchlistProvider";
import Header from "./Header";
import BottomNav from "./BottomNav";

/** Keep navigation and library state mounted while App Router changes pages. */
export default function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/gate-keeper")) return <div id="cinemax-app">{children}</div>;
  return <div id="cinemax-app"><CatalogueProvider><WatchlistProvider>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Header />
    {children}
    <BottomNav />
  </WatchlistProvider></CatalogueProvider></div>;
}
