package com.cinemax.app;

/**
 * Where a URL is allowed to be handled - pure logic, no Android types, so it can
 * be unit tested on the JVM.
 *
 * The Cinemax deployment (including its API routes, studio login and playback
 * endpoints) stays inside the app so navigation, authentication cookies and the
 * existing player all behave exactly as they do in a browser. Everything else
 * is handed to the system, which is what a user expects from a native app.
 */
public final class NavigationPolicy {

    /** Production deployment host - never localhost, never a dev/preview server. */
    public static final String PRODUCTION_HOST = "cinemax-orpin.vercel.app";

    /** Vercel preview aliases of the same deployment. */
    private static final String VERCEL_SUFFIX = ".vercel.app";

    private NavigationPolicy() {
    }

    /** Decision for one navigation request. */
    public enum Decision {
        /** Load inside the app WebView. */
        STAY_IN_APP,
        /** Open with the system (browser, mail client, dialer, store, ...). */
        OPEN_EXTERNALLY,
        /**
         * Cancel the navigation entirely. Reserved for dangerous schemes
         * (javascript:, data:, file:, vbscript:, content:) that must never be
         * loaded in the privileged WebView nor handed to another app.
         */
        BLOCK
    }

    public static Decision decide(String scheme, String host) {
        String normalizedScheme = normalize(scheme);
        String normalizedHost = normalize(host);

        if (normalizedScheme.isEmpty()) {
            // Relative / same-document navigation (about:blank, blob:).
            return Decision.STAY_IN_APP;
        }
        if ("javascript".equals(normalizedScheme)
                || "data".equals(normalizedScheme)
                || "file".equals(normalizedScheme)
                || "vbscript".equals(normalizedScheme)
                || "content".equals(normalizedScheme)) {
            // Untrusted input can never make the privileged WebView execute
            // script URLs, render data: documents or read local files.
            return Decision.BLOCK;
        }
        if ("about".equals(normalizedScheme) || "blob".equals(normalizedScheme)) {
            // about:blank and blob media documents are same-context only.
            return Decision.STAY_IN_APP;
        }
        if ("http".equals(normalizedScheme) || "https".equals(normalizedScheme)) {
            if (isCinemaxHost(normalizedHost)) {
                return Decision.STAY_IN_APP;
            }
            return Decision.OPEN_EXTERNALLY;
        }
        // tel:, mailto:, sms:, market:, intent:, whatsapp:, custom schemes ...
        return Decision.OPEN_EXTERNALLY;
    }

    /** True for the production host and its Vercel aliases. */
    public static boolean isCinemaxHost(String host) {
        String normalizedHost = normalize(host);
        if (normalizedHost.isEmpty()) {
            return false;
        }
        return PRODUCTION_HOST.equals(normalizedHost) || normalizedHost.endsWith(VERCEL_SUFFIX);
    }

    /** True for one of the canonical production entry points. */
    public static boolean isProductionUrl(String scheme, String host) {
        return ("https".equals(normalize(scheme)) || "http".equals(normalize(scheme)))
                && PRODUCTION_HOST.equals(normalize(host));
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }
}
