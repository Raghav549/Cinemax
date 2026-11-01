import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalBullets,
  LegalCallout,
  LegalCrumbs,
  LegalFooterNav,
  LegalHero,
  LegalSection,
  LegalToc,
  type LegalSectionSpec,
} from "@/components/LegalDocument";
import {
  FONT_ATTRIBUTIONS,
  IMAGE_NOTES,
  LEGAL_PAGES,
  PLATFORM_BRAND_NOTICES,
  SOFTWARE_ATTRIBUTIONS,
} from "@/lib/legal";

const meta = LEGAL_PAGES[2];

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: "/attributions" },
};

const SECTIONS: readonly LegalSectionSpec[] = [
  { id: "summary", title: "Summary by licence" },
  { id: "software", title: "Software, with versions and licences" },
  { id: "type", title: "Typefaces" },
  { id: "brand-artwork", title: "Brand artwork sources" },
  { id: "catalogue-art", title: "Catalogue artwork" },
  { id: "media", title: "Media libraries loaded on demand" },
  { id: "services", title: "Services and infrastructure" },
  { id: "how-checked", title: "How these lists are checked" },
];

/** Licence families, counted from the records above rather than asserted. */
const LICENCE_COUNTS = SOFTWARE_ATTRIBUTIONS.reduce<Record<string, number>>((counts, item) => {
  counts[item.licence] = (counts[item.licence] ?? 0) + 1;
  return counts;
}, {});

