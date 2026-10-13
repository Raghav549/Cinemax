import type { MovieCardData } from "@/components/MovieCard";
import {
  COLLECTION_SPECS,
  matchesCollection as matchesMovieCollection,
  tokens as movieTokens,
  isVerifiedPlayable,
  isOfficialExternal,
  isUpcomingMovie,
  isPlayableMovie,
  buildAllCategoryCollections,
} from "@/lib/movies";

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
  catalogStatus?: string | null;
  sourceType?: string | null;
  licenseInfo?: string | null;
  sourceAttribution?: string | null;
  releaseDate?: string | null;
  trailerUrl?: string | null;
  lastVerifiedAt?: string | null;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
}

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
  { label: "Dramas", value: "drama" },
  { label: "Anime", value: "anime" },
  { label: "Action", value: "action" },
  { label: "Sci-Fi", value: "sci-fi" },
  { label: "Thriller", value: "thriller" },
  { label: "Comedy", value: "comedy" },
  { label: "Coming Soon", value: "coming-soon" },
];

export function tokens(value: string | null | undefined): string[] {
  return movieTokens(value);
}

/** Shared by Home, Explore and collection pages so the same filter means the same thing. */
export function matchesCollection(movie: CatalogueMovie, slug: string): boolean {
  return matchesMovieCollection(movie, slug);
}

export {
  COLLECTION_SPECS,
  isVerifiedPlayable,
  isOfficialExternal,
  isUpcomingMovie,
  isPlayableMovie,
  buildAllCategoryCollections,
};
