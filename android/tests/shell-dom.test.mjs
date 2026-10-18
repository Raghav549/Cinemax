/**
 * Runs the *real* injected app layer (the script produced by AppTheme in Java)
 * against a DOM fixture that mirrors the deployed MiLey page structure, and
 * checks the app-only behaviour:
 *
 *   · the document is marked as the Android app and the theme is installed;
 *   · the native bridge is told when the theme is live and when the shell is up;
 *   · device insets reach the page as CSS custom properties;
 *   · media playback is reported so the screen can stay awake;
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

/* A trimmed but structurally accurate slice of the live MiLey page: sticky
   header, hero with the floating vinyl, a music-note rail, track list, media
   card grid, loading skeleton, bottom navigation dock, the mini player, the
   full-screen player stage, the audio element and the site's own session intro
   element. */
const fixture = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>MiLey — music, made personal</title>
</head>
<body>
  <div id="miley-app">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="miley-header">
      <div class="miley-header-brand"><a class="miley-logo" href="/" aria-label="MiLey home"><svg class="miley-emblem" viewBox="0 0 42 42" aria-hidden="true"></svg><span class="miley-wordmark">Mi<span class="miley-wordmark-accent">Ley</span></span></a></div>
      <nav class="miley-header-nav" aria-label="Primary"><a class="is-active" href="/">Home</a><a href="/explore">Explore</a><a href="/podcasts">Podcasts</a></nav>
      <div class="miley-header-actions">
        <a class="header-search-link" href="/search" aria-label="Search"><span>Search</span></a>
        <a class="header-signin" href="/login">Sign in</a>
      </div>
    </header>
    <main class="miley-page home-page" id="main-content" tabindex="-1">
      <section class="home-hero" aria-labelledby="welcome-title">
        <div class="home-hero-copy">
          <span class="page-eyebrow">MiLey · music, made personal</span>
          <h1 id="welcome-title">Sound that finds <em>you</em></h1>
          <p>Real creator releases, curated in the open.</p>
          <div class="home-hero-actions">
            <a class="primary-button" href="/explore">Explore music</a>
            <a class="secondary-button" href="/register">Create an account</a>
          </div>
        </div>
        <div class="home-hero-art" aria-hidden="true">
          <div class="hero-orbit"></div>
          <div class="hero-vinyl"><div class="hero-vinyl-center"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></div></div>
        </div>
        <span class="home-hero-aside">built around real creator releases</span>
      </section>
      <div class="home-shortcuts" aria-label="Quick links">
        <a class="shortcut-card" href="/explore"><span class="shortcut-icon"></span><span><strong>Find your sound</strong><small>Search creator releases</small></span></a>
        <a class="shortcut-card" href="/channels"><span class="shortcut-icon"></span><span><strong>Meet the creators</strong><small>Explore real channels</small></span></a>
        <a class="shortcut-card" href="/library"><span class="shortcut-icon"></span><span><strong>Your collection</strong><small>Favorites, playlists &amp; uploads</small></span></a>
        <a class="shortcut-card" href="/podcasts"><span class="shortcut-icon"></span><span><strong>Podcasts</strong><small>Authorized shows only</small></span></a>
      </div>
      <section class="section-block" aria-label="Music notes">
        <div class="section-heading"><div><h2>Notes from your circle</h2><p>Music notes are shared only between mutual follows.</p></div></div>
        <div class="music-note-rail hide-scrollbar">
          <a class="note-composer" href="/library"><span class="note-add">+</span><span>Share a song note</span></a>
          <button class="music-note-card" type="button"><span class="note-avatar"><img src="/avatars/ada.jpg" alt=""></span><span class="note-copy"><strong>Ada · @ada</strong><span><span class="note-track-art"></span>Night Signal</span></span></button>
          <button class="music-note-card" type="button"><span class="note-avatar"><img loading="lazy" src="/avatars/lin.jpg" alt=""></span><span class="note-copy"><strong>Lin · @lin</strong><span><span class="note-track-art"></span>Harbour Lights</span></span></button>
        </div>
      </section>
      <section class="section-block" aria-label="Public tracks">
        <div class="section-heading"><div><h2>Fresh releases</h2><p>Public, rights-confirmed songs.</p></div><a class="text-link" href="/explore">See all</a></div>
        <div class="track-list">
          <div class="track-row"><div class="track-main"><div class="track-row-index"><span class="mini-eq" aria-hidden="true"><i></i><i></i><i></i></span></div><div class="miley-artwork"><img loading="lazy" decoding="async" src="/art/night-signal.jpg" alt="Night Signal cover art"></div><div class="track-meta"><strong>Night Signal</strong><span>Ada Vale</span><span class="track-genre">Ambient</span></div></div><div class="track-actions"><span class="track-duration">3:42</span></div></div>
          <div class="track-row"><div class="track-main"><div class="track-row-index"><span>02</span></div><div class="miley-artwork"><img loading="lazy" decoding="async" src="/art/harbour-lights.jpg" alt="Harbour Lights cover art"></div><div class="track-meta"><strong>Harbour Lights</strong><span>Lin Ortega</span><span class="track-genre">Indie</span></div></div><div class="track-actions"><span class="track-duration">4:05</span></div></div>
        </div>
      </section>
      <section class="section-block" aria-label="Playlists">
        <div class="section-heading"><div><h2>Your playlists</h2><p>Your music, in your own order.</p></div></div>
        <div class="playlist-grid">
          <a class="media-card" href="/playlist/1"><div class="miley-artwork"><img loading="lazy" decoding="async" src="/art/deep-focus.jpg" alt="Deep Focus cover"></div><p class="media-card-title">Deep Focus</p><p class="media-card-subtitle">Public playlist</p></a>
          <a class="media-card" href="/playlist/2"><div class="miley-artwork"><img loading="lazy" decoding="async" src="/art/late-drive.jpg" alt="Late Drive cover"></div><p class="media-card-title">Late Drive</p><p class="media-card-subtitle">Private playlist</p></a>
          <a class="media-card" href="/playlist/3"><div class="miley-artwork"><img loading="lazy" decoding="async" src="/art/sunday-cook.jpg" alt="Sunday Cook cover"></div><p class="media-card-title">Sunday Cook</p><p class="media-card-subtitle">Public playlist</p></a>
        </div>
      </section>
      <section class="section-block" aria-label="Loading">
        <div class="loading-skeleton" style="height:180px"></div>
      </section>
      <footer class="miley-footer"><a href="/">MiLey</a><span>Music shared with care.</span></footer>
    </main>
    <div class="miley-bottom-nav-wrap"><nav class="miley-bottom-nav" aria-label="Primary">
      <a class="is-active" href="/"><span class="bottom-nav-icon"></span><span>Home</span></a>
      <a href="/explore"><span class="bottom-nav-icon"></span><span>Explore</span></a>
      <a href="/library"><span class="bottom-nav-icon"></span><span>Library</span></a>
      <a href="/podcasts"><span class="bottom-nav-icon"></span><span>Podcasts</span></a>
      <a href="/profile"><span class="bottom-nav-icon"></span><span>Profile</span></a>
    </nav></div>
    <div class="mini-player">
      <div class="mini-player-progress"><span style="width:20%"></span></div>
      <button class="mini-player-open" type="button"><div class="miley-artwork mini-player-art"><img loading="lazy" src="/art/night-signal.jpg" alt=""></div><div class="mini-player-copy"><strong>Night Signal</strong><span>Ada Vale</span></div></button>
      <button class="mini-player-control" type="button" aria-label="Pause"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></button>
      <button class="mini-player-control" type="button" aria-label="Next"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></button>
    </div>
    <div class="miley-toast" role="status">Saved</div>
    <div class="miley-splash" role="dialog" aria-label="Opening MiLey"><div class="miley-splash-lockup"><span class="miley-splash-tagline">A little closer to the music.</span></div><button type="button" class="miley-splash-skip">Skip intro</button></div>
    <section class="player-overlay">
      <div class="player-content">
        <div class="player-art-stage is-playing"><div class="player-art-ring ring-a"></div><div class="player-art-ring ring-b"></div><div class="miley-artwork player-artwork"><img loading="lazy" src="/art/night-signal.jpg" alt="Night Signal cover art"></div></div>
        <div class="player-details"><div class="player-details-copy"><span class="eyebrow">Now playing</span><h1>Night Signal</h1><p>Ada Vale</p></div></div>
      </div>
    </section>
    <audio id="player" preload="metadata"></audio>
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
check(document.documentElement.getAttribute("data-miley-intro") === "seen", "the site's own intro flag is marked seen");
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
check(themeText.includes(".miley-bottom-nav"), "bottom navigation restyled");
check(themeText.includes(".media-card"), "music cards restyled");
check(themeText.includes(".hero-vinyl"), "hero motion is managed for the app");
check(themeText.includes(".mini-player"), "mini player restyled");
check(themeText.includes(".miley-splash"), "the in-page session intro is suppressed");
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

