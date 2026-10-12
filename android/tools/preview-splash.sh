#!/usr/bin/env bash
# =============================================================================
# Cinemax - offline splash preview
#
#   bash android/tools/preview-splash.sh
#
# Renders the native splash without a device: the timeline, the curves and the
# viewport geometry come from the app's own SplashMotion class and the logo is
# rasterised from the packaged drawable path data (SplashPreview.java mirrors
# CinemaxSplashView.onDraw). Output goes to android/build/preview/:
#
#   splash-timeline.png   one launch, frame by frame
#   splash-screens.png    the settled frame on phone / small / landscape / tablet
#
# It is a design preview, not a device render: anti-aliasing and frame pacing
# are java.awt's, not a GPU's. The on-device checks stay the final gate.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(dirname "$SCRIPT_DIR")"
CACHE="${CINEMAX_TOOLCHAIN:-$PROJECT/.toolchain}"
OUT="${1:-$PROJECT/build}"
WORK="$OUT/preview-classes"

JAVA="$CACHE/jdk/bin/java"
ECJ_JAR="$CACHE/lib/ecj.jar"

if [ ! -x "$JAVA" ] || [ ! -f "$ECJ_JAR" ]; then
  echo "toolchain missing - run android/tools/fetch-toolchain.sh first" >&2
  exit 1
fi

mkdir -p "$WORK" "$OUT/preview"

"$JAVA" -jar "$ECJ_JAR" -source 8 -target 8 -nowarn -encoding UTF-8 \
  -d "$WORK" \
  "$PROJECT/app/src/main/java/com/cinemax/app/SplashMotion.java" \
  "$SCRIPT_DIR/SplashPreview.java"

"$JAVA" -Djava.awt.headless=true -cp "$WORK" SplashPreview "$PROJECT" "$OUT"
