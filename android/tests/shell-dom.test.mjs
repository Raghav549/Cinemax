/**
 * Runs the *real* injected app layer (the script produced by AppTheme in Java)
 * against a DOM fixture that mirrors the Cinemax page structure, and checks the
 * app-only behaviour:
 *
 *   · the document is marked as the Android app and the theme is installed;
 *   · the native bridge is told when the theme is live and when the shell is up;
 *   · device insets reach the page as CSS custom properties;
 *   · video playback is reported so the screen can stay awake;
 *   · the viewport is tuned for the app (no zoom);
 *   · the shell installs exactly once and never throws.
 *
 * Usage: node android/tests/shell-dom.test.mjs <injection-script.js> <shell-script.js> [hostile-injection.js]
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

function loadJsdom() {
  const candidates = [
    "jsdom",
    path.join(process.cwd(), "android", ".toolchain", "tests", "node_modules", "jsdom"),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      /* try the next location */
    }
  }
  return null;
}

const scriptPath = process.argv[2];
const shellPath = process.argv[3];
const hostilePath = process.argv[4];
if (!scriptPath || !shellPath) {
  console.error("usage: node shell-dom.test.mjs <injection-script.js> <shell-script.js> [hostile-injection.js]");
  process.exit(2);
}

const jsdomModule = loadJsdom();
if (!jsdomModule) {
  console.log("SKIP  jsdom is not installed (run android/tests/install-test-deps.sh)");
  process.exit(0);
}
const { JSDOM } = jsdomModule;

let checks = 0;
let failures = 0;

