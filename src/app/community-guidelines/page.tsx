import type { Metadata } from "next";
import Link from "next/link";
import MusicIcon from "@/components/miley/Icon";

export const metadata: Metadata = { title: "Community guidelines", description: "Safety, consent, and rights guidelines for the MiLey community." };
const rules = [
  ["Share music you have the right to share", "Do not upload or publish recordings, artwork, or lyrics without permission. Public access does not grant you a license to redistribute someone else's work."],
  ["Respect people's boundaries", "Follow requests, private accounts, blocks, and mutual-follow messaging restrictions are there to protect people. Do not evade them with another account or use notes and messages to harass someone."],
  ["Be honest about who you are", "Do not impersonate a musician, listener, label, rights holder, or public figure. Do not manufacture engagement, follower counts, or creator credentials."],
  ["Keep conversations safe", "Messages are stored by the service and are not end-to-end encrypted. Do not send passwords, payment details, sensitive personal data, or threats. You can block or report an account."],
  ["Report harm accurately", "Use report controls for specific rights or safety concerns. Reports are for authorized moderators and do not guarantee a response timeframe. A production operator must publish its actual moderation contact and process."],
];
export default function CommunityGuidelinesPage() { return <main className="miley-page legal-page" id="main-content"><div className="legal-heading"><span className="page-eyebrow"><MusicIcon name="heart" /> Shared with care</span><h1>Community guidelines</h1><p>MiLey should make it easier to find music and the people behind it—not easier to violate someone&apos;s rights or boundaries.</p></div><div className="legal-body">{rules.map(([title, text]) => <section className="legal-section" key={title}><h2>{title}</h2><p>{text}</p></section>)}</div><div className="legal-links"><Link href="/legal/privacy">Privacy policy <MusicIcon name="arrow" /></Link><Link href="/legal/copyright">Copyright & rights <MusicIcon name="arrow" /></Link><Link href="/settings">Settings & blocks <MusicIcon name="arrow" /></Link></div></main>; }
