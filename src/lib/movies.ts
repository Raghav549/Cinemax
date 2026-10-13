import { resolveShareLink, type LinkResolution } from "@/lib/providers";
import { isHttpOrLocalUrl, normalizeMovie, type CatalogStatus, type MovieRow, type SourceType } from "@/db/rows";

const MAGNET_PREFIX = /^magnet:/i;

/**
 * Never expose a configured magnet URI to a public browser. The public player
 * receives only the movie-scoped stream route; admin responses keep the source
 * URL so it can be edited in the studio.
 */
export function publicMovie(row: Record<string, unknown>): MovieRow {
  const movie = normalizeMovie(row);
  if (movie.catalogStatus === "upcoming" || movie.catalogStatus === "temporarily_unavailable" || movie.catalogStatus === "verification_failed") {
    movie.videoUrl = "";
  } else if (MAGNET_PREFIX.test(movie.videoUrl)) {
    const gatewayReady =
      process.env.TORRENT_STREAMING_ENABLED === "true" &&
      Boolean(process.env.TORRENT_GATEWAY_URL) &&
      Boolean(process.env.TORRENT_GATEWAY_TOKEN);
    movie.videoUrl = movie.rightsConfirmed && gatewayReady ? `/api/stream/${movie.id}` : "";
  } else if (movie.videoUrl && !isHttpOrLocalUrl(movie.videoUrl)) {
    movie.videoUrl = "";
  }
  if (movie.subtitleUrl && !isHttpOrLocalUrl(movie.subtitleUrl)) movie.subtitleUrl = "";
  return movie;
}

export type Movie = {
  id: number;
  title: string;
  description: string;
  year: number;
  rating: string;
  ratingSource?: string;
  duration: string;
  genre: string;
  language: string;
  type: string;
  director: string;
  cast: string;
  posterUrl: string;
  backdropUrl: string;
  videoUrl: string;
  subtitleUrl?: string;
  subtitleLanguage?: string;
  rightsConfirmed?: boolean;
  catalogStatus?: CatalogStatus | string | null;
  sourceType?: SourceType | string | null;
  licenseInfo?: string | null;
  sourceAttribution?: string | null;
  releaseDate?: string | null;
  trailerUrl?: string | null;
  verificationResult?: string | null;
  lastVerifiedAt?: string | null;
  category: string;
  featured: boolean;
  createdAt?: string | null;
};

export interface MovieLike {
  id: number;
  title: string;
  description?: string | null;
  year?: number | null;
  rating?: string | null;
  duration?: string | null;
  genre?: string | null;
  language?: string | null;
  type?: string | null;
  director?: string | null;
  cast?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  videoUrl?: string | null;
  subtitleUrl?: string | null;
  subtitleLanguage?: string | null;
  rightsConfirmed?: boolean | null;
  catalogStatus?: string | null;
  sourceType?: string | null;
  licenseInfo?: string | null;
  sourceAttribution?: string | null;
  releaseDate?: string | null;
  trailerUrl?: string | null;
  lastVerifiedAt?: string | null;
  category?: string | null;
  featured?: boolean | null;
}

export type Slide = {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  movieId: number | null;
  sortOrder: number;
  active: boolean;
  createdAt?: string | null;
};

export type Category = {
  id?: number;
  name: string;
  slug: string;
};

export type CollectionSpec = {
  slug: string;
  name: string;
  eyebrow: string;
  description: string;
};

