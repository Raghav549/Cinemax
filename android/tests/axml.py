#!/usr/bin/env python3
"""Minimal Android binary XML (AXML) reader.

The manifest inside a built APK is compiled binary XML, so grepping the archive
proves nothing. This parses the real chunk format (string pool, resource map,
start/end elements with typed attribute values) and renders a readable tree, so
the tests can assert exactly what the device will see:

    launchMode, windowSoftInputMode, configChanges, screenOrientation,
    usesCleartextTraffic, labels, icons, intent filters, permissions.

Usage:
    python3 axml.py <apk|AndroidManifest.xml> [--xml]
"""
from __future__ import annotations

import argparse
import struct
import sys
import zipfile

RES_STRING_POOL_TYPE = 0x0001
RES_XML_TYPE = 0x0003
RES_XML_RESOURCE_MAP_TYPE = 0x0180
RES_XML_START_NAMESPACE_TYPE = 0x0100
RES_XML_END_NAMESPACE_TYPE = 0x0101
RES_XML_START_ELEMENT_TYPE = 0x0102
RES_XML_END_ELEMENT_TYPE = 0x0103
RES_XML_CDATA_TYPE = 0x0104

TYPE_REFERENCE = 0x01
TYPE_STRING = 0x03
TYPE_FLOAT = 0x04
TYPE_DIMENSION = 0x05
TYPE_INT_DEC = 0x10
TYPE_INT_HEX = 0x11
TYPE_INT_BOOLEAN = 0x12

ANDROID_NS = "http://schemas.android.com/apk/res/android"


class Chunk:
    def __init__(self, chunk_type: int, header_size: int, size: int, offset: int):
        self.type = chunk_type
        self.header_size = header_size
        self.size = size
        self.offset = offset


class StringPool:
    def __init__(self, data: bytes, chunk: Chunk):
        base = chunk.offset
        (self.count, self.style_count, self.flags, self.strings_start, self.styles_start) = struct.unpack_from(
            "<IIIII", data, base + 8
        )
        self.utf8 = bool(self.flags & 0x100)
        self.offsets = [
            struct.unpack_from("<I", data, base + chunk.header_size + index * 4)[0]
            for index in range(self.count)
        ]
        self.base = base
        self.data = data

    def get(self, index: int) -> str:
        if index < 0 or index >= self.count:
            return ""
        position = self.base + self.strings_start + self.offsets[index]
        if self.utf8:
            length, position = self._length8(position)
            _payload_length, position = self._length8(position)
            raw = self.data[position:position + length]
            return raw.decode("utf-8", "replace")
        length, position = self._length16(position)
        raw = self.data[position:position + length * 2]
        return raw.decode("utf-16-le", "replace")

    def _length8(self, position: int):
        value = self.data[position]
        position += 1
        if value & 0x80:
            value = ((value & 0x7F) << 8) | self.data[position]
            position += 1
        return value, position

    def _length16(self, position: int):
        value = struct.unpack_from("<H", self.data, position)[0]
        position += 2
        if value & 0x8000:
            value = ((value & 0x7FFF) << 16) | struct.unpack_from("<H", self.data, position)[0]
            position += 2
        return value, position


class Element:
    def __init__(self, name: str, namespace: str = ""):
        self.name = name
        self.namespace = namespace
        self.attributes: list[tuple[str, str, str]] = []  # (namespace, name, value)
        self.children: list[Element] = []

    def attr(self, name: str, namespace: str = ANDROID_NS) -> str | None:
        for attr_ns, attr_name, value in self.attributes:
            if attr_name == name and attr_ns == namespace:
                return value
        for attr_ns, attr_name, value in self.attributes:
            if attr_name == name:
                return value
        return None

    def find(self, name: str) -> Element | None:
        for child in self.children:
            if child.name == name:
                return child
        return None

    def find_all(self, name: str) -> list[Element]:
        found: list[Element] = []
        for child in self.children:
            if child.name == name:
                found.append(child)
            found.extend(child.find_all(name))
        return found

    def render(self, indent: int = 0) -> str:
        pad = "  " * indent
        attributes = "".join(
            f' {name}="{value}"' if namespace == ANDROID_NS else f' {namespace}:{name}="{value}"'
            for namespace, name, value in self.attributes
        )
        if not self.children:
            return f"{pad}<{self.name}{attributes}/>"
        lines = [f"{pad}<{self.name}{attributes}>"]
        for child in self.children:
            lines.append(child.render(indent + 1))
        lines.append(f"{pad}</{self.name}>")
        return "\n".join(lines)


