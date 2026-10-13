package com.cinemax.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentCallbacks2;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Cinemax Android shell.
 *
 * The existing Cinemax web app *is* the product: this activity is a thin native
 * container around the production deployment. Nothing in the Next.js app, its
 * API routes, PostgreSQL data, studio (admin) login or playback pipeline is
 * replaced or forked here - the very same production site runs inside a WebView
 * with an app-only presentation layer on top.
 */
public class MainActivity extends Activity {

    /** The one and only content origin. Never localhost, never a dev server. */
    public static final String HOME_URL = "https://" + NavigationPolicy.PRODUCTION_HOST + "/";
    public static final String PRODUCTION_HOST = NavigationPolicy.PRODUCTION_HOST;

    private static final String JS_BRIDGE_NAME = "CinemaxNative";
    private static final long BACK_EXIT_WINDOW_MILLIS = 2000L;

    /**
     * True once this process has shown the launch reveal. A genuine cold start
     * plays it; an activity recreated inside a live process (a re-render, a
     * theme change, a restore) shows the finished logo instead of replaying the
     * animation, exactly like a reload after an offline retry.
     */
    private static boolean introConsumed;

    private FrameLayout rootView;
    private FrameLayout webContainer;
    private WebView web;
    private FrameLayout fullscreenHost;
    private View splashLayer;
    private CinemaxSplashView splashStage;
    private View errorLayer;
    private TextView errorMessage;
    private ProgressBar pageProgress;

    private Handler ui;
    private CinemaxChromeClient chromeClient;
    private boolean edgeToEdge;

    private boolean splashDismissed;
    private boolean pageReadyForHandoff;
    private long lastBackPressAt;
    private boolean pageProgressVisible;
    private boolean insetsPublished;

    /** Last measured window insets, in CSS pixels, pushed into the page. */
    private int insetTop;
    private int insetBottom;
    private int insetLeft;
    private int insetRight;
    private int pushedInsetTop = -1;
    private int pushedInsetBottom = -1;
    private int pushedInsetLeft = -1;
    private int pushedInsetRight = -1;

    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private int requestedOrientationBeforeFullscreen = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private boolean pagePlayerFullscreen;
    private int requestedOrientationBeforePlayerFullscreen = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;

    private final Runnable splashTimeout = new Runnable() {
        @Override
        public void run() {
            dismissSplash();
        }
    };

    private final Runnable handoffRunnable = new Runnable() {
        @Override
        public void run() {
            maybeDismissSplash();
        }
    };

    /** The stage calls this once the logo has landed. */
    private final Runnable revealLanded = new Runnable() {
        @Override
        public void run() {
            maybeDismissSplash();
        }
    };