export const COLLECTION_SPECS: readonly CollectionSpec[] = [
  { slug: "trending", name: "Trending Now", eyebrow: "Verified Spotlight", description: "Verified playable films and restorations leading the Cinemax library." },
  { slug: "movies", name: "Movies", eyebrow: "Feature Films", description: "Verified full-length feature films across classic, independent, and open cinema." },
  { slug: "new-releases", name: "Latest Releases", eyebrow: "Recent Years", description: "Modern open-license releases, recent restorations, and contemporary cinema." },
  { slug: "popular", name: "Popular", eyebrow: "Audience Favorites", description: "Widely acclaimed classics and open-movie milestones." },
  { slug: "top-rated", name: "Top Rated", eyebrow: "Critics' Choice", description: "Highest-rated films verified for immediate playback." },
  { slug: "new-hot", name: "New & Hot", eyebrow: "Fresh Picks", description: "Standout open-access and archival additions." },
  { slug: "award-winners", name: "Award Winners", eyebrow: "Festival & Academy Laureates", description: "Festival prize winners and landmark cinematic achievements." },
  { slug: "hidden-gems", name: "Hidden Gems", eyebrow: "Curator's Vault", description: "Rare archival restorations, regional pioneers, and independent discoveries." },
  { slug: "dramas", name: "Dramas and Series", eyebrow: "Dramatic Storytelling", description: "Character-driven dramas and serialized archival television." },
  { slug: "series", name: "Series", eyebrow: "Episodic Stories", description: "Multi-episode series and anthology dramas." },
  { slug: "anime", name: "Anime", eyebrow: "Japanese Animation", description: "Classic Japanese animated features and upcoming anime." },
  { slug: "animation", name: "Animation", eyebrow: "Animated Worlds", description: "Blender Studio open movies and classic animated features." },
  { slug: "documentary", name: "Documentaries", eyebrow: "Non-Fiction Cinema", description: "Historical, spaceflight, and city-symphony documentaries." },
  { slug: "short-films", name: "Short Films", eyebrow: "Concise Cinema", description: "Award-winning open-license and archival short films." },
  { slug: "family", name: "Family and Kids", eyebrow: "All-Ages Cinema", description: "Family-friendly animation, slapstick classics, and adventure tales." },
  { slug: "classics", name: "Classics", eyebrow: "Golden Age Cinema", description: "Restored silent and sound-era masterpieces from around the world." },
  { slug: "public-domain", name: "Public-Domain Cinema", eyebrow: "Verified Heritage", description: "Films with verified public-domain status preserved for open viewing." },
  { slug: "open-access", name: "Open-Access Films", eyebrow: "Creative Commons", description: "Films explicitly released under Creative Commons and open licenses." },
  { slug: "independent", name: "Independent Cinema", eyebrow: "Indie Voices", description: "Independent productions and creator-released films." },
  { slug: "recently-added", name: "Recently Added", eyebrow: "Library Additions", description: "Latest verified additions to the Cinemax catalog." },
  { slug: "highest-rated", name: "Highest Rated", eyebrow: "8.0+ Acclaim", description: "Top-scoring titles across archival and open-access collections." },
  { slug: "coming-soon", name: "Coming Soon", eyebrow: "Upcoming Slate", description: "Confirmed upcoming theatrical and series releases with official metadata." },
  { slug: "hindi", name: "Hindi Cinema", eyebrow: "Popular Languages", description: "Pioneering Hindi classics, Bombay Talkies restorations, and upcoming Hindi releases." },
  { slug: "english", name: "English Cinema", eyebrow: "Popular Languages", description: "English-language features, open movies, noir classics, and upcoming releases." },
  { slug: "tamil", name: "Tamil Cinema", eyebrow: "Popular Languages", description: "Classic Madras cinema and upcoming Tamil releases." },
  { slug: "telugu", name: "Telugu Cinema", eyebrow: "Popular Languages", description: "Golden-age Telugu classics and upcoming Telugu event films." },
  { slug: "malayalam", name: "Malayalam Cinema", eyebrow: "Popular Languages", description: "Pioneering Malayalam cinema and upcoming regional releases." },
  { slug: "bengali", name: "Bengali Cinema", eyebrow: "Popular Languages", description: "New Theatres Calcutta classics and Bengali neorealist cinema." },
  { slug: "japanese", name: "Japanese Cinema", eyebrow: "Popular Languages", description: "Archival Japanese animation and upcoming anime." },
  { slug: "korean", name: "Korean Cinema", eyebrow: "Popular Languages", description: "Korean Film Archive (KOFA) Golden Age restorations." },
  { slug: "marathi", name: "Marathi Cinema", eyebrow: "Popular Languages", description: "Prabhat Film Company and Phalke archival classics." },
  { slug: "german", name: "German Cinema", eyebrow: "Popular Languages", description: "Weimar expressionist and UFA classics." },
  { slug: "russian", name: "Russian & Soviet Cinema", eyebrow: "Popular Languages", description: "Montage era and city-symphony landmarks." },
  { slug: "french", name: "French Cinema", eyebrow: "Popular Languages", description: "Early French fantastical cinema." },
  { slug: "action", name: "Action", eyebrow: "Popular Genres", description: "High-momentum stunts, swashbuckling spectacles, and sci-fi action." },
  { slug: "adventure", name: "Adventure", eyebrow: "Popular Genres", description: "Expeditions, quests, and mythic journeys." },
  { slug: "comedy", name: "Comedy", eyebrow: "Popular Genres", description: "Screwball classics, physical comedy, and animated shorts." },
  { slug: "crime", name: "Crime", eyebrow: "Popular Genres", description: "Film noir, detective investigations, and underworld thrillers." },
  { slug: "drama", name: "Drama", eyebrow: "Popular Genres", description: "Essential human stories across eras and languages." },
  { slug: "fantasy", name: "Fantasy", eyebrow: "Popular Genres", description: "Mythology, dragons, and supernatural fables." },
  { slug: "horror", name: "Horror", eyebrow: "Popular Genres", description: "Gothic expressionism, haunted mansions, and independent horror." },
  { slug: "mystery", name: "Mystery", eyebrow: "Popular Genres", description: "Whodunits, suspenseful puzzles, and psychological intrigue." },
  { slug: "romance", name: "Romance", eyebrow: "Popular Genres", description: "Timeless love stories and romantic comedies." },
  { slug: "sci-fi", name: "Science Fiction", eyebrow: "Popular Genres", description: "Futuristic metropolises, cybernetics, and space exploration." },
  { slug: "thriller", name: "Thriller", eyebrow: "Popular Genres", description: "High-tension suspense, espionage, and psychological noir." },
];

