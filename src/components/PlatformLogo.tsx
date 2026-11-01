"use client";

import { memo } from "react";
import { PLATFORM_BY_ID, type PlatformId } from "@/lib/platforms";

/**
 * Official brand artwork, rendered at the logo's own aspect ratio.
 * The wrapper fixes the box so the rail never shifts while logos decode.
 */
function PlatformLogo({
  id,
  className = "",
  eager = false,
}: {
  id: PlatformId;
  className?: string;
  eager?: boolean;
}) {
  const platform = PLATFORM_BY_ID.get(id);
  if (!platform) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={platform.logo}
      alt={platform.name}
      className={`platform-logo ${className}`}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
    />
  );
}

export default memo(PlatformLogo);
