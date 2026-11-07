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
        // Cinemax origin. An embedded provider player (a secure third-party
        // frame) may only obtain the protected-media identifier its own DRM
        // module asks for - the same default a browser applies - so a provider
        // whose player requires it does not fail with a misleading "cannot
        // play" error inside Cinemax. Camera, microphone and anything else stay
        // denied for every origin but Cinemax.
        activity.runOnUi(new Runnable() {
            @Override
            public void run() {
                try {
                    String origin = request.getOrigin() == null ? "" : request.getOrigin().toString();
                    if (isCinemaxOrigin(origin)) {
                        request.grant(request.getResources());
                        return;
                    }
                    String[] granted = protectedMediaOnly(request.getResources(), origin);
                    if (granted.length > 0) {
                        request.grant(granted);
                    } else {
                        request.deny();
                    }
                } catch (Exception ignored) {
                    // The request may already be handled; playback continues.
                }
            }
        });
    }

    private static boolean isCinemaxOrigin(String origin) {
        try {
            android.net.Uri parsed = android.net.Uri.parse(origin);
            return NavigationPolicy.isCinemaxHost(parsed.getHost());
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * The subset of a third-party frame's request that is granted: only the
     * protected-media identifier, and only for a secure (https) origin.
     */
    static String[] protectedMediaOnly(String[] requested, String origin) {
        if (requested == null || origin == null || !origin.toLowerCase().startsWith("https://")) {
            return new String[0];
        }
        for (String resource : requested) {
            if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(resource)) {
                return new String[] {PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID};
            }
        }
        return new String[0];
    }
}
