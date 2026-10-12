import com.cinemax.app.NavigationPolicy;
import com.cinemax.app.NavigationPolicy.Decision;
import com.cinemax.app.SplashMotion;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * JVM unit checks for the Cinemax Android shell.
 *
 * Covers the app logic that does not need a device:
 *
 *   1. NavigationPolicy - which URLs stay in the app and which leave it.
 *   2. AppTheme         - the injection script builder, including JavaScript
 *                         escaping (a theme containing quotes, newlines or a
 *                         literal closing script tag must not break out).
 *
 * The generated injection script is written to disk so the jsdom test can run
 * the real thing against a DOM fixture.
 *
 * Runs on a plain JVM: no emulator, no JUnit, no Android runtime required.
 */
public final class CinemaxAppTest {

    private static final Decision STAY = Decision.STAY_IN_APP;
    private static final Decision LEAVE = Decision.OPEN_EXTERNALLY;
    private static final String HOST = NavigationPolicy.PRODUCTION_HOST;

    private static int checks;
    private static int failures;
    /** The android/ project directory, so tests work from any working directory. */
    private static File projectDirectory = new File(".");

    public static void main(String[] args) throws Exception {
        String outputDirectory = args.length > 0 ? args[0] : ".";
        new File(outputDirectory).mkdirs();
        if (args.length > 1) {
            projectDirectory = new File(args[1]);
        }

        navigationPolicyChecks();
        injectionChecks(outputDirectory);
        splashChecks();
        scrollPerformanceChecks();

        System.out.println();
        System.out.println("checks: " + checks + ", failures: " + failures);
        if (failures > 0) {
            System.exit(1);
        }
    }

    // ------------------------------------------------------------ navigation

    private static void navigationPolicyChecks() {
        section("NavigationPolicy");

        decide("https", HOST, STAY, "production https stays in the app");
        decide("HTTPS", "CINEMAX-ORPIN.VERCEL.APP", STAY, "host and scheme matching is case-insensitive");
        decide("https", "cinemax-orpin-git-main-raghav549.vercel.app", STAY, "Vercel preview alias stays in the app");
        decide(null, null, STAY, "relative same-origin navigation stays in the app");
        decide("about", null, STAY, "about:blank stays in the app");
        decide("blob", HOST, STAY, "blob media URLs stay in the app");
        decide("data", null, STAY, "data URLs stay in the app");
        decide("javascript", null, STAY, "javascript scheme stays in the app");

        decide("https", "www.pwabuilder.com", LEAVE, "third-party https leaves the app");
        decide("https", "notvercel.app", LEAVE, "a lookalike host leaves the app");
        decide("https", "evil-vercel.app.attacker.com", LEAVE, "a suffix-spoofing host leaves the app");
        decide("mailto", null, LEAVE, "mailto leaves the app");
        decide("tel", null, LEAVE, "tel leaves the app");
        decide("sms", null, LEAVE, "sms leaves the app");
        decide("market", null, LEAVE, "market leaves the app");
        decide("intent", null, LEAVE, "intent: leaves the app");
        decide("http", "localhost", LEAVE, "localhost is never served inside the app");
        decide("https", "localhost", LEAVE, "https localhost is never served inside the app");
        decide("http", "127.0.0.1", LEAVE, "127.0.0.1 is never served inside the app");
        decide("http", "10.0.2.2", LEAVE, "the Android emulator host is never served inside the app");

        check(NavigationPolicy.isProductionUrl("https", HOST), "the production URL is recognised for deep links");
        check(!NavigationPolicy.isProductionUrl("https", "cinemax-orpin.vercel.app.attacker.com"),
                "deep links are limited to the production host");
        check(!NavigationPolicy.isProductionUrl("http", "example.com"), "unrelated http links are not deep links");
    }

    // ------------------------------------------------------------- injection

