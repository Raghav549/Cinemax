/* ============================================================================
   Cinemax · Android app shell runtime  (v1.1.0)

   Injected (additively) into the live Cinemax page inside the Android app.
   Responsibilities, all of them presentation or signalling only:

     · publish real device insets so the existing layout clears system bars;
     · tell the native shell when its themed first paint is ready;
     · report media playback so the screen stays awake only while a film plays;
     · bridge the web player's fullscreen intent to Android landscape/immersive
       mode, while leaving routes, sources, API calls and authentication alone;
     · keep touch behaviour direct and avoid an expensive DOM mutation observer;
     · keep scrolling smooth: one passive scroll listener marks the document
       while a gesture is in flight (so the app stylesheet can park the purely
       decorative animations), and artwork just ahead of the viewport is decoded
       during idle time so decode work never lands inside a scroll frame.
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
    // Note: no touch-action: pan-x on the rails. Locking a rail to horizontal
    // pans pushes vertical pans that begin on a poster through the main thread;
    // the rails contain their own horizontal overscroll, so the browser's
    // default action keeps both axes on the compositor.
    style.appendChild(document.createTextNode(
      "html[data-cinemax-app='android'],html[data-cinemax-app='android'] body{" +
      "-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent;}"
    ));
    (document.head || root).appendChild(style);

    document.addEventListener("visibilitychange", refreshPlaybackState, true);
    document.addEventListener("visibilitychange", onVisibilityChanged, false);
  }

  /* ------------------------------------------------------ scroll engine */

  // How long a gesture is considered over after the last scroll event. Long
  // enough to cover the gap between two frames of a slow fling, short enough
  // that the decorative animations come back the moment the page settles.
  var SCROLL_IDLE_MILLIS = 140;
  // Artwork is decoded ahead of the viewport while the page is idle, so the
  // decode work never lands in the middle of a scroll frame.
  var WARM_AHEAD_VIEWPORTS = 1.6;
  var WARM_BATCH = 5;
  var WARM_SCAN = 24;

  var scrollFrame = 0;
  var scrollIdleAt = 0;
  var scrolling = false;
  var warmScheduled = false;
  var warmCursor = 0;
  var warmedSlides = {};

  function now() {
    if (window.performance && typeof window.performance.now === "function") {
      return window.performance.now();
    }
    return Date.now();
  }

  /**
   * Marks the document as "being scrolled" and clears the mark once the gesture
   * has been idle for SCROLL_IDLE_MILLIS. The attribute is written at most twice
   * per gesture (never per scroll event) and the loop is driven by
   * requestAnimationFrame, so a scroll that the user is not performing costs
   * nothing at all. No layout is read here: the events are passive.
   */
  function installScrollEngine() {
    window.addEventListener("scroll", onScroll, { passive: true });
    if ("onscrollend" in window) {
      window.addEventListener("scrollend", finishScroll, { passive: true });
    }
  }

  function onScroll() {
    scrollIdleAt = now() + SCROLL_IDLE_MILLIS;
    if (scrolling) {
      return;
    }
    scrolling = true;
    try {
      root.setAttribute("data-cinemax-scrolling", "true");
    } catch (error) {
      /* Older engines: the animations simply keep running. */
    }
    if (!scrollFrame) {
      scrollFrame = window.requestAnimationFrame(scrollTick);
    }
  }

  function scrollTick() {
    scrollFrame = 0;
    if (!scrolling) {
      return;
    }
    if (now() < scrollIdleAt) {
      scrollFrame = window.requestAnimationFrame(scrollTick);
      return;
    }
    finishScroll();
  }

  function finishScroll() {
    if (!scrolling) {
      return;
    }
    scrolling = false;
    if (scrollFrame) {
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
    }
    try {
      root.removeAttribute("data-cinemax-scrolling");
    } catch (error) {
      /* Nothing to undo. */
    }
    scheduleArtworkWarmup();
  }

  function onVisibilityChanged() {
    if (document.hidden) {
      finishScroll();
    }
  }

  /* --------------------------------------------------- artwork warm-up */

  /**
   * Decodes the artwork the user is about to scroll to, during idle time.
   * This reuses the browser's HTTP cache and its decoded-image cache (a decode
   * of an already-cached image is a no-op), it never runs during a scroll, and
   * it is skipped entirely when the connection asks for data saving.
   */
  function scheduleArtworkWarmup() {
    if (warmScheduled || scrolling) {
      return;
    }
    warmScheduled = true;
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(runArtworkWarmup, { timeout: 600 });
    } else {
      window.setTimeout(runArtworkWarmup, 400);
    }
  }

  function runArtworkWarmup(deadline) {
    warmScheduled = false;
    if (scrolling || document.hidden) {
      return;
    }
    if (connectionSavesData()) {
      return;
    }
    warmNextHeroSlide();
    var images = document.images;
    if (!images || !images.length) {
      return;
    }
    var viewport = window.innerHeight || 720;
    var budget = WARM_BATCH;
    var scanned = 0;
    while (scanned < WARM_SCAN && budget > 0) {
      if (deadline && typeof deadline.timeRemaining === "function" && deadline.timeRemaining() <= 1) {
        break;
      }
      var image = images[warmCursor % images.length];
      warmCursor++;
      scanned++;
      if (!wantsWarmup(image)) {
        continue;
      }
      var rect = image.getBoundingClientRect();
      if (rect.bottom < -viewport * 0.4 || rect.top > viewport * WARM_AHEAD_VIEWPORTS) {
        continue;
      }
      image.setAttribute("data-cinemax-warm", "1");
      budget--;
      if (typeof image.decode === "function") {
        var decode = image.decode();
        if (decode && typeof decode.catch === "function") {
          decode.catch(function () { /* A broken poster falls back to its placeholder. */ });
        }
      }
    }
    if (budget === 0 && scanned > 0) {
      scheduleArtworkWarmup();
    }
  }

  function wantsWarmup(image) {
    if (!image || image.getAttribute("data-cinemax-warm") === "1") {
      return false;
    }
    var className = typeof image.className === "string" ? image.className : "";
    return className.indexOf("movie-poster-image") >= 0 ||
      className.indexOf("collection-artwork") >= 0 ||
      className.indexOf("hero-image") >= 0 ||
      image.getAttribute("loading") === "lazy";
  }

  /**
   * The featured slideshow rotates on a nine second timer and mounts the next
   * backdrop at that moment: on a phone that is a fresh 1280px decode painted
   * into a full-screen cross-fade, whenever it happens to land - very often in
   * the middle of a scroll. Every slide is already announced as a small
   * pagination thumbnail, so the *next* slide's full-size source can be decoded
   * during idle time instead. One image at a time, only when the device is not
   * saving data, reusing the browser's own image cache.
   */
  function warmNextHeroSlide() {
    var previews = document.querySelectorAll(".hero-preview img");
    if (!previews || previews.length < 2) {
      return;
    }
    var index = 0;
    for (var i = 0; i < previews.length; i++) {
      var button = previews[i].parentNode;
      if (button && button.getAttribute && button.getAttribute("aria-current") === "true") {
        index = i;
        break;
      }
    }
    var next = previews[(index + 1) % previews.length];
    var source = fullSizeSource(next);
    if (!source || warmedSlides[source]) {
      return;
    }
    warmedSlides[source] = true;
    var image = new window.Image();
    image.decoding = "async";
    image.src = source;
    if (typeof image.decode === "function") {
      var decode = image.decode();
      if (decode && typeof decode.catch === "function") {
        decode.catch(function () { /* A missing backdrop falls back to its placeholder. */ });
      }
    }
  }

  /** The largest candidate the browser may pick for an <img srcset>, or its src. */
  function fullSizeSource(image) {
    if (!image) {
      return "";
    }
    var srcset = image.getAttribute("srcset");
    if (srcset) {
      var best = "";
      var bestWidth = -1;
      var candidates = srcset.split(",");
      for (var i = 0; i < candidates.length; i++) {
        var parts = candidates[i].replace(/^\s+|\s+$/g, "").split(/\s+/);
        if (!parts[0]) {
          continue;
        }
        var width = parts.length > 1 ? parseFloat(parts[1]) || 0 : 0;
        if (width > bestWidth) {
          bestWidth = width;
          best = parts[0];
        }
      }
      if (best) {
        return best;
      }
    }
    return image.currentSrc || image.getAttribute("src") || "";
  }

  function connectionSavesData() {
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return !!(connection && connection.saveData);
  }

  /* ------------------------------------------------------------------ init */

  function boot() {
    markApp();
    installTouchPolish();
    installScrollEngine();
    installFullscreenBridge();
    attachMediaListeners();
    reportReady();
    // The very first gesture should already find its artwork decoded. This waits
    // for the page's own load to finish so the warm-up can never compete with
    // the hero and the first rail for bandwidth.
    armInitialWarmup();
  }

  function armInitialWarmup() {
    if (document.readyState === "complete") {
      scheduleArtworkWarmup();
      return;
    }
    var onLoad = function () {
      window.removeEventListener("load", onLoad, false);
      scheduleArtworkWarmup();
    };
    window.addEventListener("load", onLoad, false);
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
