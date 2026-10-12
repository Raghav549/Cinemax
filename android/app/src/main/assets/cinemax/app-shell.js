/* ============================================================================
   Cinemax · Android app shell runtime  (v1.1.0)

   Injected (additively) into the live Cinemax page inside the Android app.
   Responsibilities, all of them presentation or signalling only:

     · publish real device insets so the existing layout clears system bars;
     · tell the native shell when its themed first paint is ready;
     · report media playback so the screen stays awake only while a film plays;
     · bridge the web player's fullscreen intent to Android landscape/immersive
       mode, while leaving routes, sources, API calls and authentication alone;
     · keep touch behaviour direct and avoid an expensive DOM mutation observer.
   ========================================================================== */
(function () {
  "use strict";

  if (window.__cinemaxAppShellInstalled) {
    return;
  }
  window.__cinemaxAppShellInstalled = true;

  var SHELL_VERSION = "1.1.0";
  var root = document.documentElement;
  var bridge = window.CinemaxNative || null;
  var mediaListenersInstalled = false;

  function nativeBridge() {
    return bridge || window.CinemaxNative || null;
  }

  function px(value) {
    var number = typeof value === "number" ? value : parseFloat(value);
    if (!isFinite(number) || number < 0) {
      return "0px";
    }
    return Math.round(number) + "px";
  }

  /* ---------------------------------------------------------------- insets */

  function setInset(name, value) {
    try {
      root.style.setProperty(name, px(value));
    } catch (error) {
      /* Older engines: the CSS fallback still applies. */
    }
  }

  // Called from the native shell with measured window insets (device pixels
  // converted to CSS pixels).
  window.__cinemaxInsets = function (top, bottom, left, right) {
    setInset("--cinemax-inset-top", top);
    setInset("--cinemax-inset-bottom", bottom);
    setInset("--cinemax-inset-left", left);
    setInset("--cinemax-inset-right", right);
  };

  // Sensible starting values until the measured ones arrive.
  if (!root.style.getPropertyValue("--cinemax-inset-top")) {
    setInset("--cinemax-inset-top", 24);
    setInset("--cinemax-inset-bottom", 12);
    setInset("--cinemax-inset-left", 0);
    setInset("--cinemax-inset-right", 0);
  }

  /* ------------------------------------------------------- app presentation */

  function markApp() {
    root.setAttribute("data-cinemax-app", "android");
    root.setAttribute("data-cinemax-shell", SHELL_VERSION);
    if (document.body) {
      document.body.setAttribute("data-cinemax-app", "android");
    }
    // The native splash replaces the in-page session intro on this device.
    try {
      sessionStorage.setItem("cinemax:prism-intro:v1", "1");
    } catch (error) {
      /* Private mode: the attribute below still suppresses the intro. */
    }
    root.setAttribute("data-cinemax-intro", "seen");
  }

  function reportReady() {
    var appBridge = nativeBridge();
    try {
      if (appBridge && typeof appBridge.themeApplied === "function") {
        appBridge.themeApplied();
      }
      if (appBridge && typeof appBridge.shellReady === "function") {
        appBridge.shellReady();
      }
    } catch (error) {
      /* The native side may already be gone; nothing else to do. */
    }
  }

  /* -------------------------------------------------------------- playback */

  var playingCount = 0;

  function reportPlayback(playing) {
    var appBridge = nativeBridge();
    try {
      if (appBridge && typeof appBridge.setMediaPlaying === "function") {
        appBridge.setMediaPlaying(!!playing);
      }
    } catch (error) {
      /* Ignore: the screen simply follows the platform default. */
    }
  }

  function isActiveMedia(element) {
    return !!element &&
      !element.paused &&
      !element.ended &&
      element.readyState > 2 &&
      element.currentTime > 0;
  }

  function refreshPlaybackState() {
    var medias = document.getElementsByTagName("video");
    var active = 0;
    for (var index = 0; index < medias.length; index++) {
      if (isActiveMedia(medias[index])) {
        active++;
      }
    }
    if (active === playingCount) {
      return;
    }
    playingCount = active;
    reportPlayback(active > 0);
  }

  function attachMediaListeners() {
    if (mediaListenersInstalled) {
      return;
    }
    mediaListenersInstalled = true;
    // Capture from document instead of attaching a listener to every video and
    // watching the entire React DOM. It handles dynamically mounted players
    // with no subtree watcher work during normal browsing/scrolling.
    ["playing", "play", "pause", "ended", "emptied"].forEach(function (name) {
      document.addEventListener(name, refreshPlaybackState, true);
    });
  }

  /* ------------------------------------------------------------- fullscreen */

  function installFullscreenBridge() {
    window.addEventListener("cinemax:player-fullscreen", function (event) {
      var appBridge = nativeBridge();
      var detail = event && event.detail ? event.detail : {};
      try {
        if (detail.active && appBridge && typeof appBridge.enterPlayerFullscreen === "function") {
          appBridge.enterPlayerFullscreen();
        } else if (!detail.active && appBridge && typeof appBridge.exitPlayerFullscreen === "function") {
          appBridge.exitPlayerFullscreen();
        }
      } catch (error) {
        /* DOM fullscreen remains available if the activity is not resumed. */
      }
    }, false);
  }

  /* --------------------------------------------------------- touch polish */

  function installTouchPolish() {
    // The app drives its own gestures; pinch-zoom and double-tap zoom are off.
    var viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      var content = viewport.getAttribute("content") || "";
      content = content.replace(/maximum-scale=[^,;]*[,;]?/gi, "");
      if (content.indexOf("user-scalable") === -1) {
        content += ", user-scalable=no";
      }
      viewport.setAttribute("content", content);
    }

    var style = document.createElement("style");
    style.setAttribute("data-cinemax-native", "touch");
    style.appendChild(document.createTextNode(
      "html[data-cinemax-app='android'],html[data-cinemax-app='android'] body{" +
      "-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent;}" +
      "html[data-cinemax-app='android'] .movie-track,html[data-cinemax-app='android'] .filter-chips{" +
      "touch-action:pan-x;}"
    ));
    (document.head || root).appendChild(style);

    document.addEventListener("visibilitychange", refreshPlaybackState, true);
  }

  /* ------------------------------------------------------------------ init */

  function boot() {
    markApp();
    installTouchPolish();
    installFullscreenBridge();
    attachMediaListeners();
    reportReady();
  }

  markApp();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, false);
    // First paint may already be on screen; report so the splash can lift.
    requestAnimationFrame(reportReady);
  } else {
    boot();
  }
})();
