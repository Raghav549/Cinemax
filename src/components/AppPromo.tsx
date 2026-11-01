"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hasNativeShell } from "@/lib/open-external";
import {
  APP_DOWNLOAD_PATH,
  APP_PROMO_DELAY_MS,
  APP_VERSION,
  availabilityMessage,
  isAndroidUserAgent,
  promoDecision,
  readPromoDismissed,
  rememberPromoDismissed,
} from "@/lib/app-promo";

/**
 * First-visit promotion for the Android app.
 *
 * Rules it follows, all of them visible in the behaviour:
 *
 *   · it is offered once — a dismissal is remembered on the device (storage and
 *     a cookie, never the database) and it never interrupts again;
 *   · it never blocks the site: it is a card in the corner of the page with no
 *     backdrop, no focus trap and no scroll lock, so browsing continues
 *     underneath it;
 *   · it never downloads anything by itself — the APK is fetched only when the
 *     visitor presses the button, and that button is a plain link to
 *     `/download/android`, which answers with the APK file itself;
 *   · on Android it offers the download; everywhere else it says honestly what
 *     the app is for instead of handing over a file that cannot be installed;
 *   · inside the Android app it does not appear at all — the visitor is already
 *     in it.
 *
 * The animation is two composited properties (transform, opacity) on a fixed
 * element, and it is skipped entirely under `prefers-reduced-motion`.
 */
export default function AppPromo() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isAndroid, setIsAndroid] = useState(true);
  const [note, setNote] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const storage = (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })();
    const decision = promoDecision({
      dismissed: readPromoDismissed(storage, document.cookie ?? ""),
      nativeShell: hasNativeShell(),
    });
    if (decision !== "show") return;

    // After the intro, not on top of it, and only if the page is actually being
    // looked at.
    timer.current = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      // Decided at the moment the card appears, on the device: Android gets the
      // download, anything else gets the availability note.
      const android = isAndroidUserAgent(navigator.userAgent ?? "");
      setIsAndroid(android);
      setNote(availabilityMessage(android));
      setVisible(true);
    }, APP_PROMO_DELAY_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setDismissed(true);
    const storage = (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })();
    rememberPromoDismissed(storage, (value) => {
      document.cookie = value;
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, close]);

  if (!visible || dismissed) return null;

  return (
    <aside className="app-promo" role="complementary" aria-label="Get the CINEMAX Android app">
      <div className="app-promo-glow" aria-hidden="true" />
      <div className="app-promo-body">
        <p className="app-promo-eyebrow">
          <span className="app-promo-dot" aria-hidden="true" />
          CINEMAX for Android · v{APP_VERSION}
        </p>
        <h2 className="app-promo-title">Get this app &amp; enjoy it</h2>
        <p className="app-promo-copy">
          The same catalogue, watchlist and resume point — in a full-screen app built for a phone: faster
          navigation, native sharing and playback that keeps its orientation.
        </p>
        <p className="app-promo-note">{note}</p>
        <div className="app-promo-actions">
          {isAndroid ? (
            <a
              className="app-promo-download"
              href={APP_DOWNLOAD_PATH}
              download
              // A real file response; no redirect, no page in between.
              rel="nofollow"
              onClick={() => setNote(`Downloading CINEMAX ${APP_VERSION}…`)}
            >
              <span className="app-promo-download-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5" />
                  <path d="M4 17.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
                </svg>
              </span>
              Download Android app
            </a>
          ) : (
            <button className="app-promo-download" type="button" onClick={close}>
              <span className="app-promo-download-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="7" y="2.5" width="10" height="19" rx="2.4" />
                  <path d="M11 18.5h2" />
                </svg>
              </span>
              Android only — got it
            </button>
          )}
          <button className="app-promo-continue" type="button" onClick={close}>
            Continue on website
          </button>
        </div>
      </div>
      <button className="app-promo-close" type="button" aria-label="Close this promotion" onClick={close}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </aside>
  );
}