    private static void injectionChecks(String outputDirectory) throws Exception {
        section("AppTheme injection");

        Class<?> appTheme = Class.forName("com.cinemax.app.AppTheme");
        Method buildScript = appTheme.getDeclaredMethod("buildScript", String.class);
        buildScript.setAccessible(true);

        String theme = read(asset("app-theme.css"));
        String shell = read(asset("app-shell.js"));
        String splashLayout = read(new File(projectDirectory, "app/src/main/res/layout/activity_main.xml"));
        String strings = read(new File(projectDirectory, "app/src/main/res/values/strings.xml"));

        check(theme.length() > 4000, "app-theme.css asset is present (" + theme.length() + " bytes)");
        check(!splashLayout.contains("cinemax_splash_spinner"), "the native splash has no generic spinner");
        check(!strings.contains("Starting Cinemax"), "the native splash has no generic loading copy");
        check(splashLayout.contains("com.cinemax.app.CinemaxSplashView") && splashLayout.contains("cinemax_splash_stage"),
                "the native splash hosts the layered reveal canvas");
        check(shell.length() > 2000, "app-shell.js asset is present (" + shell.length() + " bytes)");
        check(theme.contains("html[data-cinemax-app=\"android\"]"), "the theme is scoped to the app attribute");

        String script = (String) buildScript.invoke(null, theme);
        check(script.startsWith("(function(){try{"), "the injection is a self-contained IIFE");
        check(script.contains("data-cinemax-app"), "the injection marks the document as the Android app");
        check(script.contains("cinemax-native-theme"), "the injection installs the theme style element");
        check(!script.contains("createElement('script')"), "the injection relies on no inline script execution");
        check(shell.contains("(function () {") && shell.contains("__cinemaxAppShellInstalled"),
                "the shell runtime is a self-contained, single-install IIFE");
        check(!script.contains("\n</script"), "theme text cannot terminate the script element");
        check(script.indexOf("</script") < 0, "no literal closing script tag survives escaping");
        check(script.contains("sessionStorage"), "the injection suppresses the duplicate web intro");

        // Hostile inputs must not be able to break out of the generated script.
        String hostileTheme = "x');alert(1);//</script><img src=x onerror=alert(2)>\"\\\n\t@import 'evil';";
        String hostileShell = "*/</script><script>alert(3)</script>/*";
        String hostileScript = (String) buildScript.invoke(null, hostileTheme);
        check(hostileScript.indexOf("</script") < 0, "a hostile closing tag is escaped");
        check(hostileScript.indexOf("onerror=alert(2)") > 0, "a hostile payload stays inert inside the string");
        check(hostileScript.contains("x\\');alert(1)"), "the quote is backslash-escaped, so it cannot close the literal");
        check(!hostileScript.contains("\n"), "no raw newline can split the generated literal");
        write(new File(outputDirectory, "injection-script-hostile.js"), hostileScript);

        // The real media layers must carry the premium presentation rules.
        check(theme.contains("#050507"), "the theme uses the deep-black Cinemax background");
        check(theme.contains("radial-gradient"), "the theme adds colourful cinematic lighting");
        check(theme.contains("--cinemax-inset-top"), "the theme consumes the native status-bar inset");
        check(theme.contains(".bottom-nav"), "the theme restyles the bottom navigation");
        check(theme.contains(".movie-poster"), "the theme restyles the movie cards");
        check(theme.contains(".hero-title"), "the theme restyles the hero");
        check(theme.contains(".player-progress-fill"), "the theme restyles the player");
        check(theme.contains(".glass-card"), "the studio surfaces keep the same palette");
        check(theme.contains(".splash-screen"), "the theme suppresses the in-page web intro");
        check(theme.contains("prefers-reduced-motion"), "the theme still honours reduced motion");
        check(theme.contains("@media (min-width: 820px)"), "the theme scales up for tablets");

        check(shell.contains("__cinemaxInsets"), "the shell publishes device insets");
        check(shell.contains("setMediaPlaying"), "the shell reports playback to the native layer");
        check(shell.contains("__cinemaxAppShellInstalled"), "the shell installs exactly once");
        check(shell.contains("user-scalable=no"), "the shell tunes the viewport for the app");
        check(shell.contains("cinemax:player-fullscreen"), "the shell bridges player fullscreen to Android");
        check(!shell.contains("MutationObserver"), "the shell avoids a subtree observer during scrolling");

        write(new File(outputDirectory, "injection-script.js"), script);
        write(new File(outputDirectory, "shell-script.js"), shell);
    }

    // -------------------------------------------------------- splash reveal

