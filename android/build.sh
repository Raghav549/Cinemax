#!/usr/bin/env bash
# =============================================================================
# Cinemax · Android APK build
#
# Gradle-free, SDK-manager-free build of the Cinemax Android app. The app is a
# native shell around the production deployment (https://cinemax-orpin.vercel.app)
# plus an app-only presentation layer; the Next.js app, its API routes, the
# PostgreSQL database, the studio/admin panel and authentication are unchanged
# and are not part of this build.
#
#   bash android/build.sh              # build + sign + verify
#   bash android/build.sh --no-verify  # skip the post-build verification
#
# Output: android/dist/Cinemax-<version>.apk
#
# Tool overrides (optional):
#   CINEMAX_JAVA CINEMAX_KEYTOOL CINEMAX_AAPT2 CINEMAX_ANDROID_JAR
#   CINEMAX_D8_JAR CINEMAX_ECJ_JAR CINEMAX_APKSIGNER_JAR CINEMAX_HTTP_TIMEOUT
# =============================================================================
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$SCRIPT_DIR"
MAIN="$PROJECT/app/src/main"
BUILD="$PROJECT/build"
DIST="$PROJECT/dist"
CACHE="${CINEMAX_TOOLCHAIN:-$PROJECT/.toolchain}"
KEYSTORE_DIR="$PROJECT/keystore"
KEYSTORE="${CINEMAX_KEYSTORE:-$KEYSTORE_DIR/cinemax-release.keystore}"
KEY_ALIAS="${CINEMAX_KEY_ALIAS:-cinemax}"
KEY_PASS="${CINEMAX_KEY_PASS:-cinemax-release}"
STORE_PASS="${CINEMAX_STORE_PASS:-$KEY_PASS}"

APP_NAME="Cinemax"
VERSION_NAME="1.1.0"
MIN_SDK="24"
TARGET_SDK="34"

VERIFY=1
for argument in "$@"; do
  case "$argument" in
    --no-verify) VERIFY=0 ;;
    *) printf 'unknown argument: %s\n' "$argument" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
info() { printf '    %s\n' "$1"; }
fail() { printf '\n\033[1;31mBUILD FAILED: %s\033[0m\n' "$1" >&2; exit 1; }

# --------------------------------------------------------------- toolchain
if [ ! -f "$CACHE/.fetched" ]; then
  step "Fetching the pinned Android toolchain"
  bash "$PROJECT/tools/fetch-toolchain.sh"
fi

JAVA="${CINEMAX_JAVA:-$CACHE/jdk/bin/java}"
KEYTOOL="${CINEMAX_KEYTOOL:-$CACHE/jdk/bin/keytool}"
AAPT2="${CINEMAX_AAPT2:-$CACHE/bin/aapt2}"
ANDROID_JAR="${CINEMAX_ANDROID_JAR:-$CACHE/lib/android.jar}"
D8_JAR="${CINEMAX_D8_JAR:-$CACHE/lib/d8.jar}"
ECJ_JAR="${CINEMAX_ECJ_JAR:-$CACHE/lib/ecj.jar}"
APKSIGNER_JAR="${CINEMAX_APKSIGNER_JAR:-$CACHE/lib/apksigner.jar}"

[ -x "$JAVA" ] || fail "java not found at $JAVA (run android/tools/fetch-toolchain.sh or set CINEMAX_JAVA)"
[ -x "$AAPT2" ] || fail "aapt2 not found at $AAPT2"
[ -f "$ANDROID_JAR" ] || fail "android.jar not found at $ANDROID_JAR"
[ -f "$D8_JAR" ] || fail "d8.jar not found at $D8_JAR"
[ -f "$ECJ_JAR" ] || fail "ecj.jar not found at $ECJ_JAR"
[ -f "$APKSIGNER_JAR" ] || fail "apksigner.jar not found at $APKSIGNER_JAR"
command -v python3 >/dev/null 2>&1 || fail "python3 is required for the alignment step"
command -v zip >/dev/null 2>&1 || fail "the 'zip' utility is required for packaging"

info "java        : $("$JAVA" -version 2>&1 | head -n 1)"
info "aapt2       : $("$AAPT2" version 2>&1 | head -n 1)"

# ------------------------------------------------------------------- clean
step "Preparing the build tree"
rm -rf "$BUILD"
mkdir -p "$BUILD/classes" "$BUILD/dex" "$BUILD/gen" "$BUILD/assets" "$BUILD/res" "$DIST"

# ---------------------------------------------------- resources (aapt2)
step "Compiling resources and linking the Android manifest"
"$AAPT2" compile --dir "$MAIN/res" -o "$BUILD/res/compiled.zip" >"$BUILD/aapt2-compile.log" 2>&1 \
  || { cat "$BUILD/aapt2-compile.log"; fail "aapt2 compile failed"; }

"$AAPT2" link \
  -o "$BUILD/resources.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$MAIN/AndroidManifest.xml" \
  --java "$BUILD/gen" \
  --min-sdk-version "$MIN_SDK" \
  --target-sdk-version "$TARGET_SDK" \
  --auto-add-overlay \
  "$BUILD/res/compiled.zip" >"$BUILD/aapt2-link.log" 2>&1 \
  || { cat "$BUILD/aapt2-link.log"; fail "aapt2 link failed"; }
info "resources.apk $(wc -c <"$BUILD/resources.apk") bytes"

