package com.cinemax.app;

import android.content.Context;
import android.os.Build;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Loads the app-only presentation layer bundled in assets/cinemax and turns it
 * into a single injection script.
 *
 * The website, its CSS and its behaviour are left exactly as deployed: the
 * extra stylesheet and runtime are additive, scoped to
 * html[data-cinemax-app="android"] and only ever installed inside this app.
 */
final class AppTheme {

    private static final String THEME_ASSET = "cinemax/app-theme.css";
    private static final String SHELL_ASSET = "cinemax/app-shell.js";

    private static String cachedTheme;
    private static String cachedShell;
    private static String cachedScript;

    private AppTheme() {
    }

    /**
     * DOM-only bootstrap: marks the document as the app, installs the theme
     * stylesheet and suppresses the duplicate in-page intro. It contains no
     * dependence on inline script execution, so a Content-Security-Policy added
     * to the deployment later cannot break it.
     */
    static String injectionScript(Context context) {
        synchronized (AppTheme.class) {
            if (cachedScript == null) {
                cachedScript = buildScript(asset(context, THEME_ASSET));
            }
            return cachedScript;
        }
    }

    /**
     * The shell runtime, evaluated separately by the WebView. Running it through
     * evaluateJavascript keeps behaviour identical whether or not the page (or a
     * future deployment) restricts inline scripts.
     */
    static String shellScript(Context context) {
        synchronized (AppTheme.class) {
            if (cachedShell == null) {
                cachedShell = asset(context, SHELL_ASSET);
            }
            return cachedShell;
        }
    }

    private static String asset(Context context, String path) {
        InputStream stream = null;
        try {
            stream = context.getAssets().open(path);
            ByteArrayOutputStream buffer = new ByteArrayOutputStream(Math.max(8192, stream.available()));
            byte[] chunk = new byte[16384];
            int read;
            while ((read = stream.read(chunk)) > 0) {
                buffer.write(chunk, 0, read);
            }
            return buffer.toString("UTF-8");
        } catch (Exception missing) {
            return "";
        } finally {
            if (stream != null) {
                try {
                    stream.close();
                } catch (Exception ignored) {
                    // Nothing to recover from.
                }
            }
        }
    }

    /**
     * Builds the bootstrap script. Package-visible for unit tests, which check
     * the escaping with hostile input.
     */
    static String buildScript(String theme) {
        StringBuilder script = new StringBuilder(theme.length() + 2048);
        script.append("(function(){try{")
                .append("var d=document.documentElement;if(!d){return;}")
                .append("d.setAttribute('data-cinemax-app','android');")
                .append("d.setAttribute('data-cinemax-platform','android');")
                .append("d.classList.add('cinemax-native-shell');")
                .append("var head=document.head||d;")
                .append("if(!document.getElementById('cinemax-native-theme')){")
                .append("var s=document.createElement('style');s.id='cinemax-native-theme';")
                .append("s.setAttribute('data-cinemax-native','theme');")
                .append("s.appendChild(document.createTextNode('").append(jsLiteral(theme)).append("'));")
                .append("head.appendChild(s);}")
                // The native splash replaces the in-page session intro, so the
                // site's own intro is marked as already seen for this session.
                // `miley:intro:v1` is the deployed MiLey intro (src/components/
                // SplashScreen.tsx); the legacy CinemaX keys stay for the
                // retained compatibility pages.
                .append("try{sessionStorage.setItem('miley:intro:v1','1');}catch(e){}")
                .append("d.setAttribute('data-miley-intro','seen');")
                .append("try{window.dispatchEvent(new Event('miley:intro-phase'));}catch(e){}")
                .append("try{sessionStorage.setItem('cinemax:prism-intro:v1','1');}catch(e){}")
                .append("d.setAttribute('data-cinemax-intro','seen');")
                .append("try{window.dispatchEvent(new Event('cinemax:intro-phase'));}catch(e){}")
                .append("try{if(window.CinemaxNative&&window.CinemaxNative.themeApplied){")
                .append("window.CinemaxNative.themeApplied();}}catch(e){}")
                .append("}catch(e){}})();");
        return script.toString();
    }

    /** Escapes text into a JavaScript single-quote string literal. */
    private static String jsLiteral(String value) {
        StringBuilder out = new StringBuilder(value.length() + 64);
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '\\':
                    out.append("\\\\");
                    break;
                case '\'':
                    out.append("\\'");
                    break;
                case '"':
                    out.append("\\\"");
                    break;
                case '\n':
                    out.append("\\n");
                    break;
                case '\r':
                    out.append("\\r");
                    break;
                case '\t':
                    out.append("\\t");
                    break;
                case '<':
                    out.append("\\u003C");
                    break;
                case '>':
                    out.append("\\u003E");
                    break;
                case '&':
                    out.append("\\u0026");
                    break;
                case '/':
                    // Keeps a literal closing tag from ever appearing in the page.
                    out.append("\\/");
                    break;
                default:
                    if (character < 0x20 || character > 0x7e) {
                        out.append("\\u").append(pad(character));
                    } else {
                        out.append(character);
                    }
                    break;
            }
        }
        return out.toString();
    }

    private static String pad(char character) {
        String hex = Integer.toHexString(character).toUpperCase();
        StringBuilder builder = new StringBuilder(4);
        for (int index = hex.length(); index < 4; index++) {
            builder.append('0');
        }
        return builder.append(hex).toString();
    }

    static String platform() {
        return "android-" + Build.VERSION.SDK_INT;
    }
}
