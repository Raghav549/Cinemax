import com.cinemax.app.NavigationPolicy;
import com.cinemax.app.NavigationPolicy.Decision;

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
        check(splashLayout.contains("cinemax_splash_ring_one") && splashLayout.contains("cinemax_splash_streak_one"),
                "the native splash packages the animated logo light layers");
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

    private static String read(File file) throws Exception {
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    private static void write(File file, String content) throws Exception {
        try (Writer writer = new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8)) {
            writer.write(content);
        }
    }
}
