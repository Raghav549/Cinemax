package com.cinemax.app;

import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

/**
 * Chrome-level hooks: load progress, media fullscreen and player permissions.
 * These keep the site's existing player features (fullscreen video, HLS,
 * embedded providers, subtitles) working exactly as they do in a browser.
 */
public class CinemaxChromeClient extends WebChromeClient {

    private final MainActivity activity;

    public CinemaxChromeClient(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public void onProgressChanged(WebView view, int newProgress) {
        activity.onPageProgress(newProgress);
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        activity.enterFullscreen(view, callback);
    }

    @Override
    public void onHideCustomView() {
        activity.exitFullscreen();
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        if (request == null) {
            return;
        }
        // Player surfaces (audio/video/protected content) are granted to the
        // Cinemax origin only; every other origin is left to the default policy.
        activity.runOnUi(new Runnable() {
            @Override
            public void run() {
                try {
                    String origin = request.getOrigin() == null ? "" : request.getOrigin().toString();
                    if (origin.contains(MainActivity.PRODUCTION_HOST)) {
                        request.grant(request.getResources());
                    } else {
                        request.deny();
                    }
                } catch (Exception ignored) {
                    // The request may already be handled; playback continues.
                }
            }
        });
    }
}
