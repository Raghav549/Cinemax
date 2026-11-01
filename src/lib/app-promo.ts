/**
 * The first-visit Android app promotion.
 *
 * Everything here is pure so it can be checked without a browser: which visitor
 * sees the promotion, how a dismissal is remembered (storage, never a database),
 * and the one link the download button points at. The component only renders
 * what these rules decide.
 */

/** Identity of the shipped build. Asserted against the APK itself. */
export const APP_PACKAGE = "com.cinemax.app";
export const APP_VERSION = "1.1.0";
export const APP_VERSION_CODE = 2;

/** The verified artifact every download uses. No third-party host, no redirect. */
export const APP_DOWNLOAD_PATH = "/download/android";
export const APP_APK_FILE = "Cinemax-1.1.0.apk";

/** Remembered for half a year, on the device only. */
export const APP_PROMO_STORAGE_KEY = "cinemax:app-promo:v1";
export const APP_PROMO_COOKIE = "cinemax_app_promo";
export const APP_PROMO_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/** How long after the page settles before the promotion may appear. */
export const APP_PROMO_DELAY_MS = 1800;

export type PromoDecision = "show" | "hidden-dismissed" | "hidden-native-shell";

export interface PromoContext {
  /** The visitor has closed or answered the promotion before. */
  dismissed: boolean;
  /** The page is running inside the Android app, which *is* the app. */
  nativeShell: boolean;
}

/** Whether the promotion may appear at all for this visitor. */
export function promoDecision({ dismissed, nativeShell }: PromoContext): PromoDecision {
  if (nativeShell) return "hidden-native-shell";
  if (dismissed) return "hidden-dismissed";
  return "show";
}

/**
 * Android gets the download; everything else gets an honest availability note
 * instead of a file it cannot install.
 */
export function isAndroidUserAgent(userAgent: string): boolean {
  return /android/i.test(userAgent);
}

export function availabilityMessage(isAndroid: boolean): string {
  return isAndroid
    ? `CINEMAX for Android · version ${APP_VERSION} · signed release build`
    : `The CINEMAX app is for Android. Open cinemaxtv.space on an Android phone to install it — this device can keep using the website.`;
}

/** The download URL, always on the official origin and never a redirect page. */
export function appDownloadUrl(origin?: string): string {
  const base = (origin ?? "").replace(/\/$/, "");
  return `${base}${APP_DOWNLOAD_PATH}`;
}

/** `12.3 MB`, for the promotion's detail line. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(1)} MB`;
}

/** Read the stored dismissal without assuming storage is available. */
export function readPromoDismissed(storage: Pick<Storage, "getItem"> | null, cookie: string): boolean {
  try {
    if (storage?.getItem(APP_PROMO_STORAGE_KEY) === "1") return true;
  } catch {
    // Private mode and blocked storage still fall through to the cookie.
  }
  return cookie.split(";").some((part) => part.trim() === `${APP_PROMO_COOKIE}=1`);
}

/** The two writes that remember a dismissal; either one is enough to hide it. */
export function rememberPromoDismissed(
  storage: Pick<Storage, "setItem"> | null,
  writeCookie: (value: string) => void,
): void {
  try {
    storage?.setItem(APP_PROMO_STORAGE_KEY, "1");
  } catch {
    // Storage refused; the cookie below is the durable record.
  }
  try {
    writeCookie(`${APP_PROMO_COOKIE}=1; path=/; max-age=${APP_PROMO_COOKIE_MAX_AGE}; samesite=lax`);
  } catch {
    // Nothing else to try: the promotion simply shows again next visit.
  }
}
