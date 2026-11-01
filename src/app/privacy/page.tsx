import type { Metadata } from "next";
import Link from "next/link";
import {
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
import { LEGAL_PAGES } from "@/lib/legal";

const meta = LEGAL_PAGES[4];

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: "/privacy" },
};

const SECTIONS: readonly LegalSectionSpec[] = [
  { id: "approach", title: "The approach: no accounts, no ad tracking" },
  { id: "browser-storage", title: "What is stored in your browser" },
  { id: "cookies", title: "Cookies" },
  { id: "server", title: "What the server receives" },
  { id: "third-parties", title: "Third-party hosts your browser may contact" },
  { id: "android", title: "What the Android application adds" },
  { id: "sharing", title: "What happens when you share a title" },
  { id: "retention", title: "Retention and deletion" },
  { id: "rights", title: "Your choices and your rights" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes to this page" },
];

export default function PrivacyPage() {
  return (
    <main className="legal-page" id="main-content" tabIndex={-1}>
      <div className="legal-shell">
        <LegalCrumbs current="Privacy & Content Usage" />
        <LegalHero meta={meta} />

        <div className="legal-body">
          <LegalToc sections={SECTIONS} />

          <article className="legal-doc">
            <LegalSection id="approach" title="The approach: no accounts, no ad tracking" kicker="Section 01">
              <p>
                The catalogue can be read, searched, saved to and shared without creating an
                account and without giving an email address. There is no advertising network,
                no third-party analytics script, no session-replay recorder and no
                cross-site tracking pixel in this website. Nothing is sold, and no profile is
                built from what you watch.
              </p>
              <p>
                This page lists exactly what is stored, where, and for how long — including
                the one identifier that does exist, which is a random value kept in a cookie
                so an anonymous watchlist can survive a page reload.
              </p>
            </LegalSection>

            <LegalSection id="browser-storage" title="What is stored in your browser" kicker="Section 02">
              <div className="legal-table-wrap">
                <table className="legal-table">
                  <thead>
                    <tr>
                      <th scope="col">Key</th>
                      <th scope="col">Storage</th>
                      <th scope="col">What it holds</th>
                      <th scope="col">Lifetime</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <code>cinemax:playback:&lt;id&gt;</code>
                      </td>
                      <td>localStorage</td>
                      <td>Your position in a title (seconds watched, duration, the time it was written) so playback can resume on this device.</td>
                      <td>Until you clear site data or the player rewrites/removes it.</td>
                    </tr>
                    <tr>
                      <td>
                        <code>cinemax:prism-intro:v1</code>
                      </td>
                      <td>sessionStorage</td>
                      <td>A one-character flag meaning “the intro has already played in this tab”, so the animation does not repeat.</td>
                      <td>Until the tab is closed.</td>
                    </tr>
                    <tr>
                      <td>
                        <code>session_id</code>
                      </td>
                      <td>Cookie</td>
                      <td>A random UUID created by the server on your first watchlist request. It is the key for the anonymous watchlist rows belonging to this browser. It contains no personal data and is not linked to any account.</td>
                      <td>Up to one year, refreshed on use; cleared by clearing cookies.</td>
                    </tr>
                    <tr>
                      <td>
                        <code>admin_token</code>
                      </td>
                      <td>Cookie</td>
                      <td>Only for studio administrators who sign in: a signed, HTTP-only session token. Visitors never receive it.</td>
                      <td>24 hours, or until sign-out.</td>
                    </tr>
                    <tr>
                      <td>Service worker cache</td>
                      <td>Cache Storage</td>
                      <td>The application shell and static assets, so a repeat visit loads faster. It holds no catalogue data and no personal data.</td>
                      <td>Until the worker updates or you clear site data.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <LegalCallout>
                <p>
                  The earlier version of this site cached the whole catalogue in
                  sessionStorage. That copy is now deleted on sight when the page loads,
                  because it could keep a title visible after it had been deleted in the
                  studio. The catalogue now lives only in memory for the current page.
                </p>
              </LegalCallout>
            </LegalSection>

            <LegalSection id="cookies" title="Cookies" kicker="Section 03">
              <p>
                Two cookies can exist, both first-party and both set by this deployment:
                <code>session_id</code> (anonymous watchlist key, one year) and{" "}
                <code>admin_token</code> (studio sign-in only, 24 hours, HTTP-only). No
                cookie is set by an advertising or analytics service, and none is shared with
                a third party.
              </p>
              <p>
                Blocking cookies does not stop the catalogue from being read or searched; it
                only stops an anonymous watchlist from being remembered on the server.
              </p>
            </LegalSection>

            <LegalSection id="server" title="What the server receives" kicker="Section 04">
              <LegalFacts
                rows={[
                  { label: "Requests", value: "Page, API and image requests reach this deployment's own server, and its hosting provider logs them the way any web server does (address, path, time, user agent)." },
                  { label: "Watchlist", value: "The title ids you save are stored against the anonymous session id. No name, email, address or payment detail is requested or stored." },
                  { label: "Studio sign-in", value: "Administrators authenticate with credentials held by the deployment; the session token is a signed JWT in an HTTP-only cookie, never in page JavaScript." },
                  { label: "Not collected", value: "No advertising identifiers, no precise location, no contact list, no device fingerprints, no cross-site identifiers." },
                ]}
              />
            </LegalSection>

            <LegalSection id="third-parties" title="Third-party hosts your browser may contact" kicker="Section 05">
              <p>
                The page itself is served from this deployment, and both typefaces are
                self-hosted, so a normal page view contacts no third party for fonts or
                scripts. Your browser can still reach an external host in these cases:
              </p>
              <LegalBullets
                items={[
                  <>
                    <strong>Poster and backdrop images</strong> that are hosted externally —
                    typically <code>image.tmdb.org</code> — load directly from that host. It
                    sees your address and user agent for the image request, as any image host
                    would.
                  </>,
                  <>
                    <strong>A trailer you press play on</strong> may be an official YouTube or
                    Vimeo embed, or a stream from the platform that holds the rights. That
                    host&apos;s player then applies its own cookies and policies.
                  </>,
                  <>
                    <strong>“Where to watch” links</strong> open the platform&apos;s own site
                    or app. Nothing about you is sent with the link beyond the URL itself.
                  </>,
                  <>
                    <strong>A share sheet</strong> hands the title to the app you choose; from
                    that point the receiving app&apos;s terms apply (<Link href="#sharing">below</Link>).
                  </>,
                ]}
              />
              <p>
                No analytics, tag manager, ad, social embed script, A/B testing service or
                error-reporting SDK is loaded from a third party on any page of this site.
              </p>
            </LegalSection>

            <LegalSection id="android" title="What the Android application adds" kicker="Section 06">
              <p>
                The Android application is a shell around this same website. It adds no
                analytics library and no advertising SDK. What it does add:
              </p>
              <LegalBullets
                items={[
                  "It requests the INTERNET and ACCESS_NETWORK_STATE permissions, nothing else — no location, contacts, camera, microphone or broad storage access.",
                  "It keeps the screen awake only while a video is actually playing, and drops image and page caches when the system reports memory pressure.",
                  "A small bridge lets the page tell the app when playback starts or stops, when a player goes fullscreen, and when you ask to share a title.",
                  "Sharing is performed by Android's own share sheet. The app does not know, and cannot know, which app you pick, and it does not report it anywhere.",
                  "If a title is shared with an image or a trailer file, that file is written to the app's private cache directory and handed to the chosen app through a read-only, expiring permission. Nothing is written to shared storage.",
                ]}
              />
            </LegalSection>

            <LegalSection id="sharing" title="What happens when you share a title" kicker="Section 07">
              <p>
                Sharing is initiated by you and does nothing until you pick a destination. On
                the web, the browser&apos;s own share sheet (Web Share API) is used where it
                exists; where it does not, the title&apos;s link is copied to your clipboard
                so you can paste it. On Android, the system share sheet lists the apps that
                are actually installed on your device — this app does not contain, and does
                not display, a list of its own.
              </p>
              <p>
                The shared link points at the title&apos;s page on this website and contains
                the title id, nothing else about you. A generated preview image is built by
                this deployment from the title&apos;s own poster and the CINEMAX mark. Nothing
                is shared until you confirm it.
              </p>
            </LegalSection>

            <LegalSection id="retention" title="Retention and deletion" kicker="Section 08">
              <LegalBullets
                items={[
                  "Playback positions live only in your browser. Clearing site data deletes them; signing out of nothing is required because there is no account.",
                  "An anonymous watchlist lives on the server, keyed by the session cookie. Clear that cookie and the key is gone; the orphaned rows are no longer reachable from your browser.",
                  "Server logs follow the hosting provider's retention policy and are used for operating and protecting the service.",
                  "Temporary files created for sharing are cache files in the app; Android may reclaim them at any time, and they are cleared with the app's cache.",
                ]}
              />
            </LegalSection>

            <LegalSection id="rights" title="Your choices and your rights" kicker="Section 09">
              <LegalBullets
                items={[
                  "You can clear the two storage keys and the two cookies at any time from your browser's site-data settings.",
                  "You can block the service worker by clearing site data; the site still works, it just loads slightly slower next time.",
                  "You can block third-party images (for example by blocking image.tmdb.org) and the catalogue will show its placeholders instead.",
                  "If you need a watchlist entry removed server-side, send the session id you want removed — it is visible in your browser's cookie list — and it will be deleted.",
                ]}
              />
              <p>
                Depending on where you live, you may have statutory rights to access,
                correct, delete or object to processing. Because this deployment holds no
                account, the practical route for most of them is to delete the storage keys
                and cookie described above; anything else can be raised through the contact
                route on <Link href="/copyright">Copyright &amp; Intellectual Property</Link>.
              </p>
            </LegalSection>

            <LegalSection id="children" title="Children" kicker="Section 10">
              <p>
                This website is not directed at children and does not knowingly collect
                information from them. It asks for no personal details at all, so the only
                data a child could generate is the same anonymous watchlist key every visitor
                gets. Some titles in a catalogue can be unsuitable for younger viewers, and
                that rating information comes from the studio record rather than from this
                site.
              </p>
            </LegalSection>

            <LegalSection id="changes" title="Changes to this page" kicker="Section 11">
              <p>
                If a new storage key, cookie, third-party host or app permission is added, it
                is added to this page in the same change. The review date at the top records
                the version you are reading.
              </p>
            </LegalSection>

            <LegalFooterNav current={meta} />
          </article>
        </div>
      </div>
    </main>
  );
}
