import type { ReactNode } from "react";
import Link from "next/link";
import { PLATFORM_BY_ID, type PlatformId } from "@/lib/platforms";
import {
  LEGAL_OWNER,
  LEGAL_PAGES,
  PLATFORM_BRAND_NOTICES,
  siblingPages,
  type LegalPageMeta,
  type PlatformBrandNotice,
} from "@/lib/legal";

/**
 * Shared chrome for the website-only legal documents.
 *
 * These are server components: the documents are static prose, so none of this
 * ships JavaScript beyond the framework's own hydration.
 */

export function LegalCrumbs({ current }: { current: string }) {
  return (
    <nav className="legal-crumbs" aria-label="Breadcrumb">
      <Link href="/">CINEMAX</Link>
      <span aria-hidden="true">/</span>
      <Link href="/license">Legal</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{current}</span>
    </nav>
  );
}

export function LegalHero({ meta }: { meta: LegalPageMeta }) {
  return (
    <header className="legal-hero">
      <span className="legal-eyebrow">{meta.eyebrow}</span>
      <h1>{meta.title}</h1>
      <p className="legal-lede">{meta.description}</p>
      <div className="legal-hero-meta">
        <span>
          Applies to <strong>cinemax (website)</strong>
        </span>
        <span>
          Last reviewed <strong>{meta.reviewed}</strong>
        </span>
        <span>
          Owner <strong>{LEGAL_OWNER.name}</strong>
        </span>
      </div>
    </header>
  );
}

export interface LegalSectionSpec {
  id: string;
  title: string;
  kicker?: string;
}

/** Sticky table of contents built from the section list of the current page. */
export function LegalToc({ sections }: { sections: readonly LegalSectionSpec[] }) {
  return (
    <nav className="legal-toc" aria-label="On this page">
      <span className="legal-toc-title">On this page</span>
      {sections.map((section) => (
        <a key={section.id} href={`#${section.id}`}>
          {section.title}
        </a>
      ))}
    </nav>
  );
}

export function LegalSection({
  id,
  title,
  kicker,
  children,
}: {
  id: string;
  title: string;
  kicker?: string;
  children: ReactNode;
}) {
  return (
    <section className="legal-section" id={id} aria-labelledby={`${id}-heading`}>
      {kicker && <p className="legal-kicker">{kicker}</p>}
      <h2 id={`${id}-heading`}>{title}</h2>
      {children}
    </section>
  );
}

export function LegalCallout({
  title,
  children,
  strong = false,
}: {
  title?: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={`legal-callout${strong ? " is-strong" : ""}`}>
      {title && <span className="legal-callout-title">{title}</span>}
      <p>{children}</p>
    </div>
  );
}

export function LegalBullets({ items }: { items: readonly ReactNode[] }) {
  return (
    <ul className="legal-list">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export function LegalFacts({ rows }: { rows: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="legal-facts">
      {rows.map((row) => (
        <div className="legal-fact" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BrandCard({ notice, isOwnBrand }: { notice: PlatformBrandNotice; isOwnBrand: boolean }) {
  const platform = PLATFORM_BY_ID.get(notice.id);
  return (
    <article className={`legal-brand${isOwnBrand ? " is-own" : ""}`}>
      <div className="legal-brand-head">
        <span className="legal-brand-mark">
          {/* The brand's own local artwork, exactly as the rail renders it:
              never recoloured, never filtered, never overlaid. It is an SVG or
              WebP file under /public, which next/image will not optimise
              without dangerouslyAllowSVG, so the plain element is correct. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={platform?.logo ?? "/brand/cinemax-symbol.svg"}
            alt={`${notice.service} logo`}
            loading="lazy"
            decoding="async"
          />
        </span>
        <div className="legal-brand-name">
          <strong>{notice.service}</strong>
          <span>{notice.owner}</span>
        </div>
      </div>
      <div>
        <p className="legal-brand-owner">{notice.use}</p>
        {isOwnBrand && <span className="legal-brand-tag">Third-party mark</span>}
      </div>
      {notice.note && <p className="legal-brand-note">{notice.note}</p>}
    </article>
  );
}

/**
 * The nineteen brand marks, each with the name of the service it belongs to and
 * the corporate owner of the mark. The CINEMAX entry is labelled as a
 * third-party mark on purpose: the Cinemax network is not this project.
 */
export function BrandNoticeGrid({ ids }: { ids?: readonly PlatformId[] }) {
  const notices = ids
    ? PLATFORM_BRAND_NOTICES.filter((notice) => ids.includes(notice.id))
    : PLATFORM_BRAND_NOTICES;
  return (
    <div className="legal-brand-grid">
      {notices.map((notice) => (
        <BrandCard key={notice.id} notice={notice} isOwnBrand={notice.id === "cinemax"} />
      ))}
    </div>
  );
}

export function LegalFooterNav({ current }: { current: LegalPageMeta }) {
  return (
    <footer className="legal-foot">
      <p className="legal-foot-title">Other documents</p>
      <div className="legal-foot-links">
        {siblingPages(current.slug).map((page) => (
          <Link key={page.slug} href={page.href}>
            {page.title}
          </Link>
        ))}
        <Link href="/">Back to CINEMAX</Link>
      </div>
      <p className="legal-foot-note">
        {LEGAL_OWNER.summary} Last reviewed {current.reviewed}. If anything on this page
        is wrong or out of date, it should be corrected rather than left in place — see{" "}
        <Link href="/copyright">Copyright &amp; Intellectual Property</Link> for how to raise it.
      </p>
    </footer>
  );
}

/** The full set of documents, as a compact list for index-like placements. */
export function LegalDocumentIndex({ heading }: { heading?: string }) {
  return (
    <div>
      {heading && <p className="legal-foot-title">{heading}</p>}
      <ul className="legal-inline-nav">
        {LEGAL_PAGES.map((page) => (
          <li key={page.slug}>
            <Link href={page.href}>{page.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
