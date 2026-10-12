export function PosterGridSkeleton({ count = 8 }: { count?: number }) {
  return <div className="content-poster-grid" aria-busy="true" aria-label="Loading titles">{Array.from({ length: count }, (_, index) => <div className="poster-skeleton" key={index}><div className="shimmer shimmer-poster" /><div className="shimmer shimmer-title" /><div className="shimmer shimmer-meta" /></div>)}</div>;
}

export function RowSkeletons() {
  return <div aria-busy="true" aria-label="Loading your library">{[0, 1].map((row) => <div className="shimmer-row" key={row}><div className="shimmer shimmer-row-title" /><div className="shimmer-row-posters">{[0, 1, 2, 3, 4, 5].map((poster) => <div className="shimmer shimmer-poster" key={poster} />)}</div></div>)}</div>;
}

/** A single related-content row: rectangular thumbnail plus two text bars. */
function RelatedRowSkeleton() {
  return <div className="related-skeleton-row">
    <div className="shimmer related-skeleton-thumb" />
    <div className="related-skeleton-text">
      <div className="shimmer related-skeleton-bar-a" />
      <div className="shimmer related-skeleton-bar-b" />
    </div>
  </div>;
}

/** A column of vertically spaced related-content rows. */
export function RelatedSkeleton({ count = 3 }: { count?: number }) {
  return <div className="related-skeleton" aria-busy="true" aria-label="Loading related titles">
    <div className="shimmer related-skeleton-heading" />
    {Array.from({ length: count }, (_, index) => <RelatedRowSkeleton key={index} />)}
  </div>;
}

/**
 * The dark charcoal surface shown while a title's details are genuinely loading:
 * a short title bar, a longer description bar, a row of four metadata chips and a
 * stack of related-content rows. It only renders for data that has not arrived -
 * once the detail resolves it is replaced by the real content, and a buffering
 * video never swaps this back in.
 */
export function DetailSkeleton() {
  return <div className="detail-skeleton" aria-busy="true" aria-label="Loading title details">
    <div className="detail-skeleton-copy">
      <div className="shimmer detail-skeleton-title" />
      <div className="shimmer detail-skeleton-desc" />
      <div className="detail-skeleton-chips">
        {[0, 1, 2, 3].map((chip) => <div className="shimmer detail-skeleton-chip" key={chip} />)}
      </div>
    </div>
    <div className="detail-skeleton-rows">
      {[0, 1, 2].map((row) => <RelatedRowSkeleton key={row} />)}
    </div>
  </div>;
}
