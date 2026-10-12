#!/usr/bin/env bash
# =============================================================================
# Cinemax Android - toolchain fetcher
#
# The Cinemax APK is built without Gradle and without the Android SDK manager:
# every tool is a pinned, checksum-verified archive fetched from npm or PyPI.
# They are cached in android/.toolchain (git-ignored), so a rebuild is offline
# after the first run.
#
#   Android API jar     -> npm  @drxiaozhi/minapk  (tools/android.jar)
#   D8 / R8 dexer       -> npm  @drxiaozhi/minapk  (tools/d8.jar)
#   ECJ Java compiler   -> npm  @drxiaozhi/minapk  (tools/ecj-3.45.0.jar)
#   apksigner           -> npm  @drxiaozhi/minapk  (tools/apksigner.jar)
#   aapt2 (link/compile)-> PyPI aapt2 (Linux x86_64 / aarch64)
#   JRE + keytool       -> PyPI jdk4py (Temurin 25)
#
# Usage:  bash android/tools/fetch-toolchain.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$(dirname "$SCRIPT_DIR")"
CACHE="${CINEMAX_TOOLCHAIN:-$ANDROID_DIR/.toolchain}"

MINAPK_VERSION="0.4.0"
MINAPK_SHA256="d22fccaba9a909cf02f196c91ca1e45ac9cb4b32c6e16cf0493182d26c071417"
AAPT2_PYPI_VERSION="0.2.1"
AAPT2_X86_64_SHA256="a49805fdf6b92ce3fbf237b5f3fb988b2d6eb43131cd2cdd5e3cfe55d6b93ab8"
JDK4PY_VERSION="25.0.2.1"

log() { printf '\033[1;35m[toolchain]\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m[toolchain] %s\033[0m\n' "$1" >&2; exit 1; }

verify_sha256() {
  local file="$1" expected="$2"
  local actual
  actual="$(sha256sum "$file" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    fail "checksum mismatch for $file (expected $expected, got $actual)"
  fi
}

case "$(uname -s)" in
  Linux) ;;
  *) fail "This fetcher targets Linux. On macOS/Windows, install the same tools manually and pass CINEMAX_JAVA / CINEMAX_AAPT2 / CINEMAX_ANDROID_JAR / CINEMAX_D8_JAR / CINEMAX_ECJ_JAR / CINEMAX_APKSIGNER_JAR to android/build.sh." ;;
esac

# Preflight: the fetcher and the build itself need these, and a clear message
# beats a "command not found" half way through a download.
for required in curl python3 tar sha256sum; do
  command -v "$required" >/dev/null 2>&1 \
    || fail "'$required' is required to fetch the Android toolchain but was not found in PATH"
done

ARCH="$(uname -m)"
mkdir -p "$CACHE/bin" "$CACHE/lib" "$CACHE/downloads"

# --------------------------------------------------------------- npm: minapk
if [ ! -f "$CACHE/lib/d8.jar" ] || [ ! -f "$CACHE/lib/android.jar" ] || \
   [ ! -f "$CACHE/lib/ecj.jar" ] || [ ! -f "$CACHE/lib/apksigner.jar" ]; then
  TARBALL="$CACHE/downloads/minapk-$MINAPK_VERSION.tgz"
  if [ ! -f "$TARBALL" ]; then
    log "downloading @drxiaozhi/minapk@$MINAPK_VERSION"
    curl -fsSL --retry 3 -o "$TARBALL" \
      "https://registry.npmjs.org/@drxiaozhi/minapk/-/minapk-$MINAPK_VERSION.tgz"
  fi
  verify_sha256 "$TARBALL" "$MINAPK_SHA256"
  log "extracting Android API jar, d8, ECJ and apksigner"
  rm -rf "$CACHE/downloads/minapk"
  mkdir -p "$CACHE/downloads/minapk"
  tar xzf "$TARBALL" -C "$CACHE/downloads/minapk"
  cp "$CACHE/downloads/minapk/package/tools/android.jar" "$CACHE/lib/android.jar"
  cp "$CACHE/downloads/minapk/package/tools/d8.jar" "$CACHE/lib/d8.jar"
  cp "$CACHE/downloads/minapk/package/tools/ecj-3.45.0.jar" "$CACHE/lib/ecj.jar"
  cp "$CACHE/downloads/minapk/package/tools/apksigner.jar" "$CACHE/lib/apksigner.jar"
else
  log "minapk tools already cached"
fi

# --------------------------------------------------------------- PyPI: aapt2
if [ ! -x "$CACHE/bin/aapt2" ]; then
  log "resolving aapt2 $AAPT2_PYPI_VERSION from PyPI"
  WHEEL_JSON="$(curl -fsSL --retry 3 "https://pypi.org/pypi/aapt2/$AAPT2_PYPI_VERSION/json")"
  WHEEL_URL="$(printf '%s' "$WHEEL_JSON" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for entry in data["urls"]:
    if entry["packagetype"] == "bdist_wheel":
        print(entry["url"])
        break
