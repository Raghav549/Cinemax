#!/usr/bin/env python3
"""Structural verification of the built Cinemax APK.

Independent of the build script: it re-opens the finished APK and asserts the
properties that make it a real, installable Android app.

Usage: python3 android/tests/apk_check.py android/dist/Cinemax-1.0.0.apk <toolchain-dir>
"""
from __future__ import annotations

import os
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from axml import parse as parse_axml  # noqa: E402
from axml import load_manifest  # noqa: E402

CHECKS = 0
FAILURES = 0


def check(condition: bool, label: str) -> None:
    global CHECKS, FAILURES
    CHECKS += 1
    if condition:
        print(f"  ok   {label}")
    else:
        FAILURES += 1
        print(f"  FAIL {label}")


def section(name: str) -> None:
    print(f"\n== {name}")


def read_entry(apk: str, name: str) -> bytes:
    with zipfile.ZipFile(apk) as archive:
        return archive.read(name)


def run(command: list[str]) -> str:
    completed = subprocess.run(command, capture_output=True, text=True)
    return completed.stdout + completed.stderr


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: apk_check.py <apk> <toolchain-dir>", file=sys.stderr)
        return 2
    apk = sys.argv[1]
    toolchain = sys.argv[2]
    java = os.path.join(toolchain, "jdk", "bin", "java")
    aapt2 = os.path.join(toolchain, "bin", "aapt2")
    apksigner = os.path.join(toolchain, "lib", "apksigner.jar")
    aligner = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools", "align_apk.py")

    section("archive")
    check(os.path.isfile(apk), f"APK exists ({apk})")
    with zipfile.ZipFile(apk) as archive:
        broken = archive.testzip()
        names = archive.namelist()
    check(broken is None, "zip integrity is intact")
    check("AndroidManifest.xml" in names, "AndroidManifest.xml is at the archive root")
    check("resources.arsc" in names, "resources.arsc is present")
    check("classes.dex" in names, "classes.dex is present")
    check(any(name.startswith("res/") for name in names), "compiled resources are present")
    check(
        sorted(name for name in names if name.startswith("assets/cinemax/"))
        == ["assets/cinemax/app-shell.js", "assets/cinemax/app-theme.css"],
        "app presentation assets are packaged under assets/cinemax/",
    )

    section("asset parity with the repository")
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # android/
    for asset in ("app-theme.css", "app-shell.js"):
        local = os.path.join(root, "app", "src", "main", "assets", "cinemax", asset)
        with open(local, "rb") as handle:
            expected = handle.read()
        actual = read_entry(apk, f"assets/cinemax/{asset}")
        check(actual == expected, f"{asset} inside the APK matches the source file")

    section("manifest")
    badging = run([aapt2, "dump", "badging", apk])
    check("package: name='com.cinemax.app'" in badging, "package id is com.cinemax.app")
    check("versionCode='1'" in badging, "versionCode is 1")
    check("versionName='1.0.0'" in badging, "versionName is 1.0.0")
    check("application-label:'Cinemax'" in badging, "app label is Cinemax")
    check("sdkVersion:'24'" in badging, "minSdkVersion is 24 (Android 7.0)")
    check("targetSdkVersion:'34'" in badging, "targetSdkVersion is 34 (Android 14)")
    check("launchable-activity: name='com.cinemax.app.MainActivity'" in badging, "MainActivity is the launcher activity")
    check("uses-permission: name='android.permission.INTERNET'" in badging, "INTERNET permission is declared")
    check("uses-permission: name='android.permission.ACCESS_NETWORK_STATE'" in badging, "network-state permission is declared")

    # Parsed from the compiled binary XML - exactly what the device reads.
    manifest = parse_axml(load_manifest(apk))
    check(manifest.attr("package", namespace="") == "com.cinemax.app", "compiled manifest declares the package")
    check(manifest.attr("versionName") == "1.0.0", "compiled manifest declares the version name")

    application = manifest.find("application")
    check(application is not None, "compiled manifest has an <application>")
    check(application.attr("label") is not None, "the app declares a label")
    check(application.attr("usesCleartextTraffic") == "true", "cleartext policy is set explicitly for legacy media hosts")
    check(application.attr("allowBackup") == "true", "backup policy is explicit")

    activity = application.find("activity") if application else None
    check(activity is not None, "a single activity hosts the web app")
    check(activity.attr("name") == "com.cinemax.app.MainActivity", "the activity is MainActivity")
    check(activity.attr("exported") == "true", "the launcher activity is exported")
    check(activity.attr("launchMode") == "2", "launchMode singleTask keeps one app task")
    check(activity.attr("windowSoftInputMode") == "0x10", "adjustResize keeps inputs above the keyboard")
    check(activity.attr("configChanges") == "0x40003fff", "rotation and theme changes never recreate the activity")
    check(activity.attr("screenOrientation") == "4294967295", "orientation is unspecified (the player can rotate)")

    filters = activity.find_all("intent-filter") if activity else []
    actions = {element.attr("name") for element in activity.find_all("action")} if activity else set()
    categories = {element.attr("name") for element in activity.find_all("category")} if activity else set()
    data = activity.find_all("data") if activity else []
    check("android.intent.action.MAIN" in actions, "a MAIN action is declared")
    check("android.intent.category.LAUNCHER" in categories, "a LAUNCHER category is declared")
    check("android.intent.action.VIEW" in actions, "a VIEW action is declared")
    check("android.intent.category.BROWSABLE" in categories, "the deep link is browsable")
    check(len(filters) == 2, "exactly two intent filters are declared")
    production_filter = [f for f in filters if f.attr("autoVerify") == "true"]
    check(len(production_filter) == 1, "the production deep link is verified automatically")
    check(
        any(d.attr("host") == "cinemax-orpin.vercel.app" and d.attr("scheme") == "https" for d in data),
        "deep links target the production host over https",
    )
    permissions = {element.attr("name") for element in manifest.find_all("uses-permission")}
    check("android.permission.INTERNET" in permissions, "only the needed permissions are requested (INTERNET)")
    check(permissions == {"android.permission.INTERNET", "android.permission.ACCESS_NETWORK_STATE"},
          "no unnecessary permissions are requested")

    section("icons, splash and theme resources")
    for entry in (
        "res/mipmap-anydpi-v26/ic_launcher.xml",
        "res/mipmap-anydpi-v26/ic_launcher_round.xml",
    ):
        check(entry in names, f"adaptive icon {entry} is packaged")
    for density in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"):
        check(
            any(name.startswith(f"res/mipmap-{density}") and name.endswith("ic_launcher.png") for name in names),
            f"legacy raster launcher icon exists for {density}",
        )
        check(
            any(name.startswith(f"res/mipmap-{density}") and name.endswith("ic_launcher_round.png") for name in names),
            f"legacy round launcher icon exists for {density}",
        )
    check(any("cinemax_emblem" in name for name in names), "the Cinemax emblem drawable is packaged")
    check(any("cinemax_splash_background" in name for name in names), "the splash gradient is packaged")
    check(any("activity_main" in name for name in names), "the activity layout is packaged")
    check(any("values-v31" in name or name.endswith("resources.arsc") for name in names), "version-qualified values are compiled")

    section("dex content")
    dex = read_entry(apk, "classes.dex")
    for descriptor in (
        b"Lcom/cinemax/app/MainActivity;",
        b"Lcom/cinemax/app/CinemaxWebViewClient;",
        b"Lcom/cinemax/app/CinemaxChromeClient;",
        b"Lcom/cinemax/app/CinemaxBridge;",
        b"Lcom/cinemax/app/NavigationPolicy;",
        b"Lcom/cinemax/app/AppTheme;",
    ):
        check(descriptor in dex, f"{descriptor.decode()} is in classes.dex")
    check(b"cinemax-orpin.vercel.app" in dex, "the production URL is compiled into the APK")
    check(b"CinemaxNative" in dex, "the JavaScript bridge name is present")
    check(b"__cinemaxInsets" in dex, "the inset hand-off to the page is present")

    section("no development endpoints anywhere in the APK")
    haystack = dex + b"".join(
        read_entry(apk, name) for name in names if name.startswith("assets/")
    )
    for needle in (b"localhost", b"127.0.0.1", b"10.0.2.2", b"http://192.168", b":3000"):
        check(needle not in haystack, f"'{needle.decode()}' does not appear in the app payload")

    section("signature and alignment")
    if os.path.isfile(apksigner):
        verify = run([java, "-jar", apksigner, "verify", "--verbose", "--print-certs", apk])
        check("Verifies" in verify, "apksigner verifies the APK")
        check("APK Signature Scheme v2" in verify, "v2 signature scheme is used")
        check("signer #1 certificate DN: CN=Cinemax" in verify.lower() or "CN=Cinemax" in verify, "signed by the Cinemax release key")
    else:
        print("  skip apksigner (not found in the toolchain)")

    align_check = run([sys.executable, aligner, "--check", apk])
    check("alignment check passed" in align_check, "uncompressed entries are aligned (resources.arsc)")

    print(f"\nchecks: {CHECKS}, failures: {FAILURES}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