# ------------------------------------------------------- compile java (ECJ)
step "Compiling Java sources with ECJ against the Android API"
find "$MAIN/java" "$BUILD/gen" -name '*.java' >"$BUILD/sources.list"
info "$(wc -l <"$BUILD/sources.list") source file(s)"

# shellcheck disable=SC2046
"$JAVA" -jar "$ECJ_JAR" \
  -source 8 -target 8 -encoding UTF-8 -nowarn \
  -bootclasspath "$ANDROID_JAR" \
  -classpath "$ANDROID_JAR" \
  -d "$BUILD/classes" \
  $(cat "$BUILD/sources.list") >"$BUILD/ecj.log" 2>&1 \
  || { tail -n 40 "$BUILD/ecj.log"; fail "Java compilation failed (see $BUILD/ecj.log)"; }
info "compiled $(find "$BUILD/classes" -name '*.class' | wc -l) class file(s)"

# ------------------------------------------------------------ dex (D8)
step "Dexing with D8 (min API $MIN_SDK)"
find "$BUILD/classes" -name '*.class' >"$BUILD/classes.list"
mapfile -t CLASS_FILES <"$BUILD/classes.list"
"$JAVA" -cp "$D8_JAR" com.android.tools.r8.D8 \
  --min-api "$MIN_SDK" \
  --lib "$ANDROID_JAR" \
  --output "$BUILD/dex" \
  "${CLASS_FILES[@]}" >"$BUILD/d8.log" 2>&1 \
  || { tail -n 40 "$BUILD/d8.log"; fail "D8 dexing failed"; }
info "$(ls "$BUILD/dex" | tr '\n' ' ')"

# ------------------------------------------------------------- packaging
step "Packaging the APK"
cp "$BUILD/resources.apk" "$BUILD/app-unsigned.apk"
(cd "$BUILD/dex" && zip -q -X -u "$BUILD/app-unsigned.apk" classes.dex)

if [ -d "$MAIN/assets" ]; then
  # APK assets must be rooted at assets/ inside the archive.
  mkdir -p "$BUILD/pack/assets"
  cp -R "$MAIN/assets/." "$BUILD/pack/assets/"
  (cd "$BUILD/pack" && zip -q -X -r -u "$BUILD/app-unsigned.apk" assets)
  info "assets: $(cd "$BUILD/pack" && find assets -type f | tr '\n' ' ')"
fi

# -------------------------------------------------------------- alignment
step "Aligning (zipalign equivalent, 4-byte / 4096-byte)"
python3 "$PROJECT/tools/align_apk.py" "$BUILD/app-unsigned.apk" "$BUILD/app-aligned.apk"

# ---------------------------------------------------------------- signing
step "Signing"
mkdir -p "$KEYSTORE_DIR"
if [ ! -f "$KEYSTORE" ]; then
  info "creating a release keystore at $KEYSTORE"
  "$KEYTOOL" -genkeypair \
    -keystore "$KEYSTORE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -sigalg SHA256withRSA \
    -validity 10950 \
    -storetype PKCS12 \
    -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
    -dname "CN=Cinemax, OU=Cinemax App, O=Cinemax, L=Internet, C=IN" >/dev/null
else
  info "using existing keystore $KEYSTORE"
fi

APK_OUT="$DIST/$APP_NAME-$VERSION_NAME.apk"
rm -f "$APK_OUT"
"$JAVA" -jar "$APKSIGNER_JAR" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$STORE_PASS" \
  --key-pass "pass:$KEY_PASS" \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --v4-signing-enabled false \
  --out "$APK_OUT" \
  "$BUILD/app-aligned.apk" 2>"$BUILD/apksigner.log" \
  || { tail -n 30 "$BUILD/apksigner.log"; fail "apksigner failed"; }

cp "$APK_OUT" "$DIST/$APP_NAME-latest.apk"

# ------------------------------------------------------------- verification
if [ "$VERIFY" = "1" ]; then
  step "Verifying the APK"
  "$JAVA" -jar "$APKSIGNER_JAR" verify --verbose --print-certs "$APK_OUT" 2>"$BUILD/apksigner-verify.log" \
    || { tail -n 30 "$BUILD/apksigner-verify.log"; fail "apksigner verify failed"; }
  grep -E "Verifies|Verified using|Signer #1 certificate DN" "$BUILD/apksigner-verify.log" | sed 's/^/  /' || true

  python3 "$PROJECT/tools/align_apk.py" --check "$APK_OUT" | sed 's/^/  /'

  "$AAPT2" dump badging "$APK_OUT" >"$BUILD/badging.txt" 2>/dev/null || true
  grep -E "^package|^application-label|^launchable-activity|^sdkVersion|^targetSdkVersion" "$BUILD/badging.txt" | sed 's/^/  /' || true

  python3 - "$APK_OUT" <<'PY' | sed 's/^/  /'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as apk:
    names = apk.namelist()
    drawables = [n for n in names if n.startswith("res/") and n.endswith(".xml")]
    print("entries           :", len(names))
    print("classes.dex       :", "classes.dex" in names)
    print("assets present    :", sorted(n for n in names if n.startswith("assets/"))[:6])
    print("compiled xml      :", len(drawables))
PY
fi

step "Done"
info "APK    : $APK_OUT"
info "size   : $(wc -c <"$APK_OUT") bytes"
info "sha256 : $(sha256sum "$APK_OUT" | awk '{print $1}')"
info "copy   : $DIST/$APP_NAME-latest.apk"
info "install: adb install -r \"$APK_OUT\""
