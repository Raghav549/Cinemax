import type { Metadata } from "next";
import Link from "next/link";
import {
  BrandNoticeGrid,
  LegalBullets,
  LegalCallout,
  LegalCrumbs,
  LegalFooterNav,
  LegalHero,
  LegalSection,
  LegalToc,
  type LegalSectionSpec,
} from "@/components/LegalDocument";
import { BRAND_NOTICE_SUMMARY, LEGAL_PAGES } from "@/lib/legal";

const meta = LEGAL_PAGES[3];

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: "/disclaimer" },
};

const SECTIONS: readonly LegalSectionSpec[] = [
  { id: "statement", title: "The statement, in full" },
  { id: "no-affiliation", title: "No affiliation, sponsorship or endorsement" },
  { id: "nominative", title: "Why marks appear at all" },
  { id: "availability", title: "Availability and accuracy" },
  { id: "sharing", title: "Shared links, cards and previews" },
  { id: "reviews", title: "Ratings, reviews and third-party opinions" },
  { id: "liability", title: "No warranty; limitation of liability" },
  { id: "changes", title: "Changes to this notice" },
];

export default function DisclaimerPage() {
  return (
    <main className="legal-page" id="main-content" tabIndex={-1}>
      <div className="legal-shell">
        <LegalCrumbs current="Content & Trademark Disclaimer" />
        <LegalHero meta={meta} />

        <div className="legal-body">
          <LegalToc sections={SECTIONS} />

          <article className="legal-doc">
            <LegalSection id="statement" title="The statement, in full" kicker="Section 01">
              <LegalCallout strong title="Brand notice">
                <p>{BRAND_NOTICE_SUMMARY}</p>
              </LegalCallout>
              <p>
                That paragraph is the whole of this page in one sentence; the sections below
                explain what it means in each place a third-party name or mark appears on
                this website.
              </p>
            </LegalSection>

            <LegalSection id="no-affiliation" title="No affiliation, sponsorship or endorsement" kicker="Section 02">
              <p>
                CINEMAX is an independent catalogue. It has no partnership, reseller,
                distribution or licensing agreement with any of the services listed in it.
                None of those companies has supplied content to this project under an
                agreement, reviewed this website, approved its design, or endorsed it.
              </p>
              <LegalBullets
                items={[
                  "A logo in the platform rail means “titles in this catalogue are available on this service”. It is a label, not a relationship.",
                  "A platform name in a title's availability row means the same thing, and is drawn from the studio's own record for that title.",
                  "Nothing on this site may be read as a claim that CINEMAX is part of, owned by, sponsored by or approved by any of those companies.",
                  "Where a service has merged or changed owner, the note on its card on /license records the change; no claim is made about the current status of any commercial relationship because none exists.",
                ]}
              />
            </LegalSection>

            <LegalSection id="nominative" title="Why marks appear at all" kicker="Section 03">
              <p>
                Identifying where a film can legally be watched requires naming the service
                and, in practice, showing its mark so the name is recognisable in a row of
                nineteen. That is a nominative use: the mark is used for the thing it
                actually denotes, at its published proportions, without alteration and
                without being incorporated into this project&apos;s own branding.
              </p>
              <BrandNoticeGrid />
              <p>
                If a rights holder would prefer a different treatment, or no mark at all, the
                request will be honoured — see{" "}
                <Link href="/copyright">Copyright &amp; Intellectual Property</Link>.
              </p>
            </LegalSection>

            <LegalSection id="availability" title="Availability and accuracy" kicker="Section 04">
              <LegalBullets
                items={[
                  "Availability changes constantly. A title shown on a platform here may have left that platform, and a title's catalogue status reflects the last record the studio made, not a live check of the platform.",
                  "Ratings shown on a title come from the record the studio entered and may carry a source label; they are not this project's own reviews.",
                  "Descriptions, cast, crew, runtimes and release dates are as recorded by the studio and may be incomplete or out of date.",
                  "No title is presented as available for playback unless the record says so; unreleased and unavailable titles are labelled and their play action is disabled.",
                ]}
              />
            </LegalSection>

            <LegalSection id="sharing" title="Shared links, cards and previews" kicker="Section 05">
              <p>
                Sharing a title produces a link to that title&apos;s page on this website,
                plus — where the platform supports it — an image card built from the
                title&apos;s own poster, its backdrop and the CINEMAX mark, and a reference to
                its trailer. A shared card is a preview of the page, not a copy of the film,
                and a still image is never presented as playing video.
              </p>
              <p>
                Where a trailer can be attached or embedded, it is the trailer the studio
                attached to that title and it plays from its original host or from this
                deployment&apos;s own media route. A recipient who follows a shared link sees
                the same title page and the same attribution, including this notice, as any
                other visitor.
              </p>
            </LegalSection>

            <LegalSection id="reviews" title="Ratings, reviews and third-party opinions" kicker="Section 06">
              <p>
                Where a rating, review excerpt or certification appears, it is attributed to
                whoever produced it. CINEMAX does not present a third party&apos;s opinion as
                its own, and does not alter a score to suit its presentation. This project
                does not publish its own reviews of titles.
              </p>
            </LegalSection>

            <LegalSection id="liability" title="No warranty; limitation of liability" kicker="Section 07">
              <LegalCallout>
                <p>
                  This website and its catalogue are provided as they are. No warranty is
                  given that the catalogue is accurate, complete, uninterrupted or fit for a
                  particular purpose, and no warranty is given about any third-party service
                  it links to. To the extent permitted by applicable law, this project is not
                  liable for losses arising from use of the site, from reliance on a catalogue
                  record, or from anything that happens on a third-party service you reach
                  from it. Nothing here excludes liability that cannot lawfully be excluded.
                </p>
              </LegalCallout>
              <p>
                Third-party services are governed by their own terms. If a platform&apos;s
                player, account or payment flow fails, that is between you and that platform.
              </p>
            </LegalSection>

            <LegalSection id="changes" title="Changes to this notice" kicker="Section 08">
              <p>
                This notice is reviewed when the catalogue&apos;s brand set, sources or sharing
                behaviour change. The review date at the top of the page always reflects the
                version you are reading, and every other document in this section carries the
                same date when they are reviewed together.
              </p>
              <p>
                Related documents:{" "}
                <Link href="/license">Licensing &amp; Attribution</Link>,{" "}
                <Link href="/attributions">Third-Party Attributions</Link>,{" "}
                <Link href="/privacy">Privacy &amp; Content Usage</Link>.
              </p>
            </LegalSection>

            <LegalFooterNav current={meta} />
          </article>
        </div>
      </div>
    </main>
  );
}
