package com.cinemax.app;

/**
 * The native Cinemax launch reveal, expressed as pure arithmetic.
 *
 * The splash shows one thing: the existing Cinemax logo. There is no wordmark,
 * tagline, ring, orbit, dot, streak or spinner - the whole gesture is the logo
 * arriving on a deep near-black canvas, a blue-to-pink light sweeping across it
 * once, and the light around it settling down.
 *
 * Everything a frame needs is computed here, so the timeline can be checked
 * frame by frame on a plain JVM (android/tests/java/CinemaxAppTest.java):
 *
 *   · five layers - ambient wash, glow, depth bed, logo, light sweep;
 *   · transform-only values (alpha, scale, offset, travel): nothing here can
 *     asynchronously invalidate a layout pass, and no layer runs a per-frame
 *     blur, shader fill or allocation;
 *   · the whole clip is just over a second, and every layer is finished by
 *     {@link #REVEAL_MILLIS} - after that the splash is a still frame and stops
 *     requesting frames entirely, so the WebView gets the full frame budget
 *     while it loads the production site behind it.
 *
 * {@link #layout(int, int, float)} is the reason the logo is correct on every
 * screen: one size rule, centred on both axes, bounded so the artwork can never
 * reach a screen edge (verified for phone, small, landscape and tablet sizes in
 * the unit checks).
 */
public final class SplashMotion {

    /* ------------------------------------------------------------- layers */

    /** The restrained blue / violet / pink wash of the background. */
    public static final int LAYER_AMBIENT = 0;
    /** The soft glow behind the logo: it blooms, then settles onto its rest. */
    public static final int LAYER_GLOW = 1;
    /** The dark bed that lets the logo sit in front of the light. */
    public static final int LAYER_DEPTH = 2;
    /** The logo itself: it brightens to full while it dollies onto its size. */
    public static final int LAYER_LOGO = 3;
    /** The blue-to-pink light sweep that crosses the logo exactly once. */
    public static final int LAYER_SWEEP = 4;
    public static final int LAYER_COUNT = 5;

    /* ------------------------------------------------------------ timings */

    /** Every layer has finished here: the reveal is a single short clip. */
    public static final long REVEAL_MILLIS = 1040L;
    /**
     * The page may take over here: the logo has landed AND the light has
     * finished crossing it, so the frozen frame is the settled composition.
     * Freezing any earlier would leave a half-finished sweep on screen for the
     * length of the cross-fade. Only the tail of the glow's settle (imperceptible
     * - see {@link #glowAlpha(float)}) is still running at this point.
     */
    public static final long HANDOFF_READY_MILLIS = 980L;
    /**
     * Never hand over before this, so the reveal is actually seen even if the
     * page painted instantly. It only ever applies to the animated intro: a
     * still frame (re-entry, reload, reduced motion) hands over as soon as the
     * page is ready.
     */
    public static final long HANDOFF_MIN_VISIBLE_MILLIS = 900L;
    /** Duration of the cross-fade from the splash into the home page. */
    public static final long HANDOFF_FADE_MILLIS = 320L;
    /**
     * Safety valve for a page that never paints (dead network). It is not a
     * loading screen: it only makes sure the app can never sit on the splash.
     */
    public static final long SAFETY_TIMEOUT_MILLIS = 8000L;
    /** With system animations disabled the reveal is shown as a still frame. */
    public static final long REDUCED_MOTION_MIN_VISIBLE_MILLIS = 420L;

    /*
     * Delay and duration per layer, in milliseconds. The goal is one continuous
     * movement: the light comes up, the glow blooms behind the logo, the logo
     * arrives while its depth bed deepens, the sweep crosses it after it has
     * landed, and the glow eases back to its resting level last.
     */
    private static final long[] DELAYS = {
            0L,    // ambient wash
            40L,   // glow bloom
            90L,   // depth bed
            90L,   // the logo
            600L,  // light sweep
    };

    private static final long[] DURATIONS = {
            780L,  // ambient wash
            1000L, // glow bloom + settle
            560L,  // depth bed
            620L,  // the logo
            380L,  // light sweep
    };

    /* ---------------------------------------------------- animation values */

