/** True for a phone/tablet-sized portrait viewport that should open in cinema mode. */
export function isPortraitMobileViewport(): boolean {
  return typeof window !== "undefined"
    && window.innerWidth <= 820
    && window.innerHeight > window.innerWidth + 40;
}

/**
 * Ask the browser to lock the current display to landscape after it has entered
 * fullscreen. The promise is intentionally non-fatal: iOS and some browsers do
 * not implement orientation locking, but their native rotate/fullscreen UI can
 * still be used.
 */
export async function lockPlayerLandscape(): Promise<void> {
  try {
    const orientation = window.screen?.orientation as unknown as {
      lock?: (value: "landscape") => Promise<void>;
    } | undefined;
    if (typeof orientation?.lock === "function") await orientation.lock("landscape");
  } catch {
    // The device/browser does not allow an orientation lock in this context.
  }
}

/** Release a browser orientation lock when playback leaves immersive mode. */
export function unlockPlayerOrientation(): void {
  try {
    const orientation = window.screen?.orientation as unknown as {
      unlock?: () => void;
    } | undefined;
    orientation?.unlock?.();
  } catch {
    // Orientation unlock is unavailable on some browsers.
  }
}

/**
 * Must be called synchronously from a user gesture on browsers that require one.
 * Starting the request before mounting the overlay lets the first Watch Now tap
 * enter real browser fullscreen; the player then fills that fullscreen surface.
 */
export function requestBrowserImmersive(element: HTMLElement): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  if (document.fullscreenElement) {
    void lockPlayerLandscape();
    return Promise.resolve(true);
  }
  try {
    if (typeof element.requestFullscreen !== "function") return Promise.resolve(false);
    return element.requestFullscreen({ navigationUI: "hide" })
      .then(async () => {
        await lockPlayerLandscape();
        return true;
      })
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}
