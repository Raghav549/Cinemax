import { isHttpOrLocalUrl, normalizeMovie, type MovieRow } from "@/db/rows";

const MAGNET_PREFIX = /^magnet:/i;

/**
 * Never expose a configured magnet URI to a public browser. The public player
 * receives only the movie-scoped stream route; admin responses keep the source
 * URL so it can be edited in the studio.
 */
export function publicMovie(row: Record<string, unknown>): MovieRow {
  const movie = normalizeMovie(row);
  if (MAGNET_PREFIX.test(movie.videoUrl)) {
    const gatewayReady = process.env.TORRENT_STREAMING_ENABLED === "true" &&
      Boolean(process.env.TORRENT_GATEWAY_URL) && Boolean(process.env.TORRENT_GATEWAY_TOKEN);
    movie.videoUrl = movie.rightsConfirmed && gatewayReady ? `/api/stream/${movie.id}` : "";
  } else if (movie.videoUrl && !isHttpOrLocalUrl(movie.videoUrl)) {
    movie.videoUrl = "";
  }
  if (movie.subtitleUrl && !isHttpOrLocalUrl(movie.subtitleUrl)) movie.subtitleUrl = "";
  return movie;
}