    /**
     * The premium splash has to be a layered, transform-only reveal that cannot
     * delay startup, must keep the existing logo/typography, and must never be
     * replayed outside a real app launch. The timeline itself is pure arithmetic
     * (SplashMotion), so it is verified here frame by frame rather than by
     * looking at a device.
     */
    private static void splashChecks() throws Exception {
        section("native splash reveal (SplashMotion)");

        long reveal = SplashMotion.REVEAL_MILLIS;
        check(reveal >= 900L && reveal <= 1400L, "the reveal is a short clip (" + reveal + " ms)");
        check(SplashMotion.HANDOFF_MIN_VISIBLE_MILLIS <= reveal,
                "the hand-off never waits longer than the reveal itself");
        check(SplashMotion.HANDOFF_FADE_MILLIS <= 500L,
                "the hand-off cross-fade is quick (" + SplashMotion.HANDOFF_FADE_MILLIS + " ms)");
        check(SplashMotion.layerCount() >= 10, "the reveal is layered (" + SplashMotion.layerCount() + " layers)");

        boolean allFinish = true;
        for (int layer = 0; layer < SplashMotion.layerCount(); layer++) {
            if (SplashMotion.end(layer) > reveal || SplashMotion.duration(layer) <= 0L) {
                allFinish = false;
            }
        }
        check(allFinish, "every layer finishes inside the reveal clip");

        check(SplashMotion.delay(SplashMotion.LAYER_RIBBON) < SplashMotion.delay(SplashMotion.LAYER_FOLD),
                "the emblem's ribbon arrives before the fold");
        check(SplashMotion.delay(SplashMotion.LAYER_SHEEN) > SplashMotion.delay(SplashMotion.LAYER_RIBBON),
                "the light sweep crosses the emblem only after it has arrived");
        check(SplashMotion.delay(SplashMotion.LAYER_WORDMARK) > SplashMotion.delay(SplashMotion.LAYER_RIBBON),
                "the wordmark follows the emblem");
        check(SplashMotion.end(SplashMotion.LAYER_TAGLINE) == reveal,
                "the tagline settles exactly at the end of the reveal");
        check(SplashMotion.delay(SplashMotion.LAYER_STREAK_A) < SplashMotion.delay(SplashMotion.LAYER_WORDMARK)
                        && SplashMotion.delay(SplashMotion.LAYER_STREAK_B) < SplashMotion.delay(SplashMotion.LAYER_WORDMARK),
                "both light streaks travel while the logo is still revealing");
        check(SplashMotion.end(SplashMotion.LAYER_RING_OUTER) == reveal
                        && SplashMotion.end(SplashMotion.LAYER_RING_ARC) == reveal,
                "the expanding rings are the longest running layer");

        // Progress is clamped, starts at zero and is monotonic per layer.
        boolean progressOk = true;
        for (int layer = 0; layer < SplashMotion.layerCount(); layer++) {
            if (SplashMotion.progress(0L, layer) != 0f && SplashMotion.delay(layer) > 0L) {
                progressOk = false;
            }
            if (SplashMotion.progress(reveal, layer) != 1f) {
                progressOk = false;
            }
            float previous = -1f;
            for (long t = 0L; t <= reveal; t += 40L) {
                float value = SplashMotion.progress(t, layer);
                if (value < previous || value < 0f || value > 1f) {
                    progressOk = false;
                    break;
                }
                previous = value;
            }
        }
        check(progressOk, "layer progress is clamped and monotonic");

        check(SplashMotion.handoffReady(SplashMotion.HANDOFF_READY_MILLIS)
                        && !SplashMotion.handoffReady(SplashMotion.HANDOFF_READY_MILLIS - 20L),
                "the page may take over once the lockup has landed");
        check(!SplashMotion.revealComplete(reveal - 20L) && SplashMotion.revealComplete(reveal),
                "the reveal reports completion at its last frame");

        boolean easingOk = true;
        for (int step = 0; step <= 100; step++) {
            float t = step / 100f;
            if (SplashMotion.easeOutCubic(t) < 0f || SplashMotion.easeInOutSine(t) < 0f
                    || SplashMotion.easeOutQuint(t) < 0f || SplashMotion.easeInOutCubic(t) < 0f) {
                easingOk = false;
            }
        }
        check(easingOk, "easings stay in range for the whole clip");
        check(SplashMotion.easeOutCubic(0f) == 0f && Math.abs(SplashMotion.easeOutCubic(1f) - 1f) < 0.0001f,
                "easings are anchored at both ends");
        check(SplashMotion.easeOutBack(0.72f) > 1f, "the emblem lands with a small overshoot");
        check(SplashMotion.clamp01(-4f) == 0f && SplashMotion.clamp01(9f) == 1f, "clamp is defensive");

        // Ring/sheen/streak curves: silent at the ends, present in the middle.
        check(SplashMotion.ringAlpha(0.5f, 0f) == 0f
                        && SplashMotion.ringAlpha(0.5f, 1f) < 0.02f
                        && SplashMotion.ringAlpha(0.5f, 0.2f) > 0.4f,
                "a ring fades in, peaks early and dissolves");
        check(SplashMotion.ringScale(0.5f, 1.6f, 0f) < 0.6f && SplashMotion.ringScale(0.5f, 1.6f, 1f) > 1.5f,
                "rings expand outwards across the whole clip");
        check(SplashMotion.sheenAlpha(0.3f, 0f) == 0f && SplashMotion.sheenAlpha(0.3f, 1f) < 0.02f
                        && SplashMotion.sheenAlpha(0.3f, 0.35f) > 0.25f,
                "the light sweep crosses the emblem once and disappears");
        check(SplashMotion.streakAlpha(0.5f, 0f) == 0f && SplashMotion.streakAlpha(0.5f, 1f) == 0f
                        && SplashMotion.streakAlpha(0.5f, 0.4f) > 0.4f,
                "streaks fade in on approach and out on departure");
        check(SplashMotion.arcHeadAlpha(0.9f, 0f) == 0f && SplashMotion.arcHeadAlpha(0.9f, 1f) > 0.3f,
                "the aperture arc keeps a travelling light head");
        check(SplashMotion.breathScale(reveal - 1L) == 1f
                        && Math.abs(SplashMotion.breathScale(reveal + 650L) - 1f) <= 0.03f,
                "the idle halo only breathes by a couple of percent");
        check(Math.abs(SplashMotion.wordmarkLetterSpacing(0.085f, -0.055f, 1f) + 0.055f) < 0.0001f,
                "the wordmark settles on the brand's tight tracking");
        check(SplashMotion.irisRotation(-9f, 4f, 1f) > 3.5f, "the aperture blades finish their rotation");
        check(SplashMotion.emblemLift(0f) == 1f && SplashMotion.emblemLift(1f) == 0f
                        && SplashMotion.emblemLift(0.4f) > SplashMotion.emblemLift(0.6f),
                "the lockup starts at the launch position and settles into place");

        section("native splash resources and launch gating");

        String layout = read(new File(projectDirectory, "app/src/main/res/layout/activity_main.xml"));
        String mainActivity = read(new File(projectDirectory, "app/src/main/java/com/cinemax/app/MainActivity.java"));
        String splashView = read(new File(projectDirectory, "app/src/main/java/com/cinemax/app/CinemaxSplashView.java"));
        String emblem = read(new File(projectDirectory, "app/src/main/res/drawable/cinemax_emblem.xml"));
        String ribbon = read(new File(projectDirectory, "app/src/main/res/drawable/cinemax_emblem_ribbon.xml"));
        String fold = read(new File(projectDirectory, "app/src/main/res/drawable/cinemax_emblem_fold.xml"));
        String styles = read(new File(projectDirectory, "app/src/main/res/values/styles.xml"));

        check(layout.contains("com.cinemax.app.CinemaxSplashView"), "the splash stage is a single composited view");
        check(layout.contains("android:background=\"@color/cinemax_ink\""),
                "the splash layer stays a flat brand canvas (no gradient stack to composite)");
        check(!layout.contains("cinemax_splash_glow") && !layout.contains("cinemax_splash_streak_one"),
                "the old static splash view stack is gone");
        check(splashView.contains("setContentDescription"), "the splash exposes an accessibility label");
        check(splashView.contains("ANIMATOR_DURATION_SCALE"),
                "the reveal honours the system animation scale (reduced motion)");
        check(splashView.contains("splash_lockup_desc"), "the splash lockup has a brand description");
        check(styles.contains("CinemaxWordmark") && styles.contains("sans-serif-light"),
                "the existing wordmark style is preserved");
        check(splashView.contains("cinemax/fonts/outfit-550.ttf"),
                "the splash wordmark uses the website's Outfit brand font");
        check(splashView.contains("revealLift") && splashView.contains("emblemLift"),
                "the reveal starts at the launch position and rises into the lockup");

        // The two reveal halves must be exactly the emblem's artwork.
        String ribbonPath = pathDataOf(emblem, 0);
        String foldPath = pathDataOf(emblem, 1);
        check(ribbonPath.length() > 40 && foldPath.length() > 40, "the emblem exposes its two light ribbons");
        check(ribbon.contains(ribbonPath) && fold.contains(foldPath),
                "the layered splash drawables reuse the emblem paths verbatim");
        check(!ribbon.contains(foldPath) && !fold.contains(ribbonPath),
                "the two emblem layers carry the same artwork, not swapped copies");
        check(ribbon.contains("70E0FF") && fold.contains("FF65AE"),
                "both emblem layers keep the original brand gradients");

        File font = new File(projectDirectory, "app/src/main/assets/cinemax/fonts/outfit-550.ttf");
        check(font.isFile() && font.length() > 4096,
                "the brand wordmark font is packaged (" + (font.isFile() ? font.length() : 0) + " bytes)");
        check(new File(projectDirectory, "app/src/main/assets/cinemax/fonts/OUTFIT-LICENSE.txt").isFile(),
                "the bundled font ships with its SIL OFL licence");

        // Launch gating: the reveal plays once, on a genuine launch only.
        int introUses = countOccurrences(mainActivity, "CinemaxSplashView.MODE_INTRO");
        check(introUses == 1, "the animated intro is requested from exactly one place");
        check(mainActivity.contains("savedInstanceState == null"),
                "the animated intro is limited to a genuine app launch");
        check(mainActivity.contains("CinemaxSplashView.MODE_HOLD"),
                "reloads show the still frame instead of replaying the intro");
        check(mainActivity.contains("showReloadingVeil"),
                "offline retry and renderer restarts use the quiet reloading veil");
        check(mainActivity.contains("splashStage.setRevealListener"),
                "the page takes over as soon as the lockup has landed");
        check(!mainActivity.contains("playSplashIntro"),
                "the old view-stack splash animation is gone");
        check(mainActivity.contains("splashStage.freeze()"),
                "the timeline freezes before the hand-off (the fade costs no drawing)");
        check(!splashView.contains("ValueAnimator.ofFloat(0f, 1f).setDuration(0)"),
                "the reveal is never instant");
    }