    /**
     * The logo does not fade in from nothing and it never leaves the centre:
     * the cold-start surface (the launcher window, and the API 31+ system splash)
     * already draws the same artwork centred at {@link #LAUNCH_LOGO_DP}, so the
     * reveal starts from exactly that frame - the logo already lit, already
     * centred - and the dolly, the rising light and the sweep are what make it an
     * entrance. That is what keeps the hand-over from the launch window to the
     * reveal seamless instead of a blink.
     */
    public static final float LAUNCH_LOGO_DP = 128f;
    /** How far the dolly may travel on a screen whose logo is smaller than the launch artwork. */
    public static final float LOGO_SCALE_FROM_MIN = 0.80f;
    /** The logo is already lit when the reveal starts (it was on the launch window). */
    public static final float LOGO_ALPHA_FROM = 0.88f;
    /** ... and reaches full opacity this early in its own layer. */
    public static final float LOGO_ALPHA_FULL_AT = 0.40f;
    /** The glow grows into place ... */
    public static final float GLOW_SCALE_FROM = 0.74f;
    /** ... passes its resting radius by a few percent ... */
    public static final float GLOW_BLOOM_SCALE = 1.05f;
    /** ... at this point of its layer ... */
    public static final float GLOW_BLOOM_AT = 0.58f;
    /** ... and eases back onto it. */
    public static final float GLOW_PEAK_ALPHA = 0.95f;
    /** Resting brightness of the glow once the reveal has settled. */
    public static final float GLOW_REST_ALPHA = 0.46f;
    /** Point of the glow's layer where the light starts easing back down. */
    public static final float GLOW_SETTLE_AT = 0.52f;
    /** Peak opacity of the dark depth bed under the logo. */
    public static final float DEPTH_PEAK_ALPHA = 0.58f;
    /** Peak opacity of the light sweep as it crosses the logo. */
    public static final float SWEEP_PEAK_ALPHA = 0.58f;
    /** How far the sweep travels, in units of the logo's own half-extent. */
    public static final float SWEEP_TRAVEL = 1.55f;

    /* ------------------------------------------------------------ geometry */

    /** The logo takes this fraction of the shorter screen edge. */
    public static final float LOGO_FRACTION = 0.34f;
    /** Readability floor for small screens. */
    public static final float LOGO_MIN_DP = 104f;
    /** Boldness ceiling, so a tablet does not get a giant logo. */
    public static final float LOGO_MAX_DP = 176f;
    /**
     * Hard ceiling: the logo never takes more than this fraction of the shorter
     * screen edge, so the complete artwork always has at least a 30% margin.
     */
    public static final float LOGO_MAX_FRACTION = 0.40f;
    public static final float GLOW_RADIUS_FACTOR = 0.98f;
    private static final float GLOW_MAX_FRACTION = 0.46f;
    /**
     * The light pool is a touch wider than it is tall and lifted a little above
     * the centre: the same light an off-centre key would throw, instead of a
     * circular spotlight behind the logo. Both are free - the sprite is already a
     * stretched quad.
     */
    public static final float GLOW_WIDTH_FACTOR = 1.20f;
    public static final float GLOW_HEIGHT_FACTOR = 0.94f;
    public static final float GLOW_LIFT_FACTOR = 0.04f;
    public static final float DEPTH_RADIUS_FACTOR = 0.72f;
    private static final float DEPTH_OFFSET_FACTOR = 0.045f;
    private static final float SWEEP_HALF_FACTOR = 0.56f;
    private static final float SWEEP_BAND_FACTOR = 0.13f;

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

    /** True once the logo and the sweep have landed (the page may take over). */
    public static boolean handoffReady(long elapsed) {
        return elapsed >= HANDOFF_READY_MILLIS;
    }

    /* ------------------------------------------------------------ easings */

    /** Smoothstep for gentle in/out motion. */
    public static float easeInOutSine(float t) {
        return (float) (0.5 - 0.5 * Math.cos(Math.PI * clamp01(t)));
    }

    /** Fast start, long settle: the classic premium ease for arrivals. */
    public static float easeOutCubic(float t) {
        float value = 1f - clamp01(t);
        return 1f - value * value * value;
    }

    public static float lerp(float from, float to, float t) {
        return from + (to - from) * clamp01(t);
    }

