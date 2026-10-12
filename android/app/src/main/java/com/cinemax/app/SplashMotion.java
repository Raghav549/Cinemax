package com.cinemax.app;

/**
 * The native Cinemax launch reveal, expressed as pure arithmetic.
 *
 * The reveal is a short cinematic composition built from seven layers:
 *
 *   · an ambient wash - the deep near-black canvas picking up three brand lights;
 *   · the wave field - three broad, curved colour bands (blue above, violet in
 *     the middle, pink-magenta below) that expand out of the central composition
 *     towards the screen edges, each on its own clock so they parallax;
 *   · a glow that blooms behind the logo and settles onto a calm resting level;
 *   · a depth bed that lets the artwork sit in front of the light;
 *   · the logo, which dollies up from the size the launch window left it at,
 *     overshoots by a few percent and settles, lifting just enough for the
 *     finished logo-and-wordmark lockup to be centred as a whole;
 *   · a single blue-to-pink light sweep that crosses the logo once it has landed;
 *   · the CINEMAX wordmark, which fades up beneath the logo after it.
 *
 * Everything a frame needs is computed here, so the timeline can be checked
 * frame by frame on a plain JVM (android/tests/java/CinemaxAppTest.java):
 *
 *   · transform-only values (alpha, scale, offset, travel): nothing here can
 *     asynchronously invalidate a layout pass, and no layer runs a per-frame
 *     blur, shader fill, path tessellation or allocation - the curved bands are
 *     rasterised once per screen size and then drawn as textured quads;
 *   · the whole clip is just over two seconds, and every layer is finished by
 *     {@link #REVEAL_MILLIS} - after that the splash is a still frame and stops
 *     requesting frames entirely, so the WebView gets the full frame budget
 *     while it loads the production site behind it;
 *   · the page may take over at {@link #HANDOFF_READY_MILLIS}, which is gated on
 *     the page having a themed first paint. The animation never delays a ready
 *     app beyond that point, and it never runs past its own last frame.
 *
 * {@link #layout(int, int, float)} is the reason the lockup is correct on every
 * screen: one size rule for the logo, one for the wordmark, both centred on the
 * horizontal axis and centred as a pair on the vertical axis, bounded so neither
 * can ever reach a screen edge (verified for phone, small, landscape and tablet
 * sizes in the unit checks).
 */
public final class SplashMotion {

    /* ------------------------------------------------------------- layers */

    /** The restrained blue / violet / pink wash of the background. */
    public static final int LAYER_AMBIENT = 0;
    /** The three curved colour bands expanding out of the centre. */
    public static final int LAYER_WAVE = 1;
    /** The soft glow behind the logo: it blooms, then settles onto its rest. */
    public static final int LAYER_GLOW = 2;
    /** The dark bed that lets the logo sit in front of the light. */
    public static final int LAYER_DEPTH = 3;
    /** The logo itself: it dollies in, overshoots slightly and settles. */
    public static final int LAYER_LOGO = 4;
    /** The blue-to-pink light sweep that crosses the logo exactly once. */
    public static final int LAYER_SWEEP = 5;
    /** The CINEMAX wordmark: it fades up beneath the settled logo. */
    public static final int LAYER_WORDMARK = 6;
    public static final int LAYER_COUNT = 7;

    /* --------------------------------------------------------- wave bands */

    /** The upper band: deep and electric blue. */
    public static final int BAND_BLUE = 0;
    /** The middle band: violet into purple. */
    public static final int BAND_VIOLET = 1;
    /** The lower band: pink-magenta. */
    public static final int BAND_PINK = 2;
    public static final int BAND_COUNT = 3;

    /* ------------------------------------------------------------ timings */

