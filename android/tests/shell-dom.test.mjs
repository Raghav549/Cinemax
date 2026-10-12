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
import { fileURLToPath } from "node:url";

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
  // CI sets CINEMAX_REQUIRE_JSDOM=1 so a missing dependency can never turn this
  // layer into a silent pass.
  const required = process.env.CINEMAX_REQUIRE_JSDOM === "1";
  console.log(
    required
      ? "FAIL  jsdom is required (CINEMAX_REQUIRE_JSDOM=1) but is not installed - run android/tests/install-test-deps.sh"
      : "SKIP  jsdom is not installed (run android/tests/install-test-deps.sh)"
  );
  process.exit(required ? 1 : 0);
}
const { JSDOM, VirtualConsole } = jsdomModule;

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
          <div class="hero-preview-track" aria-label="Featured titles">
            <button class="hero-preview" type="button" aria-current="true"><img src="https://image.tmdb.org/t/p/w1280/slide-one.jpg" srcset="https://image.tmdb.org/t/p/w300/slide-one.jpg 300w, https://image.tmdb.org/t/p/w780/slide-one.jpg 780w, https://image.tmdb.org/t/p/w1280/slide-one.jpg 1280w" sizes="140px" alt=""><span>One</span></button>
            <button class="hero-preview" type="button"><img src="https://image.tmdb.org/t/p/w1280/slide-two.jpg" srcset="https://image.tmdb.org/t/p/w300/slide-two.jpg 300w, https://image.tmdb.org/t/p/w780/slide-two.jpg 780w, https://image.tmdb.org/t/p/w1280/slide-two.jpg 1280w" sizes="140px" alt=""><span>Two</span></button>
            <button class="hero-preview" type="button"><img src="https://image.tmdb.org/t/p/w1280/slide-three.jpg" srcset="https://image.tmdb.org/t/p/w300/slide-three.jpg 300w, https://image.tmdb.org/t/p/w780/slide-three.jpg 780w, https://image.tmdb.org/t/p/w1280/slide-three.jpg 1280w" sizes="140px" alt=""><span>Three</span></button>
          </div>
          <div class="hero-controls"><button class="icon-button hero-arrow" type="button"></button></div>
        </div>
      </section>
      <div class="hero-scenes" aria-hidden="true">
        <div class="hero-scene" data-active="true"><img class="hero-image" src="https://image.tmdb.org/t/p/w1280/slide-one.jpg" alt=""></div>
        <div class="hero-scene"><img class="hero-image" src="https://image.tmdb.org/t/p/w1280/slide-three.jpg" alt=""></div>
      </div>
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
            <article class="movie-card" role="listitem"><a class="movie-card-link" href="/movie/2">
              <div class="movie-poster"><img class="movie-poster-image" loading="lazy" src="/poster-two.png" srcset="/poster-two.png 300w, /poster-two-large.png 780w" sizes="40vw" alt="poster">
                <span class="movie-type-badge">Film</span></div>
              <div class="movie-card-copy"><h3 class="movie-card-title">Second</h3><p class="movie-card-meta">2026 · Drama</p></div>
            </a><button class="movie-save" type="button" aria-pressed="false"></button></article>
          </div>
        </section>
        <section class="movie-row" aria-label="Library">
          <div class="movie-row-head"><h2 class="movie-row-title">Library</h2></div>
          <div class="shimmer shimmer-row-title"></div>
          <div class="movie-track hide-scrollbar"><article class="movie-card"><div class="movie-poster"><img class="movie-poster-image" loading="lazy" src="/poster-three.png" alt="poster"></div></article></div>
        </section>
        <div class="cinematic-button"><span class="button-light"><svg viewBox="0 0 100 40"><rect class="light-body" x="0" y="0"></rect></svg></span><span class="button-content">Watch Now</span></div>
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
  appVersion: () => "1.1.0",
  homeUrl: () => "https://cinemax-orpin.vercel.app/",
  themeApplied: () => bridgeCalls.push("themeApplied"),
  shellReady: () => bridgeCalls.push("shellReady"),
  setMediaPlaying: (playing) => bridgeCalls.push(`media:${playing}`),
  enterPlayerFullscreen: () => bridgeCalls.push("enterFullscreen"),
  exitPlayerFullscreen: () => bridgeCalls.push("exitFullscreen"),
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
check(/background:\s*transparent/.test(themeText), "body background defers to the deep app canvas");
check(themeText.includes("radial-gradient"), "cinematic gradient details remain available");
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

