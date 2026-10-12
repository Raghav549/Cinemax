export function PosterGridSkeleton({ count = 8 }: { count?: number }) {
  return <div className="content-poster-grid" aria-busy="true" aria-label="Loading titles">{Array.from({ length: count }, (_, index) => <div className="poster-skeleton" key={index}><div className="shimmer shimmer-poster" /><div className="shimmer shimmer-title" /><div className="shimmer shimmer-meta" /></div>)}</div>;
}

export function RowSkeletons() {
  return <div aria-busy="true" aria-label="Loading your library">{[0, 1].map((row) => <div className="shimmer-row" key={row}><div className="shimmer shimmer-row-title" /><div className="shimmer-row-posters">{[0, 1, 2, 3, 4, 5].map((poster) => <div className="shimmer shimmer-poster" key={poster} />)}</div></div>)}</div>;
}
