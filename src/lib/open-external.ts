/**
 * Opens a URL outside the Cinemax page.
 *
 * Inside the Android shell this hands the link to the system (which routes it
 * to the provider's installed app where the provider supports verified app
 * links); in a browser it opens a new tab. The URL must already have been
 * validated by `parseShareUrl` - nothing untrusted ever reaches this helper.
 */
export function openExternal(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const bridge = (window as typeof window & {
      CinemaxNative?: { openExternal?: (url: string) => void };
    }).CinemaxNative;
    if (typeof bridge?.openExternal === "function") {
      bridge.openExternal(url.toString());
      return true;
    }
    window.open(url.toString(), "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

/** True when the native Android shell is hosting the page. */
export function hasNativeShell(): boolean {
  return typeof (window as typeof window & {
    CinemaxNative?: { enterPlayerFullscreen?: () => void };
  }).CinemaxNative?.enterPlayerFullscreen === "function";
}

/**
 * Signals "landscape/immersive playback" to the Android shell.
 *
 * Calls the native bridge directly when present (so the contract also works in
 * tests and in pages before the shell runtime loads) and dispatches the
 * `cinemax:player-fullscreen` event the injected shell listens to. Both native
 * handlers are idempotent, so double-signalling is harmless.
 */
export function setNativePlayerFullscreen(active: boolean): void {
  try {
    window.dispatchEvent(new CustomEvent("cinemax:player-fullscreen", { detail: { active } }));
    const bridge = (window as typeof window & {
      CinemaxNative?: { enterPlayerFullscreen?: () => void; exitPlayerFullscreen?: () => void };
    }).CinemaxNative;
    if (active && typeof bridge?.enterPlayerFullscreen === "function") bridge.enterPlayerFullscreen();
    if (!active && typeof bridge?.exitPlayerFullscreen === "function") bridge.exitPlayerFullscreen();
  } catch {
    /* The DOM Fullscreen API path remains available. */
  }
}