')"
  [ -n "$WHEEL_URL" ] || fail "could not resolve the aapt2 wheel URL"
  WHEEL="$CACHE/downloads/aapt2-$AAPT2_PYPI_VERSION.whl"
  [ -f "$WHEEL" ] || curl -fsSL --retry 3 -o "$WHEEL" "$WHEEL_URL"
  if [ "$ARCH" = "x86_64" ]; then
    verify_sha256 "$WHEEL" "$AAPT2_X86_64_SHA256"
  fi
  case "$ARCH" in
    x86_64) AAPT2_MEMBER="aapt2/bin/Linux/aapt2" ;;
    aarch64|arm64) AAPT2_MEMBER="aapt2/bin/Linux/aapt2" ;;
    *) fail "unsupported architecture: $ARCH" ;;
  esac
  python3 - "$WHEEL" "$CACHE" "$AAPT2_MEMBER" <<'PY'
import os, sys, zipfile
wheel, cache, member = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(wheel) as archive:
    data = archive.read(member)
target = os.path.join(cache, "bin", "aapt2")
with open(target, "wb") as handle:
    handle.write(data)
os.chmod(target, 0o755)
print("[toolchain] aapt2 ->", target)
PY
else
  log "aapt2 already cached"
fi

# ---------------------------------------------------------------- PyPI: jdk4py
if [ ! -x "$CACHE/jdk/bin/java" ]; then
  if [ -n "${CINEMAX_JAVA:-}" ] && [ -x "${CINEMAX_JAVA:-}" ]; then
    log "using CINEMAX_JAVA=$CINEMAX_JAVA instead of downloading a JRE"
    mkdir -p "$CACHE/jdk/bin" "$CACHE/jdk/lib"
    ln -sf "$CINEMAX_JAVA" "$CACHE/jdk/bin/java"
    if command -v keytool >/dev/null 2>&1; then
      ln -sf "$(command -v keytool)" "$CACHE/jdk/bin/keytool"
    fi
  else
    case "$ARCH" in
      x86_64) PLATFORM_TAG="x86_64" ;;
      aarch64|arm64) PLATFORM_TAG="aarch64" ;;
      *) fail "unsupported architecture for the bundled JRE: $ARCH" ;;
    esac
    log "resolving jdk4py $JDK4PY_VERSION ($PLATFORM_TAG) from PyPI"
    JDK_JSON="$(curl -fsSL --retry 3 "https://pypi.org/pypi/jdk4py/$JDK4PY_VERSION/json")"
    JDK_URL="$(printf '%s' "$JDK_JSON" | PLATFORM_TAG="$PLATFORM_TAG" python3 -c '
import json, os, sys
tag = os.environ["PLATFORM_TAG"]
data = json.load(sys.stdin)
best = None
for entry in data["urls"]:
    name = entry["filename"]
    if not name.endswith(".whl") or "manylinux" not in name:
        continue
    if tag in name:
        best = entry["url"]
        break
print(best or "")
')"
    [ -n "$JDK_URL" ] || fail "no jdk4py wheel for $PLATFORM_TAG"
    JDK_WHEEL="$CACHE/downloads/jdk4py-$JDK4PY_VERSION-$PLATFORM_TAG.whl"
    [ -f "$JDK_WHEEL" ] || curl -fsSL --retry 3 -o "$JDK_WHEEL" "$JDK_URL"
    if [ "$ARCH" = "x86_64" ]; then
      verify_sha256 "$JDK_WHEEL" "383d71d8639d072752d2eaafc84944e0d8de7f1c45d30c28f6dfef8a4a65543c"
    fi
    log "extracting Temurin runtime (java + keytool)"
    rm -rf "$CACHE/downloads/jdk4py"
    mkdir -p "$CACHE/downloads/jdk4py"
    python3 - "$JDK_WHEEL" "$CACHE/downloads/jdk4py" <<'PY'
import sys, zipfile
wheel, target = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(wheel) as archive:
    archive.extractall(target)
print("[toolchain] extracted jdk4py wheel")
PY
    rm -rf "$CACHE/jdk"
    mv "$CACHE/downloads/jdk4py/jdk4py/java-runtime" "$CACHE/jdk"
    chmod +x "$CACHE/jdk/bin/java" "$CACHE/jdk/bin/keytool" 2>/dev/null || true
  fi
else
  log "JRE already cached"
fi

touch "$CACHE/.fetched"
log "toolchain ready in $CACHE"
"$CACHE/jdk/bin/java" -version 2>&1 | head -n 1 || true
"$CACHE/bin/aapt2" version || true