    /** Every layer has finished here: the reveal is a single short clip. */
    public static final long REVEAL_MILLIS = 2200L;
    /**
     * The page may take over here: the logo has landed, the light has finished
     * crossing it and the wordmark is up, so the frozen frame is the settled
     * composition. Only the imperceptible tail of the glow's settle (see
     * {@link #glowAlpha(float)}) is still moving at this point.
     */
    public static final long HANDOFF_READY_MILLIS = 1800L;
    /**
     * Never hand over before this, so the reveal is actually seen even if the
     * page painted instantly. It only ever applies to the animated intro: a
     * still frame (re-entry, reload, reduced motion) hands over as soon as the
     * page is ready. A page that is not ready yet is waited for - the reveal
     * never holds a finished app hostage, and never cuts itself short either.
     */
    public static final long HANDOFF_MIN_VISIBLE_MILLIS = 1700L;
    /** Duration of the cross-fade from the splash into the home page. */
    public static final long HANDOFF_FADE_MILLIS = 340L;
    /**
     * Safety valve for a page that never paints (dead network). It is not a
     * loading screen: it only makes sure the app can never sit on the splash.
     */
    public static final long SAFETY_TIMEOUT_MILLIS = 8000L;
    /** With system animations disabled the reveal is shown as a still frame. */
    public static final long REDUCED_MOTION_MIN_VISIBLE_MILLIS = 420L;

    /*
     * Delay and duration per layer, in milliseconds. The goal is one continuous
     * movement: the canvas picks up its light, the colour field expands out of
     * the centre, the glow blooms behind the logo, the logo arrives and settles
     * while its depth bed deepens, the sweep crosses it once it has landed, the
     * wordmark rises beneath it, and the glow eases back to rest last.
     */
    private static final long[] DELAYS = {
            0L,    // ambient wash
            80L,   // the expanding colour field
            140L,  // glow bloom
            200L,  // depth bed
            200L,  // the logo
            1050L, // light sweep
            1150L, // the wordmark
    };

    private static final long[] DURATIONS = {
            1000L, // ambient wash
            1400L, // the three bands expanding into place
            2060L, // glow bloom + settle (the last thing to move)
            700L,  // depth bed
            820L,  // the logo
            480L,  // light sweep
            620L,  // the wordmark
    };

    /* ------------------------------------------------- wave band behaviour */

    /*
     * The three bands share one layer but not one clock: each starts a little
     * later, travels a little further and arrives a little earlier than the one
     * before it. That staggering - not any 3D effect - is the parallax.
     */
    private static final float[] BAND_START = {0f, 0.10f, 0.20f};
    private static final float[] BAND_SPAN = {0.86f, 0.80f, 0.74f};
    /** Where each band starts: a small composition around the centre. */
    private static final float[] BAND_SCALE_FROM = {0.38f, 0.28f, 0.20f};
    /**
     * Where each band settles: exactly 1.0. The bands' curved boundaries are
     * baked to tile at rest, so every band must land at the same scale or a
     * sliver of bare ink would open between them; the expansion reads as the
     * field growing out of the centre and locking into place.
     */
    private static final float[] BAND_SCALE_TO = {1f, 1f, 1f};
    /** Resting opacity of each band; the centre stays dominant. */
    private static final float[] BAND_ALPHA_TO = {1f, 0.94f, 0.88f};
    /** Fraction of its own span in which a band reaches full opacity. */
    private static final float BAND_ALPHA_RAMP = 0.55f;

    /* ---------------------------------------------------- animation values */

    /**
     * The logo does not fade in from nothing: the cold-start surface (the
     * launcher window, and the API 31+ system splash) already draws the same
     * artwork centred at {@link #LAUNCH_LOGO_DP}, so the reveal starts from
     * exactly that frame - the logo already lit, already centred - and the
     * dolly, the rising light and the sweep are what make it an entrance. That
     * is what keeps the hand-over from the launch window to the reveal seamless.
     */
    public static final float LAUNCH_LOGO_DP = 128f;
    /** How far the dolly may travel on a screen whose logo is smaller than the launch artwork. */
    public static final float LOGO_SCALE_FROM_MIN = 0.80f;
    /** The logo is already lit when the reveal starts (it was on the launch window). */
    public static final float LOGO_ALPHA_FROM = 0.88f;
    /** ... and reaches full opacity this early in its own layer. */
    public static final float LOGO_ALPHA_FULL_AT = 0.42f;
    /**
     * The dolly passes its resting size by a few percent and eases back onto it:
     * a controlled spring settle, not a bounce. Hard-bounded so the artwork can
     * never grow past 4.5% of its final size.
     */
    public static final float LOGO_OVERSHOOT_SCALE = 1.045f;
    /** Point of the logo's layer at which the overshoot peaks. */
    public static final float LOGO_OVERSHOOT_AT = 0.58f;
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
    /** Fraction of the wordmark's layer in which it reaches full opacity. */
    public static final float WORDMARK_ALPHA_FULL_AT = 0.60f;

    /* ------------------------------------------------------------ geometry */