    // ------------------------------------------------- scroll performance

    /**
     * Every rule below exists because of a specific cause of WebView scrolling
     * jank or of a sudden layout jump during scroll. Asserting them in the suite
     * keeps them from being "cleaned up" later.
     */
    private static void scrollPerformanceChecks() throws Exception {
        section("scroll performance (native + injected layer)");

        String mainActivity = read(new File(projectDirectory, "app/src/main/java/com/cinemax/app/MainActivity.java"));
        String theme = read(asset("app-theme.css"));
        String shell = read(asset("app-shell.js"));

        // Native WebView configuration.
        check(mainActivity.contains("setLoadWithOverviewMode(false)"),
                "the WebView honours the page viewport instead of re-fitting it (no scale jumps)");
        check(!mainActivity.contains("setLayerType(View.LAYER_TYPE_HARDWARE"),
                "the WebView is not forced into a single hardware layer (keeps tiled compositing)");
        check(mainActivity.contains("setOffscreenPreRaster(false)"),
                "offscreen content is not pre-rasterised (memory + raster time)");
        check(mainActivity.contains("setRendererPriorityPolicy"),
                "the renderer stays at foreground priority while the app is visible");
        check(mainActivity.contains("RENDERER_PRIORITY_WAIVED"),
                "the renderer priority is released in the background");
        check(mainActivity.contains("onTrimMemory") && mainActivity.contains("freeMemory()"),
                "WebView caches are trimmed when the platform reports pressure");
        check(mainActivity.contains("pushedInsetTop") && mainActivity.contains("insetsPublished"),
                "unchanged window insets are never pushed into the page (no idle JS work)");
        check(mainActivity.contains("SCROLL") || mainActivity.contains("splashStage.minimumVisibleMillis()"),
                "the splash hand-off is driven by the page, not by a fixed startup delay");

        // Injected stylesheet: the actual scroll-jank fixes.
        check(theme.contains("content-visibility: visible"),
                "rails are no longer skipped with content-visibility (no mid-scroll layout)");
        check(theme.contains("contain-intrinsic-size: auto none"),
                "the 390px rail estimate can no longer shift the document height");
        check(theme.contains("contain: layout style"), "rails isolate their own layout invalidation");
        check(theme.contains("scroll-behavior: auto"),
                "document scrolling is immediate on Android (rails keep their own smooth scroll)");
        check(theme.contains("[data-cinemax-scrolling=\"true\"]"),
                "the theme reacts to the scrolling state published by the shell");
        check(theme.contains("animation-play-state: paused"),
                "decorative animations park while the page is scrolling");
        check(theme.contains("touch-action: auto"),
                "rails keep both pan axes on the compositor");
        check(!theme.contains("filter: blur") && !theme.contains("will-change"),
                "the scroll layer adds no new GPU/repaint hotspots of its own");
        check(!theme.contains("backdrop-filter"), "no backdrop blur is added to the app layer");

        // Injected runtime: one passive listener, no per-card wiring.
        check(shell.contains("data-cinemax-scrolling"), "the shell publishes the scrolling state");
        check(shell.contains("installScrollEngine"), "the shell owns a single scroll coordinator");
        check(shell.contains("{ passive: true }"), "the scroll listener is passive");
        check(shell.contains("requestAnimationFrame(scrollTick)"),
                "the scroll state is coalesced to one animation frame");
        check(!shell.contains("touch-action:pan-x"), "rails no longer force vertical pans to the main thread");
        check(shell.contains("runArtworkWarmup") && shell.contains("requestIdleCallback"),
                "artwork just ahead of the viewport is decoded during idle time");
        check(shell.contains("image.decode()"), "images are decoded through the browser's own decoder cache");
        check(shell.contains("saveData"), "the warm-up respects data-saving connections");
        check(shell.contains("SCROLL_IDLE_MILLIS"), "the scrolling state clears when the gesture stops");
        check(!shell.contains("addEventListener(\"scroll\", onScroll, false)"),
                "no blocking scroll listener was introduced");
    }

