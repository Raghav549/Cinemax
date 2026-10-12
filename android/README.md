# Cinemax · Android app

The Cinemax Android app is a thin, native shell around the existing production
deployment. It does **not** fork, replace or duplicate anything: the same Next.js
app, the same API routes, the same PostgreSQL database, the same studio/admin
panel, the same authentication and the same playback pipeline run inside the app,
served from **`https://cinemax-orpin.vercel.app`**.

```
android/
├── app/src/main/                 Android application module
│   ├── AndroidManifest.xml       permissions, deep links, single activity
│   ├── java/com/cinemax/app/     six small classes (see below)
│   ├── assets/cinemax/           app-only presentation layer (CSS + runtime)
│   └── res/                      adaptive + legacy icons, splash, themes, layout
├── build.sh                      Gradle-free build → signed APK
├── tools/
│   ├── fetch-toolchain.sh        pinned, checksum-verified tool downloads
│   ├── align_apk.py              zipalign-equivalent alignment (4-byte / 4096-byte)
│   └── make_legacy_icons.py      raster launcher icons for API 24/25
├── tests/
│   ├── run-tests.sh              one command runs every layer
│   ├── install-test-deps.sh      installs jsdom for the DOM layer (cached)
│   ├── java/CinemaxAppTest.java  navigation policy + injection escaping (JVM)
│   ├── shell-dom.test.mjs        the injected layer executed against a DOM
│   ├── apk_check.py              manifest, resources, dex, signature, alignment
│   └── axml.py                   binary AndroidManifest.xml reader
└── dist/                         built artefacts (Cinemax-1.1.0.apk)
```