// Playback reporting: the native layer only wakes up when media really plays
// (the deployed player is an <audio> element; the retained media routes still
// mount <video>).
const media = document.getElementById("player");
Object.defineProperty(media, "paused", { value: false, writable: true, configurable: true });
Object.defineProperty(media, "ended", { value: false, writable: true, configurable: true });
Object.defineProperty(media, "readyState", { value: 4, writable: true, configurable: true });
Object.defineProperty(media, "currentTime", { value: 12, writable: true, configurable: true });

bridgeCalls.length = 0;
media.dispatchEvent(new window.Event("playing"));
check(bridgeCalls.includes("media:true"), "playing media keeps the screen awake");

media.paused = true;
bridgeCalls.length = 0;
media.dispatchEvent(new window.Event("pause"));
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
const heroVinyl = document.querySelector(".hero-vinyl");
const noteRail = document.querySelector(".music-note-rail");
const mediaCard = document.querySelector(".media-card");
const playerArtwork = document.querySelector(".player-artwork");
const skeleton = document.querySelector(".loading-skeleton");
const eqBar = document.querySelector(".mini-eq i");

// The site rules these overrides exist for are still there (a guard against the
// website changing underneath the app layer).
check(/html\s*\{[^}]*scroll-behavior:\s*smooth/.test(siteCss), "the site still animates document scrolling");
check(/\.music-note-rail\s*\{[^}]*overflow-x:\s*auto/.test(siteCss), "the site still ships rails as native horizontal scrollers");
check(/\.hero-vinyl\s*\{[^}]*animation:\s*vinyl-float[^;]*infinite/.test(siteCss), "the site still runs the endless hero motion");
check(/\.media-card\s*\{[^}]*transition:\s*transform/.test(siteCss), "the site still eases card interactions");