    public static float clamp(float value, float minimum, float maximum) {
        if (value < minimum) {
            return minimum;
        }
        if (value > maximum) {
            return maximum;
        }
        return value;
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

    /** The background wash comes up gently and then stays exactly where it is. */
    public static float ambientAlpha(float progress) {
        return easeOutCubic(clamp01(progress));
    }

    /**
     * Size of the glow. It grows quickly, passes its resting radius by a few
     * percent and then eases back onto it - the light "settling" rather than
     * snapping into place, with no bounce and nothing to catch the eye twice.
     */
    public static float glowScale(float progress) {
        float value = clamp01(progress);
        if (value <= GLOW_BLOOM_AT) {
            return lerp(GLOW_SCALE_FROM, GLOW_BLOOM_SCALE, easeOutCubic(value / GLOW_BLOOM_AT));
        }
        return lerp(GLOW_BLOOM_SCALE, 1f, easeInOutSine((value - GLOW_BLOOM_AT) / (1f - GLOW_BLOOM_AT)));
    }

    /**
     * Brightness of the glow: up quickly, then a long ease down onto a calm
     * resting level. It settles to a fraction of the peak instead of to nothing,
     * so the finished frame still looks lit - and it is a constant from here on,
     * which is what lets the splash stop drawing frames at all.
     */
    public static float glowAlpha(float progress) {
        float value = clamp01(progress);
        if (value <= GLOW_SETTLE_AT) {
            return lerp(0f, GLOW_PEAK_ALPHA, easeOutCubic(value / GLOW_SETTLE_AT));
        }
        return lerp(GLOW_PEAK_ALPHA, GLOW_REST_ALPHA,
                easeInOutSine((value - GLOW_SETTLE_AT) / (1f - GLOW_SETTLE_AT)));
    }

    /** The logo brightens to full over the first part of its entrance, then holds. */
    public static float logoAlpha(float progress) {
        return lerp(LOGO_ALPHA_FROM, 1f,
                easeOutCubic(clamp01(clamp01(progress) / LOGO_ALPHA_FULL_AT)));
    }

    /** A gentle dolly: the logo grows from the launch artwork onto its resting size. */
    public static float logoScale(float progress, float scaleFrom) {
        return lerp(clamp(scaleFrom, LOGO_SCALE_FROM_MIN, 1f), 1f, easeOutCubic(clamp01(progress)));
    }

    /**
     * Where the dolly starts: the size the launch surface drew the logo at, so
     * the first frame of the reveal is the frame the launcher left behind. It can
     * never be more than 1 (the logo never starts bigger than it ends).
     */
    public static float logoScaleFrom(float logoSizePx, float density) {
        if (logoSizePx <= 0f || density <= 0f) {
            return 1f;
        }
        return clamp(LAUNCH_LOGO_DP * density / logoSizePx, LOGO_SCALE_FROM_MIN, 1f);
    }

    /** The depth bed deepens as the logo arrives, then holds. */
    public static float depthAlpha(float progress) {
        return lerp(0f, DEPTH_PEAK_ALPHA, easeOutCubic(clamp01(progress)));
    }

    /** The light sweep: in, across, out - once, and never a loop. */
    public static float sweepAlpha(float progress) {
        float value = clamp01(progress);
        if (value <= 0.32f) {
            return lerp(0f, SWEEP_PEAK_ALPHA, easeOutCubic(value / 0.32f));
        }
        return lerp(SWEEP_PEAK_ALPHA, 0f, easeInOutSine((value - 0.32f) / 0.68f));
    }

    /** Horizontal travel of the light band, in units of the logo half-extent. */
    public static float sweepTravel(float progress) {
        return lerp(-SWEEP_TRAVEL, SWEEP_TRAVEL, easeInOutSine(clamp01(progress)));
    }

    /**
     * True while the travelling band can still touch the logo. The sweep only
     * needs its small offscreen layer (so the light is clipped to the artwork
     * itself) during this window - outside it the band is off the logo and is
     * not drawn at all.
     */
    public static boolean sweepOverLogo(float travel) {
        return travel > -0.90f && travel < 0.90f;
    }

    /* ------------------------------------------------------------ geometry */

    /** Viewport geometry for one screen size. Pure arithmetic - no Android types. */
    public static final class Layout {

        public final int width;
        public final int height;
        /** Centre of the screen: where the logo and every light is drawn from. */
        public final float centreX;
        public final float centreY;
        /** Edge length of the square the logo is drawn into. */
        public final float logoSize;
        /** Radius the glow sprite is drawn at. */
        public final float glowRadius;
        /** Radius of the soft dark bed under the logo. */
        public final float depthRadius;
        /** How far below the centre that bed sits. */
        public final float depthOffsetY;
        /** Half-extent of the sweep's offscreen layer. */
        public final float sweepHalfExtent;
        /** Half-width of the travelling light band. */
        public final float sweepBandHalf;
        /** Half-height of the band (the rest is clipped by the layer). */
        public final float sweepBandHalfHeight;
        public final int ambientSpriteWidth;
        public final int ambientSpriteHeight;
        public final int glowSpriteSide;
        /** Scale the dolly starts from: the launch surface's own logo size. */
        public final float logoStartScale;

        private Layout(int width, int height, float centreX, float centreY,
                float logoSize, float glowRadius, float depthRadius, float depthOffsetY,
                float sweepHalfExtent, float sweepBandHalf, float sweepBandHalfHeight,
                int ambientSpriteWidth, int ambientSpriteHeight, int glowSpriteSide,
                float logoStartScale) {
            this.width = width;
            this.height = height;
            this.centreX = centreX;
            this.centreY = centreY;
            this.logoSize = logoSize;
            this.glowRadius = glowRadius;
            this.depthRadius = depthRadius;
            this.depthOffsetY = depthOffsetY;
            this.sweepHalfExtent = sweepHalfExtent;
            this.sweepBandHalf = sweepBandHalf;
            this.sweepBandHalfHeight = sweepBandHalfHeight;
            this.ambientSpriteWidth = ambientSpriteWidth;
            this.ambientSpriteHeight = ambientSpriteHeight;
            this.glowSpriteSide = glowSpriteSide;
            this.logoStartScale = logoStartScale;
        }

        /** Distance from the logo's left/right edge to the screen edge, in px. */
        public float logoMarginX() {
            return centreX - logoSize * 0.5f;
        }

        /** Distance from the logo's top/bottom edge to the screen edge, in px. */
        public float logoMarginY() {
            return centreY - logoSize * 0.5f;
        }
    }

    /**
     * Sizes everything from the viewport: the logo is centred on both axes and
     * bounded so that the complete artwork always fits with a healthy margin,
     * on a small phone, in landscape and on a tablet alike.
     */
    public static Layout layout(int width, int height, float density) {
        float smallest = Math.max(1f, Math.min(width, height));

        // 34% of the short side, kept readable on small screens and bold (but
        // never oversized) on large ones, with a hard ceiling of 40%.
        float logoSize = smallest * LOGO_FRACTION;
        float floor = Math.min(dp(LOGO_MIN_DP, density), smallest * LOGO_MAX_FRACTION);
        if (logoSize < floor) {
            logoSize = floor;
        }
        float ceiling = Math.min(dp(LOGO_MAX_DP, density), smallest * LOGO_MAX_FRACTION);
        if (logoSize > ceiling) {
            logoSize = ceiling;
        }

        float centreX = width * 0.5f;
        float centreY = height * 0.5f;
        float glowRadius = Math.min(logoSize * GLOW_RADIUS_FACTOR, smallest * GLOW_MAX_FRACTION);
        float depthRadius = logoSize * DEPTH_RADIUS_FACTOR;
        float depthOffsetY = logoSize * DEPTH_OFFSET_FACTOR;
        float sweepHalfExtent = logoSize * SWEEP_HALF_FACTOR;
        float sweepBandHalf = logoSize * SWEEP_BAND_FACTOR;
        // Tall enough that the rotated band always covers the artwork; the rest
        // is clipped by the sweep layer, so it costs nothing.
        float sweepBandHalfHeight = logoSize;

        // The soft light is pre-rendered once per screen size, so a frame is a
        // handful of textured quads instead of full-screen gradient or blur
        // fills. A radial wash survives a stretch: it carries no detail.
        int glowSpriteSide = clampInt(Math.round(glowRadius), 160, 384);
        int ambientSpriteWidth = clampInt(Math.round(width / 6f), 96, 384);
        int ambientSpriteHeight = clampInt(Math.round(height / 6f), 96, 384);

        return new Layout(width, height, centreX, centreY, logoSize, glowRadius,
                depthRadius, depthOffsetY, sweepHalfExtent, sweepBandHalf, sweepBandHalfHeight,
                ambientSpriteWidth, ambientSpriteHeight, glowSpriteSide,
                logoScaleFrom(logoSize, density));
    }

    private static float dp(float value, float density) {
        return value * density;
    }

    private static int clampInt(int value, int minimum, int maximum) {
        if (value < minimum) {
            return minimum;
        }
        if (value > maximum) {
            return maximum;
        }
        return value;
    }

    private static int index(int layer) {
        if (layer < 0 || layer >= LAYER_COUNT) {
            throw new IllegalArgumentException("unknown splash layer: " + layer);
        }
        return layer;
    }
}
