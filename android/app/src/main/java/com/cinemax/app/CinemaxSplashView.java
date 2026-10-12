package com.cinemax.app;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.SweepGradient;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.View;
import android.view.animation.LinearInterpolator;

import java.util.Locale;

/**
 * The native Cinemax launch reveal, drawn as one composited view.
 *
 * Why one custom view instead of a stack of animated children:
 *
 *   · one draw pass, one display list, one invalidate per frame - no layout
 *     passes and no view hierarchy to measure while the app is starting;
 *   · every shader, paint, rect and text metric is built once in
 *     {@link #onSizeChanged} and reused, so a frame allocates nothing and the
 *     animation never competes with the WebView's first paint of the site;
 *   · the timeline lives in {@link SplashMotion} (pure arithmetic, unit tested)
 *     and only transform-style properties are animated, so nothing here can
 *     invalidate layout.
 *
 * The choreography mirrors the website's intro with the same branding: the
 * emblem's folded "C" ribbon slides in, the fold follows from the other side, a
 * light stripe sweeps across the logo, soft rings expand, streaks travel, and
 * the lowercase "cinemax" wordmark rises with the gradient "x" of the logo.
 */
public final class CinemaxSplashView extends View {

    /** The full launch reveal. */
    public static final int MODE_INTRO = 0;
    /**
     * Still frame of the finished lockup. Used when the page is reloaded after
     * an offline retry or a renderer restart: the same branding, never a replay
     * of the launch animation.
     */
    public static final int MODE_HOLD = 1;

    private static final int INK = 0xFF050507;
    private static final int INK_SOFT = 0xFF090910;
    private static final int WORDMARK_INK = 0xFFFAF8FF;
    private static final int TEXT_SOFT = 0xFFC7BCE8;
    private static final int BRAND_BLUE = 0xFF5E96FF;
    private static final int BRAND_PINK = 0xFFEF76CB;
    private static final int RING_COOL = 0xFF8FA7FF;
    private static final int RING_WARM = 0xFFEF76CB;
    private static final int CYAN = 0xFF4FD8FF;
    private static final int VIOLET = 0xFF8B5CF6;
    private static final int MAGENTA = 0xFFFF4FA3;

    private static final String BRAND_FONT_ASSET = "cinemax/fonts/outfit-550.ttf";
    private static final float WORDMARK_SPACING_FROM = 0.085f;
    private static final float WORDMARK_SPACING_TO = -0.055f;

    /* -------------------------------------------------------------- state */

    private int mode = MODE_INTRO;
    private boolean animationsEnabled = true;
    private boolean frozen;
    private boolean handoffAnnounced;
    private boolean shadowApplied;
    private long startedAt;
    private long elapsedMillis;
    private Runnable revealListener;

    private ValueAnimator animator;
    private final LinearInterpolator interpolator = new LinearInterpolator();

    /* -------------------------------------------------------------- paint */

    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint haloPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint irisPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arcPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint headPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint streakPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint sheenPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint wordPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint xPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint rulePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint taglinePaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private PorterDuffXfermode sheenBlend;
    private Shader ambientBlueShader;
    private Shader ambientPinkShader;
    private Shader streakShader;
    private Shader sheenShader;
    private Shader wordmarkRuleShader;

    private final Matrix shaderMatrix = new Matrix();
    private final RectF layerBounds = new RectF();
    private final RectF arcBounds = new RectF();
    private final RectF scratch = new RectF();

    private Drawable ribbonDrawable;
    private Drawable foldDrawable;

    /* ------------------------------------------------------------ metrics */

    private float centreX;
    private float emblemCentreY;
    private float emblemSize;
    private float wordmarkBaseline;
    private float wordmarkSize;
    private float ruleCentreY;
    private float ruleMaxWidth;
    private float taglineBaseline;
    private float haloRadius;
    private float ringOuterRadius;
    private float ringMidRadius;
    private float arcRadius;
    private float arcStroke;
    private float irisInnerRadius;
    private float irisOuterRadius;
    private float streakLength;
    private float streakThicknessA;
    private float streakThicknessB;
    private float streakRadius;
    private float density;
    private float scaledDensity;

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

    /** The full intro, or the still frame of a re-entry. */
    public void setMode(int mode) {
        this.mode = mode == MODE_HOLD ? MODE_HOLD : MODE_INTRO;
        this.frozen = false;
        this.handoffAnnounced = false;
        this.elapsedMillis = this.mode == MODE_HOLD ? SplashMotion.REVEAL_MILLIS : 0L;
    }

