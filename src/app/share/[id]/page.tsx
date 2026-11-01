import type { Metadata } from "next";
import Link from "next/link";
import Artwork from "@/components/Artwork";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { CinematicLink } from "@/components/CinematicButton";
import ShareActions from "@/components/ShareActions";
import { loadTitleForShare, shareCardPath, titleMetadata } from "@/lib/share-server";
import { trailerTarget, shareSubtitle, type ShareableTitle } from "@/lib/share";

export const dynamic = "force-dynamic";

/**
 * The page a shared link opens.
 *
 * It exists because a share has to say what is being shared: the title's own
 * artwork, its name, its year, its genre, a link into the catalogue, and the
 * trailer — as a real, playable video when the record points at a video file,
 * and as an explicit link to the trailer's host otherwise. A still frame is
 * never dressed up as playing video.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const title = await loadTitleForShare(id);
  return titleMetadata(title, { title: "Shared title" }, `/share/${id}`);
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadTitleForShare(id);
  if (!record) notFound();

  const shareable: ShareableTitle = {
    id: record.id,
    title: record.title,
    year: record.year,
    genre: record.genre,
    type: record.type,
    description: record.description,
    posterUrl: record.posterUrl,
    trailerUrl: record.trailerUrl,
  };
  const trailer = trailerTarget(record.trailerUrl);
  const subtitle = shareSubtitle(shareable);

  return (
    <main className="share-page" id="main-content">
      <div className="share-page-backdrop" aria-hidden="true">
        <Artwork
          src={record.backdropUrl}
          kind="backdrop"
          priority
          sizes="100vw"
          className="share-page-backdrop-image"
        />
      </div>

      <article className="share-card">
        <div className="share-card-art">
          <Artwork
            src={record.posterUrl}
            alt={`${record.title} poster`}
            kind="poster"
            priority
            sizes="(max-width: 700px) 60vw, 340px"
            className="share-card-poster"
          />
        </div>

        <div className="share-card-copy">
          <p className="share-card-eyebrow">Shared from CINEMAX</p>
          <h1 className="share-card-title">{record.title}</h1>
          {subtitle && <p className="share-card-meta">{subtitle}</p>}
          {record.description && <p className="share-card-synopsis">{record.description}</p>}

          <div className="share-card-actions">
            <CinematicLink href={`/movie/${record.id}`} icon={<Icon name="play" />}>
              Watch on CINEMAX
            </CinematicLink>
            <ShareActions title={shareable} />
          </div>

          {trailer && (
            <section className="share-trailer" aria-label="Trailer">
              <h2 className="share-trailer-title">Trailer</h2>
              {trailer.kind === "video" ? (
                <video
                  className="share-trailer-video"
                  src={trailer.url}
                  poster={record.backdropUrl ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                >
                  Your browser cannot play this trailer.
                </video>
              ) : (
                <a className="share-trailer-link" href={trailer.url} target="_blank" rel="noreferrer noopener">
                  {trailer.thumbnail ? (
                    // The trailer host's own still, shown as a still — never as a
                    // playing video. The label says where the click leads.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={trailer.thumbnail} alt="" className="share-trailer-thumb" loading="lazy" />
                  ) : (
                    <span className="share-trailer-thumb share-trailer-thumb-empty" aria-hidden="true" />
                  )}
                  <span className="share-trailer-label">
                    Watch the trailer on {trailer.kind === "youtube" ? "YouTube" : trailer.kind === "vimeo" ? "Vimeo" : "the source site"}
                    <Icon name="external" />
                  </span>
                </a>
              )}
            </section>
          )}

          <p className="share-card-note">
            Poster and backdrop are the title&apos;s own artwork. Platform names and logos belong to their respective owners;
            CINEMAX is not affiliated with them.{" "}
            <Link className="share-card-note-link" href={shareCardPath(record.id)}>
              Preview card
            </Link>
          </p>
        </div>
      </article>
    </main>
  );
}