def parse(data: bytes) -> Element:
    chunk_type, header_size, total_size = struct.unpack_from("<HHI", data, 0)
    if chunk_type != RES_XML_TYPE:
        raise ValueError(f"not binary XML (chunk type 0x{chunk_type:04x})")

    pool: StringPool | None = None
    root: Element | None = None
    stack: list[Element] = []
    # The first chunk is the XML file header: its size field is the whole file,
    # so it is skipped by header size and the real chunks follow.
    offset = header_size if header_size >= 8 else 8
    while offset + 8 <= len(data):
        ctype, cheader, csize = struct.unpack_from("<HHI", data, offset)
        if csize == 0:
            break
        chunk = Chunk(ctype, cheader, csize, offset)

        if ctype == RES_STRING_POOL_TYPE:
            pool = StringPool(data, chunk)
        elif ctype == RES_XML_START_ELEMENT_TYPE and pool is not None:
            (line, comment, ns_index, name_index, attr_start, attr_size, attr_count,
             id_index, class_index, style_index) = struct.unpack_from("<IIIIHHHHHH", data, offset + 8)
            element = Element(pool.get(name_index), pool.get(ns_index) if ns_index != 0xFFFFFFFF else "")
            # attributeStart is measured from the start of the attr-ext struct,
            # which follows the 8-byte chunk header and the node's line/comment.
            position = offset + 16 + attr_start
            for _ in range(attr_count):
                attr_ns, attr_name, raw_value = struct.unpack_from("<III", data, position)
                value_size, res0, data_type, value_data = struct.unpack_from("<HBBI", data, position + 12)
                if raw_value != 0xFFFFFFFF:
                    value = pool.get(raw_value)
                elif data_type == TYPE_STRING:
                    value = pool.get(value_data)
                elif data_type == TYPE_INT_BOOLEAN:
                    value = "true" if value_data else "false"
                elif data_type == TYPE_INT_DEC:
                    value = str(value_data)
                elif data_type == TYPE_INT_HEX:
                    value = f"0x{value_data:x}"
                elif data_type == TYPE_REFERENCE:
                    value = f"@0x{value_data:08x}"
                elif data_type == TYPE_FLOAT:
                    value = str(struct.unpack("<f", struct.pack("<I", value_data))[0])
                else:
                    value = f"0x{value_data:x}"
                element.attributes.append(
                    (pool.get(attr_ns) if attr_ns != 0xFFFFFFFF else "", pool.get(attr_name), value)
                )
                position += attr_size
            if stack:
                stack[-1].children.append(element)
            else:
                root = element
            stack.append(element)
        elif ctype == RES_XML_END_ELEMENT_TYPE:
            if stack:
                stack.pop()
        offset += csize

    if root is None:
        raise ValueError("no root element found")
    return root


def load_manifest(source: str) -> bytes:
    if source.endswith(".apk"):
        with zipfile.ZipFile(source) as archive:
            return archive.read("AndroidManifest.xml")
    with open(source, "rb") as handle:
        return handle.read()


def main() -> int:
    parser = argparse.ArgumentParser(description="Dump an APK's binary AndroidManifest.xml")
    parser.add_argument("source")
    args = parser.parse_args()
    root = parse(load_manifest(args.source))
    print(root.render())
    return 0


if __name__ == "__main__":
    sys.exit(main())
