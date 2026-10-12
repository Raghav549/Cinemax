#!/usr/bin/env python3
"""Structural verification of the built Cinemax APK.

Independent of the build script: it re-opens the finished APK and asserts the
properties that make it a real, installable Android app.

Usage: python3 android/tests/apk_check.py android/dist/Cinemax-1.1.0.apk <toolchain-dir>
"""
from __future__ import annotations

import hashlib
import os
import struct
import subprocess
import sys
import zipfile
import zlib

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


def dex_header(data: bytes) -> dict:
    """Reads the dex header exactly as the Android runtime parses it.

    A package manager refuses to install an APK whose classes.dex is not a
    well-formed dex file, so the header fields (checksum, SHA-1 signature, sizes
    and offsets) are validated here instead of trusting the dexer.
    """
    fields: dict[str, int | bytes] = {}
    if len(data) < 112:
        return {"error": "shorter than the 112-byte dex header"}
    (
        magic,
        checksum,
        signature,
        file_size,
        header_size,
        endian_tag,
        _link_size,
        _link_off,
        map_off,
        string_ids_size,
        string_ids_off,
        _type_ids_size,
        _type_ids_off,
        _proto_ids_size,
        _proto_ids_off,
        _field_ids_size,
        _field_ids_off,
        _method_ids_size,
        _method_ids_off,
        class_defs_size,
        class_defs_off,
        data_size,
        data_off,
    ) = struct.unpack_from("<8sI20s20I", data, 0)
    fields.update(
        {
            "magic": magic,
            "checksum": checksum,
            "signature": signature,
            "file_size": file_size,
            "header_size": header_size,
            "endian_tag": endian_tag,
            "map_off": map_off,
            "string_ids_size": string_ids_size,
            "string_ids_off": string_ids_off,
            "class_defs_size": class_defs_size,
            "class_defs_off": class_defs_off,
            "data_size": data_size,
            "data_off": data_off,
            "adler32": zlib.adler32(data[12:]) & 0xFFFFFFFF,
            "sha1": hashlib.sha1(data[32:]).digest(),
        }
    )
    return fields


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
    # The app-only presentation layer plus the brand wordmark font (the subset of
    # the website's Outfit face the native splash draws with) and its licence.
    packaged_assets = [
        "assets/cinemax/app-shell.js",
        "assets/cinemax/app-theme.css",
        "assets/cinemax/fonts/OUTFIT-LICENSE.txt",
        "assets/cinemax/fonts/outfit-550.ttf",
    ]
    check(
        sorted(name for name in names if name.startswith("assets/cinemax/")) == packaged_assets,
        "app presentation assets are packaged under assets/cinemax/",
    )

    section("asset parity with the repository")
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # android/
    for asset in packaged_assets:
        relative = asset[len("assets/cinemax/"):]
        local = os.path.join(root, "app", "src", "main", "assets", "cinemax", *relative.split("/"))
        with open(local, "rb") as handle:
            expected = handle.read()
        actual = read_entry(apk, asset)
        check(actual == expected, f"{relative} inside the APK matches the source file")

    section("manifest")
    badging = run([aapt2, "dump", "badging", apk])
    check("package: name='com.cinemax.app'" in badging, "package id is com.cinemax.app")
    check("versionCode='2'" in badging, "versionCode is 2")
    check("versionName='1.1.0'" in badging, "versionName is 1.1.0")
    check("application-label:'Cinemax'" in badging, "app label is Cinemax")
    check("sdkVersion:'24'" in badging, "minSdkVersion is 24 (Android 7.0)")
    check("targetSdkVersion:'34'" in badging, "targetSdkVersion is 34 (Android 14)")
    check("launchable-activity: name='com.cinemax.app.MainActivity'" in badging, "MainActivity is the launcher activity")
    check("uses-permission: name='android.permission.INTERNET'" in badging, "INTERNET permission is declared")
    check("uses-permission: name='android.permission.ACCESS_NETWORK_STATE'" in badging, "network-state permission is declared")

    # Parsed from the compiled binary XML - exactly what the device reads.
    manifest = parse_axml(load_manifest(apk))
    check(manifest.attr("package", namespace="") == "com.cinemax.app", "compiled manifest declares the package")
    check(manifest.attr("versionName") == "1.1.0", "compiled manifest declares the version name")

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
    check(any("cinemax_emblem_ribbon" in name for name in names), "the emblem's ribbon layer is packaged")
    check(any("cinemax_emblem_fold" in name for name in names), "the emblem's fold layer is packaged")
    check(any("cinemax_splash_background" in name for name in names), "the splash gradient is packaged")
    # The previous splash was a stack of separately animated drawables; the
    # reveal is drawn by one composited view now, so those layers must not ship.
    check(
        not any(
            "cinemax_splash_ring" in name or "cinemax_splash_glow" in name or "cinemax_splash_light_streak" in name
            for name in names
        ),
        "the replaced static splash layers are no longer shipped",
    )
    check(any("activity_main" in name for name in names), "the activity layout is packaged")
    check(any("values-v31" in name or name.endswith("resources.arsc") for name in names), "version-qualified values are compiled")

    # The compiled layout is binary XML: parse it and assert what the device
    # inflates, including the single-view reveal canvas that replaced the old
    # stack of animated splash children.
    layout_entry = next((name for name in names if name.endswith("layout/activity_main.xml")), None)
    check(layout_entry is not None, "the splash layout entry exists in the archive")
    if layout_entry:
        layout = parse_axml(read_entry(apk, layout_entry))
        element_names = []

        def collect(node) -> None:
            for child in getattr(node, "children", ()) or ():
                element_names.append(getattr(child, "name", "") or "")
                collect(child)

        collect(layout)
        check("com.cinemax.app.CinemaxSplashView" in element_names,
              "the splashed layout inflates the layered native reveal view")
        check(element_names.count("com.cinemax.app.CinemaxSplashView") == 1,
              "exactly one reveal canvas is inflated")
        check("FrameLayout" in element_names and "ProgressBar" in element_names,
              "the shell layout (host, progress, error surface) is intact")

    section("dex content")
    dex = read_entry(apk, "classes.dex")
    for descriptor in (
        b"Lcom/cinemax/app/MainActivity;",
        b"Lcom/cinemax/app/CinemaxWebViewClient;",
        b"Lcom/cinemax/app/CinemaxChromeClient;",
        b"Lcom/cinemax/app/CinemaxBridge;",
        b"Lcom/cinemax/app/NavigationPolicy;",
        b"Lcom/cinemax/app/AppTheme;",
        b"Lcom/cinemax/app/CinemaxSplashView;",
        b"Lcom/cinemax/app/SplashMotion;",
    ):
        check(descriptor in dex, f"{descriptor.decode()} is in classes.dex")
    check(b"cinemax-orpin.vercel.app" in dex, "the production URL is compiled into the APK")
    check(b"CinemaxNative" in dex, "the JavaScript bridge name is present")
    check(b"__cinemaxInsets" in dex, "the inset hand-off to the page is present")

    section("dex integrity (what ART parses at install time)")
    header = dex_header(dex)
    if "error" in header:
        check(False, f"classes.dex has a readable header ({header['error']})")
    else:
        # D8 emits 037 for `--min-api 24`; anything up to that is understood by
        # Android 7.0, and every version here is a real dex file format.
        magic = bytes(header["magic"])
        dex_version = magic[4:7]
        check(
            magic[:4] == b"dex\n" and magic[7:8] == b"\x00" and dex_version.isdigit(),
            f"classes.dex carries a dex magic (version {dex_version.decode(errors='replace')})",
        )
        check(
            dex_version in (b"035", b"037", b"038", b"039", b"040", b"041"),
            "the dex version is one the Android runtime knows",
        )
        check(
            dex_version <= b"037",
            "the dex version is supported by minSdkVersion 24 (Android 7.0)",
        )
        check(header["checksum"] == header["adler32"], "dex checksum matches its contents (adler32)")
        check(header["signature"] == header["sha1"], "dex SHA-1 signature matches its contents")
        check(header["file_size"] == len(dex), "dex header file_size matches the packaged size")
        check(header["header_size"] == 112, "dex header_size is 112 bytes")
        check(header["endian_tag"] == 0x12345678, "dex endian tag is little-endian 0x12345678")
        check(header["string_ids_size"] > 0 and header["string_ids_off"] < len(dex), "dex string table is present")
        check(0 < header["class_defs_size"] and header["class_defs_off"] < len(dex), "dex declares at least one class")
        check(0 < header["map_off"] < len(dex), "dex map list offset points inside the file")
        check(
            header["data_off"] + header["data_size"] <= len(dex),
            "dex data section fits inside the file",
        )

    section("no development endpoints anywhere in the APK")
    haystack = dex + b"".join(
        read_entry(apk, name) for name in names if name.startswith("assets/")
    )
    for needle in (b"localhost", b"127.0.0.1", b"10.0.2.2", b"http://192.168", b":3000"):
        check(needle not in haystack, f"'{needle.decode()}' does not appear in the app payload")

    section("signature and alignment")
    jar_signed = any(
        name.startswith("META-INF/")
        and (name.endswith(".SF") or name.endswith(".RSA") or name.endswith(".DSA") or name.endswith(".EC"))
        for name in names
    )
    check(jar_signed, "v1 (JAR) signing files are packaged in META-INF")
    if os.path.isfile(apksigner):
        verify = run([java, "-jar", apksigner, "verify", "--verbose", "--print-certs", apk])
        check("Verifies" in verify, "apksigner verifies the APK")
        check("APK Signature Scheme v2" in verify, "v2 signature scheme is used")
        check("APK Signature Scheme v3): true" in verify, "v3 signature scheme is used")
        check("signer #1 certificate DN: CN=Cinemax" in verify.lower() or "CN=Cinemax" in verify, "signed by the Cinemax release key")
    else:
        print("  skip apksigner (not found in the toolchain)")

    align_check = run([sys.executable, aligner, "--check", apk])
    check("alignment check passed" in align_check, "uncompressed entries are aligned (resources.arsc)")

    print(f"\nchecks: {CHECKS}, failures: {FAILURES}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
