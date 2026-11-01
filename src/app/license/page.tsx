import type { Metadata } from "next";
import Link from "next/link";
import {
  BrandNoticeGrid,
  LegalBullets,
  LegalCallout,
  LegalCrumbs,
  LegalFacts,
  LegalFooterNav,
  LegalHero,
  LegalSection,
  LegalToc,
  type LegalSectionSpec,
} from "@/components/LegalDocument";
import {
  BRAND_NOTICE_SUMMARY,
  FONT_ATTRIBUTIONS,
  ICON_NOTES,
  IMAGE_NOTES,
  LEGAL_OWNER,
  LEGAL_PAGES,
  PLATFORM_BRAND_NOTICES,
  SOFTWARE_ATTRIBUTIONS,
  VIDEO_NOTES,
} from "@/lib/legal";
import { PLATFORMS } from "@/lib/platforms";

const meta = LEGAL_PAGES[0];

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: "/license" },
};

const SECTIONS: readonly LegalSectionSpec[] = [
  { id: "scope", title: "Scope of this document" },
  { id: "cinemax-brand", title: "CINEMAX and third-party brands" },
  { id: "platforms", title: "The nineteen platforms" },
  { id: "catalogue-rights", title: "Titles, streaming rights and playback" },
  { id: "trademarks", title: "Trademarks and brand ownership" },
  { id: "images", title: "Image and artwork attribution" },
  { id: "fonts", title: "Typography" },
  { id: "icons", title: "Icons and interface artwork" },
  { id: "video", title: "Video content and trailers" },
  { id: "software", title: "Third-party software" },
  { id: "external", title: "External resources and links" },
  { id: "limits", title: "What this page does not claim" },
  { id: "contact", title: "Corrections and reports" },
];

