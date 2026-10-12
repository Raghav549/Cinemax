package com.cinemax.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.util.AttributeSet;
import android.view.View;
import android.view.animation.LinearInterpolator;

/**
 * The native Cinemax launch screen: a short cinematic composition that ends on
 * the Cinemax lockup - the existing emblem with the CINEMAX wordmark beneath it.
 *
 * The choreography (all of the arithmetic lives in {@link SplashMotion}):
 *
 *   1. a clean, nearly black canvas, with a restrained blue-violet light coming
 *      up around the centre;
 *   2. three broad, curved colour bands - blue above, violet through purple in
 *      the middle, pink-magenta below - expanding out of that central
 *      composition towards the edges, each on its own clock so they parallax;
 *   3. the logo dollying up from the size the launch window left it at, with a
 *      controlled overshoot and settle, lifting just enough for the finished
 *      logo-and-wordmark pair to be centred as a whole, crossed once by a
 *      blue-to-pink light sweep;
 *   4. the CINEMAX wordmark fading up a short way beneath the settled logo.
 *
 * Why it stays smooth on Android:
 *
 *   · one view, one draw pass, one {@code invalidate()} per frame - no child
 *     hierarchy, no layout pass, no measure pass while the app starts;
 *   · every soft or curved surface is pre-rendered into a small sprite once per
 *     screen size (a frame is a background fill plus a handful of textured
 *     quads), so there is no per-frame blur, no full-screen shader fill, no path
 *     tessellation and no {@code RenderEffect};
 *   · only transform-style values are animated (alpha, scale, offsets) and a
 *     frame allocates nothing;
 *   · the light sweep - the only effect that needs an offscreen layer - uses a
 *     layer barely larger than the logo, and only for the ~200 ms in which the
 *     band can actually touch the artwork;
 *   · the timeline does not loop: at {@link SplashMotion#REVEAL_MILLIS} the
 *     splash is a still frame, the animator stops and the view stops requesting
 *     frames altogether, so the WebView's first paint of the site gets the whole
 *     frame budget;
 *   · the hand-off freezes the timeline and only animates this layer's alpha and
 *     scale, which the render thread applies to the recorded display list.
 *
 * The timeline itself lives in {@link SplashMotion} (pure arithmetic, unit
 * tested on the JVM) and the geometry in {@link SplashMotion#layout}, which is
 * what keeps the lockup complete, centred and inside its margins on every screen
 * size and in every orientation.
 */
public final class CinemaxSplashView extends View {

    /** The full launch reveal. */
    public static final int MODE_INTRO = 0;
    /**
     * Still frame of the finished lockup. Used when the page is reloaded
     * (offline retry, renderer restart, activity restoration): the same
     * branding, never a replay of the launch animation.
     */
    public static final int MODE_HOLD = 1;

    /** Deep near-black canvas; the lights are drawn on top of it. */
    private static final int INK = 0xFF050507;

    /** The three restrained brand lights of the background wash. */
    private static final int WASH_BLUE = 0x335E96FF;
    private static final int WASH_BLUE_OUT = 0x005E96FF;
    private static final int WASH_VIOLET = 0x147C4DFF;
    private static final int WASH_VIOLET_OUT = 0x007C4DFF;
    private static final int WASH_PINK = 0x17EF76CB;
    private static final int WASH_PINK_OUT = 0x00EF76CB;
    /** A very soft vertical base so the colour field never meets bare ink. */
    private static final int BASE_TOP = 0x24122A6B;
    private static final int BASE_MID = 0x0F16123A;
    private static final int BASE_BOTTOM = 0x1C3A1140;

    /** Glow: a cool core easing through brand blue and violet into pink. */
    private static final int[] GLOW_COLOURS = {
            0x6BD8F0FF, 0x475E96FF, 0x2E7C4DFF, 0x17EF76CB, 0x08EF76CB, 0x00050507,
    };
    private static final float[] GLOW_STOPS = {0f, 0.22f, 0.48f, 0.70f, 0.88f, 1f};

    /** The dark bed that separates the logo from the light behind it. */
    private static final int[] DEPTH_COLOURS = {0xB8000000, 0x52000000, 0x00000000};
    private static final float[] DEPTH_STOPS = {0f, 0.45f, 1f};