    public int getMode() {
        return mode;
    }

    /** True while the launch reveal is playing (never for a re-entry). */
    public boolean isIntro() {
        return mode == MODE_INTRO;
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

    /** Starts (or restarts) the reveal. A still frame in {@link #MODE_HOLD}. */
    public void start() {
        cancelAnimator();
        startedAt = SystemClock.uptimeMillis();
        elapsedMillis = 0L;
        frozen = false;
        handoffAnnounced = false;
        if (mode == MODE_HOLD || !animationsEnabled) {
            // Reduced motion: show the finished lockup and let the page in as
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
                if (SplashMotion.handoffReady(elapsedMillis)) {
                    announceHandoff();
                }
                invalidate();
            }
        });
        animator.start();
    }

    /**
     * Stops the timeline on the frame it reached. The hand-off cross-fade only
     * changes the splash layer's alpha and scale, which the render thread
     * applies to the already-recorded display list, so freezing here means the
     * fade itself costs no drawing and no main-thread work.
     */
    public void freeze() {
        frozen = true;
        cancelAnimator();
    }

    /** Releases the animator once the splash is gone for good. */
    public void stop() {
        cancelAnimator();
    }

    public boolean isHandoffReady() {
        return SplashMotion.handoffReady(elapsedMillis);
    }

    /** True when the reveal is a still frame (system animations disabled). */
    public boolean isStillFrame() {
        return !animationsEnabled || mode == MODE_HOLD;
    }

    /* ---------------------------------------------------------------- view */

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        startedAt = SystemClock.uptimeMillis();
        loadDrawables();
    }

    @Override
    protected void onDetachedFromWindow() {
        cancelAnimator();
        super.onDetachedFromWindow();
    }

    @Override
    protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        super.onSizeChanged(width, height, oldWidth, oldHeight);
        if (width <= 0 || height <= 0) {
            return;
        }
        density = getResources().getDisplayMetrics().density;
        scaledDensity = getResources().getDisplayMetrics().scaledDensity;
        buildGeometry(width, height);
        buildPaints();
        laidOut = true;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        if (!laidOut) {
            canvas.drawColor(INK);
            return;
        }
        // Keep the timeline honest if a frame arrives late while the WebView is
        // loading the page on the same thread.
        if (mode == MODE_INTRO && !frozen && animator != null && animator.isRunning()) {
            long since = SystemClock.uptimeMillis() - startedAt;
            if (since > elapsedMillis) {
                elapsedMillis = Math.min(since, SplashMotion.REVEAL_MILLIS);
            }
        }
        drawBase(canvas);
        drawAmbient(canvas);
        // The launcher window (and the API 31+ system splash) leave the emblem
        // in the middle of the screen, so the reveal starts there and rises into
        // the lockup: one continuous movement instead of a jump between two
        // brand images. The ambient wash stays put - only the composition moves.
        int restore = canvas.save();
        canvas.translate(0f, revealLift());
        drawHalo(canvas);
        drawIris(canvas);
        drawRings(canvas);
        drawStreaks(canvas);
        drawLockup(canvas);
        canvas.restoreToCount(restore);
    }

    /**
     * Pixels the composition still has to rise: the distance from the launch
     * position (screen centre) to the emblem's resting place, gone once the
     * emblem's fold has landed.
     */
    private float revealLift() {
        if (mode == MODE_HOLD) {
            return 0f;
        }
        float landed = Math.max(SplashMotion.progress(elapsedMillis, SplashMotion.LAYER_RIBBON),
                SplashMotion.progress(elapsedMillis, SplashMotion.LAYER_FOLD));
        return (getHeight() * 0.5f - emblemCentreY) * SplashMotion.emblemLift(landed);
    }

    /* ------------------------------------------------------------ geometry */

    private void buildGeometry(int width, int height) {
        float smallest = Math.min(width, height);

        centreX = width * 0.5f;
        emblemSize = clamp(Math.min(dp(118f), smallest * 0.30f), dp(92f), dp(132f));

        Typeface brand = brandTypeface();
        wordPaint.setTypeface(brand);
        wordPaint.setTextAlign(Paint.Align.LEFT);
        wordPaint.setTextSize(sp(41f));
        wordPaint.setColor(WORDMARK_INK);
        xPaint.setTypeface(brand);
        xPaint.setTextAlign(Paint.Align.LEFT);
        xPaint.setTextSize(sp(41f));

        // Widest state of the reveal, so a large system font scale still fits.
        wordPaint.setLetterSpacing(WORDMARK_SPACING_FROM);
        xPaint.setLetterSpacing(WORDMARK_SPACING_FROM);
        float available = width - dp(44f);
        float measured = wordPaint.measureText("cinema") + xPaint.measureText("x");
        if (measured > available && measured > 0f) {
            float scaled = wordPaint.getTextSize() * (available / measured);
            wordPaint.setTextSize(scaled);
            xPaint.setTextSize(scaled);
        }
        wordmarkSize = wordPaint.getTextSize();

        taglinePaint.setTypeface(brand);
        taglinePaint.setTextAlign(Paint.Align.CENTER);
        taglinePaint.setTextSize(sp(11f));
        taglinePaint.setLetterSpacing(0.22f);
        taglinePaint.setColor(TEXT_SOFT);

        float wordmarkHeight = -wordPaint.getFontMetrics().ascent;
        float taglineHeight = -taglinePaint.getFontMetrics().ascent;
        float gapEmblemWordmark = dp(46f);
        float gapWordmarkRule = dp(20f);
        float gapRuleTagline = dp(30f);
        ruleMaxWidth = dp(96f);

        float lockupHeight = emblemSize + gapEmblemWordmark + wordmarkHeight + gapWordmarkRule
                + gapRuleTagline + taglineHeight;
        float preferredTop = height * 0.46f - lockupHeight * 0.5f;
        float maximumTop = Math.max(dp(56f), height - lockupHeight - dp(72f));
        float lockupTop = clamp(preferredTop, dp(56f), maximumTop);

        emblemCentreY = lockupTop + emblemSize * 0.5f;
        wordmarkBaseline = lockupTop + emblemSize + gapEmblemWordmark + wordmarkHeight;
        ruleCentreY = wordmarkBaseline + gapWordmarkRule;
        taglineBaseline = ruleCentreY + gapRuleTagline + taglineHeight;

        haloRadius = emblemSize * 1.22f;
        ringOuterRadius = emblemSize * 0.88f;
        ringMidRadius = emblemSize * 0.70f;
        arcRadius = emblemSize * 0.54f;
        arcStroke = dp(2.2f);
        irisInnerRadius = emblemSize * 0.30f;
        irisOuterRadius = emblemSize * 0.82f;
        streakLength = Math.max(width, height) * 1.35f;
        streakThicknessA = dp(1.6f);
        streakThicknessB = dp(1.1f);
        streakRadius = dp(1.4f);
    }

    private void buildPaints() {
        fillPaint.setStyle(Paint.Style.FILL);
        fillPaint.setShader(new LinearGradient(0f, 0f, 0f, getHeight(), INK_SOFT, INK, Shader.TileMode.CLAMP));

        glowPaint.setStyle(Paint.Style.FILL);
        float smallest = Math.min(getWidth(), getHeight());
        ambientBlueShader = new RadialGradient(getWidth() * 0.28f, getHeight() * 0.25f, smallest * 0.72f,
                BRAND_BLUE, BRAND_BLUE & 0x00FFFFFF, Shader.TileMode.CLAMP);
        ambientPinkShader = new RadialGradient(getWidth() * 0.76f, getHeight() * 0.58f, smallest * 0.66f,
                BRAND_PINK, BRAND_PINK & 0x00FFFFFF, Shader.TileMode.CLAMP);

        haloPaint.setStyle(Paint.Style.FILL);
        haloPaint.setShader(new RadialGradient(0f, 0f, haloRadius,
                new int[]{0x663F66E8, 0x22EF76CB, 0x00050507},
                new float[]{0f, 0.55f, 1f}, Shader.TileMode.CLAMP));

        irisPaint.setStyle(Paint.Style.STROKE);
        irisPaint.setStrokeCap(Paint.Cap.ROUND);
        irisPaint.setStrokeWidth(Math.max(1f, density));
        irisPaint.setShader(new LinearGradient(0f, irisInnerRadius, 0f, irisOuterRadius,
                new int[]{0x008FA7FF, 0x99CFE0FF, 0x008FA7FF},
                new float[]{0f, 0.45f, 1f}, Shader.TileMode.CLAMP));

        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setStrokeWidth(Math.max(1f, density));

        arcPaint.setStyle(Paint.Style.STROKE);
        arcPaint.setStrokeCap(Paint.Cap.ROUND);
        arcPaint.setStrokeWidth(arcStroke);
        arcPaint.setShader(new SweepGradient(0f, 0f,
                new int[]{0x00FFFFFF, 0xCC8FE0FF, 0xCCB08CFF, 0xCCFF7AC4, 0x00FFFFFF},
                new float[]{0f, 0.28f, 0.52f, 0.74f, 1f}));

        headPaint.setStyle(Paint.Style.FILL);
        headPaint.setColor(0xFFEAF6FF);

        streakPaint.setStyle(Paint.Style.FILL);
        streakShader = new LinearGradient(0f, 0f, streakLength, 0f,
                new int[]{0x00FFFFFF, 0xB3E8F2FF, 0x33C3A6FF, 0x00FFFFFF},
                new float[]{0f, 0.42f, 0.66f, 1f}, Shader.TileMode.CLAMP);
        streakPaint.setShader(streakShader);

        sheenPaint.setStyle(Paint.Style.FILL);
        sheenBlend = new PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP);

        wordPaint.setShader(null);
        wordPaint.setAlpha(255);
        xPaint.setShader(new LinearGradient(0f, 0f, wordmarkSize * 0.55f, -wordmarkSize * 0.35f,
                new int[]{0xFFB0A0FF, 0xFFED8BDF, 0xFFFF8BBA},
                new float[]{0.15f, 0.65f, 1f}, Shader.TileMode.CLAMP));
        xPaint.setAlpha(255);

        rulePaint.setStyle(Paint.Style.FILL);
        wordmarkRuleShader = new LinearGradient(0f, 0f, ruleMaxWidth, 0f,
                new int[]{CYAN, VIOLET, MAGENTA}, new float[]{0f, 0.52f, 1f}, Shader.TileMode.CLAMP);
        rulePaint.setShader(wordmarkRuleShader);

        taglinePaint.setShader(null);

        layerBounds.set(centreX - emblemSize * 0.62f, emblemCentreY - emblemSize * 0.62f,
                centreX + emblemSize * 0.62f, emblemCentreY + emblemSize * 0.62f);
        sheenShader = new LinearGradient(0f, 0f, layerBounds.width() * 0.5f, 0f,
                new int[]{0x00FFFFFF, 0xFFFFFFFF, 0x00FFFFFF},
                new float[]{0f, 0.5f, 1f}, Shader.TileMode.CLAMP);
        arcBounds.set(-arcRadius, -arcRadius, arcRadius, arcRadius);
    }

    /* ------------------------------------------------------------- drawing */

    private void drawBase(Canvas canvas) {
        canvas.drawRect(0f, 0f, getWidth(), getHeight(), fillPaint);
    }

    private void drawAmbient(Canvas canvas) {
        float alpha = SplashMotion.easeOutCubic(layerProgress(SplashMotion.LAYER_AMBIENT));
        if (alpha <= 0.004f) {
            return;
        }
        glowPaint.setShader(ambientBlueShader);
        glowPaint.setAlpha((int) (255f * 0.30f * alpha));
        canvas.drawCircle(getWidth() * 0.28f, getHeight() * 0.25f, Math.min(getWidth(), getHeight()) * 0.72f, glowPaint);
        glowPaint.setShader(ambientPinkShader);
        glowPaint.setAlpha((int) (255f * 0.22f * alpha));
        canvas.drawCircle(getWidth() * 0.76f, getHeight() * 0.58f, Math.min(getWidth(), getHeight()) * 0.66f, glowPaint);
    }

    private void drawHalo(Canvas canvas) {
        float progress = layerProgress(SplashMotion.LAYER_HALO);
        if (progress <= 0f) {
            return;
        }
        float eased = SplashMotion.easeOutCubic(progress);
        float scale = SplashMotion.lerp(0.78f, 1.04f, eased);
        if (!frozen && elapsedMillis > SplashMotion.REVEAL_MILLIS) {
            scale *= SplashMotion.breathScale(elapsedMillis);
        }
        haloPaint.setAlpha((int) (255f * Math.min(1f, eased * 1.15f)));
        canvas.save();
        canvas.translate(centreX, emblemCentreY);
        canvas.scale(scale, scale);
        canvas.drawCircle(0f, 0f, haloRadius, haloPaint);
        canvas.restore();
    }

    /** Six aperture blades that iris in and dissolve as the emblem lands. */
    private void drawIris(Canvas canvas) {
        float progress = layerProgress(SplashMotion.LAYER_IRIS);
        if (progress <= 0f || progress >= 1f) {
            return;
        }
        float alpha = SplashMotion.streakAlpha(0.55f, progress);
        if (alpha <= 0.006f) {
            return;
        }
        irisPaint.setAlpha((int) (255f * alpha));
        canvas.save();
        canvas.translate(centreX, emblemCentreY);
        canvas.rotate(SplashMotion.irisRotation(-9f, 4f, progress));
        for (int blade = 0; blade < 6; blade++) {
            canvas.save();
            canvas.rotate(blade * 60f);
            canvas.drawLine(0f, irisInnerRadius, 0f, irisOuterRadius, irisPaint);
            canvas.restore();
        }
        canvas.restore();
    }

    private void drawRings(Canvas canvas) {
        drawRing(canvas, SplashMotion.LAYER_RING_OUTER, ringOuterRadius, RING_COOL, 0.50f, 0.54f, 1.62f);
        drawRing(canvas, SplashMotion.LAYER_RING_MID, ringMidRadius, RING_WARM, 0.42f, 0.62f, 1.44f);
        drawArcRing(canvas);
    }

    private void drawRing(Canvas canvas, int layer, float radius, int colour, float peakAlpha,
            float fromScale, float toScale) {
        float progress = layerProgress(layer);
        if (progress <= 0f || progress >= 1f) {
            return;
        }
        float alpha = SplashMotion.ringAlpha(peakAlpha, progress);
        if (alpha <= 0.006f) {
            return;
        }
        ringPaint.setColor(colour);
        ringPaint.setAlpha((int) (255f * alpha));
        canvas.save();
        canvas.translate(centreX, emblemCentreY);
        float scale = SplashMotion.ringScale(fromScale, toScale, progress);
        canvas.scale(scale, scale);
        canvas.drawCircle(0f, 0f, radius, ringPaint);
        canvas.restore();
    }

    /** The aperture arc: a sweep that closes most of the circle, with a light head. */
    private void drawArcRing(Canvas canvas) {
        float progress = layerProgress(SplashMotion.LAYER_RING_ARC);
        if (progress <= 0f) {
            return;
        }
        float sweep = SplashMotion.lerp(0f, 286f, SplashMotion.easeInOutCubic(progress));
        arcPaint.setAlpha((int) (255f * Math.min(1f, 0.20f + 0.55f * SplashMotion.easeOutCubic(progress))));
        canvas.save();
        canvas.translate(centreX, emblemCentreY);
        canvas.rotate(-104f);
        canvas.drawArc(arcBounds, 0f, sweep, false, arcPaint);
        float headAlpha = SplashMotion.arcHeadAlpha(0.9f, progress);
        if (headAlpha > 0.01f) {
            double radians = Math.toRadians(sweep);
            headPaint.setAlpha((int) (255f * headAlpha));
            canvas.drawCircle((float) Math.cos(radians) * arcRadius, (float) Math.sin(radians) * arcRadius,
                    arcStroke * 1.35f, headPaint);
        }
        canvas.restore();
    }

    private void drawStreaks(Canvas canvas) {
        drawStreak(canvas, SplashMotion.LAYER_STREAK_A, streakThicknessA, -0.55f, 1.55f, -getHeight() * 0.06f, 0.55f);
        drawStreak(canvas, SplashMotion.LAYER_STREAK_B, streakThicknessB, 1.45f, -0.62f, getHeight() * 0.05f, 0.42f);
    }

    private void drawStreak(Canvas canvas, int layer, float thickness, float fromUnit, float toUnit,
            float offsetY, float peakAlpha) {
        float progress = layerProgress(layer);
        if (progress <= 0f || progress >= 1f) {
            return;
        }
        float alpha = SplashMotion.streakAlpha(peakAlpha, progress);
        if (alpha <= 0.006f) {
            return;
        }
        float travel = SplashMotion.lerp(fromUnit, toUnit, SplashMotion.easeOutQuint(progress));
        streakPaint.setAlpha((int) (255f * alpha));
        canvas.save();
        canvas.translate(centreX, emblemCentreY + offsetY);
        canvas.rotate(-24f);
        canvas.translate(travel * streakLength - streakLength * 0.5f, 0f);
        scratch.set(0f, -thickness * 0.5f, streakLength, thickness * 0.5f);
        canvas.drawRoundRect(scratch, streakRadius, streakRadius, streakPaint);
        canvas.restore();
    }

    private void drawLockup(Canvas canvas) {
        if (isSheenActive()) {
            drawEmblemWithSheen(canvas);
        } else {
            drawEmblem(canvas);
        }
        drawWordmark(canvas);
        drawRule(canvas);
        drawTagline(canvas);
    }

    private boolean isSheenActive() {
        float progress = layerProgress(SplashMotion.LAYER_SHEEN);
        return progress > 0f && progress < 1f;
    }

    private void drawEmblem(Canvas canvas) {
        drawEmblemPart(canvas, ribbonDrawable, SplashMotion.LAYER_RIBBON, -dp(14f), 0.93f, false);
        drawEmblemPart(canvas, foldDrawable, SplashMotion.LAYER_FOLD, dp(16f), 0.96f, true);
    }

    /**
     * Draws the emblem into a small offscreen layer so the light stripe is
     * clipped to the logo itself rather than a rectangle around it. That layer
     * is only ever used for the ~0.5 s of the sweep and is smaller than the
     * logo box, so it costs a fraction of a millisecond.
     */
    private void drawEmblemWithSheen(Canvas canvas) {
        float progress = layerProgress(SplashMotion.LAYER_SHEEN);
        int restore = canvas.saveLayer(layerBounds, null);
        drawEmblem(canvas);

        float alpha = SplashMotion.sheenAlpha(0.30f, progress);
        if (alpha > 0.004f) {
            sheenPaint.setShader(sheenShader);
            sheenPaint.setAlpha((int) (255f * alpha));
            sheenPaint.setXfermode(sheenBlend);
            canvas.save();
            canvas.translate(centreX + SplashMotion.lerp(-layerBounds.width(), layerBounds.width(),
                    SplashMotion.easeInOutSine(progress)), emblemCentreY);
            canvas.rotate(-18f);
            scratch.set(-layerBounds.width() * 0.32f, -layerBounds.height(),
                    layerBounds.width() * 0.32f, layerBounds.height());
            canvas.drawRect(scratch, sheenPaint);
            canvas.restore();
            sheenPaint.setXfermode(null);
        }
        canvas.restoreToCount(restore);
    }

    private void drawEmblemPart(Canvas canvas, Drawable drawable, int layer, float fromX,
            float fromScale, boolean overshoot) {
        if (drawable == null) {
            return;
        }
        float progress = layerProgress(layer);
        if (progress <= 0f) {
            return;
        }
        float alpha = SplashMotion.clamp01(progress * 2.4f);
        if (alpha <= 0.004f) {
            return;
        }
        float translateX = SplashMotion.lerp(fromX, 0f, SplashMotion.easeOutCubic(progress));
        float eased = overshoot ? SplashMotion.easeOutBack(progress) : SplashMotion.easeOutCubic(progress);
        float scale = SplashMotion.lerp(fromScale, 1f, eased);
        int half = Math.round(emblemSize * 0.5f);

        canvas.save();
        canvas.translate(centreX + translateX, emblemCentreY);
        canvas.scale(scale, scale);
        drawable.setBounds(-half, -half, half, half);
        drawable.setAlpha((int) (255f * alpha));
        drawable.draw(canvas);
        canvas.restore();
    }

    /** "cinema" in the brand ink, the closing "x" in the logo's gradient. */
    private void drawWordmark(Canvas canvas) {
        float progress = layerProgress(SplashMotion.LAYER_WORDMARK);
        if (progress <= 0f) {
            return;
        }
        float alpha = SplashMotion.clamp01(progress * 2.2f);
        if (alpha <= 0.004f) {
            return;
        }
        float spacing = SplashMotion.wordmarkLetterSpacing(WORDMARK_SPACING_FROM, WORDMARK_SPACING_TO, progress);
        wordPaint.setLetterSpacing(spacing);
        xPaint.setLetterSpacing(spacing);
        applyWordmarkShadow(progress < 1f);

        float y = wordmarkBaseline + SplashMotion.lerp(dp(16f), 0f, SplashMotion.easeOutCubic(progress));
        float headWidth = wordPaint.measureText("cinema");
        float xWidth = xPaint.measureText("x");
        float startX = centreX - (headWidth + xWidth) * 0.5f;

        int wordAlpha = (int) (255f * alpha);
        wordPaint.setAlpha(wordAlpha);
        xPaint.setAlpha(wordAlpha);
        canvas.drawText("cinema", startX, y, wordPaint);
        Shader xShader = xPaint.getShader();
        if (xShader != null) {
            shaderMatrix.setTranslate(startX + headWidth - wordmarkSize * 0.06f, y - wordmarkSize * 0.72f);
            xShader.setLocalMatrix(shaderMatrix);
        }
        canvas.drawText("x", startX + headWidth, y, xPaint);
    }

    private void applyWordmarkShadow(boolean enabled) {
        // Blurred text shadows on a hardware canvas are supported from API 28;
        // below that the wordmark renders flat, which is the right degrade.
        if (!enabled || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            if (shadowApplied) {
                wordPaint.clearShadowLayer();
                shadowApplied = false;
            }
            return;
        }
        if (!shadowApplied) {
            wordPaint.setShadowLayer(dp(13f), 0f, dp(1f), 0x668B5CF6);
            shadowApplied = true;
        }
    }

    /** Brand gradient rule that grows out from under the wordmark. */
    private void drawRule(Canvas canvas) {
        float progress = layerProgress(SplashMotion.LAYER_RULE);
        if (progress <= 0f) {
            return;
        }
        float width = ruleMaxWidth * SplashMotion.easeOutCubic(progress);
        if (width <= 0.5f) {
            return;
        }
        rulePaint.setAlpha((int) (255f * Math.min(1f, progress * 1.6f)));
        float thickness = dp(2f);
        float centre = ruleMaxWidth * 0.5f;
        float half = width * 0.5f;
        canvas.save();
        canvas.translate(centreX - centre, ruleCentreY - thickness * 0.5f);
        scratch.set(centre - half, 0f, centre + half, thickness);
        canvas.drawRoundRect(scratch, thickness, thickness, rulePaint);
        canvas.restore();
    }

    private void drawTagline(Canvas canvas) {
        float progress = layerProgress(SplashMotion.LAYER_TAGLINE);
        if (progress <= 0f) {
            return;
        }
        float alpha = SplashMotion.clamp01(progress * 1.8f);
        if (alpha <= 0.004f) {
            return;
        }
        float y = taglineBaseline + SplashMotion.lerp(dp(10f), 0f, SplashMotion.easeOutCubic(progress));
        taglinePaint.setAlpha((int) (255f * 0.80f * alpha));
        String tagline = getResources().getString(R.string.splash_tagline);
        canvas.drawText(tagline.toUpperCase(Locale.getDefault()), centreX, y, taglinePaint);
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
        if (animator != null) {
            animator.cancel();
            animator = null;
        }
    }

    private void loadDrawables() {
        if (ribbonDrawable != null && foldDrawable != null) {
            return;
        }
        try {
            ribbonDrawable = getResources().getDrawable(R.drawable.cinemax_emblem_ribbon, null).mutate();
            foldDrawable = getResources().getDrawable(R.drawable.cinemax_emblem_fold, null).mutate();
        } catch (Exception missing) {
            ribbonDrawable = null;
            foldDrawable = null;
        }
    }

    private Typeface brandTypeface() {
        try {
            return Typeface.createFromAsset(getContext().getAssets(), BRAND_FONT_ASSET);
        } catch (Exception unavailable) {
            // The platform face the app used before the brand font was packaged:
            // the splash must never fail to render.
            return Typeface.create("sans-serif-light", Typeface.NORMAL);
        }
    }

    private float dp(float value) {
        return value * density;
    }

    private float sp(float value) {
        // honours the user's system font scale
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, value,
                getResources().getDisplayMetrics());
    }

    private static float clamp(float value, float minimum, float maximum) {
        if (value < minimum) {
            return minimum;
        }
        if (value > maximum) {
            return maximum;
        }
        return value;
    }

    /**
     * Respects "Remove animations" / the developer animation scale: the splash
     * then shows a still lockup and hands over sooner instead of forcing motion
     * the user asked to avoid.
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
