package com.cinemax.app;

import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Navigation policy for the Cinemax shell: everything that belongs to the
 * Cinemax deployment stays inside the app (tabs, filters, details, playback,
 * the studio and its auth round-trips), everything else is handed to the system.
 */
public class CinemaxWebViewClient extends WebViewClient {

    private final MainActivity activity;

    public CinemaxWebViewClient(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (request == null || request.getUrl() == null) {
            return false;
        }
        Uri uri = request.getUrl();
        NavigationPolicy.Decision decision =
                NavigationPolicy.decide(uri.getScheme(), uri.getHost());
        if (decision == NavigationPolicy.Decision.OPEN_EXTERNALLY) {
            activity.openExternal(uri.toString());
            return true;
        }
        return false;
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        activity.onPageProgress(5);
    }

    @Override
    public void onPageCommitVisible(WebView view, String url) {
        // First paint is available: install the app presentation layer now so no
        // unstyled frame is ever visible behind the native splash.
        activity.applyAppTheme();
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        activity.onPageFinished(url);
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request != null && request.isForMainFrame()) {
            CharSequence description = error == null ? null : error.getDescription();
            String message = description == null || description.length() == 0
                    ? activity.getString(R.string.error_offline_body)
                    : description.toString();
            activity.showError(message);
        }
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        // A WebView renderer crash must never take the app down with it.
        boolean crashed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || detail == null
                || detail.didCrash();
        activity.recoverFromRendererCrash(crashed);
        return true;
    }
}
