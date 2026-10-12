package com.cinemax.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.util.AttributeSet;
import android.view.View;
import android.view.animation.LinearInterpolator;

/**
 * The native Cinemax launch screen: the existing Cinemax logo, one light sweep
 * and a settled glow - nothing else.
 *
 * There is deliberately no wordmark, tagline, ring, orbit, dot, streak, ripple
 * or spinner anywhere in this view. The composition is a single centred logo on
 * a deep near-black canvas whose colour comes from three restrained brand
 * lights (blue, violet, pink).
 *
 * Why it stays smooth on Android:
 *
 *   · one view, one draw pass, one {@code invalidate()} per frame - no child
 *     hierarchy, no layout pass, no measure pass while the app starts;
 *   · the soft light is pre-rendered into small sprites once per screen size
 *     (a frame is a background fill plus a handful of textured quads), so there
 *     is no per-frame blur, no full-screen gradient shader fill and no
 *     {@code RenderEffect};
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
 * what keeps the logo complete and centred on every screen size.
 */
public final class CinemaxSplashView extends View {

    /** The full launch reveal. */
    public static final int MODE_INTRO = 0;
    /**
     * Still frame of the finished logo. Used when the page is reloaded (offline
     * retry, renderer restart, activity restoration): the same branding, never a
     * replay of the launch animation.
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
    private final Paint glowPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint depthPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint sweepPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final PorterDuffXfermode sweepBlend = new PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP);

    private final Rect ambientSrc = new Rect();
    private final Rect ambientDst = new Rect();
    private final Rect glowSrc = new Rect();
    private final Rect depthSrc = new Rect();
    private final Rect spriteDst = new Rect();
    private final RectF sweepLayer = new RectF();

    private Bitmap ambientSprite;
    private Bitmap glowSprite;
    private Bitmap depthSprite;
    private Shader sweepShader;
    private Drawable emblem;

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

    /** Milliseconds of the timeline that have been drawn. */    public long elapsedMillis() {
        return elapsedMillis;
    }

    /** How long the splash stays up even when the page is already painted. */
    public long minimumVisibleMillis() {
        return animationsEnabled
                ? SplashMotion.HANDOFF_MIN_VISIBLE_MILLIS
                : SplashMotion.REDUCED_MOTION_MIN_VISIBLE_MILLIS;
    }

    /** Called once per launch, when the logo has landed and the page may take over. */
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

        float glow = SplashMotion.glowAlpha(layerProgress(SplashMotion.LAYER_GLOW));
        if (glow > 0.004f && glowSprite != null) {
            float scale = SplashMotion.glowScale(layerProgress(SplashMotion.LAYER_GLOW));
            float radiusX = Math.max(1f, geometry.glowRadius * SplashMotion.GLOW_WIDTH_FACTOR * scale);
            float radiusY = Math.max(1f, geometry.glowRadius * SplashMotion.GLOW_HEIGHT_FACTOR * scale);
            float centreY = geometry.centreY - geometry.logoSize * SplashMotion.GLOW_LIFT_FACTOR;
            glowPaint.setAlpha(alphaOf(glow));
            spriteDst.set(Math.round(geometry.centreX - radiusX), Math.round(centreY - radiusY),
                    Math.round(geometry.centreX + radiusX), Math.round(centreY + radiusY));
            canvas.drawBitmap(glowSprite, glowSrc, spriteDst, glowPaint);
        }

        float depth = SplashMotion.depthAlpha(layerProgress(SplashMotion.LAYER_DEPTH));
        if (depth > 0.004f && depthSprite != null) {
            float radius = geometry.depthRadius;
            float centreY = geometry.centreY + geometry.depthOffsetY;
            depthPaint.setAlpha(alphaOf(depth));
            spriteDst.set(Math.round(geometry.centreX - radius), Math.round(centreY - radius),
                    Math.round(geometry.centreX + radius), Math.round(centreY + radius));
            canvas.drawBitmap(depthSprite, depthSrc, spriteDst, depthPaint);
        }

