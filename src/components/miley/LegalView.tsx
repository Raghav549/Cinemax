import Link from "next/link";
import MusicIcon from "./Icon";

const sections = {
  terms: {
    eyebrow: "The basics",
    title: "Terms of service",
    intro: "These terms describe the MiLey product as currently implemented. The service operator should replace the contact and jurisdiction details and obtain local legal review before public launch.",
    items: [
      ["Who can use MiLey", "You must be at least 13 years old to create an account. Registration validates age on the server. A parent or guardian should supervise use where local law requires it."],
      ["Your account", "Use a unique password, keep access to your email address, and notify the service operator if you believe your account was used without permission. Passwords are stored as bcrypt hashes; the service never intentionally displays them."],
      ["Music and rights", "You retain rights you hold in content you submit. You may upload or publish audio only when you own it or have permission to distribute it. The upload confirmation is an attestation, not a license granted to MiLey and not proof of ownership. Do not upload copyrighted recordings without permission."],
      ["Public and private content", "You choose whether tracks, channels, playlists, or profiles are public where those controls are offered. Public material may be viewed and played by other users. Privacy settings are enforced by server routes, but no online service can promise that content already seen or copied by another person will be recalled."],
      ["Respectful use", "Do not impersonate others, harass or threaten people, evade blocks, scrape private data, interfere with the service, or upload unlawful, infringing, or harmful content. Use reporting and blocking controls responsibly."],
      ["Messages and notes", "Direct messages are stored on the service and are available to authorized service operators. They are not end-to-end encrypted. Music notes require a mutual follow and a public playable track, and may expire automatically."],
      ["Moderation and availability", "The operator may restrict or remove content believed to violate these terms or applicable law. MiLey is provided without a guarantee of uninterrupted availability. External audio, email, database, and storage services may be unavailable or require separate configuration."],
      ["Account closure", "You may request account deletion from Settings. Stored audio is deleted before database records; if configured storage is unavailable or an object cannot be removed, deletion is paused and the account remains for a retry."],
      ["Contact and governing law", "Before launch, the operator must publish a support/contact address and the governing-law and dispute-resolution terms required in the places where MiLey is offered. This implementation does not invent a business identity or contact address."],
    ],
  },
  privacy: {
    eyebrow: "Your information",
    title: "Privacy policy",
    intro: "This page describes the data handled by the current MiLey implementation. The service operator must identify its legal entity, actual infrastructure providers, retention periods, and contact details before production use.",
    items: [
      ["Account details", "Registration stores an email address, username, display name, date of birth, optional gender selection, a bcrypt password hash, verification status, and timestamps. Date of birth supports minimum-age checks; the current product does not use birth date or gender for music recommendations."],
      ["Listening and library", "Favorites, playlists, album data, and—when enabled—recent track playback position are stored in PostgreSQL. Turn off listening history in Settings to stop future history writes. Existing history remains until you delete your account or the operator implements a separate deletion control."],
      ["Social data", "Follow relationships, follow requests, profile settings, channel subscriptions, music notes, reports, blocks, in-app notifications, and messages are stored to provide the social features. Messages are not end-to-end encrypted. Mutual-follow checks and privacy/block rules are applied by server endpoints."],
      ["Uploads and images", "Audio is uploaded to an S3-compatible object store only when the operator configures one. Profile and artwork images are stored in PostgreSQL bytea rows in this implementation. Uploads are checked for type, size, ownership, and (for audio) a file hash; the service does not independently establish music rights."],
      ["Cookies and browser storage", "MiLey uses an HTTP-only, SameSite session cookie. Playback queue and player preferences may be saved in localStorage on the device. These browser values are not a cross-device account sync. Clear browser storage to remove local queue data."],
      ["Service providers", "A PostgreSQL service is required. Audio uploads require an S3-compatible storage service. Verification and password-reset email require an operator-configured transactional email provider; email is not sent through SMTP in this implementation. Podcast audio, if approved, is served from the publisher's external HTTPS host."],
      ["Analytics and advertising", "This repository does not implement an advertising profile or third-party analytics product for MiLey. Hosting, CDN, and infrastructure operators may maintain their own operational logs; the service operator must document those providers and their retention in the deployed privacy notice."],
      ["Retention and deletion", "Sessions and account content are associated with your account. Account deletion cascades database records only after stored audio cleanup succeeds; if storage cleanup cannot be confirmed, deletion is paused and the account remains. Backups and provider logs may have separate retention that the operator must document."],
      ["Your choices", "You can edit your profile, choose a private account, control history and recommendation preferences, block accounts, unsubscribe from channels, change your password, and request account deletion in Settings. Contact the service operator for other privacy requests; the contact must be published before launch."],
      ["Security limits", "Passwords and session tokens are not stored in plain text. This is not a security certification. Messages are not encrypted end-to-end, public content can be copied by viewers, and security depends on the deployed database, storage, email, host configuration, and operational practices."],
    ],
  },
  copyright: {
    eyebrow: "Rights and removal",
    title: "Copyright & music rights",
    intro: "MiLey is designed for independent creators to share recordings they control. A checkbox cannot establish a license, and the service does not provide a blanket music license.",
    items: [
      ["Before uploading", "Upload only your own work or recordings for which you have all rights and permissions needed for the distribution you select. A composition, sound recording, sample, performance, artwork, and metadata may have different rightsholders."],
      ["Report a concern", "Use the in-app report controls when available, and contact the service operator using the support address published by the deployed service. A production operator must add a complete copyright notice-and-takedown process, responsible agent, response timelines, and required local-law disclosures before accepting public uploads."],
      ["Operator review", "Reports are stored for authorized moderators. This repository does not by itself provide a staffed moderation team, legal agent, or a guaranteed response time. Do not treat a submission as a completed legal notice unless the operator confirms it meets the applicable process."],
    ],
  },
} as const;

export default function LegalView({ kind }: { kind: keyof typeof sections }) {
  const page = sections[kind];
  return <main className="miley-page legal-page" id="main-content" tabIndex={-1}><div className="legal-heading"><span className="page-eyebrow"><MusicIcon name="shield" /> {page.eyebrow} · MiLey</span><h1>{page.title}</h1><p>{page.intro}</p><span className="legal-review-date">Product disclosure reviewed October 18, 2026 · not a substitute for legal advice</span></div><div className="legal-body">{page.items.map(([title, text]) => <section className="legal-section" key={title}><h2>{title}</h2><p>{text}</p></section>)}</div><div className="legal-links"><Link href="/community-guidelines">Community guidelines <MusicIcon name="arrow" /></Link><Link href="/licenses">Open-source licenses <MusicIcon name="arrow" /></Link><Link href="/settings">Privacy settings <MusicIcon name="arrow" /></Link></div></main>;
}
