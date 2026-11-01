"use client";

import { useCallback, useState } from "react";
import CinematicButton from "@/components/CinematicButton";
import Icon from "@/components/Icon";
import { shareTitle, type ShareOutcome, type ShareableTitle } from "@/lib/share";

/**
 * The share control used on the share landing page.
 *
 * It runs the same code path as the Share button on the title screen: inside the
 * Android app that is the native share sheet, in a supporting browser it is the
 * Web Share API (with the generated card, and the trailer when it is a real
 * attachable file), and elsewhere it copies the link. The outcome is reported
 * back to the visitor instead of failing silently.
 */
export default function ShareActions({ title }: { title: ShareableTitle }) {
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [busy, setBusy] = useState(false);

  const onShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    let outcome: ShareOutcome = "failed";
    try {
      outcome = await shareTitle(title);
    } finally {
      setBusy(false);
    }
    setStatus(reportFor(outcome));
  }, [busy, title]);

  return (
    <div className="share-actions">
      <CinematicButton
        onClick={() => void onShare()}
        disabled={busy}
        icon={<Icon name="share" />}
        aria-label="Share this title"
      >
        {busy ? "Preparing…" : "Share this title"}
      </CinematicButton>
      {status && (
        <p className={status.tone === "ok" ? "share-status" : "share-status is-warn"} role="status">
          {status.text}
        </p>
      )}
    </div>
  );
}

function reportFor(outcome: ShareOutcome): { text: string; tone: "ok" | "warn" } {
  switch (outcome) {
    case "shared":
      return { text: "Shared.", tone: "ok" };
    case "copied":
      return { text: "Link copied — this browser has no share sheet.", tone: "ok" };
    case "cancelled":
      return { text: "Sharing cancelled.", tone: "ok" };
    case "unavailable":
      return { text: "This browser can’t share or copy the link automatically.", tone: "warn" };
    default:
      return { text: "Sharing didn’t open. You can copy the link from the address bar.", tone: "warn" };
  }
}
