#!/usr/bin/env bash
# =============================================================================
# Cinemax Android - test dependency installer
#
# The DOM layer (tests/shell-dom.test.mjs) runs the *real* injected app layer
# inside a jsdom document. jsdom is the only test dependency and is not a
# dependency of the Next.js app, so it is installed into the git-ignored
# toolchain cache instead of the repository root:
#
#   android/.toolchain/tests/node_modules/jsdom
#
# shell-dom.test.mjs resolves it from there, so `bash android/tests/run-tests.sh`
# picks the layer up automatically once this script has run. Without jsdom the
# DOM layer self-skips (unless CINEMAX_REQUIRE_JSDOM=1, which turns the skip
# into a failure - used by CI so a missing dependency can never hide a
# regression).
#
#   bash android/tests/install-test-deps.sh          # install
#   bash android/tests/install-test-deps.sh --check  # verify only, no network
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(dirname "$SCRIPT_DIR")"
CACHE="${CINEMAX_TOOLCHAIN:-$PROJECT/.toolchain}"
TARGET="$CACHE/tests/node_modules/jsdom"
JSDOM_VERSION="${CINEMAX_JSDOM_VERSION:-26.1.0}"

log() { printf '\033[1;35m[test-deps]\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m[test-deps] %s\033[0m\n' "$1" >&2; exit 1; }

CHECK_ONLY=0
for argument in "$@"; do
  case "$argument" in
    --check) CHECK_ONLY=1 ;;
    *) printf 'unknown argument: %s\n' "$argument" >&2; exit 2 ;;
  esac
done

if [ -d "$TARGET" ]; then
  log "jsdom already installed at $TARGET"
  exit 0
fi

if [ "$CHECK_ONLY" = "1" ]; then
  fail "jsdom is not installed (run bash android/tests/install-test-deps.sh)"
fi

command -v npm >/dev/null 2>&1 \
  || fail "npm is required to install jsdom (node $(node --version 2>/dev/null || echo 'not found'))"

log "installing jsdom@$JSDOM_VERSION into $CACHE/tests"
mkdir -p "$CACHE/tests"
printf '{\n  "name": "cinemax-android-test-deps",\n  "private": true,\n  "description": "DOM runtime for android/tests/shell-dom.test.mjs"\n}\n' \
  >"$CACHE/tests/package.json"

(
  cd "$CACHE/tests"
  npm install --no-audit --no-fund --loglevel=error "jsdom@$JSDOM_VERSION"
) || fail "npm could not install jsdom"

[ -d "$TARGET" ] || fail "jsdom was not installed at $TARGET"
log "jsdom ready: $TARGET"
node -e "const { JSDOM } = require(process.argv[1]); new JSDOM('<p>ok</p>'); console.log('[test-deps] jsdom', require(process.argv[1] + '/package.json').version, 'loads')" "$TARGET"
