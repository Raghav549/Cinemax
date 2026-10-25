"use client";

import { useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { useCatalogue } from "@/components/CatalogueProvider";
import { COLLECTION_SPECS, matchesCollection, tokens } from "@/lib/catalogue";
import { CATEGORY_BROWSER_SECTIONS } from "@/lib/navigation";
import Artwork from "@/components/Artwork";
import Icon, { collectionIcon } from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import CinematicButton from "@/components/CinematicButton";

const COLOURS = [
  "100, 82, 255",
  "224, 74, 156",
  "56, 120, 252",
  "142, 75, 238",
  "230, 107, 74",
  "50, 150, 210",
];

export default function CategoriesPage() {
  const { movies, categories, loading, error, refresh } = useCatalogue();

  const collectionsBySlug = useMemo(() => {
    const map = new Map<
      string,
      { id: string; slug: string; name: string; titles: typeof movies; image?: string | null; colour: string }
    >();

    const allSpecs = [
      ...COLLECTION_SPECS.map((s) => ({ slug: s.slug, name: s.name })),
      ...categories.map((c) => ({ slug: c.slug, name: c.name })),
      ...[...new Set(movies.flatMap((movie) => [...tokens(movie.category), ...tokens(movie.genre)]))].map((slug) => ({
        slug,
        name: slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      })),
    ];

    let colourIndex = 0;
    for (const item of allSpecs) {
      const slug = item.slug.toLowerCase();
      if (map.has(slug)) continue;
      const titles = movies.filter((movie) => matchesCollection(movie, slug));
      if (titles.length === 0) continue;
      const artwork = titles.find((movie) => movie.backdropUrl) ?? titles[0];
      map.set(slug, {
        id: slug,
        slug,
        name: item.name,
        titles,
        image: artwork?.backdropUrl || artwork?.posterUrl,
        colour: COLOURS[colourIndex++ % COLOURS.length],
      });
    }
    return map;
  }, [movies, categories]);

  const collections = useMemo(() => Array.from(collectionsBySlug.values()), [collectionsBySlug]);
  const spotlights = useMemo(
    () =>
      ["trending", "new-releases", "open-access", "coming-soon"]
        .map((slug) => collectionsBySlug.get(slug))
        .filter((item): item is NonNullable<typeof item> => Boolean(item && item.titles.length > 0)),
    [collectionsBySlug]
  );

  const groupedSections = useMemo(() => {
    return CATEGORY_BROWSER_SECTIONS.map((section) => ({
      ...section,
      items: section.items
        .map((item) => {
          const entry = collectionsBySlug.get(item.slug);
          if (!entry) return null;
          return {
            ...entry,
            name: item.label,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    })).filter((section) => section.items.length > 0);
  }, [collectionsBySlug]);

  return (
    <main className="secondary-page explore-page" id="main-content" tabIndex={-1}>
      <div className="secondary-page-content">
        <div className="page-heading">
          <h1>Explore</h1>
          <span className="page-count">{!loading && `${movies.length} titles`}</span>
        </div>
        {loading && !collections.length ? (
          <div className="category-grid" aria-busy="true" aria-label="Loading collections">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="shimmer category-skeleton" />
            ))}
          </div>
        ) : error ? (
          <EmptyState title="Collections unavailable" description={error} icon="explore">
            <CinematicButton onClick={refresh} icon={<Icon name="refresh" />}>
              Try again
            </CinematicButton>
          </EmptyState>
        ) : !collections.length ? (
          <EmptyState
            title="No collections yet"
            description="Collections appear here when titles are added to the library."
            icon="explore"
          />
        ) : (
          <>
            {spotlights.length > 0 && (
              <div className="explore-spotlights">
                {spotlights.map((item) => (
                  <Link
                    key={item.id}
                    href={`/category/${encodeURIComponent(item.slug)}`}
                    className="collection-spotlight"
                    style={{ "--collection-colour": item.colour } as CSSProperties}
                  >
                    <Artwork
                      src={item.image}
                      kind="backdrop"
                      className="collection-artwork"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                    <span className="collection-shade" />
                    <div className="collection-copy">
                      <span className="collection-icon">
                        <Icon name={collectionIcon(item.slug)} />
                      </span>
                      <h2>{item.name}</h2>
                      <span className="collection-count">{item.titles.length} titles</span>
                    </div>
                    <span className="collection-arrow">
                      <Icon name="arrow-right" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {groupedSections.map((section) => (
              <section key={section.id} aria-label={section.title}>
                <div className="section-heading">
                  <h2>{section.title}</h2>
                  <span className="result-count">{section.items.length} categories</span>
                </div>
                <div className="category-grid">
                  {section.items.map((item) => (
                    <Link
                      key={`${section.id}-${item.slug}`}
                      href={`/category/${encodeURIComponent(item.slug)}`}
                      className="collection-card"
                      style={{ "--collection-colour": item.colour } as CSSProperties}
                    >
                      {item.image && (
                        <Artwork
                          src={item.image}
                          kind="backdrop"
                          className="collection-artwork"
                          sizes="(max-width: 640px) 50vw, 33vw"
                        />
                      )}
                      <span className="collection-shade" />
                      <div className="collection-copy">
                        <span className="collection-icon">
                          <Icon name={collectionIcon(item.slug)} />
                        </span>
                        <h2>{item.name}</h2>
                        <span className="collection-count">
                          {item.titles.length} {item.titles.length === 1 ? "title" : "titles"}
                        </span>
                      </div>
                      <span className="collection-arrow">
                        <Icon name="arrow-right" />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