`.github/workflows/android.yml` builds this same way in CI (no Gradle, no SDK
manager): it fetches the pinned toolchain, installs jsdom, runs
`android/build.sh`, then `android/tests/run-tests.sh`, and uploads
`Cinemax-1.1.0.apk` plus its `.sha256` as the `cinemax-android-apk` artifact.
Every push and pull request builds it, and the workflow can be started by hand
with *Run workflow*.
```

## Build

```bash
bash android/build.sh              # build, sign and verify  →  android/dist/Cinemax-1.1.0.apk
bash android/build.sh --no-verify  # skip the verification pass
bash android/tests/run-tests.sh    # build if needed, then run all checks
bash android/tests/run-tests.sh --skip-build
```

The first build downloads a pinned toolchain into `android/.toolchain/`
(git-ignored) and verifies every archive's SHA-256:

| Tool                   | Source                                   | Used for                       |
| ---------------------- | ---------------------------------------- | ------------------------------ |
| `aapt2` 2.19-7832930   | PyPI `aapt2`                             | resource compilation + linking  |
| Android API 34 jar     | npm `@drxiaozhi/minapk`                  | `javac`/D8 boot and library jar |
| `d8.jar` (R8)          | npm `@drxiaozhi/minapk`                  | Java bytecode → `classes.dex`   |
| `ecj-3.45.0.jar`       | npm `@drxiaozhi/minapk`                  | Java compiler (`-source 8`)     |
| `apksigner.jar`        | npm `@drxiaozhi/minapk`                  | v1 + v2 + v3 signing            |
| Temurin 25 (jdk4py)    | PyPI `jdk4py`                            | JRE + `keytool`                 |

No Gradle, no Android SDK manager, no Android Studio. Override any tool with
`CINEMAX_JAVA`, `CINEMAX_KEYTOOL`, `CINEMAX_AAPT2`, `CINEMAX_ANDROID_JAR`,
`CINEMAX_D8_JAR`, `CINEMAX_ECJ_JAR`, `CINEMAX_APKSIGNER_JAR`.

**Signing.** `android/keystore/cinemax-release.keystore` (PKCS12, alias
`cinemax`) holds the self-signed release key; store and key password default to
`cinemax-release`. Override with `CINEMAX_KEYSTORE`, `CINEMAX_KEY_ALIAS`,
`CINEMAX_KEY_PASS`, `CINEMAX_STORE_PASS`. **Replace this keystore with your own
before publishing to Play** – the signing key decides upgrade identity:

```bash
CINEMAX_KEYSTORE=/secure/cinemax.jks CINEMAX_KEY_ALIAS=cinemax \
CINEMAX_KEY_PASS='…' CINEMAX_STORE_PASS='…' bash android/build.sh
```

Play requires an `.aab`; this project produces an installable, signed `.apk`.
The same sources build an AAB with any standard Android toolchain (Android
Studio → *Build → Generate Signed Bundle*), since `app/` is a normal Android
module layout.

## Install

```bash
adb install -r android/dist/Cinemax-1.1.0.apk
```

Or copy the APK to the device and open it (enable *Install unknown apps* for the
file manager/browser you use). Requirements: **Android 7.0 (API 24) or newer**,
`targetSdk 34`. Two permissions only: `INTERNET` and `ACCESS_NETWORK_STATE`.

## What the app does

| Concern | Behaviour |
| --- | --- |
| Content origin | `https://cinemax-orpin.vercel.app` only – never localhost, never an emulator host, never a dev server. The URL is compiled into `classes.dex` and asserted by the tests. |
| In-app navigation | The production host and its `*.vercel.app` aliases stay in the WebView, so tabs, filters, search, details, watchlist, studio login, cookies and the whole player behave exactly as in a browser. |
| External links | Any other domain, plus `mailto:`, `tel:`, `sms:`, `market:`, `intent:` and unknown schemes open in the matching system app. A lookalike host such as `evil-vercel.app.attacker.com` is sent out, not loaded. |
| Deep links | `https://cinemax-orpin.vercel.app/...` opens inside the app (`autoVerify`, see below). Re-opening from the launcher keeps the page you were on. |
| Back button | Fullscreen video → leave fullscreen; error screen → dismiss; otherwise WebView history → then "Press back again to exit". |
| Rotation | The activity handles configuration changes itself, so rotating (or the player switching to landscape) never reloads the page. |
| Edge to edge | API 30+ draws behind transparent status/navigation bars; the real insets are measured natively and published to the page as CSS variables, so the existing layout clears the status bar, gesture bar, cutout and rounded corners. Themed brand gradient shows in the very top and bottom strips. |
| Keyboard | `adjustResize` + IME padding, so the studio forms are never hidden behind the keyboard. |
| Playback | Media autoplay is permitted, HLS/MSE run in-page, and the Cinemax player bridge puts direct video into immersive **sensor-landscape** fullscreen. Exit (or Android Back) restores the prior orientation and normal system bars; the screen stays awake only while media is actually playing. |
| Session intro | The native splash replaces the web intro with a transform/opacity Cinemax emblem reveal, restrained light rings and streaks, then a themed first-paint hand-off. It has no generic spinner or “Starting Cinemax” screen. |
| Crash resilience | If the WebView renderer dies, the shell rebuilds it and reloads instead of crashing the app. |
| Offline | A native Cinemax screen with *Try again* and *Open in browser* appears when the main document cannot load. |

## The Android presentation and performance layer

Presentation only. Nothing about data, routing, API calls or authentication
changes; the layer is an extra stylesheet plus a small runtime, scoped to
`html[data-cinemax-app="android"]`, and is invisible to the website.

* **Deep-black foundation** – page and large surface backgrounds use `#050507`
  / `#08080c`. The existing violet, blue and pink buttons, borders, icons,
  logo, active indicators and artwork are deliberately untouched.
* **Scroll work removed** – the fixed full-page aurora, blur filters and
  per-poster entrance animation were removed from the Android-only layer.
  Rails retain momentum scrolling; source images remain responsive/lazy and
  decode asynchronously.
* **Less React work** – card artwork is memoized, watchlist changes only
  re-render the compact save control, collection rows are indexed once, and
  rail edge state is coalesced to one animation frame rather than every scroll
  event.
* **Fullscreen hand-off** – `app-shell.js` listens for the player’s fullscreen
  event and asks the native bridge for landscape immersive mode. It delegates
  media events at the document level instead of observing the full React DOM.
* **Responsive** – gutters, hit targets (≥ 48 dp) and type scale adapt from
  320 dp phones to tablets; `prefers-reduced-motion` remains respected.

`android/app/src/main/assets/cinemax/app-theme.css` is the stylesheet and
`app-shell.js` is the runtime (insets, playback reporting, fullscreen hand-off,
viewport and touch behaviour). Both are evaluated by
`MainActivity.applyAppTheme()` after the first paint, so the native splash lifts
onto an already-themed page.