bridgeCalls.length = 0;
window.dispatchEvent(new window.CustomEvent("cinemax:player-fullscreen", { detail: { active: true } }));
window.dispatchEvent(new window.CustomEvent("cinemax:player-fullscreen", { detail: { active: false } }));
check(bridgeCalls.includes("enterFullscreen"), "web player fullscreen enters native landscape mode");
check(bridgeCalls.includes("exitFullscreen"), "web player fullscreen restores native portrait mode");

console.log("\n== safety");
check(!document.querySelector("script[src]"), "injection adds no remote script");
check(themeText.includes("html[data-cinemax-app=\"android\"]"), "every app rule is scoped to the app attribute");
check(
  !/(^|\})\s*(body|html|\.movie-card|\.bottom-nav)\s*\{/.test(themeText.replace(/html\[data-cinemax-app="android"\]/g, "SCOPED")),
  "no unscoped selectors are injected"
);
check(!/(^|\})\s*#cinemax-app\s*\{/.test(themeText.replace(/html\[data-cinemax-app="android"\]/g, "SCOPED")),
  "no stacking context is created over the app root");
check(/html\[data-cinemax-app="android"\]::before\s*\{[^}]*display:\s*none/.test(themeText), "the expensive fixed aurora layer is disabled");
check(!shellScript.includes("MutationObserver"), "the shell does not observe the full React subtree");

/* ------------------------------------------------------------------ cascade */

/* Resolves which rule actually wins for one property on one element, walking the
   site's real stylesheet first and the injected app theme second, exactly like
   the cascade does in the WebView (specificity, then source order). */
function specificityOf(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|::?[\w-]+/g) || []).length;
  const types = selector
    .replace(/\[[^\]]+\]|::?[\w-]+/g, " ")
    .split(/[\s>+~]+/)
    .filter((part) => /^[a-zA-Z][\w-]*$/.test(part)).length;
  return ids * 1000000 + classes * 1000 + types;
}

/* The conditions the app actually renders under: a 412 dp phone, no
   "reduce motion" preference. Media groups are evaluated against that instead of
   being treated as if every query applied. */
const VIEWPORT = { width: 412, height: 915 };

function mediaApplies(prelude) {
  const conditions = prelude.replace(/^@media\s*/, "");
  if (/prefers-reduced-motion/.test(conditions)) {
    return false;
  }
  if (/prefers-color-scheme|prefers-contrast|orientation|hover:|pointer:/.test(conditions)) {
    return false;
  }
  let applies = true;
  for (const match of conditions.matchAll(/\((min|max)-width:\s*([\d.]+)(px|em|rem)\)/g)) {
    const pixels = match[3] === "px" ? Number(match[2]) : Number(match[2]) * 16;
    if (match[1] === "min" && VIEWPORT.width < pixels) applies = false;
    if (match[1] === "max" && VIEWPORT.width > pixels) applies = false;
  }
  return applies;
}

