#!/usr/bin/env python3
"""zipalign-equivalent alignment step for the Cinemax APK.

Android's `zipalign` rewrites an APK so that every **uncompressed** entry starts
at a predictable offset: 4 bytes for most entries, 4096 bytes for shared
libraries. That lets the platform mmap `resources.arsc` (and any .so files)
straight out of the archive instead of copying them.

This script implements the same guarantee using only the standard library, so
the Cinemax build stays Gradle-free and dependency-free. Entries keep their
original order and compression method; padding travels in the ZIP extra field.

Usage:
    python3 align_apk.py app-unaligned.apk app-aligned.apk
    python3 align_apk.py --check app-release.apk
"""
from __future__ import annotations

import argparse
import struct
import sys
import zipfile

STORED = zipfile.ZIP_STORED
ALIGN = 4
PAGE = 4096
"""Native libraries must be page aligned and stored uncompressed."""
PAD_ID = 0xD935
"""Private extra-field id, the same one Android's zipalign uses."""


def required_alignment(name: str) -> int:
    return PAGE if name.endswith(".so") else ALIGN


def extra_field_padding(pad: int) -> bytes:
    """Builds one private extra field carrying `pad` bytes in total."""
    payload = pad - 4
    return struct.pack("<HH", PAD_ID, payload) + (b"\x00" * payload)


def measure(path: str) -> list[tuple[str, int, int]]:
    """Returns (name, required alignment, actual data offset) for each entry.

    Only uncompressed entries have an alignment contract: deflated payloads are
    decoded by the platform, so their offset is irrelevant (exactly like
    Android's own zipalign, which reports them as "compressed").
    """
    with open(path, "rb") as handle:
        blob = handle.read()
    entries: list[tuple[str, int, int]] = []
    with zipfile.ZipFile(path, "r") as archive:
        for info in archive.infolist():
            header = info.header_offset
            name_length, extra_length = struct.unpack("<HH", blob[header + 26:header + 30])
            data_offset = header + 30 + name_length + extra_length
            alignment = 0 if info.compress_type != STORED else required_alignment(info.filename)
            entries.append((info.filename, alignment, data_offset))
    return entries


def align(source: str, target: str) -> None:
    with zipfile.ZipFile(source, "r") as src, zipfile.ZipFile(target, "w") as dst:
        dst.comment = src.comment
        for info in src.infolist():
            data = src.read(info.filename)
            shared_library = info.filename.endswith(".so")
            method = STORED if shared_library else info.compress_type
            alignment = required_alignment(info.filename)
            name_length = len(info.filename.encode("utf-8"))
            extra = bytes(info.extra)

            if method == STORED:
                for _ in range(2):
                    offset = dst.fp.tell() + 30 + name_length + len(extra)
                    remainder = offset % alignment
                    if remainder == 0:
                        break
                    pad = alignment - remainder
                    if pad < 4:
                        # An extra field needs a 4-byte header; one more
                        # alignment step keeps the offset aligned anyway.
                        pad += alignment
                    extra += extra_field_padding(pad)

            entry = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            entry.compress_type = method
            entry.external_attr = info.external_attr
            entry.internal_attr = info.internal_attr
            entry.create_system = info.create_system
            entry.extra = extra
            dst.writestr(entry, data)


def main() -> int:
    parser = argparse.ArgumentParser(description="Align an APK the way zipalign does.")
    parser.add_argument("source")
    parser.add_argument("target", nargs="?")
    parser.add_argument("--check", action="store_true", help="report alignment without rewriting")
    args = parser.parse_args()

    if args.check:
        entries = measure(args.source)
        bad = [(n, a, o) for n, a, o in entries if a and o % a != 0]
        for name, alignment, offset in entries:
            if name == "resources.arsc" or name.endswith(".so"):
                state = "ok" if offset % alignment == 0 else "MISALIGNED"
                print(f"  {state:<10} {name} (offset {offset}, % {alignment})")
        if bad:
            print(f"alignment check failed for {len(bad)} entrie(s)", file=sys.stderr)
            return 1
        print(f"alignment check passed ({len(entries)} entries)")
        return 0

    if not args.target:
        parser.error("an output path is required unless --check is used")

    align(args.source, args.target)

    entries = measure(args.target)
    problems = [(n, a, o) for n, a, o in entries if a and o % a != 0]
    if problems:
        for name, alignment, offset in problems:
            print(f"still misaligned: {name} at {offset} (need % {alignment})", file=sys.stderr)
        return 1

    for name, alignment, offset in entries:
        if name == "resources.arsc" or name.endswith(".so"):
            print(f"  aligned {name} -> offset {offset} (% {alignment} == 0)")
    print(f"aligned {len(entries)} entrie(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