## Digital Asset Links

`public/.well-known/assetlinks.json` in the web app publishes the app package
and the release certificate fingerprint so the `autoVerify` deep-link filter can
be verified against the production domain. After changing the signing key,
regenerate the fingerprint and update that file:

```bash
android/.toolchain/jdk/bin/keytool -list -v \
  -keystore android/keystore/cinemax-release.keystore \
  -alias cinemax -storepass cinemax-release | grep SHA256
```

Then redeploy the site and reinstall the app.

## Tests

```bash
bash android/tests/run-tests.sh              # build if needed, then all layers
bash android/tests/install-test-deps.sh      # jsdom for the DOM layer (cached)
```

`run-tests.sh` runs four layers and exits non-zero on failure (it installs jsdom
itself when it is missing and npm is available). `CINEMAX_REQUIRE_JSDOM=1` turns
a missing jsdom/node into a failure instead of a skip — CI sets it, so the DOM
layer can never silently disappear from a build:

1. **JVM unit checks (58)** – navigation policy (in-app vs external, including
   localhost/emulator rejection and suffix-spoofing hosts) and injection
   escaping (hostile CSS/JS cannot break out of the generated script).
2. **JavaScript syntax** – `node --check` on the generated injection script, the
   packaged shell runtime and the source shell.
3. **DOM behaviour (40, jsdom)** – the real injected layer runs against a
   fixture of the Cinemax page: theme installed once, bridge signalled, insets
   published and clamped, viewport tuned, playback reported on play/pause,
   fullscreen reaches and leaves the native bridge, no full-subtree observer,
   no unscoped selectors, no inline-script dependency, hostile input inert.
4. **APK structure (88)** – parsed binary manifest (package, SDK versions,
   `singleTask`, `adjustResize`, `configChanges`, deep link, permissions),
   adaptive + legacy icons, splash and theme resources, classes in `classes.dex`,
   the production URL in the DEX, **no `localhost`/`127.0.0.1`/`10.0.2.2`/`:3000`
   anywhere in the payload**, apksigner verification (v1 + v2 + v3) and
   zipalign equivalence for `resources.arsc`.

   The same layer validates `classes.dex` the way the device does before it
   installs a package: dex magic and version (037, supported by API 24), the
   adler32 checksum, the SHA-1 signature, `file_size`, `header_size`, the
   endian tag, the string table, the class list, the map offset and the data
   section bounds. A malformed dex would fail here instead of failing to
   install.

The web application is unchanged by this work: `npm run lint`, `npm run
typecheck` and `npm run build` all pass with every existing route, API and page
intact.

## Verifying on a device

These checks need a real device or emulator with the production site reachable –
they are the final gate:

1. `adb install -r android/dist/Cinemax-1.1.0.apk`, then launch Cinemax.
2. Confirm the animated logo → home hand-off completes without a spinner or
   “Starting Cinemax” label, and that the hero, rails and every poster load from
   `cinemax-orpin.vercel.app` (no local content).
3. On a mid-range phone, rapidly scroll several rails and a long collection;
   repeat on a throttled/slow network and verify touch input stays responsive.
4. Open a direct title and an adaptive HLS title. Verify the settings menu lists
   only manifest-provided levels (including Auto for multiple levels), while a
   single rendition plainly explains that it cannot switch quality.
5. Start playback, switch to fullscreen landscape and back, then press Android
   Back once in fullscreen (it must restore portrait/system bars rather than
   close playback) and again to leave the player.
6. Open `/gate-keeper`, log in with the studio credentials and confirm the
   dashboard loads and edits save. Toggle airplane mode and reopen the app to
   see the native offline screen and *Try again*.

## Remaining notes

* The sandbox used to build this APK has **no network route to the production
  deployment and no attached Android device/emulator**, so final GPU frame-time,
  physical rotation and live-source playback checks could not be performed here.
  The production URL is compiled into the APK and asserted by the tests; run the
  device checklist above against the deployed site before releasing.
* Playback of any licence-restricted source still depends on the deployment's
  own configuration (`TORRENT_*` gateway) exactly as on the web; the app adds
  nothing to that path.
* For the Play Store you also need a store listing, an `.aab`, and a privacy
  policy URL.