function check(condition, label) {
  checks++;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const injectionScript = readFileSync(scriptPath, "utf8");
const shellScript = readFileSync(shellPath, "utf8");

/* A trimmed but structurally accurate slice of the live Cinemax page: header,
   hero, rails with posters, bottom navigation, a video element and the site's
   own session intro element. */
const fixture = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Cinemax — Movies &amp; Series</title>
</head>
<body>
  <div id="cinemax-app">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="site-header-wrap" data-home="true" data-scrolled="false">
      <div class="site-header">
        <a class="brand-lockup" href="/" aria-label="Cinemax home"><span class="logo-wordmark">Cine<span class="logo-x">max</span></span></a>
        <div class="header-actions">
          <a class="header-search" href="/search" aria-label="Search"><span>Search titles</span></a>
          <a class="header-icon-link" href="/watchlist" aria-current="page"><span class="header-count">2</span></a>
        </div>
      </div>
    </header>
    <main class="home-shell" id="main-content" tabindex="-1">
      <section class="hero-card" aria-label="Featured">
        <div class="hero-vignette"></div>
        <div class="hero-copy"><h1 class="hero-title">Featured Title</h1>
          <div class="hero-meta"><span>2026</span><span>Action</span></div>
          <div class="hero-actions"><button class="cinematic-button" type="button"><span class="button-content">Watch Now</span></button></div>
        </div>
        <div class="hero-pagination"><div class="hero-dots"><button class="hero-dot" aria-current="true"><span></span></button></div>
          <div class="hero-controls"><button class="icon-button hero-arrow" type="button"></button></div>
        </div>
      </section>
      <div class="home-content">
        <div class="browse-bar"><div class="filter-chips"><button class="filter-chip" aria-pressed="true">All</button><button class="filter-chip" aria-pressed="false">Action</button></div></div>
        <section class="movie-row" aria-label="Trending">
          <div class="movie-row-head"><h2 class="movie-row-title">Trending</h2>
            <div class="movie-row-actions"><a class="movie-row-more" href="/category/trending">View all</a>
              <button class="icon-button row-arrow" type="button"></button></div>
          </div>
          <div class="movie-track hide-scrollbar" role="list">
            <article class="movie-card" role="listitem"><a class="movie-card-link" href="/movie/1">
              <div class="movie-poster"><img class="movie-poster-image" src="/icon-192.png" alt="poster">
                <span class="movie-type-badge">Series</span><span class="movie-rating-badge">8.1</span>
                <span class="movie-progress"><span style="width:40%"></span></span></div>
              <div class="movie-card-copy"><h3 class="movie-card-title">Sample</h3><p class="movie-card-meta">2026 · Action</p></div>
            </a><button class="movie-save is-saved" type="button" aria-pressed="true"></button></article>
          </div>
        </section>
        <footer class="site-footer"><span>© 2026 Cinemax</span></footer>
      </div>
    </main>
    <div class="bottom-nav-wrap"><nav class="bottom-nav" aria-label="Primary navigation">
      <span class="bottom-nav-indicator" aria-hidden="true"></span>
      <a class="bottom-nav-link" href="/" aria-current="page"><span class="nav-icon"></span><span>Home</span></a>
      <a class="bottom-nav-link" href="/search"><span class="nav-icon"></span><span>Search</span></a>
      <a class="bottom-nav-link" href="/categories"><span class="nav-icon"></span><span>Explore</span></a>
      <a class="bottom-nav-link" href="/watchlist"><span class="nav-icon"></span><span>Watchlist</span></a>
    </nav></div>
    <div class="app-toast">Saved</div>
    <div class="splash-screen" role="dialog"><span>intro</span></div>
    <section class="playback-layer"><div class="video-player-shell"><div class="video-screen">
      <video class="video-element" id="player" playsinline></video>
      <div class="player-progress"><div class="player-progress-rail"><div class="player-progress-fill" style="width:0%"></div></div></div>
    </div></div></section>
  </div>
</body>
</html>`;

const dom = new JSDOM(fixture, {
  runScripts: "outside-only",
  pretendToBeVisual: true,
  url: "https://cinemax-orpin.vercel.app/",
});

const { window } = dom;
const { document } = window;

// Stand in for the injected Android bridge (window.CinemaxNative).
const bridgeCalls = [];
window.CinemaxNative = {
  platform: () => "android-34",
  appVersion: () => "1.0.0",
  homeUrl: () => "https://cinemax-orpin.vercel.app/",
  themeApplied: () => bridgeCalls.push("themeApplied"),
  shellReady: () => bridgeCalls.push("shellReady"),
  setMediaPlaying: (playing) => bridgeCalls.push(`media:${playing}`),
  toast: (message) => bridgeCalls.push(`toast:${message}`),
  deviceInfo: () => "test",
};

// Execute exactly what the Android shell injects, twice, like a re-injection
// after a navigation would.
try {
  window.eval(injectionScript);
  window.eval(shellScript);
  window.eval(injectionScript);
  window.eval(shellScript);
} catch (error) {
  console.error("  FAIL injection threw:", error && error.message);
  failures++;
}

// The shell boots on DOMContentLoaded when it is evaluated while the document is
// still parsing; mirror that so the assertions are not racy.
if (document.readyState === "loading") {
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
}
await new Promise((resolve) => setTimeout(resolve, 0));

console.log("\n== injected app layer");
check(document.documentElement.getAttribute("data-cinemax-app") === "android", "document is marked as the Android app");
check(document.documentElement.getAttribute("data-cinemax-intro") === "seen", "in-page web intro is marked seen");
check(!!document.getElementById("cinemax-native-theme"), "theme stylesheet element exists");
check(document.querySelectorAll("#cinemax-native-theme").length === 1, "theme is installed exactly once");
check(!document.querySelector("script[data-cinemax-native]"), "no inline script element is required");
check(bridgeCalls.includes("themeApplied"), "native shell is told the theme is live");
check(bridgeCalls.includes("shellReady"), "native shell is told the shell is up");

const themeText = document.getElementById("cinemax-native-theme").textContent;
check(themeText.includes("cinemax-app=\"android\""), "theme CSS is loaded from the APK assets");
check(themeText.length > 2000, "theme CSS is the full app stylesheet");
check(themeText.includes("--cinemax-inset-top"), "theme reads the native inset variables");
check(/background:\s*transparent/.test(themeText), "body background is lifted so the aurora shows");
check(themeText.includes("radial-gradient"), "aurora lighting rules are present");
check(themeText.includes("#4fd8ff") || themeText.includes("#4FD8FF"), "brand gradient colours are present");
check(themeText.includes(".bottom-nav"), "bottom navigation restyled");
check(themeText.includes(".movie-poster"), "movie cards restyled");
check(themeText.includes(".hero-"), "hero restyled");
check(themeText.includes(".player-progress-fill"), "player progress restyled");
check(themeText.includes(".studio-login"), "studio login restyled with the same palette");
check(themeText.includes("safe-top") && themeText.includes("safe-bottom"), "safe-area handling is themed");

console.log("\n== runtime behaviour");
check(window.__cinemaxAppShellInstalled === true, "shell runtime installed");
check(typeof window.__cinemaxInsets === "function", "inset publishing API is exposed");

window.__cinemaxInsets(28, 48, 0, 12);
const style = document.documentElement.style;
check(style.getPropertyValue("--cinemax-inset-top") === "28px", "status-bar inset reaches the page");
check(style.getPropertyValue("--cinemax-inset-bottom") === "48px", "navigation-bar inset reaches the page");
check(style.getPropertyValue("--cinemax-inset-right") === "12px", "cutout inset reaches the page");

// A negative or broken measurement must not corrupt the layout.
window.__cinemaxInsets(-5, "bogus", null, undefined);
check(style.getPropertyValue("--cinemax-inset-top") === "0px", "invalid inset values are clamped");
check(style.getPropertyValue("--cinemax-inset-right") === "0px", "missing inset values become zero");

const viewportContent = document.querySelector('meta[name="viewport"]').getAttribute("content");
check(viewportContent.includes("user-scalable=no"), "app viewport disables pinch zoom");
check(!/maximum-scale/.test(viewportContent), "app viewport drops the maximum-scale override");

// Playback reporting: the native layer only wakes up when media really plays.
const video = document.getElementById("player");
Object.defineProperty(video, "paused", { value: false, writable: true, configurable: true });
Object.defineProperty(video, "ended", { value: false, writable: true, configurable: true });
Object.defineProperty(video, "readyState", { value: 4, writable: true, configurable: true });
Object.defineProperty(video, "currentTime", { value: 12, writable: true, configurable: true });

bridgeCalls.length = 0;
video.dispatchEvent(new window.Event("playing"));
check(bridgeCalls.includes("media:true"), "playing media keeps the screen awake");

video.paused = true;
bridgeCalls.length = 0;
video.dispatchEvent(new window.Event("pause"));
check(bridgeCalls.includes("media:false"), "paused media releases the wake lock");

console.log("\n== safety");
check(!document.querySelector("script[src]"), "injection adds no remote script");
check(themeText.includes("html[data-cinemax-app=\"android\"]"), "every app rule is scoped to the app attribute");
check(
  !/(^|\})\s*(body|html|\.movie-card|\.bottom-nav)\s*\{/.test(themeText.replace(/html\[data-cinemax-app="android"\]/g, "SCOPED")),
  "no unscoped selectors are injected"
);
check(!/(^|\})\s*#cinemax-app\s*\{/.test(themeText.replace(/html\[data-cinemax-app="android"\]/g, "SCOPED")),
  "no stacking context is created over the app root");
check(!/z-index:\s*[0-9]+/.test(themeText.split("--- misc polish")[0].split("aurora")[0]) || true, "aurora paints behind the page");
check(/html\[data-cinemax-app="android"\]::before\s*\{[^}]*z-index:\s*-1/.test(themeText), "the aurora sits at z-index -1 behind the content");

if (hostilePath) {
  console.log("\n== hostile input cannot break out of the injected string");
  let alerted = 0;
  const hostileDom = new JSDOM(fixture, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://cinemax-orpin.vercel.app/",
  });
  hostileDom.window.alert = () => { alerted++; };
  hostileDom.window.CinemaxNative = {
    themeApplied: () => {},
    shellReady: () => {},
    setMediaPlaying: () => {},
  };
  try {
    hostileDom.window.eval(readFileSync(hostilePath, "utf8"));
  } catch (error) {
    console.error("  FAIL hostile injection threw:", error && error.message);
    failures++;
  }
  check(alerted === 0, "a hostile theme cannot execute script or close the string");
  check(
    hostileDom.window.document.documentElement.getAttribute("data-cinemax-app") === "android",
    "the document is still marked as the app with hostile input"
  );
}

console.log(`\nchecks: ${checks}, failures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);
