import type { IconName } from "@/components/Icon";

export const NAVIGATION: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/categories", label: "Explore", icon: "explore" },
  { href: "/watchlist", label: "Watchlist", icon: "bookmark" },
];
export function activeNavigationIndex(pathname: string) {
  if (pathname === "/categories" || pathname.startsWith("/category/")) return 2;
  if (pathname.startsWith("/search")) return 1;
  if (pathname.startsWith("/watchlist")) return 3;
  return 0;
}