function collectDeclarations(cssText, element, property) {
  const found = [];
  let order = 0;
  // Comments sit between rules (and above each app rule): drop them so a
  // selector is never glued to a comment body.
  const walk = (source) => {
    const text = source.replace(/\/\*[\s\S]*?\*\//g, " ");
    let index = 0;
    while (index < text.length) {
      const open = text.indexOf("{", index);
      if (open === -1) {
        return;
      }
      const prelude = text.slice(index, open).trim();
      let depth = 1;
      let cursor = open + 1;
      while (cursor < text.length && depth > 0) {
        if (text[cursor] === "{") depth += 1;
        else if (text[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      const block = text.slice(open + 1, cursor - 1);
      if (prelude.startsWith("@")) {
        const group = /^@(media|supports|layer|container|document)[\s(]/i.test(prelude);
        if (group && (!/^@media/i.test(prelude) || mediaApplies(prelude))) {
          walk(block);
        }
      } else if (prelude) {
        // Declarations may start the block or follow a ';' - possibly on their
        // own line, which is how the hand-written app theme is formatted.
        const declaration = new RegExp("(?:^|;|\\n)\\s*" + property + "\\s*:([^;}]*)", "i").exec(block);
        if (declaration) {
          for (const candidate of prelude.split(",")) {
            const selector = candidate.trim();
            if (!selector || selector.includes(":")) {
              continue;
            }
            try {
              if (element.matches(selector)) {
                found.push({
                  selector,
                  value: declaration[1].trim(),
                  rank: specificityOf(selector) * 1000 + order++,
                });
              }
            } catch (error) {
              /* A selector jsdom cannot evaluate is simply not a candidate. */
            }
          }
        }
      }
      index = cursor;
    }
  };
  walk(cssText);
  return found;
}

function winningValue(sheets, element, property) {
  let winner = null;
  let sheetOrder = 0;
  for (const sheet of sheets) {
    const declarations = collectDeclarations(sheet, element, property);
    for (const declaration of declarations) {
      const rank = declaration.rank + sheetOrder;
      if (!winner || rank > winner.rank) {
        winner = { ...declaration, rank };
      }
    }
    sheetOrder += 1000000000;
  }
  return winner;
}

const siteCss = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "app", "globals.css"),
  "utf8"
);
const sheets = [siteCss, themeText];

console.log("\n== the app layer wins the cascade on the scroll path");
const heroScene = document.querySelector('.hero-scene[data-active="true"]');
const rows = document.querySelectorAll(".movie-row");
const row = rows[rows.length - 1];
const track = document.querySelector(".movie-track");
const rect = document.querySelector(".button-light rect");

// The site rules these overrides exist for are still there (a guard against the
// website changing underneath the app layer).
check(/\.movie-row\s*\{[^}]*content-visibility:\s*auto/.test(siteCss), "the site still skips offscreen rails");
check(/html\s*\{[^}]*scroll-behavior:\s*smooth/.test(siteCss), "the site still animates document scrolling");
check(/\.button-light rect\s*\{[^}]*animation:/.test(siteCss), "the site still runs the flowing button light");

const rowVisibility = winningValue(sheets, row, "content-visibility");
check(rowVisibility && rowVisibility.value === "visible", `rails render without content-visibility skipping (${rowVisibility && rowVisibility.value})`);
const rowIntrinsic = winningValue(sheets, row, "contain-intrinsic-size");
check(rowIntrinsic && rowIntrinsic.value.includes("none"), `the 390px rail estimate is dropped (${rowIntrinsic && rowIntrinsic.value})`);
const rowContain = winningValue(sheets, row, "contain");
check(rowContain && rowContain.value.includes("layout"), `rails isolate their own layout work (${rowContain && rowContain.value})`);
const scrollBehaviour = winningValue(sheets, document.documentElement, "scroll-behavior");
check(scrollBehaviour && scrollBehaviour.value === "auto", `document scrolling is immediate in the app (${scrollBehaviour && scrollBehaviour.value})`);
const trackTouch = winningValue(sheets, track, "touch-action");
check(trackTouch && trackTouch.value === "auto", `rails leave both pan axes to the compositor (${trackTouch && trackTouch.value})`);

document.documentElement.setAttribute("data-cinemax-scrolling", "true");
const lightState = winningValue(sheets, rect, "animation-play-state");
check(
  lightState && lightState.value === "paused" && lightState.selector.includes("data-cinemax-scrolling"),
  `decorative animations park while scrolling (${lightState && lightState.value})`
);
const sceneTransition = winningValue(sheets, heroScene, "transition");
check(
  sceneTransition && /opacity .65s ease/.test(sceneTransition.value),
  `the hero keeps its own cross-fade, untouched by the scroll layer (${sceneTransition && sceneTransition.value})`
);
check(
  !/data-cinemax-scrolling[^{]*\.hero-scene/.test(themeText),
  "only endless animations are parked while scrolling (nothing the user looks at can snap)"
);
document.documentElement.removeAttribute("data-cinemax-scrolling");

/* ------------------------------------------------------------- scroll engine */

console.log("\n== scroll engine (one passive listener, idle decode ahead of the view)");

const scrollDom = new JSDOM(fixture, {
  runScripts: "outside-only",
  pretendToBeVisual: true,
  url: "https://cinemax-orpin.vercel.app/",
});
const sw = scrollDom.window;
const sd = sw.document;

const attributeWrites = { set: 0, remove: 0 };
const decodedUrls = [];
const listeners = [];

const documentElement = sd.documentElement;
const setAttribute = documentElement.setAttribute.bind(documentElement);
const removeAttribute = documentElement.removeAttribute.bind(documentElement);
documentElement.setAttribute = (name, value) => {
  if (name === "data-cinemax-scrolling") attributeWrites.set += 1;
  return setAttribute(name, value);
};
documentElement.removeAttribute = (name) => {
  if (name === "data-cinemax-scrolling") attributeWrites.remove += 1;
  return removeAttribute(name);
};

const originalAddEventListener = sw.EventTarget.prototype.addEventListener;
sw.EventTarget.prototype.addEventListener = function (type, handler, options) {
  listeners.push({
    type,
    passive: !!(options && options.passive),
    target: this === sw ? "window" : this.tagName ? this.tagName.toLowerCase() : "node",
    className: typeof this.className === "string" ? this.className : "",
  });
  return originalAddEventListener.call(this, type, handler, options);
};
sw.HTMLImageElement.prototype.decode = function () {
  decodedUrls.push(this.currentSrc || this.src);
  return Promise.resolve();
};

sw.CinemaxNative = {
  themeApplied: () => {},
  shellReady: () => {},
  setMediaPlaying: () => {},
};
try {
  sw.eval(injectionScript);
  sw.eval(shellScript);
} catch (error) {
  console.error("  FAIL scroll-engine injection threw:", error && error.message);
  failures += 1;
}
if (sd.readyState === "loading") {
  sd.dispatchEvent(new sw.Event("DOMContentLoaded"));
}

const scrollListener = listeners.find((entry) => entry.type === "scroll");
check(!!scrollListener, "the shell listens for scroll on the window");
check(scrollListener && scrollListener.passive === true, "that scroll listener is passive (never blocks the compositor)");
check(
  listeners.every((entry) => entry.target === "window" || entry.target === "node"),
  "no listeners are attached per card/rail (the React tree keeps its own)"
);

// Idle warm-up of what the user is about to reach: one decode per image, no
// repeat work, and never while the page is scrolling.
await new Promise((resolve) => setTimeout(resolve, 700));
check(decodedUrls.length > 0, `nearby artwork is decoded during idle time (${decodedUrls.length} images)`);
const firstPass = decodedUrls.length;
await new Promise((resolve) => setTimeout(resolve, 700));
check(
  decodedUrls.length === firstPass,
  "later idle passes decode nothing again (each element is warmed once)"
);
check(
  [...sd.images].every((image) => !image.getAttribute("loading") || image.getAttribute("data-cinemax-warm") === "1"),
  "every lazy image on screen is marked as warmed"
);
check(
  decodedUrls.some((url) => url.includes("/w1280/slide-two.jpg")),
  "the next featured slide's full-size backdrop is decoded before the rotation"
);
check(
  !decodedUrls.some((url) => url.includes("/w300/")),
  "only the size the full-size view will use is warmed"
);

const beforeScroll = decodedUrls.length;
for (let burst = 0; burst < 8; burst += 1) {
  sw.dispatchEvent(new sw.Event("scroll"));
}
check(attributeWrites.set === 1, `eight scroll events cost a single state change (${attributeWrites.set})`);
check(documentElement.getAttribute("data-cinemax-scrolling") === "true", "the document is marked as scrolling");
check(decodedUrls.length === beforeScroll, "no decode work is started while the finger is on the screen");

await new Promise((resolve) => setTimeout(resolve, 700));
check(documentElement.getAttribute("data-cinemax-scrolling") === null, "the scrolling state clears once the gesture stops");
check(attributeWrites.remove >= 1, "clearing the state is also a single attribute write");

if (hostilePath) {
  console.log("\n== hostile input cannot break out of the injected string");
  let alerted = 0;
  const hostileDom = new JSDOM(fixture, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://cinemax-orpin.vercel.app/",
    // The hostile payload is *meant* to be rejected by the CSS parser, so the
    // expected "Could not parse CSS stylesheet" report is silenced: it is not a
    // failure, and its stack trace only makes the log look broken.
    virtualConsole: new VirtualConsole(),
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
