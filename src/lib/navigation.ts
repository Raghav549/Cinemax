export type NavDestination = {
  id: "home" | "search" | "categories";
  label: string;
  href: string;
  match: (pathname: string) => boolean;
};

export type PillSegment = {
  id: "web" | "movies" | "dramas";
  label: string;
  href: string;
  slugs?: readonly string[];
  match?: (pathname: string) => boolean;
};

export type CategoryBrowserItem = {
  slug: string;
  label: string;
  href: string;
  badge?: string;
};

export type CategoryBrowserSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: readonly CategoryBrowserItem[];
};

export const PRIMARY_PILL_ITEMS: readonly PillSegment[] = [
  {
    id: "web",
    label: "Web",
    href: "/",
    match: (pathname) => pathname === "/",
  },
  {
    id: "movies",
    label: "Movies",
    href: "/category/movies",
    slugs: ["movies", "new-releases", "trending", "popular", "top-rated", "new-hot", "award-winners", "hidden-gems"],
  },
  {
    id: "dramas",
    label: "Dramas",
    href: "/category/dramas",
    slugs: ["dramas", "drama", "series"],
  },
];

export const BROWSE_ITEMS: readonly CategoryBrowserItem[] = [
  { slug: "movies", label: "All Movies", href: "/category/movies" },
  { slug: "new-releases", label: "Latest Releases", href: "/category/new-releases" },
  { slug: "trending", label: "Trending", href: "/category/trending" },
  { slug: "popular", label: "Popular", href: "/category/popular" },
  { slug: "top-rated", label: "Top Rated", href: "/category/top-rated" },
  { slug: "new-hot", label: "New & Hot", href: "/category/new-hot" },
  { slug: "award-winners", label: "Award Winners", href: "/category/award-winners" },
  { slug: "hidden-gems", label: "Hidden Gems", href: "/category/hidden-gems" },
];

export const DISCOVER_TYPE_ITEMS: readonly CategoryBrowserItem[] = [
  { slug: "movies", label: "Movies", href: "/category/movies" },
  { slug: "dramas", label: "Dramas and Series", href: "/category/dramas" },
  { slug: "anime", label: "Anime", href: "/category/anime" },
  { slug: "animation", label: "Animation", href: "/category/animation" },
  { slug: "documentary", label: "Documentaries", href: "/category/documentary" },
  { slug: "short-films", label: "Short Films", href: "/category/short-films" },
  { slug: "family", label: "Family and Kids", href: "/category/family" },
  { slug: "classics", label: "Classics", href: "/category/classics" },
];

export const LANGUAGE_ITEMS: readonly CategoryBrowserItem[] = [
  { slug: "hindi", label: "Hindi", href: "/category/hindi" },
  { slug: "english", label: "English", href: "/category/english" },
  { slug: "tamil", label: "Tamil", href: "/category/tamil" },
  { slug: "telugu", label: "Telugu", href: "/category/telugu" },
  { slug: "malayalam", label: "Malayalam", href: "/category/malayalam" },
  { slug: "bengali", label: "Bengali", href: "/category/bengali" },
  { slug: "japanese", label: "Japanese", href: "/category/japanese" },
  { slug: "korean", label: "Korean", href: "/category/korean" },
  { slug: "marathi", label: "Marathi", href: "/category/marathi" },
  { slug: "german", label: "German", href: "/category/german" },
  { slug: "russian", label: "Russian", href: "/category/russian" },
  { slug: "french", label: "French", href: "/category/french" },
];

export const GENRE_ITEMS: readonly CategoryBrowserItem[] = [
  { slug: "action", label: "Action", href: "/category/action" },
  { slug: "adventure", label: "Adventure", href: "/category/adventure" },
  { slug: "comedy", label: "Comedy", href: "/category/comedy" },
  { slug: "crime", label: "Crime", href: "/category/crime" },
  { slug: "drama", label: "Drama", href: "/category/drama" },
  { slug: "fantasy", label: "Fantasy", href: "/category/fantasy" },
  { slug: "horror", label: "Horror", href: "/category/horror" },
  { slug: "mystery", label: "Mystery", href: "/category/mystery" },
  { slug: "romance", label: "Romance", href: "/category/romance" },
  { slug: "sci-fi", label: "Science Fiction", href: "/category/sci-fi" },
  { slug: "thriller", label: "Thriller", href: "/category/thriller" },
  { slug: "animation", label: "Animation", href: "/category/animation" },
];

export const COLLECTION_ITEMS: readonly CategoryBrowserItem[] = [
  { slug: "recently-added", label: "Recently Added", href: "/category/recently-added" },
  { slug: "highest-rated", label: "Highest Rated", href: "/category/highest-rated" },
  { slug: "public-domain", label: "Public-Domain Cinema", href: "/category/public-domain" },
  { slug: "open-access", label: "Open-Access Films", href: "/category/open-access" },
  { slug: "independent", label: "Independent Cinema", href: "/category/independent" },
  { slug: "coming-soon", label: "Coming Soon", href: "/category/coming-soon", badge: "Coming Soon" },
];

export const CATEGORY_BROWSER_SECTIONS: readonly CategoryBrowserSection[] = [
  {
    id: "browse",
    title: "Browse",
    items: BROWSE_ITEMS,
  },
  {
    id: "discover-type",
    title: "Discover by Content Type",
    items: DISCOVER_TYPE_ITEMS,
  },
  {
    id: "languages",
    title: "Popular Languages",
    items: LANGUAGE_ITEMS,
  },
  {
    id: "genres",
    title: "Popular Genres",
    items: GENRE_ITEMS,
  },
  {
    id: "collections",
    title: "Collections",
    items: COLLECTION_ITEMS,
  },
];

export const BOTTOM_NAV_ITEMS: readonly NavDestination[] = [
  {
    id: "home",
    label: "Home",
    href: "/",
    match: (pathname) => pathname === "/",
  },
  {
    id: "search",
    label: "Search",
    href: "/search",
    match: (pathname) => pathname.startsWith("/search"),
  },
  {
    id: "categories",
    label: "Categories",
    href: "/categories",
    match: (pathname) => pathname.startsWith("/categories") || pathname.startsWith("/category/"),
  },
];

export function activeBottomNavIndex(pathname: string): number {
  const index = BOTTOM_NAV_ITEMS.findIndex((item) => item.match(pathname));
  return index === -1 ? 0 : index;
}

export function activePillId(pathname: string): PillSegment["id"] | null {
  if (pathname === "/") return "web";
  const slug = pathname.startsWith("/category/") ? pathname.slice("/category/".length).toLowerCase() : "";
  for (const item of PRIMARY_PILL_ITEMS) {
    if (item.match?.(pathname)) return item.id;
    if (slug && item.slugs?.includes(slug)) return item.id;
  }
  return null;
}
