"use client";

import { useCallback, useState } from "react";
import Icon from "./Icon";
import { openExternal } from "@/lib/open-external";
import { displayHost } from "@/lib/providers";
import type { LinkResolution, ShareMetadata } from "@/lib/providers";

/**
 * The in-app provider page shown when a share link cannot be played inside
 * Cinemax - DRM/subscription services (Netflix, Prime Video, Hotstar, …),
 * login-walled content, or sites without a permitted embed. It is honest about
 * the restriction and offers a clear "Play on the official service" action,
 * while preserving the original URL.
 */
export default function ProviderLanding({
  resolution,
  metadata,
  onClose,
  closeLabel = "Back",
}: {
  resolution: LinkResolution;
  metadata?: ShareMetadata | null;
  onClose: () => void;
  closeLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyTimer, setCopyTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const plan = resolution.playback;
  const provider = resolution.provider;
  const title = metadata?.title || (resolution.contentId ? `${provider.name} · ${resolution.contentId}` : provider.name);
  const message =
    plan.strategy === "external" ? plan.message : provider.restriction || "Open this link on the official service to watch it.";

  const copyLink = useCallback(() => {
    const url = resolution.canonicalUrl || resolution.originalUrl;
    const done = () => {
      setCopied(true);
      if (copyTimer) clearTimeout(copyTimer);
      setCopyTimer(setTimeout(() => setCopied(false), 2200));
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done).catch(done);
    else done();
  }, [copyTimer, resolution.canonicalUrl, resolution.originalUrl]);

  return (
    <div className="provider-page" role="dialog" aria-modal="true" aria-label={`${provider.name} — open on the official service`}>
      <div className="provider-page-topbar">
        <button className="player-icon-button" type="button" aria-label={closeLabel} onClick={onClose}>
          <Icon name="chevron-left" />
        </button>
        <span className="player-title">{provider.name}</span>
        <button className="player-icon-button" type="button" aria-label="Close player" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      <div className="provider-page-body">
        <div className="provider-badge" style={{ background: `linear-gradient(135deg, ${provider.accent}, #1b1230)` }} aria-hidden="true">
          <span>{provider.name.replace(/[^A-Za-z+]/g, "").slice(0, 2).toUpperCase() || "▶"}</span>
        </div>

        <p className="provider-eyebrow">{plan.strategy === "external" && plan.reason === "unsupported" ? "Unsupported provider" : "Official service"}</p>
        <h1 className="provider-title">{title}</h1>
        {metadata?.author && <p className="provider-author">{metadata.author}</p>}

        {metadata?.thumbnailUrl && (
          // Thumbnail comes from the provider's own oEmbed response, never from
          // scraping arbitrary pages. Missing artwork simply stays hidden.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="provider-thumbnail" src={metadata.thumbnailUrl} alt="" />
        )}

        <p className="provider-message">{message}</p>

        <p className="provider-url" title={resolution.originalUrl}>
          <span className="provider-url-host">{displayHost(resolution.originalUrl)}</span>
          <span className="provider-url-full">{resolution.originalUrl}</span>
        </p>

        <ul className="provider-facts">
          {provider.requirements.subscription && <li><Icon name="lock" /> Subscription required on {provider.name}</li>}
          {!provider.requirements.subscription && provider.requirements.login && <li><Icon name="lock" /> Sign-in may be required on {provider.name}</li>}
          {provider.requirements.drm && <li><Icon name="lock" /> Protected by the provider’s DRM — playback stays on their player</li>}
        </ul>

        <div className="provider-actions">
          <button className="cinematic-button provider-cta" type="button" onClick={() => openExternal(resolution.canonicalUrl || resolution.originalUrl)}>
            <Icon name="play" filled /> {plan.strategy === "external" ? plan.actionLabel : `Play on ${provider.name}`}
          </button>
          <button className="cinematic-button button-secondary" type="button" onClick={copyLink} aria-live="polite">
            <Icon name={copied ? "check" : "link"} /> {copied ? "Link copied" : "Copy link"}
          </button>
          <button className="cinematic-button button-secondary" type="button" onClick={onClose}>
            <Icon name="arrow-left" /> {closeLabel}
          </button>
        </div>

        <p className="provider-note">
          Cinemax never bypasses DRM, subscriptions or paywalls. When a provider permits an official player, it plays inside
          Cinemax; otherwise the title opens on their service.
        </p>
      </div>
    </div>
  );
}
