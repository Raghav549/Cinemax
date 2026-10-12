package com.cinemax.app;

import android.os.Build;
import android.webkit.JavascriptInterface;

/**
 * The only bridge between the page and the app.
 *
 * It exposes a handful of one-way signals (theme applied, shell ready, media
 * playing) plus two conveniences the page may use for external links. Reading
 * or writing Cinemax data still happens exactly as before, through the site's
 * own API routes and the same production database.
 */
public class CinemaxBridge {

    public static final String APP_VERSION = "1.0.0";
    public static final int APP_VERSION_CODE = 1;

    private final MainActivity activity;

    CinemaxBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String platform() {
        return AppTheme.platform();
    }

    @JavascriptInterface
    public String appVersion() {
        return APP_VERSION;
    }

    @JavascriptInterface
    public String homeUrl() {
        return MainActivity.HOME_URL;
    }

    @JavascriptInterface
    public void themeApplied() {
        activity.runOnUi(new Runnable() {
            @Override
            public void run() {
                activity.onThemeApplied();
            }
        });
    }

    @JavascriptInterface
    public void shellReady() {
        activity.runOnUi(new Runnable() {
            @Override
            public void run() {
                activity.onShellReady();
            }
        });
    }

    @JavascriptInterface
    public void setMediaPlaying(final boolean playing) {
        activity.onMediaPlaying(playing);
    }

    @JavascriptInterface
    public void openExternal(final String url) {
        activity.runOnUi(new Runnable() {
            @Override
            public void run() {
                activity.openExternal(url);
            }
        });
    }

    @JavascriptInterface
    public void toast(final String message) {
        activity.showToast(message);
    }

    @JavascriptInterface
    public String deviceInfo() {
        return "Cinemax Android " + APP_VERSION + " (API " + Build.VERSION.SDK_INT + ")";
    }
}