export default function AttributionsPage() {
  return (
    <main className="legal-page" id="main-content" tabIndex={-1}>
      <div className="legal-shell">
        <LegalCrumbs current="Third-Party Attributions" />
        <LegalHero meta={meta} />

        <div className="legal-body">
          <LegalToc sections={SECTIONS} />

          <article className="legal-doc">
            <LegalSection id="summary" title="Summary by licence" kicker="Section 01">
              <p>
                Everything this website depends on is permissively licensed. The counts
                below are computed from the records on this page, not written by hand, so
                they cannot drift away from the tables that follow.
              </p>
              <div className="legal-table-wrap">
                <table className="legal-table">
                  <thead>
                    <tr>
                      <th scope="col">Licence</th>
                      <th scope="col">Components listed here</th>
                      <th scope="col">Obligation this project meets</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>MIT</strong>
                      </td>
                      <td>{LICENCE_COUNTS.MIT ?? 0}</td>
                      <td>Copyright notice and licence text retained (this page and the installed package headers).</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Apache-2.0</strong>
                      </td>
                      <td>{LICENCE_COUNTS["Apache-2.0"] ?? 0}</td>
                      <td>Attribution retained; no NOTICE file is supplied by these packages that would need reproducing.</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>BSD-3-Clause</strong>
                      </td>
                      <td>{LICENCE_COUNTS["BSD-3-Clause"] ?? 0}</td>
                      <td>Copyright notice retained; neither the author&apos;s nor the project&apos;s name is used to endorse this site.</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>SIL Open Font License 1.1</strong>
                      </td>
                      <td>{FONT_ATTRIBUTIONS.length}</td>
                      <td>Licence text ships beside each font, including inside the Android build.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                The installed tree also contains notice-bearing licences beyond the four
                above. They are recorded rather than glossed over, because &ldquo;permissive
                everywhere&rdquo; would not be true:
              </p>
              <div className="legal-table-wrap">
                <table className="legal-table">
                  <thead>
                    <tr>
                      <th scope="col">Package</th>
                      <th scope="col">Licence</th>
                      <th scope="col">Why it is present</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>lightningcss</strong> (+ platform builds)
                      </td>
                      <td>MPL-2.0</td>
                      <td>CSS transform used by Tailwind CSS at build time. Unmodified; its source is published by its project.</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>axe-core</strong>, @axe-core/playwright
                      </td>
                      <td>MPL-2.0</td>
                      <td>Accessibility assertions in the browser test suite. Development only; never shipped.</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>@img/sharp-libvips</strong>
                      </td>
                      <td>LGPL-3.0-or-later</td>
                      <td>The native image library behind the framework&apos;s image pipeline. Used as an unmodified, dynamically loaded dependency; its source is published by its project.</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>caniuse-lite</strong>
                      </td>
                      <td>CC-BY-4.0</td>
                      <td>Browser-support data used by the CSS toolchain at build time.</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>minimatch</strong>
                      </td>
                      <td>BlueOak-1.0.0</td>
                      <td>Glob matching inside the lint toolchain. Development only.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <LegalCallout>
                <p>
                  There is no AGPL, SSPL or Commons-Clause package in the tree. This project
                  modifies none of the packages above, and none of them is offered to a
                  visitor in a form that would require this project&apos;s own source to be
                  published. If that ever changed, it would be recorded here before the
                  dependency shipped.
                </p>
              </LegalCallout>
            </LegalSection>

            <LegalSection id="software" title="Software, with versions and licences" kicker="Section 02">
              <p>
                Versions are the ones pinned in this deployment&apos;s lockfile. Licence
                identifiers are the SPDX values recorded in each package&apos;s own metadata.
              </p>
              <div className="legal-table-wrap">
                <table className="legal-table">
                  <thead>
                    <tr>
                      <th scope="col">Component</th>
                      <th scope="col">Version</th>
                      <th scope="col">Licence</th>
                      <th scope="col">Attribution / project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SOFTWARE_ATTRIBUTIONS.map((item) => (
                      <tr key={item.name}>
                        <td>
                          <strong>{item.name}</strong>
                          <br />
                          {item.use}
                        </td>
                        <td>{item.version ?? "—"}</td>
                        <td>{item.licence}</td>
                        <td>
                          {item.url ? (
                            <a href={item.url} rel="noreferrer noopener" target="_blank">
                              {item.url.replace(/^https?:\/\//, "")}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                The full transitive dependency tree, including development-only packages, is
                reproducible from the repository with <code>npm run licenses</code>. That
                report is the authoritative list; this table names what the website itself
                relies on directly.
              </p>
            </LegalSection>

            <LegalSection id="type" title="Typefaces" kicker="Section 03">
              <div className="legal-table-wrap">
                <table className="legal-table">
                  <thead>
                    <tr>
                      <th scope="col">Family</th>
                      <th scope="col">Authors</th>
                      <th scope="col">Licence</th>
                      <th scope="col">Licence text shipped at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FONT_ATTRIBUTIONS.map((font) => (
                      <tr key={font.family}>
                        <td>
                          <strong>{font.family}</strong>
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
                Both families are self-hosted as <code>woff2</code> files and served from this
                deployment. No font is requested from a third-party font service, so no
                visitor request is made to one.
              </p>
            </LegalSection>

            <LegalSection id="brand-artwork" title="Brand artwork sources" kicker="Section 04">
              <p>
                Each platform mark was obtained from a public brand-artwork library, checked
                against that source by comparing path geometry (for vectors) or a file hash
                (for raster art), and stored locally — no logo is hot-linked at runtime. The
                marks themselves remain the property of their owners; the library is only how
                the file was obtained.
              </p>
              <div className="legal-table-wrap">
                <table className="legal-table">
                  <thead>
                    <tr>
                      <th scope="col">Mark</th>
                      <th scope="col">Owner</th>
                      <th scope="col">Source and preparation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLATFORM_BRAND_NOTICES.map((notice) => (
                      <tr key={notice.id}>
                        <td>
                          <strong>{notice.service}</strong>
                        </td>
                        <td>{notice.owner}</td>
                        <td>
                          {notice.id === "cinemax"
                            ? "tv-logo/tv-logos (countries/united-states/cinemax-us.png), resized and encoded as WebP with its alpha channel intact."
                            : "See public/platforms and docs/platform-assets.md for the exact upstream path, variant and preparation of this file."}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <LegalBullets
                items={[
                  "Every file in public/platforms/ is recorded with its upstream repository, path and preparation in docs/platform-assets.md.",
                  "A build check (npm run verify:logos) pins each file's geometry and colour tokens, so a substituted or recoloured export fails the build rather than shipping quietly.",
                  "No mark was redrawn, traced or recreated, and none was generated synthetically.",
                ]}
              />
            </LegalSection>

            <LegalSection id="catalogue-art" title="Catalogue artwork" kicker="Section 05">
              <LegalBullets items={IMAGE_NOTES.map((note) => <>{note}</>)} />
            </LegalSection>

            <LegalSection id="media" title="Media libraries loaded on demand" kicker="Section 06">
              <p>
                Two substantial libraries are never part of the first page load. They are
                split into their own chunks and fetched only when a title that needs them is
                actually played, so a visitor who never plays an HLS or DASH title never
                downloads either:
              </p>
              <LegalBullets
                items={[
                  <>
                    <strong>hls.js 1.7.3</strong> — Apache-2.0 — for HTTP Live Streaming on
                    browsers without native support.
                  </>,
                  <>
                    <strong>dash.js 5.2.1</strong> — BSD-3-Clause — for MPEG-DASH manifests.
                  </>,
                ]}
              />
              <p>
                Both libraries are unmodified and are used through their documented public
                APIs. Their copyright notices remain in the distributed chunks.
              </p>
            </LegalSection>

            <LegalSection id="services" title="Services and infrastructure" kicker="Section 07">
              <p>
                This deployment is hosted on a third-party platform and stores its catalogue
                in a PostgreSQL database provided as a service. Those providers process
                requests on this project&apos;s behalf under their own terms; no software is
                redistributed from them. Which third-party hosts a visitor&apos;s browser may
                contact is listed on <Link href="/privacy">Privacy &amp; Content Usage</Link>.
              </p>
              <p>
                The Android application is a shell around the same deployment. It adds no
                other third-party library: sharing is performed by the operating system&apos;s
                own share sheet, not by an SDK.
              </p>
            </LegalSection>

            <LegalSection id="how-checked" title="How these lists are checked" kicker="Section 08">
              <LegalBullets
                items={[
                  <>
                    <code>npm run verify:logos</code> — proves every platform id resolves to a
                    pinned, valid, locally stored asset, and that the artwork matches the
                    recorded original.
                  </>,
                  <>
                    <code>npm run verify:platforms</code> — proves the registry that drives
                    the rail, the studio picker and the platform filters behaves correctly.
                  </>,
                  <>
                    <code>npm run licenses</code> — recomputes the dependency licence report
                    from the installed tree, so this page can be re-checked rather than trusted.
                  </>,
                  <>
                    The legal routes are website-only: no Android source, asset or bridge call
                    references them, and a test asserts that.
                  </>,
                ]}
              />
            </LegalSection>

            <LegalFooterNav current={meta} />
          </article>
        </div>
      </div>
    </main>
  );
}