export function splitTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function tokens(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean);
}

export function isVerifiedPlayable(movie: MovieLike): boolean {
  return (movie.catalogStatus ?? "verified_playable") === "verified_playable" && Boolean(movie.videoUrl?.trim());
}

export function isOfficialExternal(movie: MovieLike): boolean {
  return movie.catalogStatus === "official_external_playback";
}

export function isUpcomingMovie(movie: MovieLike): boolean {
  return movie.catalogStatus === "upcoming";
}

export function isUnavailableMovie(movie: MovieLike): boolean {
  return movie.catalogStatus === "temporarily_unavailable" || movie.catalogStatus === "verification_failed";
}

export function isPlayableMovie(movie: MovieLike): boolean {
  return isVerifiedPlayable(movie) || isOfficialExternal(movie);
}

const STRICT_PLAYABLE_SLUGS = new Set([
  "trending",
  "popular",
  "top-rated",
  "highest-rated",
  "new-releases",
  "new-hot",
  "award-winners",
  "hidden-gems",
  "recently-added",
  "public-domain",
  "open-access",
  "independent",
  "classics",
  "short-films",
  "documentary",
]);

export function matchesCollection(movie: MovieLike, slug: string): boolean {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug || cleanSlug === "all") {
    return !isUnavailableMovie(movie);
  }

  if (isUnavailableMovie(movie)) return false;

  // Coming Soon collection strictly contains upcoming movies
  if (cleanSlug === "coming-soon" || cleanSlug === "upcoming") {
    return isUpcomingMovie(movie);
  }

  // Strictly playable collections never mix in upcoming unplayable releases
  if (STRICT_PLAYABLE_SLUGS.has(cleanSlug) && isUpcomingMovie(movie)) {
    return false;
  }

  // Movies collection shows playable/external movies, not upcoming
  if (cleanSlug === "movies" && isUpcomingMovie(movie)) {
    return false;
  }

  const categories = splitTokens(movie.category).map((item) => item.toLowerCase());
  const genres = splitTokens(movie.genre).map((item) => item.toLowerCase());
  const languages = splitTokens(movie.language).map((item) => item.toLowerCase());
  const type = (movie.type || "").toLowerCase();
  const rating = Number.parseFloat(movie.rating || "0") || 0;
  const year = movie.year || 0;

  if (categories.includes(cleanSlug)) return true;

  switch (cleanSlug) {
    case "movies":
      return type === "movie" || type === "short film";
    case "dramas":
      return type === "series" || categories.includes("dramas") || genres.includes("drama");
    case "series":
      return type === "series";
    case "anime":
      return type === "anime" || genres.includes("anime");
    case "animation":
      return genres.includes("animation") || type === "anime";
    case "documentary":
      return type === "documentary" || genres.includes("documentary");
    case "short-films":
      return type === "short film" || categories.includes("short-films");
    case "family":
      return genres.includes("family") || categories.includes("family");
    case "classics":
      return (year > 0 && year <= 1969) || genres.includes("classics");
    case "public-domain":
      return movie.sourceType === "public_domain" || categories.includes("public-domain");
    case "open-access":
      return movie.sourceType === "open_license" || categories.includes("open-access");
    case "independent":
      return movie.sourceType === "independent" || movie.sourceType === "open_license" || categories.includes("independent");
    case "top-rated":
    case "highest-rated":
      return rating >= 7.8;
    case "recently-added":
    case "new-releases":
      return year >= 2006;
    case "sci-fi":
      return genres.some((item) => item.includes("sci-fi") || item.includes("science fiction"));
    default:
      if (languages.some((lang) => lang === cleanSlug || lang.includes(cleanSlug))) return true;
      if (genres.some((g) => g === cleanSlug || g.includes(cleanSlug))) return true;
      return false;
  }
}