export default function LicensePage() {
  return (
    <main className="legal-page" id="main-content" tabIndex={-1}>
      <div className="legal-shell">
        <LegalCrumbs current="Licensing & Attribution" />
        <LegalHero meta={meta} />

        <div className="legal-body">
          <LegalToc sections={SECTIONS} />

          <article className="legal-doc">
            <LegalSection id="scope" title="Scope of this document" kicker="Section 01">
              <p>
                This page documents how the CINEMAX catalogue presents other companies&apos;
                brands, artwork and software, who owns each of those things, and what the
                presence of a name or a logo on this website actually means. It covers the
                website you are reading; the Android application presents the same
                catalogue and is described where its behaviour differs.
              </p>
              <p>
                It is written to be factual and checkable. Every ownership statement below
                records the corporate entity that owns the mark at the time of review, and
                every licence statement records the licence that the work is distributed
                under. Where something has not been verified, it says so instead of
                inventing a licence, a partner or an approval.
              </p>
              <LegalFacts
                rows={[
                  { label: "Document", value: "Licensing & Attribution" },
                  { label: "Applies to", value: "The CINEMAX website and its Android application shell" },
                  { label: "Last reviewed", value: meta.reviewed },
                  { label: "Brand marks documented", value: `${PLATFORM_BRAND_NOTICES.length} (the ${PLATFORMS.length} platforms in the catalogue, CINEMAX included)` },
                  { label: "Legal effect", value: "This is an attribution and disclosure page. It is not a licence grant and not legal advice." },
                ]}
              />
            </LegalSection>

            <LegalSection id="cinemax-brand" title="CINEMAX and third-party brands" kicker="Section 02">
              <p>
                Two different things on this website are called CINEMAX, and they must not
                be confused:
              </p>
              <LegalBullets
                items={[
                  <>
                    <strong>This project&apos;s identity.</strong> The CINEMAX emblem (the
                    folded-ribbon “C”), the CINEMAX wordmark, the app icon and the splash
                    animation are original artwork created for this catalogue. They belong
                    to this project and appear at <code>/brand/cinemax-symbol.svg</code>,{" "}
                    <code>/brand/cinemax-app-icon.svg</code> and in{" "}
                    <code>src/components/Logo.tsx</code>.
                  </>,
                  <>
                    <strong>The Cinemax television network.</strong> &ldquo;Cinemax&rdquo; is
                    also the name of a premium television network owned by Home Box Office,
                    Inc., a Warner Bros. Discovery company. The platform entry named CINEMAX
                    in the platform rail uses <em>that</em> network&apos;s brand artwork, so
                    it is labelled on this page as a third-party trademark.
                  </>,
                ]}
              />
              <LegalCallout title="Two identities, no overlap">
                <p>
                  The artwork used for the CINEMAX platform entry is not this project&apos;s
                  emblem, and this project&apos;s emblem is not the Cinemax network&apos;s
                  logo. They were deliberately kept apart: replacing one with the other
                  would either misrepresent a third-party brand or repurpose this
                  project&apos;s own identity.
                </p>
              </LegalCallout>
              <p>
                This project is independent. It is not operated by Home Box Office, Inc.,
                Warner Bros. Discovery, or any other network or streaming service named on
                this site, and no such company has reviewed, approved or endorsed it.
              </p>
            </LegalSection>

            <LegalSection id="platforms" title="The nineteen platforms" kicker="Section 03">
              <p>
                The catalogue records where each title can be streamed. Nineteen platforms
                are supported, each with its own entry, its own circle in the platform rail
                and its own checkbox in the studio that adds titles. Every mark below is the
                platform&apos;s own artwork, shown at its published proportions, unmodified:
                not recoloured, not filtered, not cropped into a different shape and not
                replaced with text.
              </p>
              <BrandNoticeGrid />
              <LegalCallout title="Nominative use only">
                <p>{BRAND_NOTICE_SUMMARY}</p>
              </LegalCallout>
              <p>
                A platform appears in the rail whether or not the library currently holds
                any title for it; a platform with no titles shows a zero count rather than
                invented content. Where a service has merged, been renamed, or been
                absorbed into another (JioCinema into JioHotstar; Max back to HBO Max;
                Discovery+ into Max in the United States), the catalogue keeps the older
                name only where existing records already reference it, and the note on that
                platform&apos;s card says so.
              </p>
            </LegalSection>

            <LegalSection id="catalogue-rights" title="Titles, streaming rights and playback" kicker="Section 04">
              <p>
                CINEMAX is a catalogue and a player, not a rights holder. It does not sell,
                sublicense or redistribute commercial films or series. Each title&apos;s
                availability is whatever the studio that added it recorded, and the
                catalogue shows that record rather than guessing:
              </p>
              <LegalBullets
                items={[
                  <>
                    A title recorded as <strong>available on an external platform</strong>{" "}
                    opens that platform&apos;s own page and player. The stream never passes
                    through CINEMAX.
                  </>,
                  <>
                    A title recorded as <strong>licensed for playback here</strong> plays the
                    source the studio attached — a hosted file, an HLS or DASH stream, or an
                    embedded trailer.
                  </>,
                  <>
                    A title recorded as <strong>upcoming</strong> has no playback and is
                    labelled as such; the play button is disabled rather than faked.
                  </>,
                ]}
              />
              <p>
                Playback of a trailer is not a licence to the underlying film. Nothing on
                this website grants you any right to copy, redistribute or publicly perform
                any title in the catalogue.
              </p>
            </LegalSection>

            <LegalSection id="trademarks" title="Trademarks and brand ownership" kicker="Section 05">
              <p>
                Trademarks are territorial and can change hands. The table below records the
                owner of each mark as documented at the review date above, together with the
                date of any corporate change that affects it. It is provided so that a
                reader can check the claim against the owner&apos;s own material, not as a
                legal opinion.
              </p>
              <div className="legal-table-wrap">
                <table className="legal-table">
                  <caption className="sr-only">
                    Platform brand marks, their owners and the corporate changes affecting them
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Mark</th>
                      <th scope="col">Owner of the mark</th>
                      <th scope="col">Change recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLATFORM_BRAND_NOTICES.map((notice) => (
                      <tr key={notice.id}>
                        <td>
                          <strong>{notice.service}</strong>
                        </td>
                        <td>{notice.owner}</td>
                        <td>{notice.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                The marks are reproduced as images. All rights in them remain with their
                owners, and all rights are reserved by those owners; nothing here transfers
                any right, and no mark is used as part of this project&apos;s own name or
                branding.
              </p>
            </LegalSection>

            <LegalSection id="images" title="Image and artwork attribution" kicker="Section 06">
              <p>
                The catalogue displays posters and backdrops, the platform marks described
                above, and this project&apos;s own artwork. The rules applied to each class
                are:
              </p>
              <LegalBullets items={IMAGE_NOTES.map((note) => <>{note}</>)} />
              <p>
                Brand artwork provenance — the exact upstream source for each of the
                nineteen files, the preparation applied to each one and the pins that detect
                a substituted or recoloured file — is recorded in the repository at{" "}
                <code>docs/platform-assets.md</code> and checked by{" "}
                <code>npm run verify:logos</code>.
              </p>
            </LegalSection>

            <LegalSection id="fonts" title="Typography" kicker="Section 07">
              <p>
                Both typefaces are open-source families distributed under the SIL Open Font
                License 1.1, which permits use, redistribution and embedding, including in
                applications. The licence text for each ships with the site.
              </p>
              <div className="legal-table-wrap">
                <table className="legal-table">
                  <thead>
                    <tr>
                      <th scope="col">Family</th>
                      <th scope="col">Authors</th>
                      <th scope="col">Licence</th>
                      <th scope="col">Where the licence ships</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FONT_ATTRIBUTIONS.map((font) => (
                      <tr key={font.family}>
                        <td>
                          <strong>{font.family}</strong>
                          <br />
                          {font.use}
                        </td>
                        <td>{font.designer}</td>
                        <td>
                          <a href={font.licenceUrl} rel="noreferrer noopener" target="_blank">
                            {font.licence}
                          </a>
                        </td>
                        <td>{font.file}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Neither face has been modified, renamed or subsetted under a different name,
                and neither is sold.
              </p>
            </LegalSection>

            <LegalSection id="icons" title="Icons and interface artwork" kicker="Section 08">
              <p>
                <LegalBullets items={ICON_NOTES.map((note) => <>{note}</>)} />
              </p>
            </LegalSection>

            <LegalSection id="video" title="Video content and trailers" kicker="Section 09">
              <LegalBullets items={VIDEO_NOTES.map((note) => <>{note}</>)} />
              <p>
                Sharing a title never produces a copy of the film. Sharing sends a link to
                the title&apos;s page, plus — where the platform supports it — a generated
                image card built from that title&apos;s own poster and a reference to its
                trailer. See <Link href="/disclaimer">the disclaimer</Link> for how shared
                previews should be read.
              </p>
            </LegalSection>

            <LegalSection id="software" title="Third-party software" kicker="Section 10">
              <p>
                This website is built on open-source software. The table lists what is
                actually used, the licence recorded by each package, and whether it reaches
                a visitor&apos;s browser. A complete list, including transitive
                dependencies, is produced from the installed tree by{" "}
                <code>npm run licenses</code> and published on{" "}
                <Link href="/attributions">Third-Party Attributions</Link>.
              </p>
              <div className="legal-table-wrap">
                <table className="legal-table">
                  <thead>
                    <tr>
                      <th scope="col">Component</th>
                      <th scope="col">Version</th>
                      <th scope="col">Licence</th>
                      <th scope="col">Used for</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SOFTWARE_ATTRIBUTIONS.map((item) => (
                      <tr key={item.name}>
                        <td>
                          <strong>{item.name}</strong>
                        </td>
                        <td>{item.version ?? "—"}</td>
                        <td>{item.licence}</td>
                        <td>{item.use}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                No open-source licence requires this project to disclose its own source, and
                none of the licences above is modified. Copyright notices remain with their
                respective authors.
              </p>
            </LegalSection>

            <LegalSection id="external" title="External resources and links" kicker="Section 11">
              <p>
                Selecting a platform, opening a trailer hosted elsewhere, or following a link
                out of CINEMAX takes you to a service this project does not control. Those
                services set their own cookies, log their own requests and apply their own
                terms and privacy policies. CINEMAX does not receive, store or share your
                account details from them, and a link does not imply a relationship with the
                destination.
              </p>
              <p>
                Where a title&apos;s artwork is served by an external image host, your browser
                contacts that host directly to load the image. The{" "}
                <Link href="/privacy">privacy page</Link> lists the hosts a visitor&apos;s
                browser may contact.
              </p>
            </LegalSection>

            <LegalSection id="limits" title="What this page does not claim" kicker="Section 12">
              <LegalCallout strong title="No partnership, licence or approval is implied">
                <p>
                  The presence of a platform name or logo on this website means one thing
                  only: titles in this catalogue can be watched there. It does not mean that
                  the platform has partnered with CINEMAX, licensed anything to it, sponsored
                  it, reviewed it, or endorsed it. No such agreements exist, and none is
                  claimed anywhere in this site, its metadata or its sharing cards.
                </p>
              </LegalCallout>
              <LegalBullets
                items={[
                  "This page is not legal advice, and it is not a licence to use any third-party mark. If you want to use a mark, ask its owner.",
                  "Ownership statements are recorded from public sources at the review date. Corporate structures change; where a change is known it is dated above.",
                  "No claim is made that every rights holder of every title has been identified. Titles are added by the studio with a recorded source and licence note, which is shown on the title's own page where one exists.",
                  "Nothing here waives any right of any third party, including rights this project is not aware of.",
                ]}
              />
            </LegalSection>

            <LegalSection id="contact" title="Corrections and reports" kicker="Section 13">
              <p>
                If a statement on this page is wrong, if a licence or owner has changed, or
                if material in the catalogue is yours and should not be there, say so and it
                will be corrected or removed. The procedure, and what to include, is set out
                on <Link href="/copyright">Copyright &amp; Intellectual Property</Link>.
              </p>
              <p>{LEGAL_OWNER.contact}</p>
            </LegalSection>

            <LegalFooterNav current={meta} />
          </article>
        </div>
      </div>
    </main>
  );
}
