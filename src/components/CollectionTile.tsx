"use client";

import { memo } from "react";
import Link from "next/link";
import Artwork from "./Artwork";
import Icon, { collectionIcon } from "./Icon";

export interface CollectionTileData {
  slug: string;
  label: string;
  href: string;
  count: number;
  image?: string | null;
  badge?: string;
}

/**
 * Artwork-backed collection tile.
 *
 * Uses the collection's own catalogue artwork (a backdrop from a title that
 * actually belongs to it). When a collection has no artwork, the tile falls
 * back to the deep-gloss black surface instead of inventing an image.
 */
function CollectionTile({
  item,
  active = false,
  eager = false,
  onNavigate,
}: {
  item: CollectionTileData;
  active?: boolean;
  eager?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      className={`collection-tile ${active ? "is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      {item.image ? (
        <Artwork
          src={item.image}
          kind="backdrop"
          className="collection-tile-art"
          sizes="(max-width: 640px) 46vw, 190px"
          priority={eager}
        />
      ) : (
        <span className="collection-tile-art collection-tile-art-fallback" aria-hidden="true">
          <Icon name={collectionIcon(item.slug)} />
        </span>
      )}
      <span className="collection-tile-shade" aria-hidden="true" />
      <span className="collection-tile-gloss" aria-hidden="true" />
      <span className="collection-tile-icon" aria-hidden="true">
        <Icon name={collectionIcon(item.slug)} />
      </span>
      <span className="collection-tile-copy">
        <span className="collection-tile-name">{item.label}</span>
        <span className="collection-tile-count">
          {item.count > 0 ? `${item.count} ${item.count === 1 ? "title" : "titles"}` : (item.badge ?? "No titles yet")}
        </span>
      </span>
    </Link>
  );
}

export default memo(CollectionTile);