    /** The logo takes this fraction of the shorter screen edge. */
    public static final float LOGO_FRACTION = 0.34f;
    /** Readability floor for small screens. */
    public static final float LOGO_MIN_DP = 104f;
    /** Boldness ceiling, so a tablet does not get a giant logo. */
    public static final float LOGO_MAX_DP = 176f;
    /**
     * Hard ceiling: the logo never takes more than this fraction of the shorter
     * screen edge, so the complete artwork always has a healthy margin.
     */
    public static final float LOGO_MAX_FRACTION = 0.40f;

    /** The wordmark is sized from the same short edge, in the same proportion. */
    public static final float WORDMARK_FRACTION = 0.062f;
    /** Readability floor / boldness ceiling of the wordmark. */
    public static final float WORDMARK_MIN_DP = 13f;
    public static final float WORDMARK_MAX_DP = 26f;
    /** Air between the logo and the wordmark, as a fraction of the short edge. */
    public static final float WORDMARK_GAP_FRACTION = 0.050f;
    /**
     * Cap height as a fraction of the text size for the brand face. It is what
     * turns "the gap below the logo" into a real baseline, and it keeps the
     * lockup arithmetic pure (no font metrics needed to lay the splash out).
     */
    public static final float WORDMARK_CAP_RATIO = 0.72f;
    /** The wordmark never runs wider than this fraction of the screen. */
    public static final float WORDMARK_MAX_WIDTH_FRACTION = 0.80f;
    /** Brand tracking of the splash wordmark, in em. */
    public static final float WORDMARK_LETTER_SPACING_EM = 0.30f;

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
    /** Pre-rendered band sprites stay this small; they are smooth gradients. */
    private static final int WAVE_SPRITE_WIDTH_MIN = 96;
    private static final int WAVE_SPRITE_WIDTH_MAX = 208;
    private static final int WAVE_SPRITE_HEIGHT_MIN = 96;
    private static final int WAVE_SPRITE_HEIGHT_MAX = 256;

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

    /** True once the logo, the sweep and the wordmark have landed. */
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
     * Progress of one colour band inside the wave layer. Each band has its own
     * start and span, which is what makes the field read as three flowing layers
     * rather than one sheet of colour.
     */
    public static float waveProgress(float progress, int band) {
        int index = bandIndex(band);
        return clamp01((clamp01(progress) - BAND_START[index]) / BAND_SPAN[index]);
    }

    /**
     * Size of one colour band: it starts as a small composition around the
     * centre of the screen and expands past the edges, so the field always runs
     * off the screen instead of stopping on it.
     */
    public static float waveScale(float progress, int band) {
        int index = bandIndex(band);
        return lerp(BAND_SCALE_FROM[index], BAND_SCALE_TO[index],
                easeOutCubic(waveProgress(progress, index)));
    }

