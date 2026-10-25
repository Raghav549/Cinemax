"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCatalogue } from "@/components/CatalogueProvider";
import { COLLECTION_SPECS, matchesCollection, type CatalogueMovie } from "@/lib/catalogue";
import MovieCard from "@/components/MovieCard";
import Artwork from "@/components/Artwork";
import Icon, { collectionIcon } from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import { PosterGridSkeleton } from "@/components/Skeletons";
import CinematicButton from "@/components/CinematicButton";

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = use(params);
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const { movies, categories, loading: indexLoading, error: indexError, refresh } = useCatalogue();
  const [collection, setCollection] = useState<{ slug: string; movies: CatalogueMovie[]; error: string }>({
    slug: "",
    movies: [],
    error: "",
  });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/movies?category=${encodeURIComponent(slug)}&limit=500`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Collection unavailable");
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Collection unavailable");
        if (!controller.signal.aborted) setCollection({ slug, movies: data as CatalogueMovie[], error: "" });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCollection({ slug, movies: [], error: "This collection could not be loaded. Please try again." });
      });
    return () => controller.abort();
  }, [slug, retry]);

  const loading = indexLoading && collection.slug !== slug;
  const error = collection.error && indexError ? collection.error : "";
  const [sort, setSort] = useState("default");

  const spec = COLLECTION_SPECS.find((item) => item.slug === slug);
  const name =
    spec?.name ??
    categories.find((item) => item.slug === slug)?.name ??
    slug.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

  const titles = useMemo(() => {
    const indexed = movies.filter((movie) => matchesCollection(movie, slug));
    const apiMatches = (collection.slug === slug ? collection.movies : []).filter((movie) =>
      matchesCollection(movie, slug)
    );
    const selected = [...indexed, ...apiMatches].filter(
      (movie, index, all) => all.findIndex((item) => item.id === movie.id) === index
    );
    if (sort === "rating") selected.sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
    if (sort === "title") selected.sort((a, b) => a.title.localeCompare(b.title));
    return selected;
  }, [movies, collection, slug, sort]);

  const cover = titles.find((movie) => movie.backdropUrl)?.backdropUrl || titles[0]?.posterUrl;

  return (
    <main className="secondary-page collection-page" id="main-content" tabIndex={-1}>
      <div className="secondary-page-content">
        <Link href="/categories" className="page-back">
          <Icon name="arrow-left" />
          Explore
        </Link>
        <div className="collection-page-heading">
          {cover && <Artwork src={cover} kind="backdrop" className="collection-page-art" />}
          <span className="collection-page-icon">
            <Icon name={collectionIcon(slug)} />
          </span>
          <div>
            <h1>{name}</h1>
            {spec?.description && <p className="collection-page-sub">{spec.description}</p>}
          </div>
        </div>
        <div className="collection-toolbar">
          <span className="result-count" role="status">
            {loading ? "Loading titles…" : `${titles.length} ${titles.length === 1 ? "title" : "titles"}`}
          </span>
          <label className="sort-field">
            <Icon name="sort" />
            <span className="sr-only">Sort titles</span>
            <select aria-label="Sort titles" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="default">Recently added</option>
              <option value="rating">Top rated</option>
              <option value="title">A–Z</option>
            </select>
          </label>
        </div>
        {loading ? (
          <PosterGridSkeleton />
        ) : error ? (
          <EmptyState title="Collection unavailable" description={error} icon={collectionIcon(slug)}>
            <CinematicButton
              onClick={() => {
                refresh();
                setRetry((count) => count + 1);
              }}
              icon={<Icon name="refresh" />}
            >
              Try again
            </CinematicButton>
          </EmptyState>
        ) : titles.length ? (
          <div className="content-poster-grid" role="list" aria-label={`${name} titles`}>
            {titles.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No titles here yet"
            description="Choose another collection to keep exploring."
            icon={collectionIcon(slug)}
          />
        )}
      </div>
    </main>
  );
}