    private final Runnable exitHintRunnable = new Runnable() {
        @Override
        public void run() {
            lastBackPressAt = 0L;
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ui = new Handler(Looper.getMainLooper());
        setContentView(R.layout.activity_main);

        rootView = (FrameLayout) findViewById(R.id.cinemax_root);
        webContainer = (FrameLayout) findViewById(R.id.cinemax_web_container);
        fullscreenHost = (FrameLayout) findViewById(R.id.cinemax_fullscreen_host);
        splashLayer = findViewById(R.id.cinemax_splash);
        splashStage = (CinemaxSplashView) findViewById(R.id.cinemax_splash_stage);
        errorLayer = findViewById(R.id.cinemax_error);
        errorMessage = (TextView) findViewById(R.id.cinemax_error_message);
        pageProgress = (ProgressBar) findViewById(R.id.cinemax_progress);

        findViewById(R.id.cinemax_retry).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                retryConnection();
            }
        });
        findViewById(R.id.cinemax_open_browser).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openExternal(HOME_URL);
            }
        });

        configureWindow();
        installSystemBarHandling();
        createWebView();

        // The reveal is a launch gesture, not a screen: one genuine cold start
        // per process plays it, everything else shows the finished logo. Nothing
        // here can replay it while the user is navigating, and nothing waits for
        // the animation beyond the hand-off gates below.
        boolean coldLaunch = savedInstanceState == null && !introConsumed;
        introConsumed = true;
        splashStage.setRevealListener(revealLanded);
        splashStage.setMode(coldLaunch
                ? CinemaxSplashView.MODE_INTRO
                : CinemaxSplashView.MODE_HOLD);
        splashStage.start();
        ui.postDelayed(splashTimeout, SplashMotion.SAFETY_TIMEOUT_MILLIS);
        loadUrl(initialUrl(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        boolean deepLink = intent != null
                && Intent.ACTION_VIEW.equals(intent.getAction())
                && intent.getData() != null;
        if (deepLink) {
            setIntent(intent);
            String url = initialUrl(intent);
            if (web != null && url != null) {
                hideError();
                web.loadUrl(url);
            }
            return;
        }
        // Re-opening the app from the launcher keeps the current page (and its
        // state) instead of reloading the home page under the user.
        if (web == null || web.getUrl() == null) {
            loadUrl(HOME_URL);
        }
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            exitFullscreen();
            return;
        }
        if (pagePlayerFullscreen) {
            // Let the React player update its own fullscreen control, then
            // restore portrait/system bars natively before navigating back.
            if (web != null) {
                web.evaluateJavascript("window.dispatchEvent(new Event('cinemax:native-fullscreen-exit'));if(document.fullscreenElement){document.exitFullscreen();}", null);
            }
            exitPlayerFullscreen();
            return;
        }
        if (errorLayer.getVisibility() == View.VISIBLE) {
            hideError();
            if (web != null && web.canGoBack()) {
                web.goBack();
            } else {
                finish();
            }
            return;
        }
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBackPressAt <= BACK_EXIT_WINDOW_MILLIS) {
            ui.removeCallbacks(exitHintRunnable);
            super.onBackPressed();
            return;
        }
        lastBackPressAt = now;
        ui.postDelayed(exitHintRunnable, BACK_EXIT_WINDOW_MILLIS);
        Toast.makeText(this, R.string.backexit_hint, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            web.onPause();
            web.pauseTimers();
            applyRendererPriority(false);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
            applyRendererPriority(true);
        }
        if (rootView != null) {
            rootView.requestApplyInsets();
        }
    }

    /**
     * Frees WebView caches before the system has to kill the process. The site's
     * own image/HTTP caches live in the renderer and are reused for the pixels
     * the user is about to scroll back into, so this is only done when the
     * platform reports real pressure.
     */
    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (web == null) {
            return;
        }
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            web.freeMemory();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && (customView != null || pagePlayerFullscreen)) {
            applyImmersiveFullscreen();
        }
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacks(splashTimeout);
        ui.removeCallbacks(handoffRunnable);
        ui.removeCallbacks(exitHintRunnable);
        if (splashStage != null) {
            splashStage.stop();
            splashStage.setRevealListener(null);
        }
        customView = null;
        customViewCallback = null;
        pagePlayerFullscreen = false;
        clearImmersiveFullscreen();
        if (web != null) {
            webContainer.removeView(web);
            web.setWebChromeClient(null);
            web.setWebViewClient(null);
            web.removeAllViews();
            web.destroy();
            web = null;
        }
        fullscreenHost.removeAllViews();
        super.onDestroy();
    }

    // ---------------------------------------------------------------- URLs

    /**
     * Production URL for a Cinemax deep link. Non-Cinemax URLs and non-web
     * schemes fall back to the Cinemax home surface.
     */
    private String initialUrl(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            Uri data = intent.getData();
            String scheme = data.getScheme();
            if (NavigationPolicy.isProductionUrl(scheme, data.getHost())) {
                return data.toString();
            }
        }
        return HOME_URL;
    }

    private void loadUrl(String url) {
        if (web == null || url == null) {
            return;
        }
        hideError();
        web.loadUrl(url);
    }

    private void retryConnection() {
        hideError();
        showReloadingVeil();
        String current = web == null ? null : web.getUrl();
        loadUrl(current != null && current.startsWith("http") ? current : HOME_URL);
    }

    /**
     * A branded veil for a document that is genuinely being reloaded (offline
     * retry, renderer restart, activity recreation). It shows the finished
     * logo - the launch reveal is never replayed outside a real app launch.
     */
    private void showReloadingVeil() {
        splashDismissed = false;
        pageReadyForHandoff = false;
        splashLayer.animate().cancel();
        splashLayer.setAlpha(1f);
        splashLayer.setScaleX(1f);
        splashLayer.setScaleY(1f);
        splashLayer.setVisibility(View.VISIBLE);
        splashStage.setMode(CinemaxSplashView.MODE_HOLD);
        splashStage.start();
        ui.removeCallbacks(handoffRunnable);
        ui.removeCallbacks(splashTimeout);
        ui.postDelayed(splashTimeout, SplashMotion.SAFETY_TIMEOUT_MILLIS);
    }

    // ------------------------------------------------------- window & insets

    private void configureWindow() {
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // Transparent bars blend into the deep-black Cinemax canvas rather
            // than creating a separate system-bar strip.
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
        }
    }

    /**
     * API 30+ draws edge to edge: the live page receives the measured insets and
     * respects the status bar, gesture bar, cutouts and rounded corners itself.
     * Older releases keep the platform's inset layout with transparent bars, so
     * the page is simply told there is nothing to add.
     */
    private void installSystemBarHandling() {
        edgeToEdge = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
        if (edgeToEdge) {
            getWindow().setDecorFitsSystemWindows(false);
        }

        rootView.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                int top = 0;
                int bottom = 0;
                int left = 0;
                int right = 0;
                int imeBottom = 0;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    android.graphics.Insets bars = insets.getInsets(
                            WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    top = bars.top;
                    bottom = bars.bottom;
                    left = bars.left;
                    right = bars.right;
                    imeBottom = insets.getInsets(WindowInsets.Type.ime()).bottom;
                } else {
                    top = insets.getSystemWindowInsetTop();
                    bottom = insets.getSystemWindowInsetBottom();
                    left = insets.getSystemWindowInsetLeft();
                    right = insets.getSystemWindowInsetRight();
                }

                if (!edgeToEdge) {
                    // The window itself is already inset below the system bars.
                    top = 0;
                    bottom = 0;
                    left = 0;
                    right = 0;
                }

                publishInsets(top, bottom, left, right);
                applyImePadding(imeBottom);
                return insets;
            }
        });
        rootView.requestApplyInsets();
    }

    private void publishInsets(int topPx, int bottomPx, int leftPx, int rightPx) {
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) {
            density = 1f;
        }
        int top = Math.round(topPx / density);
        int bottom = Math.round(bottomPx / density);
        int left = Math.round(leftPx / density);
        int right = Math.round(rightPx / density);
        if (top == insetTop && bottom == insetBottom && left == insetLeft && right == insetRight
                && insetsPublished) {
            // Insets are dispatched on every system-bar transition (and, on some
            // devices, repeatedly during a scroll gesture). Publishing unchanged
            // values would evaluate script on the page's main thread for nothing.
            return;
        }
        insetTop = top;
        insetBottom = bottom;
        insetLeft = left;
        insetRight = right;
        pushInsetsToPage();
    }

    private void pushInsetsToPage() {
        if (web == null) {
            return;
        }
        if (insetsPublished && insetTop == pushedInsetTop && insetBottom == pushedInsetBottom
                && insetLeft == pushedInsetLeft && insetRight == pushedInsetRight) {
            return;
        }
        pushedInsetTop = insetTop;
        pushedInsetBottom = insetBottom;
        pushedInsetLeft = insetLeft;
        pushedInsetRight = insetRight;
        insetsPublished = true;
        String script = "window.__cinemaxInsets&&window.__cinemaxInsets("
                + insetTop + "," + insetBottom + "," + insetLeft + "," + insetRight + ");";
        web.evaluateJavascript(script, null);
    }

    /** Keeps the keyboard from covering inputs on API 30+ edge-to-edge windows. */
    private void applyImePadding(int imeBottomPx) {
        if (!edgeToEdge || web == null) {
            return;
        }
        if (web.getPaddingBottom() != imeBottomPx) {
            web.setPadding(web.getPaddingLeft(), web.getPaddingTop(), web.getPaddingRight(), imeBottomPx);
        }
    }

    private void applyImmersiveFullscreen() {
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    private void clearImmersiveFullscreen() {
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
        } else {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
        if (rootView != null) {
            // Bars are back: re-measure so the page regains its insets.
            rootView.requestApplyInsets();
        }
    }

    // ------------------------------------------------------------- WebView

    private void createWebView() {
        web = new WebView(this);
        webContainer.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        configureWebView();
    }

    private void configureWebView() {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        // Honour the page's own responsive viewport (width=device-width,
        // initial-scale=1). Overview mode makes the WebView re-fit the whole
        // document to the view every time the document height changes - which,
        // on a catalogue that grows as rails lazily mount, is felt as sudden
        // layout jumps and scale wobble while scrolling.
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        // Never pre-rasterise offscreen content: it costs raster time and memory
        // on mid-range devices for pages the user has not reached.
        settings.setOffscreenPreRaster(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        // Text size is deliberately left at the platform default so the user's
        // system font-size preference is honoured (accessibility).
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setGeolocationEnabled(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // Beyond DOM storage: the site's catalogue/watchlist caches benefit from
        // the same quota a browser gives them.
        settings.setUserAgentString(settings.getUserAgentString()
                + " CinemaxAndroid/" + CinemaxBridge.APP_VERSION);

        web.setBackgroundColor(Color.parseColor("#050507"));
        // Deliberately NO setLayerType() here. Forcing LAYER_TYPE_HARDWARE on a
        // WebView takes it out of Chromium's own tiled/scanline compositing and
        // into a single GPU texture that has to be re-uploaded as the page
        // scrolls - the classic cause of stuttering vertical scrolling and high
        // GPU memory in Android WebView apps. The default (no forced layer)
        // keeps Chromium's fast path, including its dedicated render surface.
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        web.setHorizontalScrollBarEnabled(false);
        web.setWebViewClient(new CinemaxWebViewClient(this));
        chromeClient = new CinemaxChromeClient(this);
        web.setWebChromeClient(chromeClient);
        web.addJavascriptInterface(new CinemaxBridge(this), JS_BRIDGE_NAME);

        if (isDebuggableBuild()) {
            // Remote inspection only where the build itself is debuggable.
            WebView.setWebContentsDebuggingEnabled(true);
        } else {
            WebView.setWebContentsDebuggingEnabled(false);
        }

        // Keep the renderer process at foreground priority while the app is
        // visible so the compositor is never throttled mid-scroll; it is relaxed
        // in onPause() so a backgrounded app does not hold the process.
        applyRendererPriority(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookies.setAcceptThirdPartyCookies(web, true);
        }
    }

    private boolean isDebuggableBuild() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    /** Recovers from a WebView renderer crash instead of taking the app down. */
    public void recoverFromRendererCrash(final boolean crashed) {
        runOnUi(new Runnable() {
            @Override
            public void run() {
                if (web != null) {
                    webContainer.removeView(web);
                    web.setWebChromeClient(null);
                    web.setWebViewClient(null);
                    web.destroy();
                    web = null;
                }
                customView = null;
                customViewCallback = null;
                pagePlayerFullscreen = false;
                restoreOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                fullscreenHost.removeAllViews();
                fullscreenHost.setVisibility(View.GONE);
                clearImmersiveFullscreen();
                createWebView();
                showReloadingVeil();
                showError(getString(R.string.error_reload_body));
                web.loadUrl(HOME_URL);
                if (crashed) {
                    Toast.makeText(MainActivity.this, R.string.error_reload_hint, Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    // -------------------------------------------------------------- splash

    /**
     * The page reports that the app presentation layer is live, i.e. the real
     * home page has a themed first paint behind the splash.
     */
    public void onThemeApplied() {
        onPageReadyForHandoff();
    }

    public void onShellReady() {
        onPageReadyForHandoff();
    }

    public void onPageFinished(String url) {
        applyAppTheme();
        onPageReadyForHandoff();
    }

    private void onPageReadyForHandoff() {
        pageReadyForHandoff = true;
        maybeDismissSplash();
    }

    /**
     * Hands the screen over to the page once the reveal is actually visible and
     * the page is painted. There is deliberately no spinner or "Starting" copy:
     * a visible progress indicator belongs to real in-page navigation, not to
     * this branded hand-off, and the splash never blocks startup work - the
     * WebView starts loading the production site in onCreate().
     */
    private void maybeDismissSplash() {
        if (splashDismissed || splashLayer.getVisibility() != View.VISIBLE) {
            return;
        }
        if (!pageReadyForHandoff) {
            // Never uncover an unpainted page: a flash of empty dark canvas is
            // exactly what the splash exists to hide.
            return;
        }
        if (!splashStage.isStillFrame() && !splashStage.isHandoffReady()) {
            // The logo has not landed yet; the stage calls back when it has.
            return;
        }
        long remaining = splashStage.minimumVisibleMillis() - splashStage.elapsedMillis();
        if (remaining > 0L) {
            ui.removeCallbacks(handoffRunnable);
            ui.postDelayed(handoffRunnable, remaining + 16L);
            return;
        }
        dismissSplash();
    }

    private void dismissSplash() {
        if (splashDismissed) {
            return;
        }
        splashDismissed = true;
        ui.removeCallbacks(splashTimeout);
        ui.removeCallbacks(handoffRunnable);
        // Stop the timeline on the frame it reached. The cross-fade below only
        // changes this view's alpha and scale, which the render thread applies to
        // the recorded display list, so the hand-off costs no drawing and no
        // main-thread work while the page finishes painting.
        splashStage.freeze();
        splashLayer.animate()
                .alpha(0f)
                .scaleX(1.035f)
                .scaleY(1.035f)
                .setDuration(SplashMotion.HANDOFF_FADE_MILLIS)
                .withEndAction(new Runnable() {
                    @Override
                    public void run() {
                        splashLayer.setVisibility(View.GONE);
                        splashLayer.setAlpha(1f);
                        splashLayer.setScaleX(1f);
                        splashLayer.setScaleY(1f);
                        splashStage.stop();
                    }
                })
                .start();
    }

    /**
     * Keeps the renderer at foreground priority while the app is visible (so the
     * compositor is never throttled mid-scroll) and lets it go in the background.
     */
    private void applyRendererPriority(boolean foreground) {
        if (web == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        try {
            web.setRendererPriorityPolicy(
                    foreground ? WebView.RENDERER_PRIORITY_IMPORTANT : WebView.RENDERER_PRIORITY_WAIVED,
                    true);
        } catch (Exception ignored) {
            // Some vendor WebViews restrict this; the default policy applies.
        }
    }

    public void onPageProgress(int progress) {
        if (pageProgress == null) {
            return;
        }
        if (!pageProgressVisible && progress > 0 && progress < 100) {
            pageProgressVisible = true;
            pageProgress.setVisibility(View.VISIBLE);
            pageProgress.setAlpha(1f);
        }
        pageProgress.setProgress(progress);
        if (progress >= 100 && pageProgressVisible) {
            pageProgressVisible = false;
            pageProgress.animate().alpha(0f).setDuration(280).withEndAction(new Runnable() {
                @Override
                public void run() {
                    pageProgress.setVisibility(View.INVISIBLE);
                    pageProgress.setProgress(0);
                }
            }).start();
        }
    }

    // -------------------------------------------------------- app theming

    /**
     * Adds the app-only presentation layer to the live page. The deployment
     * itself is untouched: the theme is injected as an extra stylesheet plus a
     * small runtime, scoped to html[data-cinemax-app="android"].
     */
    public void applyAppTheme() {
        if (web == null) {
            return;
        }
        // 1. DOM-only bootstrap: app attributes plus the additive stylesheet.
        web.evaluateJavascript(AppTheme.injectionScript(this), null);
        // 2. The shell runtime (insets, playback reporting, viewport). Evaluated
        //    directly so it never depends on inline script execution being
        //    allowed by a page policy.
        web.evaluateJavascript(AppTheme.shellScript(this), null);
        // 3. A new document has a fresh (empty) page, so the insets are pushed
        //    again even though the measured values did not change.
        insetsPublished = false;
        pushInsetsToPage();
    }

    /** Hands an external URL (or non-http scheme) to the system. */
    public void openExternal(String url) {
        if (url == null) {
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException notFound) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    public void showToast(final String message) {
        if (message == null || message.length() == 0) {
            return;
        }
        runOnUi(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    /** Keeps the screen awake while the page reports active media playback. */
    public void onMediaPlaying(final boolean playing) {
        runOnUi(new Runnable() {
            @Override
            public void run() {
                if (web != null) {
                    web.setKeepScreenOn(playing);
                }
            }
        });
    }

    public void runOnUi(Runnable runnable) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            runnable.run();
        } else {
            ui.post(runnable);
        }
    }

    // --------------------------------------------------------- error state

    public void showError(String message) {
        runOnUi(new Runnable() {
            @Override
            public void run() {
                if (errorMessage != null && message != null) {
                    errorMessage.setText(message);
                }
                if (errorLayer.getVisibility() != View.VISIBLE) {
                    errorLayer.setAlpha(0f);
                    errorLayer.setVisibility(View.VISIBLE);
                    errorLayer.animate().alpha(1f).setDuration(260).start();
                }
                // The page cannot be shown, so the splash has nothing left to
                // hand over to; the offline surface owns the screen from here.
                dismissSplash();
            }
        });
    }

    public void hideError() {
        runOnUi(new Runnable() {
            @Override
            public void run() {
                if (errorLayer.getVisibility() == View.VISIBLE) {
                    errorLayer.animate().alpha(0f).setDuration(200).withEndAction(new Runnable() {
                        @Override
                        public void run() {
                            errorLayer.setVisibility(View.GONE);
                        }
                    }).start();
                }
            }
        });
    }

    // ---------------------------------------------------- video fullscreen

    /** HTML5 fullscreen (video or licensed provider embed) inside the app. */
    public void enterFullscreen(View view, WebChromeClient.CustomViewCallback callback) {
        if (customView != null) {
            if (callback != null) {
                callback.onCustomViewHidden();
            }
            return;
        }
        if (pagePlayerFullscreen) {
            exitPlayerFullscreen();
        }
        customView = view;
        customViewCallback = callback;
        requestedOrientationBeforeFullscreen = getRequestedOrientation();
        fullscreenHost.setVisibility(View.VISIBLE);
        fullscreenHost.addView(view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        fullscreenHost.bringToFront();
        pageProgress.setVisibility(View.INVISIBLE);
        pageProgressVisible = false;
        applyImmersiveFullscreen();
        requestLandscapeOrientation();
    }

    public void exitFullscreen() {
        if (customView == null) {
            return;
        }
        View view = customView;
        WebChromeClient.CustomViewCallback callback = customViewCallback;
        customView = null;
        customViewCallback = null;
        fullscreenHost.removeView(view);
        fullscreenHost.setVisibility(View.GONE);
        clearImmersiveFullscreen();
        restoreOrientation(requestedOrientationBeforeFullscreen);
        if (callback != null) {
            callback.onCustomViewHidden();
        }
    }

    /**
     * Fullscreen requested by the custom React player. Unlike a browser custom
     * view, the WebView remains mounted so playback state, HLS buffers and the
     * current route survive orientation changes.
     */
    public void enterPlayerFullscreen() {
        runOnUi(new Runnable() {
            @Override
            public void run() {
                if (pagePlayerFullscreen || customView != null) {
                    return;
                }
                pagePlayerFullscreen = true;
                requestedOrientationBeforePlayerFullscreen = getRequestedOrientation();
                applyImmersiveFullscreen();
                requestLandscapeOrientation();
            }
        });
    }

    public void exitPlayerFullscreen() {
        runOnUi(new Runnable() {
            @Override
            public void run() {
                if (!pagePlayerFullscreen) {
                    return;
                }
                pagePlayerFullscreen = false;
                clearImmersiveFullscreen();
                restoreOrientation(requestedOrientationBeforePlayerFullscreen);
            }
        });
    }

    public boolean isFullscreen() {
        return customView != null || pagePlayerFullscreen;
    }

    /** A video fullscreen button always opens a landscape cinema surface. */
    private void requestLandscapeOrientation() {
        try {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } catch (Exception ignored) {
            // Orientation locks can be restricted; immersive playback still works.
        }
    }

    private void restoreOrientation(int previousOrientation) {
        try {
            setRequestedOrientation(previousOrientation);
        } catch (Exception ignored) {
            // The device may refuse while the activity is not resumed.
        }
    }

}