        drawLogo(canvas);
    }

    /* ------------------------------------------------------------- drawing */

    /**
     * The logo, drawn straight into its bounds (no canvas transform, no
     * save/restore): the entrance is a scale about the exact centre of the
     * screen, so the artwork is symmetric at every instant and can never drift
     * off centre or clip.
     */
    private void drawLogo(Canvas canvas) {
        if (emblem == null) {
            return;
        }
        float progress = layerProgress(SplashMotion.LAYER_LOGO);
        float alpha = SplashMotion.logoAlpha(progress);
        if (alpha <= 0.004f) {
            return;
        }
        // The logo never moves off centre: the entrance is a dolly from the size
        // the launch window left it at, so the artwork is symmetric at every
        // instant of the reveal, on every screen size.
        float half = geometry.logoSize
                * SplashMotion.logoScale(progress, geometry.logoStartScale) * 0.5f;
        emblem.setAlpha(alphaOf(alpha));
        emblem.setBounds(
                Math.round(geometry.centreX - half),
                Math.round(geometry.centreY - half),
                Math.round(geometry.centreX + half),
                Math.round(geometry.centreY + half));

        float sweepProgress = layerProgress(SplashMotion.LAYER_SWEEP);
        float travel = SplashMotion.sweepTravel(sweepProgress);
        float sweepAlpha = SplashMotion.sweepAlpha(sweepProgress);
        if (sweepAlpha <= 0.004f || !SplashMotion.sweepOverLogo(travel)) {
            emblem.draw(canvas);
            return;
        }
        drawLogoWithSweep(canvas, travel, sweepAlpha);
    }

    /**
     * Draws the light sweep where it belongs: across the logo and nowhere else.
     * The emblem goes into a small offscreen layer the size of the artwork, the
     * band is drawn into it with {@code SRC_ATOP}, and the layer is composited
     * back - so the light follows the logo's own shapes instead of a rectangle
     * around them. It is used for ~200 ms of the reveal, and never when the band
     * is off the artwork.
     */
    private void drawLogoWithSweep(Canvas canvas, float travel, float sweepAlpha) {
        int restore = canvas.saveLayer(sweepLayer, null);
        emblem.draw(canvas);
        sweepPaint.setShader(sweepShader);
        sweepPaint.setAlpha(alphaOf(sweepAlpha));
        sweepPaint.setXfermode(sweepBlend);
        canvas.save();
        canvas.translate(geometry.centreX + travel * (geometry.logoSize * 0.5f + geometry.sweepBandHalf),
                geometry.centreY);
        canvas.rotate(SWEEP_ANGLE_DEGREES);
        canvas.drawRect(-geometry.sweepBandHalf, -geometry.sweepBandHalfHeight,
                geometry.sweepBandHalf, geometry.sweepBandHalfHeight, sweepPaint);
        canvas.restore();
        sweepPaint.setXfermode(null);
        canvas.restoreToCount(restore);
    }

    /* ------------------------------------------------------------- sprites */

    /**
     * The soft light, rasterised once per screen size (and rebuilt if the veil
     * comes back later). Small on purpose: these are smooth gradients, so they
     * stretch to any screen without artefacts while keeping the per-frame cost
     * at a handful of textured quads.
     */
    private void ensureSprites() {
        if (ambientSprite != null && glowSprite != null && depthSprite != null) {
            return;
        }
        int ambientWidth = geometry.ambientSpriteWidth;
        int ambientHeight = geometry.ambientSpriteHeight;
        ambientSprite = buildAmbient(ambientWidth, ambientHeight);
        ambientSrc.set(0, 0, ambientWidth, ambientHeight);
        ambientDst.set(0, 0, getWidth(), getHeight());

        int glowSide = geometry.glowSpriteSide;
        glowSprite = buildSprite(glowSide, GLOW_COLOURS, GLOW_STOPS);
        glowSrc.set(0, 0, glowSide, glowSide);

        int depthSide = Math.max(48, glowSide / 2);
        depthSprite = buildSprite(depthSide, DEPTH_COLOURS, DEPTH_STOPS);
        depthSrc.set(0, 0, depthSide, depthSide);
    }

    private void releaseSprites() {
        ambientSprite = null;
        glowSprite = null;
        depthSprite = null;
    }

    /** Three brand lights over the deep ink: blue, violet, pink - and restrained. */
    private static Bitmap buildAmbient(int width, int height) {
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
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

    private void buildSweepLayer() {
        float extent = geometry.sweepHalfExtent;
        sweepLayer.set(geometry.centreX - extent, geometry.centreY - extent,
                geometry.centreX + extent, geometry.centreY + extent);
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
     * Tells the activity the logo has landed. Posted rather than run inline so
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
     * then shows the finished logo and hands over sooner instead of forcing
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