    /**
     * Opacity of one colour band. It comes up over the first part of its own
     * travel and then holds - a constant at rest, which is what lets the
     * finished splash stop requesting frames.
     */
    public static float waveAlpha(float progress, int band) {
        int index = bandIndex(band);
        float ramp = clamp01(waveProgress(progress, index) / BAND_ALPHA_RAMP);
        return BAND_ALPHA_TO[index] * easeOutCubic(ramp);
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

    /**
     * The dolly: the logo grows from the launch artwork onto its resting size,
     * passes it by {@link #LOGO_OVERSHOOT_SCALE} and eases back onto it. One
     * controlled settle - the artwork never bounces and never spins.
     */
    public static float logoScale(float progress, float scaleFrom) {
        float value = clamp01(progress);
        float from = clamp(scaleFrom, LOGO_SCALE_FROM_MIN, 1f);
        if (value <= LOGO_OVERSHOOT_AT) {
            return lerp(from, LOGO_OVERSHOOT_SCALE, easeOutCubic(value / LOGO_OVERSHOOT_AT));
        }
        return lerp(LOGO_OVERSHOOT_SCALE, 1f,
                easeInOutSine((value - LOGO_OVERSHOOT_AT) / (1f - LOGO_OVERSHOOT_AT)));
    }

    /**
     * How far the logo has lifted, in units of {@link SplashMotion.Layout#lockupLift}.
     * It starts at exactly zero - the frame the launch window left on screen -
     * and eases up so the finished logo-and-wordmark pair is centred as a whole.
     * The travel is a few percent of the screen height, interpolated every frame,
     * so it is a movement and never a jump.
     */
    public static float logoRise(float progress) {
        return easeInOutSine(clamp01(progress));
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

    /**
     * Opacity of the wordmark: a restrained fade that is complete well before
     * its layer ends, so the wordmark is simply present for the final beat.
     */
    public static float wordmarkAlpha(float progress) {
        return easeOutCubic(clamp01(clamp01(progress) / WORDMARK_ALPHA_FULL_AT));
    }

    /**
     * How far the wordmark has risen, in units of its own rise distance: 0 is
     * its resting place, 1 is where it starts (a short way below it).
     */
    public static float wordmarkRise(float progress) {
        return 1f - easeOutCubic(clamp01(progress));
    }

    /* ------------------------------------------------------------ geometry */

    /** Viewport geometry for one screen size. Pure arithmetic - no Android types. */
    public static final class Layout {

        public final int width;
        public final int height;
        /** Centre of the screen: where the light is drawn from. */
        public final float centreX;
        public final float centreY;
        /** Edge length of the square the logo is drawn into. */
        public final float logoSize;
        /** Centre of the logo once the lockup has settled. */
        public final float logoRestCentreY;
        /** How far the logo lifts so the finished lockup is centred as a pair. */
        public final float lockupLift;
        /** Radius the glow sprite is drawn at. */
        public final float glowRadius;
        /** Radius of the soft dark bed under the logo. */
        public final float depthRadius;
        /** How far below the logo that bed sits. */
        public final float depthOffsetY;
        /** Half-extent of the sweep's offscreen layer. */
        public final float sweepHalfExtent;
        /** Half-width of the travelling light band. */
        public final float sweepBandHalf;
        /** Half-height of the band (the rest is clipped by the layer). */
        public final float sweepBandHalfHeight;
        /** Text size of the CINEMAX wordmark. */
        public final float wordmarkSize;
        /** Air between the logo and the top of the wordmark's capitals. */
        public final float wordmarkGap;
        /** Top of the wordmark's capitals once the lockup has settled. */
        public final float wordmarkCapTop;
        /** Baseline the wordmark is drawn on. */
        public final float wordmarkBaselineY;
        /** Widest the wordmark may be drawn before its size is reduced. */
        public final float wordmarkMaxWidth;
        /** Top of the settled lockup / bottom of it, for the margin checks. */
        public final float lockupTop;
        public final float lockupBottom;
        public final int ambientSpriteWidth;
        public final int ambientSpriteHeight;
        public final int glowSpriteSide;
        /** Side of each pre-rendered curved colour band. */
        public final int waveSpriteWidth;
        public final int waveSpriteHeight;
        /** Scale the dolly starts from: the launch surface's own logo size. */
        public final float logoStartScale;

        private Layout(int width, int height, float centreX, float centreY,
                float logoSize, float logoRestCentreY, float lockupLift,
                float glowRadius, float depthRadius, float depthOffsetY,
                float sweepHalfExtent, float sweepBandHalf, float sweepBandHalfHeight,
                float wordmarkSize, float wordmarkGap, float wordmarkCapTop,
                float wordmarkBaselineY, float wordmarkMaxWidth,
                float lockupTop, float lockupBottom,
                int ambientSpriteWidth, int ambientSpriteHeight, int glowSpriteSide,
                int waveSpriteWidth, int waveSpriteHeight, float logoStartScale) {
            this.width = width;
            this.height = height;
            this.centreX = centreX;
            this.centreY = centreY;
            this.logoSize = logoSize;
            this.logoRestCentreY = logoRestCentreY;
            this.lockupLift = lockupLift;
            this.glowRadius = glowRadius;
            this.depthRadius = depthRadius;
            this.depthOffsetY = depthOffsetY;
            this.sweepHalfExtent = sweepHalfExtent;
            this.sweepBandHalf = sweepBandHalf;
            this.sweepBandHalfHeight = sweepBandHalfHeight;
            this.wordmarkSize = wordmarkSize;
            this.wordmarkGap = wordmarkGap;
            this.wordmarkCapTop = wordmarkCapTop;
            this.wordmarkBaselineY = wordmarkBaselineY;
            this.wordmarkMaxWidth = wordmarkMaxWidth;
            this.lockupTop = lockupTop;
            this.lockupBottom = lockupBottom;
            this.ambientSpriteWidth = ambientSpriteWidth;
            this.ambientSpriteHeight = ambientSpriteHeight;
            this.glowSpriteSide = glowSpriteSide;
            this.waveSpriteWidth = waveSpriteWidth;
            this.waveSpriteHeight = waveSpriteHeight;
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
     * Sizes everything from the viewport: the logo is centred on the horizontal
     * axis, the logo-and-wordmark pair is centred on the vertical axis, and both
     * are bounded so the complete lockup always fits with a healthy margin - on a
     * small phone, in landscape and on a tablet alike.
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

        // The wordmark is sized off the same short edge, then floored and capped
        // so it stays legible on a small phone and never shouts on a tablet.
        float wordmarkSize = smallest * WORDMARK_FRACTION;
        if (wordmarkSize < dp(WORDMARK_MIN_DP, density)) {
            wordmarkSize = dp(WORDMARK_MIN_DP, density);
        }
        if (wordmarkSize > dp(WORDMARK_MAX_DP, density)) {
            wordmarkSize = dp(WORDMARK_MAX_DP, density);
        }
        // Never tighter than a little over half the text size, whatever the screen.
        float wordmarkGap = Math.max(smallest * WORDMARK_GAP_FRACTION, wordmarkSize * 0.55f);

        float capHeight = wordmarkSize * WORDMARK_CAP_RATIO;
        // Centring the pair: the logo moves up by half of what hangs below it.
        float lockupLift = (wordmarkGap + capHeight) * 0.5f;

        float centreX = width * 0.5f;
        float centreY = height * 0.5f;
        float logoRestCentreY = centreY - lockupLift;
        float wordmarkCapTop = logoRestCentreY + logoSize * 0.5f + wordmarkGap;
        float wordmarkBaselineY = wordmarkCapTop + capHeight;
        float lockupTop = logoRestCentreY - logoSize * 0.5f;
        float lockupBottom = wordmarkBaselineY + wordmarkSize * 0.10f;

        float glowRadius = Math.min(logoSize * GLOW_RADIUS_FACTOR, smallest * GLOW_MAX_FRACTION);
        float depthRadius = logoSize * DEPTH_RADIUS_FACTOR;
        float depthOffsetY = logoSize * DEPTH_OFFSET_FACTOR;
        float sweepHalfExtent = logoSize * SWEEP_HALF_FACTOR;
        float sweepBandHalf = logoSize * SWEEP_BAND_FACTOR;
        // Tall enough that the rotated band always covers the artwork; the rest
        // is clipped by the sweep layer, so it costs nothing.
        float sweepBandHalfHeight = logoSize;
        float wordmarkMaxWidth = width * WORDMARK_MAX_WIDTH_FRACTION;

        // The soft light and the colour field are pre-rendered once per screen
        // size, so a frame is a handful of textured quads instead of full-screen
        // gradient fills, path tessellation or blur. Smooth gradients survive a
        // stretch: they carry no detail.
        int glowSpriteSide = clampInt(Math.round(glowRadius), 160, 384);
        int ambientSpriteWidth = clampInt(Math.round(width / 6f), 96, 384);
        int ambientSpriteHeight = clampInt(Math.round(height / 6f), 96, 384);
        int waveSpriteWidth = clampInt(Math.round(width / 5f),
                WAVE_SPRITE_WIDTH_MIN, WAVE_SPRITE_WIDTH_MAX);
        int waveSpriteHeight = clampInt(Math.round(height / 5f),
                WAVE_SPRITE_HEIGHT_MIN, WAVE_SPRITE_HEIGHT_MAX);

        return new Layout(width, height, centreX, centreY, logoSize, logoRestCentreY, lockupLift,
                glowRadius, depthRadius, depthOffsetY, sweepHalfExtent, sweepBandHalf,
                sweepBandHalfHeight, wordmarkSize, wordmarkGap, wordmarkCapTop, wordmarkBaselineY,
                wordmarkMaxWidth, lockupTop, lockupBottom,
                ambientSpriteWidth, ambientSpriteHeight, glowSpriteSide,
                waveSpriteWidth, waveSpriteHeight, logoScaleFrom(logoSize, density));
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

    private static int bandIndex(int band) {
        if (band < 0 || band >= BAND_COUNT) {
            throw new IllegalArgumentException("unknown colour band: " + band);
        }
        return band;
    }
}