    // ---------------------------------------------------------------- utils

    private static void section(String name) {
        System.out.println();
        System.out.println("== " + name);
    }

    private static void decide(String scheme, String host, Decision expected, String label) {
        Decision actual = NavigationPolicy.decide(scheme, host);
        check(actual == expected, label + " (expected " + expected + ", got " + actual + ")");
    }

    private static void check(boolean condition, String label) {
        checks++;
        if (condition) {
            System.out.println("  ok   " + label);
        } else {
            failures++;
            System.out.println("  FAIL " + label);
        }
    }

    private static File asset(String name) {
        return new File(new File(projectDirectory, "app/src/main/assets/cinemax"), name);
    }

    /** Nth `android:pathData="..."` value of a vector drawable. */
    private static String pathDataOf(String vector, int index) {
        String marker = "android:pathData=\"";
        int cursor = -1;
        for (int found = 0; found <= index; found++) {
            cursor = vector.indexOf(marker, cursor + 1);
            if (cursor < 0) {
                return "";
            }
        }
        int start = cursor + marker.length();
        int end = vector.indexOf('"', start);
        return end > start ? vector.substring(start, end) : "";
    }

    private static int countOccurrences(String haystack, String needle) {
        if (needle.isEmpty()) {
            return 0;
        }
        int count = 0;
        int cursor = haystack.indexOf(needle);
        while (cursor >= 0) {
            count++;
            cursor = haystack.indexOf(needle, cursor + needle.length());
        }
        return count;
    }

    private static String read(File file) throws Exception {
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    private static void write(File file, String content) throws Exception {
        try (Writer writer = new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8)) {
            writer.write(content);
        }
    }
}
