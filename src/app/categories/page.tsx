"use client";

import { useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { useCatalogue } from "@/components/CatalogueProvider";
import { matchesCollection, tokens } from "@/lib/catalogue";
import Artwork from "@/components/Artwork";
import Icon, { collectionIcon } from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import CinematicButton from "@/components/CinematicButton";

const COLOURS = ["100, 82, 255", "224, 74, 156", "56, 120, 252", "142, 75, 238", "230, 107, 74", "50, 150, 210"];

export default function CategoriesPage() {
  const { movies, categories, loading, error, refresh } = useCatalogue();
  const collections = useMemo(() => {
    const all = categories.length ? categories : [...new Set(movies.flatMap((movie) => [...tokens(movie.category), ...tokens(movie.genre)]))].map((slug, index) => ({ id: index, slug, name: slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }));
    return all.map((category, index) => {
      const titles = movies.filter((movie) => matchesCollection(movie, category.slug));
      const artwork = titles.find((movie) => movie.backdropUrl) ?? titles[0];
      return { ...category, titles, image: artwork?.backdropUrl || artwork?.posterUrl, colour: COLOURS[index % COLOURS.length] };
    });
  }, [movies, categories]);
  const spotlights = collections.filter((item) => ["trending", "new-releases"].includes(item.slug) && item.titles.length);
  const remaining = collections.filter((item) => !spotlights.some((spotlight) => spotlight.id === item.id));

  return <main className="secondary-page explore-page" id="main-content" tabIndex={-1}><div className="secondary-page-content">
    <div className="page-heading"><h1>Explore</h1><span className="page-count">{!loading && `${movies.length} titles`}</span></div>
    {loading && !collections.length ? <div className="category-grid" aria-busy="true" aria-label="Loading collections">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="shimmer category-skeleton" />)}</div> : error ? <EmptyState title="Collections unavailable" description={error} icon="explore"><CinematicButton onClick={refresh} icon={<Icon name="refresh" />}>Try again</CinematicButton></EmptyState> : !collections.length ? <EmptyState title="No collections yet" description="Collections appear here when titles are added to the library." icon="explore" /> : <>
      {spotlights.length > 0 && <div className="explore-spotlights">{spotlights.map((item) => <Link key={item.id} href={`/category/${encodeURIComponent(item.slug)}`} className="collection-spotlight" style={{ "--collection-colour": item.colour } as CSSProperties}><Artwork src={item.image} kind="backdrop" className="collection-artwork" sizes="(max-width: 640px) 100vw, 50vw" /><span className="collection-shade" /><div className="collection-copy"><span className="collection-icon"><Icon name={collectionIcon(item.slug)} /></span><h2>{item.name}</h2><span className="collection-count">{item.titles.length} titles</span></div><span className="collection-arrow"><Icon name="arrow-right" /></span></Link>)}</div>}
      <div className="section-heading"><h2>Collections</h2></div>
      <div className="category-grid">{remaining.map((item) => <Link key={item.id} href={`/category/${encodeURIComponent(item.slug)}`} className="collection-card" style={{ "--collection-colour": item.colour } as CSSProperties}>{item.image && <Artwork src={item.image} kind="backdrop" className="collection-artwork" sizes="(max-width: 640px) 50vw, 33vw" />}<span className="collection-shade" /><div className="collection-copy"><span className="collection-icon"><Icon name={collectionIcon(item.slug)} /></span><h2>{item.name}</h2><span className="collection-count">{item.titles.length} {item.titles.length === 1 ? "title" : "titles"}</span></div><span className="collection-arrow"><Icon name="arrow-right" /></span></Link>)}</div>
    </>}
  </div></main>;
}
