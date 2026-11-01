#!/usr/bin/env python3
"""One-paragraph summary of a shipped APK, for the download-promo check.

Reads the artifact with nothing but the Python standard library (the compiled
manifest is decoded by `axml.py`, which the build's own verification uses), so
the web job can prove what the download button hands out without an Android
toolchain.

Prints JSON: package, versionName, versionCode, sha256, size, signature files,
entry count, and whether the archive is intact.

Usage: python3 android/tests/apk_summary.py <apk>
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from axml import load_manifest, parse as parse_axml  # noqa: E402


def summarize(path: str) -> dict:
    report: dict = {"path": os.path.basename(path), "exists": os.path.isfile(path)}
    if not report["exists"]:
        return report

    with open(path, "rb") as handle:
        data = handle.read()
    report["size"] = len(data)
    report["sha256"] = hashlib.sha256(data).hexdigest()

    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        report["entries"] = len(names)
        report["intact"] = archive.testzip() is None
        report["manifest"] = "AndroidManifest.xml" in names
        report["dex"] = [name for name in names if name.endswith(".dex")]
        report["signature"] = sorted(
            name for name in names
            if name.upper().startswith("META-INF/") and name.upper().rsplit(".", 1)[-1] in {"RSA", "DSA", "EC", "SF"}
        )

    manifest = parse_axml(load_manifest(path))
    report["package"] = manifest.attr("package", namespace="")
    report["versionName"] = manifest.attr("versionName")
    report["versionCode"] = manifest.attr("versionCode")
    return report


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: apk_summary.py <apk>", file=sys.stderr)
        return 2
    print(json.dumps(summarize(sys.argv[1]), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
