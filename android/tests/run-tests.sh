#!/usr/bin/env bash
# =============================================================================
# Cinemax Android - test suite
#
#   bash android/tests/run-tests.sh              # build if needed, then test
#   bash android/tests/run-tests.sh --skip-build # test the current APK only
#
# The DOM layer needs jsdom. It is installed once, into the git-ignored toolchain
# cache, by android/tests/install-test-deps.sh - which this script runs
# automatically when jsdom is missing and npm is available. Set
# CINEMAX_REQUIRE_JSDOM=1 to turn a missing jsdom (or node) into a failure
# instead of a skip; CI sets it so this layer can never silently disappear.
#
# Layers:
#   1. JVM unit checks   : navigation policy + injection escaping (no device)
#   2. JavaScript syntax : node --check on the generated injection script
#   3. DOM behaviour     : the real injected layer executed against a DOM fixture
#   4. APK structure     : manifest, resources, icons, dex, signature, alignment
#
# These tests run without an emulator. Installing the APK on a device is still
# the final gate for WebView rendering, and is documented in android/README.md.
# =============================================================================
set -uo pipefail
export PYTHONDONTWRITEBYTECODE=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(dirname "$SCRIPT_DIR")"
REPO="$(dirname "$PROJECT")"
CACHE="${CINEMAX_TOOLCHAIN:-$PROJECT/.toolchain}"
WORK="$PROJECT/build/tests"

SKIP_BUILD=0
for argument in "$@"; do
  case "$argument" in
    --skip-build) SKIP_BUILD=1 ;;
    *) printf 'unknown argument: %s\n' "$argument" >&2; exit 2 ;;
  esac
done

FAILED=0
step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
note() { printf '    %s\n' "$1"; }
result() { if [ "$1" = "0" ]; then printf '    \033[1;32mPASS\033[0m %s\n' "$2"; else printf '    \033[1;31mFAIL\033[0m %s\n' "$2"; FAILED=1; fi; }

[ -d "$CACHE" ] || bash "$PROJECT/tools/fetch-toolchain.sh"

JAVA="$CACHE/jdk/bin/java"
ECJ_JAR="$CACHE/lib/ecj.jar"
ANDROID_JAR="$CACHE/lib/android.jar"
APK="$PROJECT/dist/Cinemax-1.0.0.apk"
JSDOM_DIR="$CACHE/tests/node_modules/jsdom"
REQUIRE_JSDOM="${CINEMAX_REQUIRE_JSDOM:-0}"

# The DOM layer is only as good as jsdom being present: install it once when it
# is missing, so `run-tests.sh` covers all four layers on a fresh checkout.
if [ ! -d "$JSDOM_DIR" ] && command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  mkdir -p "$CACHE/tests"
  note "installing jsdom for the DOM layer (see ${CACHE#"$REPO"/}/tests/install-test-deps.log)"
  bash "$SCRIPT_DIR/install-test-deps.sh" >"$CACHE/tests/install-test-deps.log" 2>&1 \
    || note "jsdom could not be installed - see $CACHE/tests/install-test-deps.log"
fi

if [ "$SKIP_BUILD" = "0" ] || [ ! -f "$APK" ] || [ ! -d "$PROJECT/build/gen" ]; then
  step "Building the APK"
  bash "$PROJECT/build.sh" | tail -n 6
fi

mkdir -p "$WORK/classes" "$WORK/out"

# ---------------------------------------------------------- 1. JVM unit tests
step "1/4  JVM unit checks (navigation policy, injection escaping)"
(
  cd "$PROJECT"
  # The generated R class (from aapt2) is part of the app sources.
  find app/src/main/java "$PROJECT/build/gen" "$SCRIPT_DIR/java" -name '*.java' >"$WORK/tests.sources"
  "$JAVA" -jar "$ECJ_JAR" -source 8 -target 8 -encoding UTF-8 -nowarn \
    -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" \
    -d "$WORK/classes" $(cat "$WORK/tests.sources") >"$WORK/ecj-tests.log" 2>&1
)
if [ $? -ne 0 ]; then
  tail -n 30 "$WORK/ecj-tests.log"
  result 1 "test compilation"
else
  "$JAVA" -cp "$WORK/classes:$ANDROID_JAR" CinemaxAppTest "$WORK/out" "$PROJECT"
  result $? "unit checks"
fi

INJECTION="$WORK/out/injection-script.js"
SHELL_SCRIPT="$WORK/out/shell-script.js"

# ------------------------------------------------------ 2. JavaScript syntax
step "2/4  JavaScript syntax of the injected layer"
if ! command -v node >/dev/null 2>&1; then
  if [ "$REQUIRE_JSDOM" = "1" ]; then
    result 1 "node is required for this layer but is not installed"
  else
    note "node is not installed - layer skipped"
  fi
elif [ ! -f "$INJECTION" ]; then
  result 1 "the injection script was not produced (unit checks failed)"
else
  node --check "$INJECTION" && result 0 "node --check on the generated injection script" \
    || result 1 "node --check on the generated injection script"
  node --check "$PROJECT/app/src/main/assets/cinemax/app-shell.js" && result 0 "node --check on app-shell.js" \
    || result 1 "node --check on app-shell.js"
  node --check "$SHELL_SCRIPT" && result 0 "node --check on the shell runtime evaluated by the WebView" \
    || result 1 "node --check on the shell runtime evaluated by the WebView"
fi

# ---------------------------------------------------------- 3. DOM behaviour
step "3/4  DOM behaviour of the injected app layer"
if ! command -v node >/dev/null 2>&1; then
  if [ "$REQUIRE_JSDOM" = "1" ]; then
    result 1 "node is required for this layer but is not installed"
  else
    note "node is not installed - layer skipped"
  fi
elif [ ! -d "$JSDOM_DIR" ] && [ "$REQUIRE_JSDOM" = "1" ]; then
  result 1 "jsdom is required (CINEMAX_REQUIRE_JSDOM=1) but is not installed - run android/tests/install-test-deps.sh"
elif [ ! -f "$INJECTION" ]; then
  result 1 "the injection script was not produced (unit checks failed)"
else
  node "$SCRIPT_DIR/shell-dom.test.mjs" "$INJECTION" "$WORK/out/shell-script.js" "$WORK/out/injection-script-hostile.js"
  result $? "DOM behaviour"
fi

# ----------------------------------------------------------- 4. APK structure
step "4/4  APK structure, dex content, signature and alignment"
python3 "$SCRIPT_DIR/apk_check.py" "$APK" "$CACHE"
result $? "APK structure"

step "Summary"
if [ "$FAILED" = "0" ]; then
  printf '    \033[1;32mAll Android checks passed.\033[0m\n'
  printf '    APK: %s\n' "$APK"
else
  printf '    \033[1;31mOne or more checks failed (see above).\033[0m\n'
fi
exit "$FAILED"
