package com.cinemax.app;

/**
 * The native splash choreography, expressed as pure arithmetic.
 *
 * The website's intro reveals the Cinemax emblem in layers: the folded "C"
 * ribbon slides in, the fold follows from the other side, a light stripe sweeps
 * across the logo, rings expand, streaks travel and the wordmark rises. The
 * Android app cannot reuse that CSS, so the same choreography is rebuilt here
 * as a layer table plus easing functions.
 *
 * Deliberately free of Android types: it can be unit tested on a plain JVM
 * (android/tests/java/CinemaxAppTest.java) and it keeps every timing decision in
 * one place instead of scattering magic numbers through the drawing code.
 *
 * Only transform-style properties are animated (alpha, translation, scale,
 * radius, rotation, letter spacing). Nothing here can trigger a layout pass, and
 * the whole reveal is one clip of ~1.2 s: the WebView loads the production site
 * in parallel and the intro hands over as soon as the page has a themed first
 * paint.
 */
public final class SplashMotion {

    /* ------------------------------------------------------------- layers */

    /** Large brand glows behind everything (deepest layer). */
    public static final int LAYER_AMBIENT = 0;
    /** Soft halo that sits directly behind the emblem. */
    public static final int LAYER_HALO = 1;
    /** Six aperture blades that briefly iris in behind the lockup. */
    public static final int LAYER_IRIS = 2;
    public static final int LAYER_RING_OUTER = 3;
    public static final int LAYER_RING_MID = 4;
    /** Inner ring drawn as a sweeping arc with a travelling light head. */
    public static final int LAYER_RING_ARC = 5;
    public static final int LAYER_STREAK_A = 6;
    public static final int LAYER_STREAK_B = 7;
    /** The folded "C" ribbon of the emblem. */
    public static final int LAYER_RIBBON = 8;
    /** The interlocking fold of the emblem. */
    public static final int LAYER_FOLD = 9;
    /** Light stripe that sweeps across the emblem once it has landed. */
    public static final int LAYER_SHEEN = 10;
    public static final int LAYER_WORDMARK = 11;
    /** Brand gradient rule under the wordmark. */
    public static final int LAYER_RULE = 12;
    public static final int LAYER_TAGLINE = 13;
    public static final int LAYER_COUNT = 14;

    /* ------------------------------------------------------------ timings */

    /** Every layer has finished by this point: one clip of the reveal. */
    public static final long REVEAL_MILLIS = 1180L;
    /** The lockup (emblem + wordmark) is complete - the page may take over. */
    public static final long HANDOFF_READY_MILLIS = 1110L;
    /** Never hand over before this, so the reveal is actually seen. */
    public static final long HANDOFF_MIN_VISIBLE_MILLIS = 900L;
    /** Duration of the cross-fade from the splash into the home page. */
    public static final long HANDOFF_FADE_MILLIS = 340L;
    /** Keyboard-free safety valve for a dead network (never a loading screen). */
    public static final long SAFETY_TIMEOUT_MILLIS = 8000L;
    /** With system animations disabled the reveal is shown as a still frame. */
    public static final long REDUCED_MOTION_MIN_VISIBLE_MILLIS = 420L;
    /** Slow breathing of the halo once the lockup has landed. */
    public static final long BREATH_PERIOD_MILLIS = 2600L;

    /*
     * Delay and duration per layer, in milliseconds. The relative order mirrors
     * the website's intro (ribbon 0.18s, fold 0.30s, sheen 0.50s, wordmark
     * 0.45s, rings 0.09-0.14s, streaks 0.12-0.24s), compressed so the whole
     * reveal fits in REVEAL_MILLIS.
     */
    private static final long[] DELAYS = {
            0L,    // ambient glows
            60L,   // halo
            80L,   // aperture iris
            90L,   // outer ring
            240L,  // inner ring
            140L,  // sweeping arc
            120L,  // streak A
            240L,  // streak B
            170L,  // emblem ribbon
            300L,  // emblem fold
            520L,  // sheen sweep
            470L,  // wordmark
            560L,  // gradient rule
            620L,  // tagline
    };

    private static final long[] DURATIONS = {
            900L,   // ambient glows
            900L,   // halo
            700L,   // aperture iris
            1090L,  // outer ring
            880L,   // inner ring
            1040L,  // sweeping arc
            880L,   // streak A
            880L,   // streak B
            760L,   // emblem ribbon
            780L,   // emblem fold
            520L,   // sheen sweep
            640L,   // wordmark
            600L,   // gradient rule
            560L,   // tagline
    };

    private SplashMotion() {
    }

    /* -------------------------------------------------------- layer maths */

    public static int layerCount() {
        return LAYER_COUNT;
    }

    public static long delay(int layer) {
        return DELAYS[index(layer)];
    }

    public static long duration(int layer) {
        return DURATIONS[index(layer)];
    }

    /** Absolute time at which a layer has finished. */
    public static long end(int layer) {
        int index = index(layer);
        return DELAYS[index] + DURATIONS[index];
    }

    /** Linear 0..1 progress of one layer at {@code elapsed} milliseconds. */
    public static float progress(long elapsed, int layer) {
        int index = index(layer);
        long duration = DURATIONS[index];
        if (duration <= 0L) {
            return elapsed >= DELAYS[index] ? 1f : 0f;
        }
        return clamp01((elapsed - DELAYS[index]) / (float) duration);
    }

