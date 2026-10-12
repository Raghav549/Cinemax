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
     * The splash shows one thing: the existing Cinemax logo. No wordmark, no
     * tagline, no ring, orbit, dot, streak or spinner may come back into it, and
     * that is asserted here as deliberately as the choreography is - "remove the
     * clutter" is the point of the redesign.
     *
     * Everything the reveal does is pure arithmetic (SplashMotion) or pure
     * geometry (SplashMotion.layout), so the whole gesture is checked on the JVM:
     * frame by frame for the timeline, screen by screen for the logo.
     */
    private static void splashChecks() throws Exception {
        section("native splash reveal (SplashMotion)");

        long reveal = SplashMotion.REVEAL_MILLIS;
        check(reveal >= 900L && reveal <= 1200L, "the reveal is a short clip (" + reveal + " ms)");
        check(SplashMotion.HANDOFF_MIN_VISIBLE_MILLIS <= reveal,
                "the hand-off never waits longer than the reveal itself");
        check(SplashMotion.HANDOFF_FADE_MILLIS <= 500L,
                "the hand-off cross-fade is quick (" + SplashMotion.HANDOFF_FADE_MILLIS + " ms)");
        check(SplashMotion.HANDOFF_READY_MILLIS <= reveal,
                "the page can take over inside the clip, never after it");
        check(SplashMotion.layerCount() == 5,
                "the reveal is exactly the five designed layers (was " + SplashMotion.layerCount() + ")");

        boolean allFinish = true;
        for (int layer = 0; layer < SplashMotion.layerCount(); layer++) {
            if (SplashMotion.end(layer) > reveal || SplashMotion.duration(layer) <= 0L) {
                allFinish = false;
            }
        }
        check(allFinish, "every layer finishes inside the reveal clip");

        check(SplashMotion.end(SplashMotion.LAYER_GLOW) == reveal,
                "the glow settling onto its resting level is the last thing to move");
        check(SplashMotion.delay(SplashMotion.LAYER_GLOW) < SplashMotion.delay(SplashMotion.LAYER_LOGO),
                "the light around the logo comes up before the logo itself");
        check(SplashMotion.delay(SplashMotion.LAYER_DEPTH) == SplashMotion.delay(SplashMotion.LAYER_LOGO)
                        && SplashMotion.end(SplashMotion.LAYER_DEPTH) <= SplashMotion.end(SplashMotion.LAYER_LOGO),
                "the depth bed under the logo is settled as the logo lands");
        check(SplashMotion.delay(SplashMotion.LAYER_SWEEP) > SplashMotion.delay(SplashMotion.LAYER_LOGO),
                "the light sweep crosses the logo only after it has arrived");
        check(SplashMotion.end(SplashMotion.LAYER_SWEEP) <= SplashMotion.HANDOFF_READY_MILLIS,
                "the page can only take over once the light has finished crossing the logo");
        check(SplashMotion.HANDOFF_READY_MILLIS >= SplashMotion.HANDOFF_MIN_VISIBLE_MILLIS,
                "the hand-off gate is the landed logo + finished sweep, not an arbitrary wait");

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
            for (long t = 0L; t <= reveal; t += 20L) {
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
                "the page may take over the moment the logo and the light have landed");
        check(!SplashMotion.revealComplete(reveal - 20L) && SplashMotion.revealComplete(reveal),
                "the reveal reports completion at its last frame");

        boolean easingOk = true;
        for (int step = 0; step <= 100; step++) {
            float t = step / 100f;
            float out = SplashMotion.easeOutCubic(t);
            float sine = SplashMotion.easeInOutSine(t);
            if (out < 0f || out > 1f || sine < 0f || sine > 1f) {
                easingOk = false;
            }
        }
        check(easingOk, "the easings stay in range for the whole clip");
        check(SplashMotion.easeOutCubic(0f) == 0f
                        && Math.abs(SplashMotion.easeOutCubic(1f) - 1f) < 0.0001f
                        && SplashMotion.easeOutCubic(0.5f) > 0.5f,
                "the arrival ease is anchored at both ends and settles late");
        check(SplashMotion.clamp01(-4f) == 0f && SplashMotion.clamp01(9f) == 1f, "clamp is defensive");
        check(Math.abs(SplashMotion.lerp(10f, 20f, 0.25f) - 12.5f) < 0.0001f, "lerp interpolates");

        // The logo is already lit on the cold-start surface, so it brightens to
        // full instead of fading in from nothing: the hand-over from the launch
        // window to the reveal is continuous rather than a blink.
        check(SplashMotion.logoAlpha(0f) >= 0.8f && SplashMotion.logoAlpha(0f) < 1f
                        && SplashMotion.logoAlpha(SplashMotion.LOGO_ALPHA_FULL_AT) == 1f
                        && SplashMotion.logoAlpha(1f) == 1f,
                "the logo is already lit when the reveal starts and reaches full opacity early");
        check(SplashMotion.logoScale(0f, 0.9f) < 1f && SplashMotion.logoScale(0f, 1f) == 1f
                        && SplashMotion.logoScale(1f, 0.9f) == 1f
                        && SplashMotion.logoScale(0.5f, 0.9f) > SplashMotion.logoScale(0.2f, 0.9f)
                        && SplashMotion.logoScale(0f, 0.05f) >= SplashMotion.LOGO_SCALE_FROM_MIN,
                "the logo dollies onto its exact size - no bounce, no overshoot");
        check(SplashMotion.logoScaleFrom(367f, 2.75f) < 1f
                        && SplashMotion.logoScaleFrom(367f, 2.75f) > SplashMotion.LOGO_SCALE_FROM_MIN,
                "on a normal phone the dolly starts at the size the launch surface drew");
        check(SplashMotion.logoScaleFrom(32f, 2f) == 1f && SplashMotion.logoScaleFrom(0f, 2f) == 1f
                        && SplashMotion.logoScaleFrom(900f, 2f) == SplashMotion.LOGO_SCALE_FROM_MIN,
                "the start size is clamped: the logo never starts larger than it ends, "
                        + "and never shrinks past the dolly limit");
        check(SplashMotion.GLOW_WIDTH_FACTOR > 1f && SplashMotion.GLOW_HEIGHT_FACTOR < 1f
                        && SplashMotion.GLOW_LIFT_FACTOR > 0f,
                "the light pool is a lifted ellipse, not a circular spotlight");

        // The glow blooms, then settles onto a calm - but still lit - level. That
        // resting level is what lets the finished splash stop drawing frames.
        check(SplashMotion.glowAlpha(0f) == 0f
                        && SplashMotion.glowAlpha(SplashMotion.GLOW_SETTLE_AT) > SplashMotion.glowAlpha(1f)
                        && SplashMotion.glowAlpha(1f) >= 0.2f
                        && SplashMotion.glowAlpha(1f) <= SplashMotion.GLOW_PEAK_ALPHA,
                "the glow settles onto a calm resting level instead of switching off");
        boolean glowScaleOk = true;
        float glowPeak = 0f;
        for (int step = 0; step <= 100; step++) {
            float value = SplashMotion.glowScale(step / 100f);
            if (value <= 0f || value > 1.10f) {
                glowScaleOk = false;
            }
            glowPeak = Math.max(glowPeak, value);
        }
        check(glowScaleOk, "the glow never flashes wider than a few percent of its rest size");
        check(Math.abs(SplashMotion.glowScale(1f) - 1f) < 0.0001f && glowPeak > 1f,
                "the glow blooms just past its rest size and eases back onto it");

        check(SplashMotion.ambientAlpha(0f) == 0f && SplashMotion.ambientAlpha(1f) == 1f,
                "the background lighting comes up and then stays exactly where it is");
        check(SplashMotion.depthAlpha(0f) == 0f && SplashMotion.depthAlpha(1f) > 0f
                        && SplashMotion.depthAlpha(1f) <= 0.6f
                        && SplashMotion.DEPTH_RADIUS_FACTOR
                        < SplashMotion.GLOW_RADIUS_FACTOR * SplashMotion.GLOW_HEIGHT_FACTOR,
                "the depth bed under the logo stays subtle and inside the light pool");

        // The sweep: one crossing, gone by the end, and its offscreen layer only
        // exists while the band can actually touch the artwork.
        check(SplashMotion.sweepAlpha(0f) == 0f && SplashMotion.sweepAlpha(1f) < 0.02f
                        && SplashMotion.sweepAlpha(0.32f) > 0.4f,
                "the light crosses the logo once and is gone");
        check(Math.abs(SplashMotion.sweepTravel(0f) + SplashMotion.SWEEP_TRAVEL) < 0.0001f
                        && Math.abs(SplashMotion.sweepTravel(1f) - SplashMotion.SWEEP_TRAVEL) < 0.0001f
                        && SplashMotion.sweepTravel(0.5f) > SplashMotion.sweepTravel(0.25f),
                "the light travels across the whole logo, once, in one direction");
        check(!SplashMotion.sweepOverLogo(SplashMotion.sweepTravel(0f))
                        && SplashMotion.sweepOverLogo(SplashMotion.sweepTravel(0.5f))
                        && !SplashMotion.sweepOverLogo(SplashMotion.sweepTravel(1f)),
                "the sweep's offscreen layer exists only while the light touches the logo");
        int bandFrames = 0;
        int sampled = 0;
        for (int step = 0; step <= 200; step++) {
            sampled++;
            if (SplashMotion.sweepOverLogo(SplashMotion.sweepTravel(step / 200f))) {
                bandFrames++;
            }
        }
        check(bandFrames * 2 < sampled,
                "the light is on the logo for less than half the clip (" + bandFrames + "/" + sampled + ")");

        splashGeometryChecks();
        splashResourceChecks();
    }

    /**
     * "Complete logo, correctly centred, on every screen size" is a property
     * rather than a screenshot: the layout maths is checked against a spread of
     * real viewports (legacy small phone, current phones, landscape, tablets) and
     * densities, including the bounds the size rule promises.
     */
    private static void splashGeometryChecks() {
        section("native splash geometry (the logo on every screen size)");

        int[][] sizes = {
                {240, 320},   // legacy small
                {320, 480},   // small phone
                {360, 640},
                {360, 800},
                {393, 851},
                {411, 891},   // current phone
                {412, 915},
                {480, 800},
                {600, 1024},  // tablet
                {800, 1280},
                {1280, 800},  // landscape tablet
                {915, 412},   // landscape phone
                {1440, 3120},
        };
        float[] densities = {1f, 1.5f, 2f, 2.75f, 3.5f};

        boolean centred = true;
        boolean fits = true;
        boolean sized = true;
        boolean glowFits = true;
        boolean spritesSane = true;
        for (int[] size : sizes) {
            for (float density : densities) {
                int width = size[0];
                int height = size[1];
                float smallest = Math.min(width, height);
                SplashMotion.Layout layout = SplashMotion.layout(width, height, density);
                if (Math.abs(layout.centreX - width / 2f) > 0.001f
                        || Math.abs(layout.centreY - height / 2f) > 0.001f) {
                    centred = false;
                }
                // The complete artwork, with the margin the size rule promises.
                if (layout.logoMarginX() < smallest * 0.15f || layout.logoMarginY() < smallest * 0.15f
                        || layout.logoSize > smallest * SplashMotion.LOGO_MAX_FRACTION + 0.001f) {
                    fits = false;
                }
                // Never below the readability floor (104 dp) and never above
                // the boldness ceiling (176 dp), and always inside the 40% cap.
                float floorPx = Math.min(density * SplashMotion.LOGO_MIN_DP,
                        smallest * SplashMotion.LOGO_MAX_FRACTION);
                float ceilingPx = Math.min(density * SplashMotion.LOGO_MAX_DP,
                        smallest * SplashMotion.LOGO_MAX_FRACTION);
                if (layout.logoSize < floorPx - 0.001f || layout.logoSize > ceilingPx + 0.001f) {
                    sized = false;
                }
                // The glow is part of the composition, so it has to fit as well.
                if (layout.centreX - layout.glowRadius < 0f || layout.centreY - layout.glowRadius < 0f) {
                    glowFits = false;
                }
                if (layout.glowSpriteSide < 160 || layout.glowSpriteSide > 384
                        || layout.ambientSpriteWidth < 96 || layout.ambientSpriteWidth > 384
                        || layout.ambientSpriteHeight < 96 || layout.ambientSpriteHeight > 384) {
                    spritesSane = false;
                }
            }
        }
        check(centred, "the logo is centred on both axes for " + sizes.length + " screen sizes x "
                + densities.length + " densities");
        check(fits, "the complete logo always fits, with at least a 30% margin");
        check(sized, "the logo size always sits between the readability floor (104 dp) and the"
                + " boldness ceiling (176 dp), inside the 40% cap");
        check(glowFits, "the glow around the logo stays inside the screen too");
        check(spritesSane, "the pre-rendered light sprites stay small enough to build in one frame");

        SplashMotion.Layout phone = SplashMotion.layout(1080, 2280, 2.75f);
        float smallestPx = Math.min(1080, 2280);
        check(Math.abs(phone.logoSize - smallestPx * SplashMotion.LOGO_FRACTION) < 0.5f,
                "in the normal range the logo is exactly " + Math.round(SplashMotion.LOGO_FRACTION * 100f)
                        + "% of the shorter screen edge (" + Math.round(phone.logoSize / 2.75f) + " dp on a 393 dp phone)");
        SplashMotion.Layout smallPhone = SplashMotion.layout(720, 1280, 2f);
        check(Math.abs(smallPhone.logoSize - 720 * SplashMotion.LOGO_FRACTION) < 0.001f
                        && smallPhone.logoSize > SplashMotion.LOGO_MIN_DP * 2f,
                "a 360 dp phone gets the same rule (" + Math.round(smallPhone.logoSize / 2f) + " dp)");
        check(phone.glowRadius < phone.centreX && phone.glowRadius < phone.centreY,
                "the glow radius is bounded by the screen, not by the logo size");
        SplashMotion.Layout tiny = SplashMotion.layout(240, 320, 1f);
        check(tiny.logoSize <= 240 * SplashMotion.LOGO_MAX_FRACTION + 0.001f,
                "even on a legacy 240 x 320 screen the logo keeps its margin");
    }

    /**
     * The parts of the contract that live in resources: the logo is the only
     * thing the reveal draws (no text, rings, dots, streaks or blur anywhere in
     * it), the soft light is pre-rendered rather than drawn per frame, and the
     * reveal still runs on a genuine cold launch only.
     */
    private static void splashResourceChecks() throws Exception {
        section("native splash resources and launch gating");

        String layout = read(new File(projectDirectory, "app/src/main/res/layout/activity_main.xml"));
        String mainActivity = read(new File(projectDirectory, "app/src/main/java/com/cinemax/app/MainActivity.java"));
        String splashView = withoutComments(
                read(new File(projectDirectory, "app/src/main/java/com/cinemax/app/CinemaxSplashView.java")));
        String motion = withoutComments(
                read(new File(projectDirectory, "app/src/main/java/com/cinemax/app/SplashMotion.java")));
        String emblem = read(new File(projectDirectory, "app/src/main/res/drawable/cinemax_emblem.xml"));
        String windowBackground = read(new File(projectDirectory, "app/src/main/res/drawable/cinemax_window_background.xml"));
        String strings = read(new File(projectDirectory, "app/src/main/res/values/strings.xml"));
        String styles = read(new File(projectDirectory, "app/src/main/res/values/styles.xml"));

        check(layout.contains("com.cinemax.app.CinemaxSplashView"), "the splash stage is a single composited view");
        check(layout.contains("android:background=\"@color/cinemax_ink\""),
                "the splash layer stays a flat near-black canvas");
        check(!layout.contains("cinemax_splash_glow") && !layout.contains("cinemax_splash_streak_one")
                        && !layout.contains("cinemax_splash_spinner"),
                "the replaced splash view stack is gone (no glow/streak/spinner children)");
        check(splashView.contains("R.drawable.cinemax_emblem"),
                "the reveal draws the existing Cinemax logo, unmodified");
        check(pathDataOf(emblem, 0).length() > 40 && pathDataOf(emblem, 3).length() > 20,
                "the logo artwork is intact (both ribbons and both light edges)");
        check(!new File(projectDirectory,
                        "app/src/main/res/drawable/cinemax_emblem_ribbon.xml").isFile()
                        && !new File(projectDirectory,
                        "app/src/main/res/drawable/cinemax_emblem_fold.xml").isFile(),
                "the split ribbon layers of the old reveal are gone");

        // The logo is the only thing on screen: nothing in the reveal draws type.
        check(!splashView.contains("drawText") && !splashView.contains("Typeface")
                        && !splashView.contains("StaticLayout") && !splashView.contains("fonts/"),
                "the reveal draws no text at all (no wordmark, no tagline)");
        check(!strings.contains("Movies") && !strings.contains("Starting Cinemax"),
                "no slogan, tagline or loading copy ships with the splash");
        check(!styles.contains("CinemaxWordmark") && !styles.contains("CinemaxTagline"),
                "the old splash wordmark/tagline styles are gone");
        check(!new File(projectDirectory, "app/src/main/assets/cinemax/fonts").isDirectory(),
                "the splash wordmark font is no longer packaged (nothing draws text)");

        // No rings, orbit lines, dots or blur: the reveal is the logo and light.
        check(!splashView.contains("drawCircle") && !splashView.contains("drawArc")
                        && !splashView.contains("drawPath") && !splashView.contains("drawOval")
                        && !splashView.contains("drawLine") && !splashView.contains("PathMeasure"),
                "no rings, orbit lines or dots are drawn by the reveal");
        check(!splashView.contains("BlurMaskFilter") && !splashView.contains("setShadowLayer")
                        && !splashView.contains("RenderEffect") && !splashView.contains("Blur"),
                "no blur and no shadow layer: the soft light is a pre-rendered sprite");
        check(!splashView.contains("setRepeatCount") && !splashView.contains("INFINITE")
                        && !motion.contains("Repeat"),
                "nothing loops: once the reveal has settled it asks for no further frames");

        // Android-specific smoothness contract of the draw path.
        check(splashView.contains("ensureSprites") && splashView.contains("Bitmap.Config.ARGB_8888"),
                "the soft light is rasterised once per screen size, not per frame");
        check(splashView.contains("onAnimationEnd") && splashView.contains("releaseSprites"),
                "the animator and the light sprites are released when the splash is done");
        int removeListenersAt = splashView.indexOf("removeAllListeners");
        check(countOccurrences(splashView, "removeAllListeners") == 1
                        && removeListenersAt > splashView.indexOf("private void cancelAnimator"),
                "listeners are removed only from the cancel path, never while the animator is"
                        + " dispatching its own callbacks");
        check(!splashView.contains("recycle()"),
                "sprites are dropped rather than recycled (the render thread may still hold a frame)");
        check(splashView.contains("saveLayer") && splashView.contains("PorterDuff.Mode.SRC_ATOP")
                        && splashView.contains("SplashMotion.sweepOverLogo"),
                "the light sweep is clipped to the logo, and only while it can touch it");
        check(splashView.contains("SplashMotion.layout("),
                "the viewport geometry comes from the tested layout maths");
        check(!splashView.contains("requestLayout") && !splashView.contains("setLayoutParams"),
                "the reveal never triggers a layout pass");
        check(splashView.contains("ANIMATOR_DURATION_SCALE"),
                "the reveal honours the system animation scale (reduced motion)");
        check(splashView.contains("setContentDescription") && splashView.contains("splash_lockup_desc"),
                "the splash exposes an accessibility label");
        check(windowBackground.contains("@drawable/cinemax_emblem")
                        && windowBackground.contains("#050507") && !windowBackground.contains("5E96FF"),
                "the launch window is deep near-black with the centred logo (no colour flash)");
        // The window's artwork and the first frame of the reveal must be the same
        // logo at the same size, or the hand-over would jump.
        String windowLogoWidth = attribute(windowBackground, "android:width");
        check(windowLogoWidth.equals(Math.round(SplashMotion.LAUNCH_LOGO_DP) + "dp"),
                "the launch window draws the logo at " + windowLogoWidth
                        + ", the size the reveal starts its dolly from");
        check(!motion.contains("logoRiseDp") && !splashView.contains("rise"),
                "the logo never moves off centre (the entrance is a dolly about the centre)");

        // Launch gating: the reveal plays once, on a genuine cold launch only.
        int introUses = countOccurrences(mainActivity, "CinemaxSplashView.MODE_INTRO");
        check(introUses == 1, "the animated intro is requested from exactly one place");
        check(mainActivity.contains("savedInstanceState == null") && mainActivity.contains("introConsumed"),
                "the animated intro is limited to a genuine cold launch, once per process");
        check(mainActivity.contains("CinemaxSplashView.MODE_HOLD"),
                "reloads and re-entries show the still logo instead of replaying the animation");
        check(mainActivity.contains("showReloadingVeil"),
                "offline retry and renderer restarts use the quiet reloading veil");
        check(mainActivity.contains("splashStage.setRevealListener")
                        && mainActivity.contains("pageReadyForHandoff"),
                "the page takes over as soon as the logo has landed and the page has painted");
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

    /** Value of `name="..."` in a resource file, or "" when it is not there. */
    private static String attribute(String xml, String name) {
        String marker = name + "=\"";
        int start = xml.indexOf(marker);
        if (start < 0) {
            return "";
        }
        start += marker.length();
        int end = xml.indexOf('"', start);
        return end > start ? xml.substring(start, end) : "";
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

    /**
     * Strips Java comments (and keeps string literals intact) so the checks that
     * assert something is *not* in a file test the code rather than the prose
     * around it - the Javadoc is allowed to explain that the reveal contains no
     * blur, no circles and no text.
     */
    private static String withoutComments(String source) {
        StringBuilder out = new StringBuilder(source.length());
        int index = 0;
        while (index < source.length()) {
            char current = source.charAt(index);
            char next = index + 1 < source.length() ? source.charAt(index + 1) : '\0';
            if (current == '/' && next == '/') {
                while (index < source.length() && source.charAt(index) != '\n') {
                    index++;
                }
            } else if (current == '/' && next == '*') {
                index += 2;
                while (index + 1 < source.length()
                        && !(source.charAt(index) == '*' && source.charAt(index + 1) == '/')) {
                    index++;
                }
                index += 2;
            } else if (current == '"' || current == '\'') {
                char quote = current;
                out.append(current);
                index++;
                while (index < source.length()) {
                    char inner = source.charAt(index);
                    out.append(inner);
                    index++;
                    if (inner == '\\' && index < source.length()) {
                        out.append(source.charAt(index));
                        index++;
                    } else if (inner == quote) {
                        break;
                    }
                }
            } else {
                out.append(current);
                index++;
            }
        }
        return out.toString();
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
