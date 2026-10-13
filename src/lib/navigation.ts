import type { IconName } from "@/components/Icon";

/** Bottom row below the curved light line: Home · Search · Categories. */
export const NAVIGATION: { href: string; label: string; icon: IconName | "logo" }[] = [
  { href: "/", label: "Home", icon: "logo" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/categories", label: "Categories", icon: "categories" },
];

export function activeNavigationIndex(pathname: string) {
  if (pathname === "/categories" || pathname.startsWith("/category/")) return 2;
  if (pathname.startsWith("/search") || pathname === "/watch") return 1;
  return 0;
}

/*
 * The premium pill maps onto the existing category system rather than inventing
 * a new backend. Cinemax has no dedicated "Web" or "Dramas" collection of its own:
 * "Web" is the app's label for the episodic/web-series shelf, which the catalogue
 * already serves as the `series` category, and "Dramas" is the existing `drama`
 * category. "Movies" maps to `movies`. All three resolve to real, seeded routes
 * (`/category/series`, `/category/movies`, `/category/drama`); see the seed data
 * for the titles behind each.
 */
export const CATEGORY_NAVIGATION: { href: string; label: string; slug: string }[] = [
  { href: "/category/series", label: "Web", slug: "series" },
  { href: "/category/movies", label: "Movies", slug: "movies" },
  { href: "/category/drama", label: "Dramas", slug: "drama" },
];

export function activeCategoryIndex(pathname: string) {
  return CATEGORY_NAVIGATION.findIndex((item) => pathname === item.href);
}

/** Extra destinations revealed by the pill's chevron - all real catalogue routes. */
export const MORE_NAVIGATION: { href: string; label: string; icon: IconName }[] = [
  { href: "/watchlist", label: "Watchlist", icon: "bookmark" },
  { href: "/watch", label: "Watch a link", icon: "link" },
];