const HOME_RAIL_SLUGS = [
  "trending",
  "movies",
  "hindi",
  "open-access",
  "public-domain",
  "action",
  "comedy",
  "thriller",
  "sci-fi",
  "animation",
  "dramas",
  "coming-soon",
] as const;

export function buildCollections<T extends MovieLike>(movies: T[], categories: Category[] = []) {
  const activeMovies = movies.filter((m) => !isUnavailableMovie(m));

  const specBySlug = new Map(COLLECTION_SPECS.map((s) => [s.slug, s]));
  for (const cat of categories) {
    if (!specBySlug.has(cat.slug)) {
      specBySlug.set(cat.slug, {
        slug: cat.slug,
        name: cat.name,
        eyebrow: "Collection",
        description: `${cat.name} titles in the Cinemax catalog.`,
      });
    }
  }

  return HOME_RAIL_SLUGS.map((slug) => {
    const spec = specBySlug.get(slug)!;
    const matched = activeMovies.filter((movie) => matchesCollection(movie, slug));
    return {
      ...spec,
      movies: matched,
    };
  }).filter((collection) => collection.movies.length > 0);
}

export function buildAllCategoryCollections<T extends MovieLike>(movies: T[], categories: Category[] = []) {
  const activeMovies = movies.filter((m) => !isUnavailableMovie(m));
  const seen = new Set<string>();
  const specs: CollectionSpec[] = [];

  for (const spec of COLLECTION_SPECS) {
    seen.add(spec.slug);
    specs.push(spec);
  }
  for (const cat of categories) {
    if (!seen.has(cat.slug)) {
      seen.add(cat.slug);
      specs.push({
        slug: cat.slug,
        name: cat.name,
        eyebrow: "Collection",
        description: `${cat.name} titles in the Cinemax catalog.`,
      });
    }
  }

  return specs
    .map((spec) => ({
      ...spec,
      movies: activeMovies.filter((movie) => matchesCollection(movie, spec.slug)),
    }))
    .filter((collection) => collection.movies.length > 0);
}

export function filterMovies<T extends MovieLike>(movies: T[], query: string): T[] {
  const active = movies.filter((m) => !isUnavailableMovie(m));
  const terms = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return active;

  return active.filter((movie) => {
    const haystack = [
      movie.title,
      movie.genre,
      movie.director,
      movie.cast,
      movie.language,
      movie.type,
      movie.category,
      movie.description,
      String(movie.year || ""),
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function featuredFeature(movies: Movie[], slides: Slide[]) {
  const playableMovies = movies.filter(isVerifiedPlayable);
  const movieById = new Map(playableMovies.map((movie) => [movie.id, movie]));
  const movieByTitle = new Map(playableMovies.map((movie) => [movie.title.toLowerCase(), movie]));

  const slideItems = slides
    .filter((slide) => slide.active)
    .map((slide) => {
      const movie =
        (slide.movieId ? movieById.get(slide.movieId) : undefined) ??
        movieByTitle.get(slide.title.toLowerCase());
      if (!movie) return null;
      return {
        key: `slide-${slide.id}`,
        title: slide.title || movie.title,
        subtitle: slide.subtitle || movie.description,
        imageUrl: slide.imageUrl || movie.backdropUrl || movie.posterUrl,
        movieId: movie.id,
        movie,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (slideItems.length > 0) return slideItems;

  const picked = playableMovies.filter((movie) => movie.featured);
  const pool = picked.length > 0 ? picked : playableMovies.slice(0, 5);
  return pool.slice(0, 5).map((movie) => ({
    key: `movie-${movie.id}`,
    title: movie.title,
    subtitle: movie.description,
    imageUrl: movie.backdropUrl || movie.posterUrl,
    movieId: movie.id,
    movie,
  }));
}

export type PlaybackSource =
  | { kind: "empty" }
  | { kind: "invalid"; reason: string }
  | {
      kind: "resolved";
      resolution: LinkResolution;
    };

/**
 * Resolve a catalogue movie's `videoUrl` through the provider registry.
 */
export function resolvePlaybackSource(raw: string | null | undefined): PlaybackSource {
  const value = (raw || "").trim();
  if (!value) return { kind: "empty" };
  const result = resolveShareLink(value, { allowUnknownDirect: true });
  if (!result.ok) {
    return { kind: "invalid", reason: result.message };
  }
  return { kind: "resolved", resolution: result };
}