    /** The sweep: pink trailing edge, white-hot core, blue leading edge. */
    private static final int[] SWEEP_COLOURS = {
            0x00FF7AC8, 0x99FF7AC8, 0xE6FFFFFF, 0xB35EA8FF, 0x005EA8FF,
    };
    private static final float[] SWEEP_STOPS = {0f, 0.26f, 0.52f, 0.78f, 1f};
    private static final float SWEEP_ANGLE_DEGREES = -20f;

    /*
     * The colour field. Each band is baked once per screen size into a small
     * sprite: a broad cubic boundary across the screen, filled with a vertical
     * gradient that fades to nothing instead of ending on a line. The boundary
     * control points are fractions of the viewport, so the same design lands in
     * the same place on a phone, in landscape and on a tablet.
     */

    /** Blue / violet boundary: two cubic segments, in fractions of the screen. */
    private static final float[] EDGE_UPPER = {
            0.00f, 0.360f, 0.16f, 0.262f, 0.30f, 0.212f, 0.50f, 0.300f,
            0.70f, 0.388f, 0.86f, 0.418f, 1.00f, 0.330f,
    };
    /** Violet / pink boundary. */
    private static final float[] EDGE_LOWER = {
            0.00f, 0.600f, 0.16f, 0.702f, 0.32f, 0.742f, 0.50f, 0.650f,
            0.68f, 0.558f, 0.84f, 0.528f, 1.00f, 0.620f,
    };

    /**
     * The three bands cross-fade across their shared boundaries: each one holds a
     * near-opaque plateau through its interior and only fades where the next band
     * is already rising, so the field reads as three flowing layers of colour and
     * never as a hard seam of bare ink between them.
     */

    /** Upper band: deep blue into electric blue, cross-fading down into violet. */
    private static final int[] BAND_BLUE_COLOURS = {0xF2305AD6, 0xE85A3BD8};
    private static final float[] BAND_BLUE_STOPS = {0f, 1f};
    private static final float BAND_BLUE_TOP = 0f;
    private static final float BAND_BLUE_BOTTOM = 0.40f;
    private static final float BAND_BLUE_OVERLAP = 0.06f;

    /** Middle band: violet through purple, ramping in over the blue's fade. */
    private static final int[] BAND_VIOLET_COLOURS = {0xF26A45E0, 0xE8A03BC0};
    private static final float[] BAND_VIOLET_STOPS = {0f, 1f};
    private static final float BAND_VIOLET_TOP = 0.26f;
    private static final float BAND_VIOLET_BOTTOM = 0.68f;
    private static final float BAND_VIOLET_OVERLAP = 0.06f;

    /** Lower band: magenta into the brand pink, brightest at the bottom edge. */
    private static final int[] BAND_PINK_COLOURS = {0xF0C2409E, 0xF2EF76CB};
    private static final float[] BAND_PINK_STOPS = {0f, 1f};
    private static final float BAND_PINK_TOP = 0.56f;
    private static final float BAND_PINK_BOTTOM = 1f;
    private static final float BAND_PINK_OVERLAP = 0.06f;

    /** The wordmark: brand typeface, brand tracking, no effects. */
    private static final String WORDMARK = "CINEMAX";
    private static final String WORDMARK_ASSET = "cinemax/fonts/outfit-semibold.ttf";
    private static final String WORDMARK_FALLBACK_FAMILY = "sans-serif-medium";
    private static final int WORDMARK_COLOUR = 0xFFF7F4FF;
    /** How far the wordmark travels up, in units of its own text size. */
    private static final float WORDMARK_RISE_EM = 0.34f;

    /* -------------------------------------------------------------- state */

    private int mode = MODE_INTRO;
    private final boolean animationsEnabled;
    private boolean frozen;
    private boolean handoffAnnounced;
    private long elapsedMillis;
    private Runnable revealListener;

    private ValueAnimator animator;
    private final LinearInterpolator interpolator = new LinearInterpolator();

    /* -------------------------------------------------------------- paint */

