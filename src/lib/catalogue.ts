import type { MovieCardData } from "@/components/MovieCard";

export interface CatalogueMovie extends MovieCardData {
  description: string | null;
  language: string | null;
  director: string | null;
  cast: string | null;
  backdropUrl: string | null;
  videoUrl: string | null;
  subtitleUrl: string | null;
  subtitleLanguage: string | null;
  category: string | null;
  featured: boolean | null;
  rightsConfirmed: boolean;
}

export interface Category { id: number; name: string; slug: string; }
export interface FeaturedSlide {
  id: number;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  movieId: number | null;
}

export const FILTERS = [
  { label: "For you", value: "all" },
  { label: "Movies", value: "movies" },
  { label: "Series", value: "series" },
  { label: "Anime", value: "anime" },
  { label: "Action", value: "action" },
  { label: "Sci-Fi", value: "sci-fi" },
  { label: "Thriller", value: "thriller" },
  { label: "Comedy", value: "comedy" },
  { label: "Drama", value: "drama" },
];

export function tokens(value: string | null | undefined): string[] {
  return (value ?? "").split(",").map((token) => token.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean);
}

/** Shared by Home, Explore and collection pages so the same filter means the same thing. */
export function matchesCollection(movie: CatalogueMovie, slug: string): boolean {
  const key = slug.toLowerCase();
  if (key === "all") return true;
  if (tokens(movie.category).includes(key)) return true;
  if (key === "movies") return movie.type?.toLowerCase() === "movie";
  if (["series", "anime", "documentary"].includes(key) && movie.type?.toLowerCase() === key) return true;
  return tokens(movie.genre).includes(key);
}