const scrollBehaviour = winningValue(sheets, document.documentElement, "scroll-behavior");
check(scrollBehaviour && scrollBehaviour.value === "auto", `document scrolling is immediate in the app (${scrollBehaviour && scrollBehaviour.value})`);
const railVisibility = winningValue(sheets, noteRail, "content-visibility");
check(railVisibility && railVisibility.value === "visible", `rails render without content-visibility skipping (${railVisibility && railVisibility.value})`);
const railIntrinsic = winningValue(sheets, noteRail, "contain-intrinsic-size");
check(railIntrinsic && railIntrinsic.value.includes("none"), `the rail height estimate is dropped (${railIntrinsic && railIntrinsic.value})`);
const railContain = winningValue(sheets, noteRail, "contain");
check(railContain && railContain.value.includes("layout"), `rails isolate their own layout work (${railContain && railContain.value})`);
const railTouch = winningValue(sheets, noteRail, "touch-action");
check(railTouch && railTouch.value === "auto", `rails leave both pan axes to the compositor (${railTouch && railTouch.value})`);
const railOverscroll = winningValue(sheets, noteRail, "overscroll-behavior-x");
check(railOverscroll && railOverscroll.value === "contain", `rails contain their own horizontal overscroll (${railOverscroll && railOverscroll.value})`);

document.documentElement.setAttribute("data-cinemax-scrolling", "true");
const lightState = winningValue(sheets, heroVinyl, "animation-play-state");
check(
  lightState && lightState.value === "paused" && lightState.selector.includes("data-cinemax-scrolling"),
  `decorative animations park while scrolling (${lightState && lightState.value})`
);
const eqState = winningValue(sheets, eqBar, "animation-play-state");
check(
  eqState && eqState.value === "paused" && eqState.selector.includes("data-cinemax-scrolling"),
  `the equaliser bars park while scrolling (${eqState && eqState.value})`
);
const shimmerState = winningValue(sheets, skeleton, "animation-play-state");
check(
  shimmerState && shimmerState.value === "paused" && shimmerState.selector.includes("data-cinemax-scrolling"),
  `the loading shimmer parks while scrolling (${shimmerState && shimmerState.value})`
);
const recordTransition = winningValue(sheets, playerArtwork, "transition");
check(
  recordTransition && /transform .8s/.test(recordTransition.value),
  `the rotating record keeps its own easing, untouched by the scroll layer (${recordTransition && recordTransition.value})`
);
check(
  !/data-cinemax-scrolling[^{]*\.(media-card|player-artwork|track-row)/.test(themeText),
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
// Artwork beyond one warm-up batch is decoded in a follow-up idle pass; let the
// queue drain completely before asserting that nothing runs again.
await new Promise((resolve) => setTimeout(resolve, 700));
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
  !decodedUrls.some((url) => url.includes("ada.jpg")),
  "artwork the site did not mark lazy is left to the browser"
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
