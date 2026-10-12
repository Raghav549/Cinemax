package com.cinemax.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
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
    private static final long MIN_SPLASH_MILLIS = 1050L;
    private static final long SPLASH_TIMEOUT_MILLIS = 15000L;
    private static final long BACK_EXIT_WINDOW_MILLIS = 2000L;

    private FrameLayout rootView;
    private FrameLayout webContainer;
    private WebView web;
    private FrameLayout fullscreenHost;
    private View splashLayer;
    private View splashLockup;
    private View splashSpinner;
    private View splashStatus;
    private View errorLayer;
    private TextView errorMessage;
    private ProgressBar pageProgress;

    private Handler ui;
    private CinemaxChromeClient chromeClient;
    private boolean edgeToEdge;

    private long splashShownAt;
    private boolean splashDismissed;
    private long lastBackPressAt;
    private boolean pageProgressVisible;

    /** Last measured window insets, in CSS pixels, pushed into the page. */
    private int insetTop;
    private int insetBottom;
    private int insetLeft;
    private int insetRight;

    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private int requestedOrientationBeforeFullscreen = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;

    private final Runnable splashTimeout = new Runnable() {
        @Override
        public void run() {
            dismissSplash();
        }
    };

    private final Runnable dismissSplashRunnable = new Runnable() {
        @Override
        public void run() {
            dismissSplash();
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
        splashLockup = findViewById(R.id.cinemax_splash_lockup);
        splashSpinner = findViewById(R.id.cinemax_splash_spinner);
        splashStatus = findViewById(R.id.cinemax_splash_status);
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

        playSplashIntro();
        splashShownAt = System.currentTimeMillis();
        ui.postDelayed(splashTimeout, SPLASH_TIMEOUT_MILLIS);
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
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
        }
        if (rootView != null) {
            rootView.requestApplyInsets();
        }
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacks(splashTimeout);
        ui.removeCallbacks(dismissSplashRunnable);
        ui.removeCallbacks(exitHintRunnable);
        customView = null;
        customViewCallback = null;
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

    /** Production URL for a Cinemax deep link, otherwise the production home page. */
    private String initialUrl(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            Uri data = intent.getData();
            if (NavigationPolicy.isProductionUrl(data.getScheme(), data.getHost())) {
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
        showSplashForRetry();
        String current = web == null ? null : web.getUrl();
        loadUrl(current != null && current.startsWith("http") ? current : HOME_URL);
    }

    private void showSplashForRetry() {
        splashShownAt = System.currentTimeMillis();
        if (splashDismissed) {
            splashDismissed = false;
            splashLayer.setAlpha(1f);
            splashLayer.setVisibility(View.VISIBLE);
            playSplashIntro();
        }
        ui.removeCallbacks(splashTimeout);
        ui.postDelayed(splashTimeout, SPLASH_TIMEOUT_MILLIS);
    }

    // ------------------------------------------------------- window & insets

    private void configureWindow() {
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // Transparent bars: the Cinemax gradient (window background) lights
            // the status and navigation bars instead of a flat black strip.
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
        insetTop = Math.round(topPx / density);
        insetBottom = Math.round(bottomPx / density);
        insetLeft = Math.round(leftPx / density);
        insetRight = Math.round(rightPx / density);
        pushInsetsToPage();
    }

    private void pushInsetsToPage() {
        if (web == null) {
            return;
        }
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
        window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private void clearImmersiveFullscreen() {
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
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
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
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

        web.setBackgroundColor(Color.parseColor("#100A28"));
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
        }

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
                fullscreenHost.removeAllViews();
                fullscreenHost.setVisibility(View.GONE);
                clearImmersiveFullscreen();
                createWebView();
                showSplashForRetry();
                showError(getString(R.string.error_reload_body));
                web.loadUrl(HOME_URL);
                if (crashed) {
                    Toast.makeText(MainActivity.this, R.string.error_reload_hint, Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    // -------------------------------------------------------------- splash

    private void playSplashIntro() {
        splashLockup.setAlpha(0f);
        splashLockup.setScaleX(0.88f);
        splashLockup.setScaleY(0.88f);
        splashLockup.setTranslationY(dp(14));
        splashLockup.animate()
                .alpha(1f)
                .scaleX(1f)
                .scaleY(1f)
                .translationY(0f)
                .setDuration(560)
                .setStartDelay(60)
                .start();
        splashSpinner.setAlpha(0f);
        splashSpinner.animate().alpha(1f).setDuration(420).setStartDelay(260).start();
        splashStatus.setAlpha(0f);
        splashStatus.animate().alpha(1f).setDuration(420).setStartDelay(360).start();
    }

    /** The page reports that the app presentation layer is live. */
    public void onThemeApplied() {
        scheduleSplashDismiss();
    }

    public void onShellReady() {
        scheduleSplashDismiss();
    }

    public void onPageFinished(String url) {
        applyAppTheme();
        scheduleSplashDismiss();
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

    private void scheduleSplashDismiss() {
        long elapsed = System.currentTimeMillis() - splashShownAt;
        ui.removeCallbacks(dismissSplashRunnable);
        if (elapsed >= MIN_SPLASH_MILLIS) {
            dismissSplash();
        } else {
            ui.postDelayed(dismissSplashRunnable, MIN_SPLASH_MILLIS - elapsed);
        }
    }

    private void dismissSplash() {
        if (splashDismissed) {
            return;
        }
        splashDismissed = true;
        splashLayer.animate()
                .alpha(0f)
                .scaleX(1.04f)
                .scaleY(1.04f)
                .setDuration(420)
                .withEndAction(new Runnable() {
                    @Override
                    public void run() {
                        splashLayer.setVisibility(View.GONE);
                        splashLayer.setScaleX(1f);
                        splashLayer.setScaleY(1f);
                    }
                })
                .start();
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
                scheduleSplashDismiss();
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
        applyFullscreenOrientation(view);
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
        try {
            setRequestedOrientation(requestedOrientationBeforeFullscreen);
        } catch (Exception ignored) {
            // The device may refuse while the activity is not resumed.
        }
        if (callback != null) {
            callback.onCustomViewHidden();
        }
    }

    public boolean isFullscreen() {
        return customView != null;
    }

    /**
     * A landscape film fills a landscape screen; a vertical clip stays vertical.
     * The orientation follows the surface the player asked for, then is released.
     */
    private void applyFullscreenOrientation(final View view) {
        ui.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (customView == null) {
                    return;
                }
                int width = view.getWidth();
                int height = view.getHeight();
                if (width <= 0 || height <= 0) {
                    return;
                }
                try {
                    if (width > height) {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                    } else {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
                    }
                } catch (Exception ignored) {
                    // Orientation locks can be restricted; playback still works.
                }
            }
        }, 220);
    }

    // ---------------------------------------------------------------- misc

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