    /** True once every layer has finished: the still frame of the intro. */
    public static boolean revealComplete(long elapsed) {
        return elapsed >= REVEAL_MILLIS;
    }

    /** True once the emblem and wordmark have landed (page may take over). */
    public static boolean handoffReady(long elapsed) {
        return elapsed >= HANDOFF_READY_MILLIS;
    }

    /** Smoothstep for gentle in/out motion. */
    public static float easeInOutSine(float t) {
        return (float) (0.5 - 0.5 * Math.cos(Math.PI * clamp01(t)));
    }

    /** Fast start, long settle: the classic "premium" ease for arrives. */
    public static float easeOutCubic(float t) {
        float value = 1f - clamp01(t);
        return 1f - value * value * value;
    }

    /** Even faster start - used for light sweeps and streaks. */
    public static float easeOutQuint(float t) {
        float value = 1f - clamp01(t);
        return 1f - value * value * value * value * value;
    }

    public static float easeInOutCubic(float t) {
        float value = clamp01(t);
        if (value < 0.5f) {
            return 4f * value * value * value;
        }
        float shifted = -2f * value + 2f;
        return 1f - shifted * shifted * shifted / 2f;
    }

    /** Small overshoot so the emblem lands rather than stops. */
    public static float easeOutBack(float t) {
        float value = clamp01(t) - 1f;
        float overshoot = 1.30f;
        return 1f + (overshoot + 1f) * value * value * value + overshoot * value * value;
    }

    public static float lerp(float from, float to, float t) {
        return from + (to - from) * clamp01(t);
    }

    public static float clamp01(float value) {
        if (value < 0f) {
            return 0f;
        }
        if (value > 1f) {
            return 1f;
        }
        return value;
    }

    /* ------------------------------------------------------- layer curves */

    /**
     * Ring fade: out quickly, then a long dissolve. A ring that simply faded in
     * and out linearly reads as a "loading" pulse; peaking early reads as an
     * expanding wave.
     */
    public static float ringAlpha(float peak, float progress) {
        float value = clamp01(progress);
        if (value <= 0.26f) {
            return peak * easeOutCubic(value / 0.26f);
        }
        return peak * (1f - easeInOutSine((value - 0.26f) / 0.74f));
    }

    /** Expanding wave: starts tight, eases out, keeps travelling. */
    public static float ringScale(float from, float to, float progress) {
        return lerp(from, to, easeOutQuint(clamp01(progress)));
    }

    /** The travelling light head of the sweeping arc is brightest mid-sweep. */
    public static float arcHeadAlpha(float peak, float progress) {
        float value = clamp01(progress);
        if (value <= 0.15f) {
            return peak * (value / 0.15f);
        }
        return peak * (1f - 0.45f * ((value - 0.15f) / 0.85f));
    }

    /** Light stripe: crosses the emblem once and is gone. */
    public static float sheenAlpha(float peak, float progress) {
        float value = clamp01(progress);
        if (value <= 0.35f) {
            return peak * easeOutCubic(value / 0.35f);
        }
        return peak * (1f - easeInOutSine((value - 0.35f) / 0.65f));
    }

    /** Streak brightness: fades in on the way in, out on the way out. */
    public static float streakAlpha(float peak, float progress) {
        float value = clamp01(progress);
        if (value <= 0.4f) {
            return peak * (value / 0.4f);
        }
        return peak * (1f - (value - 0.4f) / 0.6f);
    }

    /**
     * Halo breathing after the reveal: a +-2% scale wobble on a slow period.
     * Returns 1.0 while the intro is still running.
     */
    public static float breathScale(long elapsed) {
        if (elapsed <= REVEAL_MILLIS) {
            return 1f;
        }
        double phase = ((elapsed - REVEAL_MILLIS) % BREATH_PERIOD_MILLIS) / (double) BREATH_PERIOD_MILLIS;
        return (float) (1.0 + 0.02 * Math.sin(phase * 2.0 * Math.PI));
    }

    /** Wordmark tracking: opens up, then settles onto the brand's tight spacing. */
    public static float wordmarkLetterSpacing(float from, float to, float progress) {
        return lerp(from, to, easeOutQuint(clamp01(progress)));
    }

    /**
     * The reveal begins where the launch surface left the emblem - dead centre,
     * as the launcher window and the API 31+ system splash draw it - and the
     * whole lockup rises into its resting place as the emblem lands. Returns 1
     * while the composition is still at the launch position, 0 once it is home,
     * so the movement is continuous into the reveal instead of a jump.
     */
    public static float emblemLift(float progress) {
        return 1f - easeOutCubic(clamp01(progress));
    }

    /** Aperture iris: blades rotate a few degrees as they fade away. */
    public static float irisRotation(float from, float to, float progress) {
        return lerp(from, to, easeOutQuint(clamp01(progress)));
    }

    private static int index(int layer) {
        if (layer < 0 || layer >= LAYER_COUNT) {
            throw new IllegalArgumentException("unknown splash layer: " + layer);
        }
        return layer;
    }
}
