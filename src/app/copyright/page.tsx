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
import { LEGAL_OWNER, LEGAL_PAGES } from "@/lib/legal";

const meta = LEGAL_PAGES[1];

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: "/copyright" },
};

const SECTIONS: readonly LegalSectionSpec[] = [
  { id: "ownership", title: "What this project owns" },
  { id: "not-ours", title: "What this project does not own" },
  { id: "code", title: "Source code and interface" },
  { id: "brand-assets", title: "The CINEMAX identity assets" },
  { id: "limits-on-use", title: "What you may not do with this site" },
  { id: "reporting", title: "Reporting a rights concern" },
  { id: "procedure", title: "What happens after a report" },
  { id: "counter", title: "If you believe a removal was wrong" },
];

export default function CopyrightPage() {
  return (
    <main className="legal-page" id="main-content" tabIndex={-1}>
      <div className="legal-shell">
        <LegalCrumbs current="Copyright & Intellectual Property" />
        <LegalHero meta={meta} />

        <div className="legal-body">
          <LegalToc sections={SECTIONS} />

          <article className="legal-doc">
            <LegalSection id="ownership" title="What this project owns" kicker="Section 01">
              <p>
                Copyright in this website&apos;s original work — its interface design, its
                layout and motion design, its component code, its written documentation
                including this page, and the CINEMAX emblem, wordmark and application icon —
                belongs to the CINEMAX project. That protection covers the expression, not
                the ideas: a colour scheme, a rail of posters or a circle containing a logo
                is not itself protectable subject matter.
              </p>
              <LegalFacts
                rows={[
                  { label: "Original artwork", value: "CINEMAX emblem, wordmark lockup, app icon, splash animation, interface icons" },
                  { label: "Originals live at", value: "public/brand/, src/components/Logo.tsx, src/components/Icon.tsx" },
                  { label: "Written material", value: "The legal documents on this website, the README and the documentation in docs/" },
                  { label: "Third-party material", value: "Everything listed on /license and /attributions — not owned by this project" },
                ]}
              />
            </LegalSection>

            <LegalSection id="not-ours" title="What this project does not own" kicker="Section 02">
              <p>
                The catalogue is a catalogue: the films and series it lists, their posters
                and backdrops, their trailers, and the platform names and logos that say
                where they can be streamed all belong to their respective owners. This
                project claims no copyright in any of them and grants no rights to them.
              </p>
              <BrandNoticeGrid />
              <LegalCallout title="Why the logos are here">
                <p>
                  A platform mark appears so a viewer can recognise, at a glance, where a
                  title is available. That is identification, not association: it says
                  nothing about the relationship between CINEMAX and the platform, and the
                  full statement is on <Link href="/disclaimer">Content &amp; Trademark
                  Disclaimer</Link>.
                </p>
              </LegalCallout>
            </LegalSection>

            <LegalSection id="code" title="Source code and interface" kicker="Section 03">
              <p>
                The application is built on open-source software under the licences listed on{" "}
                <Link href="/attributions">Third-Party Attributions</Link>. Those licences
                cover those libraries, not this project&apos;s own code, and this
                project&apos;s own code is not offered under an open-source licence by this
                page.
              </p>
              <p>
                The interface icons and motion artwork are drawn as inline SVG in this
                project&apos;s own files. They are not taken from an icon set, a stock library
                or another product&apos;s interface, and no third-party icon font is bundled.
              </p>
            </LegalSection>

            <LegalSection id="brand-assets" title="The CINEMAX identity assets" kicker="Section 04">
              <p>
                The emblem, the wordmark and the app icon are used unchanged everywhere they
                appear: the website header, the dock, the favicon, the sharing cards, the
                Android splash screen and the launcher icon. Their geometry and their
                blue–violet–pink gradient are fixed, and a build check fails if they drift
                from one another.
              </p>
              <LegalBullets
                items={[
                  "The emblem is not the logo of any broadcast network, including the Cinemax network, and it was not derived from one.",
                  "Reusing the identity in another product, or presenting it as your own, is not permitted.",
                  "Third-party platform marks are never used as this project's own branding, and this project's mark is never used as a platform logo.",
                ]}
              />
            </LegalSection>

            <LegalSection id="limits-on-use" title="What you may not do with this site" kicker="Section 05">
              <LegalBullets
                items={[
                  "You may not reproduce, redistribute or resell the catalogue, its artwork or its code as your own product.",
                  "You may not remove or obscure attribution, copyright notices or this page's disclosures.",
                  "You may not use the CINEMAX identity, or any platform mark shown here, to imply a partnership or endorsement that does not exist.",
                  "You may not use the catalogue to redistribute a film. Playback is for personal viewing of sources the studio has recorded as licensed or public domain.",
                  "You may not attempt to bypass the studio's authentication or extract another user's data.",
                ]}
              />
            </LegalSection>

            <LegalSection id="reporting" title="Reporting a rights concern" kicker="Section 06">
              <p>
                If you own rights in material that appears in this catalogue and you believe
                it should not be there, a report will be acted on. To be actionable, a report
                should identify:
              </p>
              <LegalBullets
                items={[
                  <>
                    <strong>The work.</strong> The title, and enough detail to find it in the
                    catalogue (a page address or the catalogue id is ideal).
                  </>,
                  <>
                    <strong>Your right.</strong> What you own — copyright, trademark, or an
                    exclusive licence — and the territory it covers.
                  </>,
                  <>
                    <strong>Your authority.</strong> Whether you are the owner or authorised
                    to act for them.
                  </>,
                  <>
                    <strong>What you want.</strong> Removal of the title, replacement of the
                    artwork, a correction to an attribution, or something else.
                  </>,
                  <>
                    <strong>How to reach you.</strong> A reply address, so the report can be
                    answered and the outcome recorded.
                  </>,
                ]}
              />
              <LegalCallout title="A good-faith statement is required">
                <p>
                  A report should state that you have a good-faith belief that the use is not
                  authorised, and that the information in it is accurate. Reports are not
                  published, and the person who added the title is told that it was removed
                  and why.
                </p>
              </LegalCallout>
              <p>{LEGAL_OWNER.contact}</p>
            </LegalSection>

            <LegalSection id="procedure" title="What happens after a report" kicker="Section 07">
              <LegalBullets
                items={[
                  "The title is taken out of public view while the report is checked — it is not left up because the check takes time.",
                  "The studio record that added the title is reviewed: the recorded source, the licence note and the rights confirmation.",
                  "If the report is upheld, the title stays removed and the record is annotated with the reason.",
                  "If the report cannot be upheld, the title is restored and the reasoning is recorded; the reporter is told either way.",
                  "If the issue is an attribution rather than the material itself, the attribution is corrected on this page and, where relevant, on /license.",
                ]}
              />
              <p>
                Because removal is a catalogue action and not a redesign, nothing else about
                the site changes: the same records, screens and APIs stay in place.
              </p>
            </LegalSection>

            <LegalSection id="counter" title="If you believe a removal was wrong" kicker="Section 08">
              <p>
                Say so, with the same detail the original report needed: what was removed, why
                you believe the use was authorised, and what evidence supports that. The
                material stays out of view until the question is settled — a catalogue listing
                is not worth an unresolved dispute.
              </p>
              <p>
                Nothing on this page limits any right or defence available to either side,
                and nothing here is legal advice. If you need advice, consult a lawyer
                qualified where you are.
              </p>
            </LegalSection>

            <LegalFooterNav current={meta} />
          </article>
        </div>
      </div>
    </main>
  );
}
