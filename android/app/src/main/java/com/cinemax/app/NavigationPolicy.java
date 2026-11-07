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

    /**
     * The official production host - never localhost, never a dev/preview server.
     *
     * The app is a WebView around this one site, so this is also the host every
     * share link points at and the host declared for Android App Links.
     */
    public static final String PRODUCTION_HOST = "cinemaxtv.space";

    /** The deployment hostname used by earlier builds; still handled in-app. */
    private static final String LEGACY_HOST = "cinemax-orpin.vercel.app";

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

    /**
     * Decision for a navigation that happens inside a sub-frame: an embedded
     * provider player (iframe) that Cinemax shows with the provider's own
     * controls.
     *
     * The main-frame policy must not be applied here. A provider's player
     * routinely navigates its own frame - server-side redirects between its
     * hosts (`/e/{id}` to `/v/{id}`, CDN or consent hops), region fail-over,
     * gesture-driven reloads - and each of those lands in
     * {@code shouldOverrideUrlLoading} with {@code isForMainFrame() == false}.
     * Treating them as "third-party, open externally" cancels the frame's own
     * navigation (the player then looks like a dead or buffering server inside
     * Cinemax while the same page works in a browser) and throws the user into
     * the system browser on top of it.
     *
     * So, inside a frame:
     *   - http(s) navigation to any host stays in the frame (the provider's
     *     infrastructure handles it, exactly as a browser would);
     *   - dangerous schemes are still cancelled outright;
     *   - every other scheme (intent:, market:, custom app schemes - typically
     *     ad or redirect scripts inside a third-party frame) is cancelled
     *     without being handed to another app. A frame must never be able to
     *     launch arbitrary apps or leave Cinemax on the viewer's behalf.
     */
    public static Decision decideForSubFrame(String scheme) {
        String normalizedScheme = normalize(scheme);
        if (normalizedScheme.isEmpty()
                || "http".equals(normalizedScheme)
                || "https".equals(normalizedScheme)
                || "about".equals(normalizedScheme)
                || "blob".equals(normalizedScheme)) {
            return Decision.STAY_IN_APP;
        }
        return Decision.BLOCK;
    }

    /**
     * True for the official host, its www form, the deployment hostname earlier
     * versions were built against, and Vercel preview aliases of the deployment.
     * Everything else is handed to the system.
     */
    public static boolean isCinemaxHost(String host) {
        String normalizedHost = normalize(host);
        if (normalizedHost.isEmpty()) {
            return false;
        }
        return PRODUCTION_HOST.equals(normalizedHost)
                || ("www." + PRODUCTION_HOST).equals(normalizedHost)
                || LEGACY_HOST.equals(normalizedHost)
                || normalizedHost.endsWith(VERCEL_SUFFIX);
    }

    /**
     * Website-only documents: licensing, copyright, attributions, disclaimer and
     * privacy. They are part of the website (discovery, legal record) and are
     * deliberately not part of this app, so the app neither renders them nor
     * hands them to a browser: a request for one is cancelled and the visitor
     * stays on the page they were reading.
     */
    private static final String[] WEBSITE_ONLY_ROOTS = {
            "/license",
            "/copyright",
            "/attributions",
            "/disclaimer",
            "/privacy",
    };

    /**
     * True when the path belongs to a website-only document.
     *
     * Matched per path segment, so "/license" and "/license/" are the document
     * itself while "/licenses-of-movies" or "/share/license" are not.
     */
    public static boolean isWebsiteOnlyPath(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        String candidate = path.trim().toLowerCase();
        int query = candidate.indexOf('?');
        if (query >= 0) {
            candidate = candidate.substring(0, query);
        }
        int fragment = candidate.indexOf('#');
        if (fragment >= 0) {
            candidate = candidate.substring(0, fragment);
        }
        if (!candidate.startsWith("/")) {
            candidate = "/" + candidate;
        }
        while (candidate.length() > 1 && candidate.endsWith("/")) {
            candidate = candidate.substring(0, candidate.length() - 1);
        }
        for (String root : WEBSITE_ONLY_ROOTS) {
            if (candidate.equals(root)) {
                return true;
            }
        }
        return false;
    }

    /** True for one of the canonical production entry points (the App Link hosts). */
    public static boolean isProductionUrl(String scheme, String host) {
        String normalizedHost = normalize(host);
        return ("https".equals(normalize(scheme)) || "http".equals(normalize(scheme)))
                && (PRODUCTION_HOST.equals(normalizedHost) || ("www." + PRODUCTION_HOST).equals(normalizedHost));
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }
}
