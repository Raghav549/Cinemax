import type { SVGProps, ReactNode } from "react";

export type IconName = "home" | "search" | "explore" | "discover" | "categories" | "bookmark" | "play" | "pause" | "info" | "arrow-left" | "arrow-right" | "chevron-left" | "chevron-right" | "chevron-down" | "close" | "plus" | "check" | "star" | "film" | "series" | "sparkles" | "action" | "orbit" | "drama" | "comedy" | "thriller" | "horror" | "documentary" | "trending" | "share" | "trash" | "refresh" | "lock" | "sort" | "link" | "external";
const paths: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z" /><path d="M9 21v-7h6v7" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.8" /><path d="m15.6 15.6 4.7 4.7" /></>,
  explore: <><path d="m14.8 9.2-1.7 3.9-3.9 1.7 1.7-3.9 3.9-1.7Z" /><circle cx="12" cy="12" r="9" /><path d="M12 3v2m0 14v2M3 12h2m14 0h2" /></>,
  discover: <><rect x="3" y="3" width="8" height="8" rx="2.4" /><rect x="13" y="3" width="8" height="8" rx="2.4" /><rect x="3" y="13" width="8" height="8" rx="2.4" /><path d="M19.6 13.4 18 19.6l-4.6-4.6 6.2-1.6Z" /></>,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  bookmark: <path d="M6 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-3.8L6 21V5Z" />,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
  "arrow-left": <path d="M20 12H4m6-6-6 6 6 6" />,
  "arrow-right": <path d="M4 12h16m-6-6 6 6-6 6" />,
  "chevron-left": <path d="m15 6-6 6 6 6" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  film: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M7 4v16M17 4v16M3 9h4m10 0h4M3 15h4m10 0h4" /></>,
  series: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="m8 3 4 4 4-4m-6 10 5 2-5 2v-4Z" /></>,
  sparkles: <><path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z" /><path d="M20 2v4m-2-2h4" /></>,
  action: <path d="m13 2-9 11h7l-1 9 10-12h-7l1-8Z" />,
  orbit: <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-35 12 12)" /><path d="M10 3a9 9 0 0 1 10 11M4 10a9 9 0 0 0 10 11" /></>,
  drama: <><path d="M4 6c5 2 11 2 16 0v6a8 8 0 0 1-16 0V6Z" /><path d="M8 11h1m6 0h1m-7 5s1-2 3-2 3 2 3 2" /></>,
  comedy: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.4 3 4 3 4-3 4-3M8 9h1m6 0h1" /></>,
  thriller: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M12 8v4m0 4h.01" /></>,
  horror: <><path d="M12 3a8 8 0 0 0-8 8v9l4-2 4 2 4-2 4 2v-9a8 8 0 0 0-8-8Z" /><path d="M9 10h.01M15 10h.01M9 15h6" /></>,
  documentary: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></>,
  trending: <><path d="m3 17 6-6 4 4 8-10" /><path d="M15 5h6v6" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.7 10.7 6.6-4.1m-6.6 6.7 6.6 4.1" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.7-2L20 8M4 16l2.2 3A7 7 0 0 0 17.9 17" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
  sort: <><path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4" /></>,
  categories: <><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></>,
  link: <><path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l2.7-2.7a4.5 4.5 0 1 0-6.4-6.3l-1.5 1.5" /><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-2.7 2.7a4.5 4.5 0 1 0 6.4 6.3l1.5-1.5" /></>,
  external: <><path d="M14 4h6v6" /><path d="m20 4-8.5 8.5" /><path d="M19 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
};

export default function Icon({ name, filled = false, ...props }: SVGProps<SVGSVGElement> & { name: IconName; filled?: boolean }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

export function collectionIcon(slug: string): IconName {
  const icons: Record<string, IconName> = { trending: "trending", "new-releases": "sparkles", movies: "film", series: "series", anime: "sparkles", action: "action", drama: "drama", "sci-fi": "orbit", comedy: "comedy", thriller: "thriller", horror: "horror", documentary: "documentary" };
  return icons[slug] ?? "film";
}
