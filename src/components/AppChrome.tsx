"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import MiLeyHeader from "./miley/Header";
import MiLeyBottomNav from "./miley/BottomNav";
import { MusicProvider } from "./miley/MusicProvider";
import { FullPlayer, MiniPlayer } from "./miley/Player";
import MiLeyToast from "./miley/Toast";

const AUTH_PATHS = new Set(["/login", "/register", "/verify", "/reset-password", "/forgot-password"]);

export default function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  if (pathname.startsWith("/gate-keeper")) return <div id="miley-app">{children}</div>;
  const authScreen = AUTH_PATHS.has(pathname);
  return <MusicProvider>
    <div id="miley-app" data-screen={pathname.split("/").filter(Boolean)[0] || "home"} className={authScreen ? "is-auth-screen" : ""}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <MiLeyHeader compact={authScreen} />
      {children}
      {!authScreen && <MiniPlayer />}
      {!authScreen && <MiLeyBottomNav />}
      <FullPlayer />
      <MiLeyToast />
    </div>
  </MusicProvider>;
}
