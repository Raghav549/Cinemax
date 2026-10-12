#!/usr/bin/env python3
"""Build the native splash wordmark font from the website's own brand face.

The web app ships Outfit as a *variable* WOFF2 (`src/app/fonts/outfit.woff2`,
weight axis 100-900, SIL Open Font License - see the licence file next to it).
Android's `Typeface.createFromAsset` cannot read WOFF2, so this tool:

  1. decompresses the WOFF2 with fontTools,
  2. pins the weight axis to the weight the website uses for the logo,
  3. subsets it to the characters the native splash and lockup actually draw,
  4. writes a plain static TTF next to the app's other Cinemax assets.

Result: the Android splash renders the exact same brand letterforms as the
website (weight, tracking and glyph shapes), in a few kilobytes, without
touching the website or referencing a network font.

Usage:
    python3 android/tools/make_brand_font.py [--weight 550] [--check]

`--check` re-derives the font and fails if the packaged asset no longer matches
the website source, which is what CI runs.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE_FONT = os.path.join(REPO_ROOT, "src", "app", "fonts", "outfit.woff2")
SOURCE_LICENCE = os.path.join(REPO_ROOT, "src", "app", "fonts", "OUTFIT-LICENSE.txt")
ASSET_DIR = os.path.join(REPO_ROOT, "android", "app", "src", "main", "assets", "cinemax", "fonts")

# Everything the native lockup can draw. Keeping the set closed keeps the asset
# tiny; a character outside it falls back to the system light face at runtime.
SUBSET = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789"
    " ·.,-&'/():;!?+"
)


def build(weight: float) -> bytes:
    try:
        from fontTools.ttLib import TTFont
        from fontTools.varLib import instancer
        from fontTools import subset
    except ImportError as error:  # pragma: no cover - tooling guard
        sys.exit(f"fontTools is required ({error}). Try: python3 -m pip install fonttools brotli")

    if not os.path.isfile(SOURCE_FONT):
        sys.exit(f"missing website font: {SOURCE_FONT}")

    font = TTFont(SOURCE_FONT)
    if "fvar" in font:
        axes = {axis.axisTag: axis for axis in font["fvar"].axes}
        axis = axes.get("wght")
        if axis is None:
            sys.exit("the brand font has no weight axis")
        if not axis.minValue <= weight <= axis.maxValue:
            sys.exit(f"weight {weight} is outside the brand face's axis ({axis.minValue}-{axis.maxValue})")
        font = instancer.instantiateVariableFont(font, {"wght": weight}, inplace=False)
        font.flavor = None

        # The variable face is named after its thin default instance; rename the
        # pinned build so the packaged asset is self-describing.
        family = "Outfit"
        style = "Regular"
        for record in font["name"].names:
            if record.nameID == 1:
                record.string = family
            elif record.nameID == 2:
                record.string = style
            elif record.nameID == 4:
                record.string = f"{family} {style}"
            elif record.nameID == 6:
                record.string = f"{family}-{style}"
        font["OS/2"].usWeightClass = int(weight)

    options = subset.Options()
    options.layout_features = ["kern", "liga", "calt"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables += ["DSIG"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=SUBSET)
    subsetter.subset(font)

    import io

    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weight", type=float, default=550.0, help="pin the brand weight axis (default: 550)")
    parser.add_argument("--check", action="store_true", help="verify the packaged asset instead of writing it")
    arguments = parser.parse_args()

    weight = int(arguments.weight) if float(arguments.weight).is_integer() else arguments.weight
    data = build(arguments.weight)
    digest = hashlib.sha256(data).hexdigest()
    target = os.path.join(ASSET_DIR, f"outfit-{weight}.ttf")
    licence_target = os.path.join(ASSET_DIR, "OUTFIT-LICENSE.txt")

    if arguments.check:
        if not os.path.isfile(target) or open(target, "rb").read() != data:
            print(f"FAIL {os.path.relpath(target, REPO_ROOT)} does not match the website brand font", file=sys.stderr)
            return 1
        print(f"ok   {os.path.relpath(target, REPO_ROOT)} matches the website brand font ({len(data)} bytes)")
        return 0

    os.makedirs(ASSET_DIR, exist_ok=True)
    with open(target, "wb") as handle:
        handle.write(data)
    if os.path.isfile(SOURCE_LICENCE):
        shutil.copyfile(SOURCE_LICENCE, licence_target)
    print(f"{os.path.relpath(target, REPO_ROOT)}: {len(data)} bytes, sha256 {digest}")
    print(f"{os.path.relpath(licence_target, REPO_ROOT)}: SIL Open Font License (required by the OFL)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