    private final Paint ambientPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint wavePaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint glowPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint depthPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint sweepPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint wordmarkPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
    private final PorterDuffXfermode sweepBlend = new PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP);

    private final Rect ambientSrc = new Rect();
    private final Rect ambientDst = new Rect();
    private final Rect glowSrc = new Rect();
    private final Rect depthSrc = new Rect();
    private final Rect[] waveSrc = {new Rect(), new Rect(), new Rect()};
    private final Rect spriteDst = new Rect();
    private final RectF sweepLayer = new RectF();

    private Bitmap ambientSprite;
    private Bitmap[] waveSprites;
    private Bitmap glowSprite;
    private Bitmap depthSprite;
    private Shader sweepShader;
    private Drawable emblem;

    private boolean typefaceResolved;
    /** Measured width of the wordmark at its designed size, for the fit check. */
    private float wordmarkMeasured;
    /** The text size actually used (reduced only if the screen is too narrow). */
    private float wordmarkTextSize;
    /** Baseline used at rest; the reveal adds the rise offset to it. */
    private float wordmarkBaseline;

    private SplashMotion.Layout geometry;
    private boolean laidOut;

    public CinemaxSplashView(Context context) {
        this(context, null);
    }

    public CinemaxSplashView(Context context, AttributeSet attrs) {
        super(context, attrs);
        setWillNotDraw(false);
        setContentDescription(context.getString(R.string.splash_lockup_desc));
        animationsEnabled = resolveAnimationsEnabled(context);
    }

    /* --------------------------------------------------------- public API */

    /** The full reveal, or the still frame of a re-entry. */
    public void setMode(int mode) {
        this.mode = mode == MODE_HOLD ? MODE_HOLD : MODE_INTRO;
        this.frozen = false;
        this.handoffAnnounced = false;
        this.elapsedMillis = this.mode == MODE_HOLD ? SplashMotion.REVEAL_MILLIS : 0L;
        invalidate();
    }

    /** True while the launch reveal is playing (never for a re-entry). */
    public boolean isIntro() {
        return mode == MODE_INTRO;
    }

    /** The mode the view was asked to play. */
    public int getMode() {
        return mode;
    }

    /** Milliseconds of the timeline that have been drawn. */
    public long elapsedMillis() {
        return elapsedMillis;
    }

    /** How long the splash stays up even when the page is already painted. */
    public long minimumVisibleMillis() {
        return animationsEnabled
                ? SplashMotion.HANDOFF_MIN_VISIBLE_MILLIS
                : SplashMotion.REDUCED_MOTION_MIN_VISIBLE_MILLIS;
    }

    /** Called once per launch, when the lockup has landed and the page may take over. */
    public void setRevealListener(Runnable listener) {
        this.revealListener = listener;
    }

    /** True when the reveal is a still frame (re-entry or system animations disabled). */
    public boolean isStillFrame() {
        return !animationsEnabled || mode == MODE_HOLD;
    }

    public boolean isHandoffReady() {
        return SplashMotion.handoffReady(elapsedMillis);
    }

    /** Starts (or restarts) the reveal. A still frame in {@link #MODE_HOLD}. */
    public void start() {
        cancelAnimator();
        elapsedMillis = 0L;
        frozen = false;
        handoffAnnounced = false;
        if (mode == MODE_HOLD || !animationsEnabled) {
            // Reduced motion: show the finished frame and let the page in as
            // soon as it is ready instead of animating the reveal.
            elapsedMillis = SplashMotion.REVEAL_MILLIS;
            invalidate();
            announceHandoff();
            return;
        }
        animator = ValueAnimator.ofFloat(0f, 1f);
        animator.setDuration(SplashMotion.REVEAL_MILLIS);
        animator.setInterpolator(interpolator);
        animator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator animation) {
                if (frozen) {
                    return;
                }
                elapsedMillis = (long) (animation.getAnimatedFraction() * SplashMotion.REVEAL_MILLIS);
                if (elapsedMillis >= SplashMotion.REVEAL_MILLIS) {
                    elapsedMillis = SplashMotion.REVEAL_MILLIS;
                }
                if (SplashMotion.handoffReady(elapsedMillis)) {
                    announceHandoff();
                }
                invalidate();
            }
        });
        animator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                // The finished frame is the resting composition: the timeline is
                // over, so drop the animator instead of asking for more frames.
                // Deliberately does NOT touch the listener list here - Android
                // dispatches these callbacks while iterating that very list.
                if (animator == animation) {
                    animator = null;
                }
            }
        });
        animator.start();
        invalidate();
    }

    /**
     * Stops the timeline on the frame it reached. The hand-off cross-fade only
     * changes this layer's alpha and scale, which the render thread applies to
     * the already-recorded display list, so freezing here means the fade itself
     * costs no drawing and no main-thread work.
     */
    public void freeze() {
        frozen = true;
        cancelAnimator();
    }

    /**
     * Releases the animator and the pre-rendered light once the splash is gone
     * for good. The bitmaps are dropped, never recycled: the render thread may
     * still be holding the last recorded display list, and a recycled bitmap in
     * it would crash the next frame. They are rebuilt from scratch the next time
     * the veil is shown.
     */
    public void stop() {
        cancelAnimator();
        releaseSprites();
    }

    /* ---------------------------------------------------------------- view */

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        ensureEmblem();
    }

    @Override
    protected void onDetachedFromWindow() {
        cancelAnimator();
        releaseSprites();
        super.onDetachedFromWindow();
    }

    @Override
    protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        super.onSizeChanged(width, height, oldWidth, oldHeight);
        if (width <= 0 || height <= 0) {
            return;
        }
        geometry = SplashMotion.layout(width, height, getResources().getDisplayMetrics().density);
        buildSweepLayer();
        releaseSprites();
        laidOut = true;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        // The opaque ink fill is the first thing on screen and the last thing on
        // screen: it is what makes the launch window, this reveal and the page
        // hand-off one continuous dark surface.
        canvas.drawColor(INK);
        if (!laidOut || geometry == null) {
            return;
        }
        ensureSprites();
        ensureEmblem();

        float ambient = SplashMotion.ambientAlpha(layerProgress(SplashMotion.LAYER_AMBIENT));
        if (ambient > 0.004f && ambientSprite != null) {
            ambientPaint.setAlpha(alphaOf(ambient));
            canvas.drawBitmap(ambientSprite, ambientSrc, ambientDst, ambientPaint);
        }

        drawWaveField(canvas, layerProgress(SplashMotion.LAYER_WAVE));

        // The light follows the logo: it blooms around the centre of the screen
        // where the artwork starts, and settles around where the artwork ends.
        float logoProgress = layerProgress(SplashMotion.LAYER_LOGO);
        float logoCentreY = logoCentreY(logoProgress);

        float glow = SplashMotion.glowAlpha(layerProgress(SplashMotion.LAYER_GLOW));
        if (glow > 0.004f && glowSprite != null) {
            float scale = SplashMotion.glowScale(layerProgress(SplashMotion.LAYER_GLOW));
            float radiusX = Math.max(1f, geometry.glowRadius * SplashMotion.GLOW_WIDTH_FACTOR * scale);
            float radiusY = Math.max(1f, geometry.glowRadius * SplashMotion.GLOW_HEIGHT_FACTOR * scale);
            float centreY = logoCentreY - geometry.logoSize * SplashMotion.GLOW_LIFT_FACTOR;
            glowPaint.setAlpha(alphaOf(glow));
            spriteDst.set(Math.round(geometry.centreX - radiusX), Math.round(centreY - radiusY),
                    Math.round(geometry.centreX + radiusX), Math.round(centreY + radiusY));
            canvas.drawBitmap(glowSprite, glowSrc, spriteDst, glowPaint);
        }

        float depth = SplashMotion.depthAlpha(layerProgress(SplashMotion.LAYER_DEPTH));
        if (depth > 0.004f && depthSprite != null) {
            float radius = geometry.depthRadius;
            float centreY = logoCentreY + geometry.depthOffsetY;
            depthPaint.setAlpha(alphaOf(depth));
            spriteDst.set(Math.round(geometry.centreX - radius), Math.round(centreY - radius),
                    Math.round(geometry.centreX + radius), Math.round(centreY + radius));
            canvas.drawBitmap(depthSprite, depthSrc, spriteDst, depthPaint);
        }

        drawLogo(canvas, logoProgress, logoCentreY);
        drawWordmark(canvas);
    }

    /* ------------------------------------------------------------- drawing */

    /**
     * The expanding colour field: three pre-rendered curved bands, each drawn as
     * one textured quad scaled about the centre of the screen. No path work, no
     * shader fill and no allocation happens per frame - the shape and the
     * gradient were rasterised once in {@link #ensureSprites()}.
     */
    private void drawWaveField(Canvas canvas, float progress) {
        if (waveSprites == null) {
            return;
        }
        // The field is always full-bleed left to right (a small constant overhang
        // keeps the sprite's own vertical edges off screen); only the vertical
        // extent animates, so the curved boundaries rise and bloom into place
        // without ever exposing a hard horizontal edge mid-reveal.
        float halfWidth = geometry.width * 0.5f * 1.04f;
        float halfHeight = geometry.height * 0.5f;
        for (int band = 0; band < SplashMotion.BAND_COUNT; band++) {
            float alpha = SplashMotion.waveAlpha(progress, band);
            if (alpha <= 0.004f) {
                continue;
            }
            float extentX = halfWidth;
            float extentY = halfHeight * SplashMotion.waveScale(progress, band);
            wavePaint.setAlpha(alphaOf(alpha));
            spriteDst.set(Math.round(geometry.centreX - extentX), Math.round(geometry.centreY - extentY),
                    Math.round(geometry.centreX + extentX), Math.round(geometry.centreY + extentY));
            canvas.drawBitmap(waveSprites[band], waveSrc[band], spriteDst, wavePaint);
        }
    }

    /**
     * The logo, drawn straight into its bounds (no canvas transform, no
     * save/restore): the entrance is a dolly about the exact centre of the
     * artwork, so it is symmetric at every instant and can never distort or clip.
     */
    private void drawLogo(Canvas canvas, float progress, float centreY) {
        if (emblem == null) {
            return;
        }
        float alpha = SplashMotion.logoAlpha(progress);
        if (alpha <= 0.004f) {
            return;
        }
        // The logo never rotates and never leaves the horizontal centre: the
        // entrance is a dolly (with a small controlled settle) plus a short lift
        // that centres the finished logo-and-wordmark pair as a whole.
        float half = geometry.logoSize
                * SplashMotion.logoScale(progress, geometry.logoStartScale) * 0.5f;
        emblem.setAlpha(alphaOf(alpha));
        emblem.setBounds(
                Math.round(geometry.centreX - half),
                Math.round(centreY - half),
                Math.round(geometry.centreX + half),
                Math.round(centreY + half));

        float sweepProgress = layerProgress(SplashMotion.LAYER_SWEEP);
        float travel = SplashMotion.sweepTravel(sweepProgress);
        float sweepAlpha = SplashMotion.sweepAlpha(sweepProgress);
        if (sweepAlpha <= 0.004f || !SplashMotion.sweepOverLogo(travel)) {
            emblem.draw(canvas);
            return;
        }
        drawLogoWithSweep(canvas, travel, sweepAlpha, centreY);
    }

    /**
     * Draws the light sweep where it belongs: across the logo and nowhere else.
     * The emblem goes into a small offscreen layer the size of the artwork, the
     * band is drawn into it with {@code SRC_ATOP}, and the layer is composited
     * back - so the light follows the logo's own shapes instead of a rectangle
     * around them. It is used for ~200 ms of the reveal, and never when the band
     * is off the artwork.
     */
    private void drawLogoWithSweep(Canvas canvas, float travel, float sweepAlpha, float centreY) {
        float extent = geometry.sweepHalfExtent;
        sweepLayer.set(geometry.centreX - extent, centreY - extent,
                geometry.centreX + extent, centreY + extent);
        int restore = canvas.saveLayer(sweepLayer, null);
        emblem.draw(canvas);
        sweepPaint.setShader(sweepShader);
        sweepPaint.setAlpha(alphaOf(sweepAlpha));
        sweepPaint.setXfermode(sweepBlend);
        canvas.save();
        canvas.translate(geometry.centreX + travel * (geometry.logoSize * 0.5f + geometry.sweepBandHalf),
                centreY);
        canvas.rotate(SWEEP_ANGLE_DEGREES);
        canvas.drawRect(-geometry.sweepBandHalf, -geometry.sweepBandHalfHeight,
                geometry.sweepBandHalf, geometry.sweepBandHalfHeight, sweepPaint);
        canvas.restore();
        sweepPaint.setXfermode(null);
        canvas.restoreToCount(restore);
    }

    /**
     * The CINEMAX wordmark, revealed after the logo has settled. It is plain
     * text: the brand face, the brand tracking, one solid colour and no shadow or
     * outline, so it stays crisp against the colour field at any size.
     */
    private void drawWordmark(Canvas canvas) {
        if (wordmarkTextSize <= 0f) {
            return;
        }
        float progress = layerProgress(SplashMotion.LAYER_WORDMARK);
        float alpha = SplashMotion.wordmarkAlpha(progress);
        if (alpha <= 0.004f) {
            return;
        }
        float rise = SplashMotion.wordmarkRise(progress) * wordmarkTextSize * WORDMARK_RISE_EM;
        wordmarkPaint.setAlpha(alphaOf(alpha));
        // Android's centred text layout includes the trailing letter-space, so
        // the optical centre is half a space to the left without this.
        float opticalCentre = geometry.centreX
                + wordmarkTextSize * SplashMotion.WORDMARK_LETTER_SPACING_EM * 0.5f;
        canvas.drawText(WORDMARK, opticalCentre, wordmarkBaseline + rise, wordmarkPaint);
    }

    /** Centre of the logo at a point in the reveal: the screen centre first. */
    private float logoCentreY(float logoProgress) {
        return geometry.centreY
                - geometry.lockupLift * SplashMotion.logoRise(logoProgress);
    }

    /* ------------------------------------------------------------- sprites */

    /**
     * The soft light and the colour field, rasterised once per screen size (and
     * rebuilt if the veil comes back later). Small on purpose: these are smooth
     * gradients, so they stretch to any screen without artefacts while keeping
     * the per-frame cost at a handful of textured quads.
     */
    private void ensureSprites() {
        if (ambientSprite != null && glowSprite != null && depthSprite != null
                && waveSprites != null) {
            return;
        }
        int ambientWidth = geometry.ambientSpriteWidth;
        int ambientHeight = geometry.ambientSpriteHeight;
        ambientSprite = buildAmbient(ambientWidth, ambientHeight);
        ambientSrc.set(0, 0, ambientWidth, ambientHeight);
        ambientDst.set(0, 0, getWidth(), getHeight());

        int waveWidth = geometry.waveSpriteWidth;
        int waveHeight = geometry.waveSpriteHeight;
        waveSprites = new Bitmap[] {
                buildBlueBand(waveWidth, waveHeight),
                buildVioletBand(waveWidth, waveHeight),
                buildPinkBand(waveWidth, waveHeight),
        };
        for (int band = 0; band < waveSprites.length; band++) {
            waveSrc[band].set(0, 0, waveWidth, waveHeight);
        }

        int glowSide = geometry.glowSpriteSide;
        glowSprite = buildSprite(glowSide, GLOW_COLOURS, GLOW_STOPS);
        glowSrc.set(0, 0, glowSide, glowSide);

        int depthSide = Math.max(48, glowSide / 2);
        depthSprite = buildSprite(depthSide, DEPTH_COLOURS, DEPTH_STOPS);
        depthSrc.set(0, 0, depthSide, depthSide);

        buildWordmark();
    }

    private void releaseSprites() {
        ambientSprite = null;
        waveSprites = null;
        glowSprite = null;
        depthSprite = null;
        wordmarkMeasured = 0f;
        wordmarkTextSize = 0f;
    }

    /**
     * The base of the canvas: a very soft vertical tint plus three brand lights.
     * Restrained on purpose - the colour field and the glow do the work, and this
     * only stops the field from ever meeting bare ink.
     */
    private static Bitmap buildAmbient(int width, int height) {
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new LinearGradient(0f, 0f, 0f, height,
                new int[] {BASE_TOP, BASE_MID, BASE_BOTTOM}, new float[] {0f, 0.52f, 1f},
                Shader.TileMode.CLAMP));
        canvas.drawRect(0f, 0f, width, height, paint);
        float longEdge = Math.max(width, height);
        canvas.drawRect(0f, 0f, width, height, wash(paint, width * 0.30f, height * 0.24f,
                longEdge * 0.62f, WASH_BLUE, WASH_BLUE_OUT));
        canvas.drawRect(0f, 0f, width, height, wash(paint, width * 0.52f, height * 0.50f,
                longEdge * 0.36f, WASH_VIOLET, WASH_VIOLET_OUT));
        canvas.drawRect(0f, 0f, width, height, wash(paint, width * 0.74f, height * 0.66f,
                longEdge * 0.56f, WASH_PINK, WASH_PINK_OUT));
        return bitmap;
    }

    private static Paint wash(Paint paint, float x, float y, float radius, int inner, int outer) {
        paint.setShader(new RadialGradient(x, y, Math.max(1f, radius), inner, outer, Shader.TileMode.CLAMP));
        return paint;
    }

    /** A radial sprite built from a stop list (glow and depth bed share it). */
    private static Bitmap buildSprite(int side, int[] colours, float[] stops) {
        int size = Math.max(8, side);
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        float radius = size * 0.5f;
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new RadialGradient(radius, radius, radius, colours, stops, Shader.TileMode.CLAMP));
        // Filled as a rectangle: the gradient is transparent at its rim, so the
        // corners are invisible and the reveal draws no circles, rings or dots.
        canvas.drawRect(0f, 0f, size, size, paint);
        return bitmap;
    }

    /** The upper band: the top of the screen down to the first curved boundary. */
    private static Bitmap buildBlueBand(int width, int height) {
        Bitmap bitmap = newBandBitmap(width, height);
        Canvas canvas = new Canvas(bitmap);
        float[] edge = shift(EDGE_UPPER, BAND_BLUE_OVERLAP);
        Path band = new Path();
        band.moveTo(0f, 0f);
        band.lineTo(width, 0f);
        band.lineTo(width, edge[13] * height);
        reverseBoundary(band, edge, width, height);
        band.close();
        canvas.drawPath(band, bandPaint(height, BAND_BLUE_TOP, BAND_BLUE_BOTTOM,
                BAND_BLUE_COLOURS, BAND_BLUE_STOPS));
        return bitmap;
    }

    /** The middle band: between the two curved boundaries. */
    private static Bitmap buildVioletBand(int width, int height) {
        Bitmap bitmap = newBandBitmap(width, height);
        Canvas canvas = new Canvas(bitmap);
        float[] top = shift(EDGE_UPPER, -BAND_VIOLET_OVERLAP);
        float[] bottom = shift(EDGE_LOWER, BAND_VIOLET_OVERLAP);
        Path band = new Path();
        band.moveTo(0f, top[1] * height);
        forwardBoundary(band, top, width, height);
        band.lineTo(width, bottom[13] * height);
        reverseBoundary(band, bottom, width, height);
        band.close();
        canvas.drawPath(band, bandPaint(height, BAND_VIOLET_TOP, BAND_VIOLET_BOTTOM,
                BAND_VIOLET_COLOURS, BAND_VIOLET_STOPS));
        return bitmap;
    }

    /** The lower band: from the second curved boundary down to the bottom edge. */
    private static Bitmap buildPinkBand(int width, int height) {
        Bitmap bitmap = newBandBitmap(width, height);
        Canvas canvas = new Canvas(bitmap);
        float[] edge = shift(EDGE_LOWER, -BAND_PINK_OVERLAP);
        Path band = new Path();
        band.moveTo(0f, edge[1] * height);
        forwardBoundary(band, edge, width, height);
        band.lineTo(width, height);
        band.lineTo(0f, height);
        band.close();
        canvas.drawPath(band, bandPaint(height, BAND_PINK_TOP, BAND_PINK_BOTTOM,
                BAND_PINK_COLOURS, BAND_PINK_STOPS));
        return bitmap;
    }

    private static Bitmap newBandBitmap(int width, int height) {
        return Bitmap.createBitmap(Math.max(8, width), Math.max(8, height), Bitmap.Config.ARGB_8888);
    }

    /**
     * A vertical gradient for one band, expressed in fractions of the sprite so
     * the same design scales with the screen. Every band fades to full
     * transparency at its outer end: nothing here ends on a hard line.
     */
    private static Paint bandPaint(int height, float topFraction, float bottomFraction,
            int[] colours, float[] stops) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new LinearGradient(0f, topFraction * height, 0f, bottomFraction * height,
                colours, stops, Shader.TileMode.CLAMP));
        return paint;
    }

    /**
     * Traces a boundary left to right. The fourteen fractions are two cubic
     * segments: start, two control points, middle, two control points, end.
     */
    private static void forwardBoundary(Path path, float[] edge, int width, int height) {
        path.cubicTo(edge[2] * width, edge[3] * height, edge[4] * width, edge[5] * height,
                edge[6] * width, edge[7] * height);
        path.cubicTo(edge[8] * width, edge[9] * height, edge[10] * width, edge[11] * height,
                edge[12] * width, edge[13] * height);
    }

    /** Copies a boundary with every control point shifted by {@code dy}. */
    private static float[] shift(float[] edge, float dy) {
        float[] shifted = new float[edge.length];
        for (int index = 0; index < edge.length; index += 2) {
            shifted[index] = edge[index];
            shifted[index + 1] = edge[index + 1] + dy;
        }
        return shifted;
    }

    /** The same boundary traced right to left, so a band can be closed. */
    private static void reverseBoundary(Path path, float[] edge, int width, int height) {
        path.cubicTo(edge[10] * width, edge[11] * height, edge[8] * width, edge[9] * height,
                edge[6] * width, edge[7] * height);
        path.cubicTo(edge[4] * width, edge[5] * height, edge[2] * width, edge[3] * height,
                edge[0] * width, edge[1] * height);
    }

    /**
     * Resolves the wordmark for this screen size: the brand face where it can be
     * loaded, the platform medium sans otherwise, at the designed size - reduced
     * only if the screen is too narrow for it. The measurement happens once per
     * size, never per frame.
     */
    private void buildWordmark() {
        ensureTypeface();
        wordmarkPaint.setTextAlign(Paint.Align.CENTER);
        wordmarkPaint.setColor(WORDMARK_COLOUR);
        wordmarkPaint.setLetterSpacing(SplashMotion.WORDMARK_LETTER_SPACING_EM);
        float size = geometry.wordmarkSize;
        wordmarkPaint.setTextSize(size);
        wordmarkMeasured = wordmarkPaint.measureText(WORDMARK);
        if (wordmarkMeasured > geometry.wordmarkMaxWidth && wordmarkMeasured > 0f) {
            size = size * (geometry.wordmarkMaxWidth / wordmarkMeasured);
            wordmarkPaint.setTextSize(size);
            wordmarkMeasured = wordmarkPaint.measureText(WORDMARK);
        }
        wordmarkTextSize = size;
        // Recomputed rather than taken from the layout maths so a reduced text
        // size keeps the same air below the logo instead of drifting up.
        wordmarkBaseline = geometry.wordmarkCapTop + size * SplashMotion.WORDMARK_CAP_RATIO;
    }

    /**
     * The brand face ships with the app as a static instance of the same Outfit
     * variable font the website uses (SIL Open Font License, kept next to it).
     * If it cannot be loaded for any reason the splash falls back to the
     * platform medium sans rather than failing to draw the lockup.
     */
    private void ensureTypeface() {
        if (typefaceResolved) {
            return;
        }
        typefaceResolved = true;
        Typeface loaded = null;
        try {
            loaded = Typeface.createFromAsset(getContext().getAssets(), WORDMARK_ASSET);
        } catch (Exception unavailable) {
            loaded = null;
        }
        wordmarkPaint.setTypeface(loaded != null
                ? loaded
                : Typeface.create(WORDMARK_FALLBACK_FAMILY, Typeface.NORMAL));
    }

    private void buildSweepLayer() {
        float half = geometry.sweepBandHalf;
        sweepShader = new LinearGradient(-half, 0f, half, 0f, SWEEP_COLOURS, SWEEP_STOPS,
                Shader.TileMode.CLAMP);
    }

    private void ensureEmblem() {
        if (emblem != null) {
            return;
        }
        try {
            // The one and only copy of the logo artwork (shared with the app
            // icon, the launch window and the offline screen).
            emblem = getResources().getDrawable(R.drawable.cinemax_emblem, null).mutate();
        } catch (Exception missing) {
            emblem = null;
        }
    }

    /* --------------------------------------------------------------- utils */

    private float layerProgress(int layer) {
        if (mode == MODE_HOLD) {
            return 1f;
        }
        return SplashMotion.progress(elapsedMillis, layer);
    }

    /**
     * Tells the activity the lockup has landed. Posted rather than run inline so
     * the activity can dismiss the splash (and cancel this animator) without
     * re-entering the animation callback.
     */
    private void announceHandoff() {
        if (handoffAnnounced) {
            return;
        }
        handoffAnnounced = true;
        final Runnable listener = revealListener;
        if (listener != null) {
            post(listener);
        }
    }

    private void cancelAnimator() {
        // The field is cleared first: cancel() can re-enter through the listener
        // above, and the listener list must never be mutated while Android is
        // dispatching callbacks from it.
        ValueAnimator running = animator;
        animator = null;
        if (running != null) {
            running.removeAllListeners();
            running.cancel();
        }
    }

    private static int alphaOf(float value) {
        int alpha = (int) (SplashMotion.clamp01(value) * 255f + 0.5f);
        return alpha > 255 ? 255 : alpha;
    }

    /**
     * Respects "Remove animations" / the developer animation scale: the splash
     * then shows the finished lockup and hands over sooner instead of forcing
     * motion the user asked to avoid.
     */
    private static boolean resolveAnimationsEnabled(Context context) {
        try {
            float scale = android.provider.Settings.Global.getFloat(context.getContentResolver(),
                    android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f);
            return scale > 0f;
        } catch (Exception unavailable) {
            return true;
        }
    }
}
