#!/usr/bin/env python3
"""Renders the legacy (pre API 26) Cinemax launcher icons.

Adaptive icons cover Android 8+; API 24/25 devices read the raster mipmaps, so
the same emblem is rasterised here with the brand gradient. Pure Pillow, no
external services. Run: python3 android/tools/make_legacy_icons.py
"""
from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "app", "src", "main", "res")
SS = 4  # supersampling factor

DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_color(t):
    """Brand ribbon gradient: cyan -> blue -> violet -> magenta."""
    stops = [
        (0.0, (0x70, 0xE0, 0xFF)),
        (0.36, (0x44, 0x79, 0xFF)),
        (0.70, (0x83, 0x55, 0xFF)),
        (1.0, (0xBE, 0x65, 0xF7)),
    ]
    t = max(0.0, min(1.0, t))
    for index in range(len(stops) - 1):
        t0, c0 = stops[index]
        t1, c1 = stops[index + 1]
        if t <= t1:
            span = (t1 - t0) or 1.0
            return lerp(c0, c1, (t - t0) / span)
    return stops[-1][1]


def fold_color(t):
    stops = [
        (0.0, (0xBC, 0xA7, 0xFF)),
        (0.46, (0xE5, 0x79, 0xF1)),
        (1.0, (0xFF, 0x65, 0xAE)),
    ]
    t = max(0.0, min(1.0, t))
    for index in range(len(stops) - 1):
        t0, c0 = stops[index]
        t1, c1 = stops[index + 1]
        if t <= t1:
            span = (t1 - t0) or 1.0
            return lerp(c0, c1, (t - t0) / span)
    return stops[-1][1]


def arc_points(cx, cy, radius, start_deg, end_deg, steps=48):
    points = []
    for step in range(steps + 1):
        angle = math.radians(start_deg + (end_deg - start_deg) * step / steps)
        points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return points


def ribbon_polygon():
    """Emblem ribbon: the folded 'C' from public/brand/cinemax-symbol.svg."""
    # SVG arc: from (12.8,22.5) to (12.8,41.5), r=10.9, sweep=0 -> bulge left.
    chord = 41.5 - 22.5
    radius = 10.9
    offset = math.sqrt(max(radius * radius - (chord / 2) ** 2, 0.0))
    centre = (12.8 + offset, 32.0)
    start_angle = math.degrees(math.atan2(22.5 - centre[1], 12.8 - centre[0]))
    end_angle = math.degrees(math.atan2(41.5 - centre[1], 12.8 - centre[0]))
    # Sweep counter-clockwise in SVG space through 180 degrees to the left.
    while end_angle > start_angle:
        start_angle += 360.0
    arc = arc_points(centre[0], centre[1], radius, start_angle, end_angle)
    return [(42.2, 5.8), (12.8, 22.5)] + arc + [
        (42.2, 58.2),
        (51.8, 46.9),
        (25.7, 32.0),
        (51.8, 17.1),
    ]


def fold_polygon():
    return [
        (39.5, 19.8),
        (57.2, 29.9),
        (57.2, 34.1),
        (39.5, 44.2),
        (32.1, 35.7),
        (38.7, 32.0),
        (32.1, 28.3),
    ]


def to_pixels(point, scale, offset):
    return (point[0] * scale + offset[0], point[1] * scale + offset[1])


def render_icon(size):
    canvas = size * SS
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))

    # Background: rounded square with a plum/violet radial glow.
    background = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    pixels = []
    cxp, cyp = canvas * 0.30, canvas * 0.22
    max_distance = math.hypot(canvas * 0.85, canvas * 0.85)
    for y in range(canvas):
        for x in range(canvas):
            distance = math.hypot(x - cxp, y - cyp) / max_distance
            pixels.append(lerp((0x9A, 0x63, 0xFF), (0x1B, 0x0B, 0x4A), min(1.0, distance * 1.35)) + (255,))
    background.putdata(pixels)

    mask = Image.new("L", (canvas, canvas), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, canvas - 1, canvas - 1], radius=int(canvas * 0.22), fill=255
    )
    image.paste(background, (0, 0), mask)

    draw = ImageDraw.Draw(image)

    # Emblem scaled into the icon (same proportions as the adaptive icon).
    emblem_scale = canvas / 108.0 * 1.05
    offset = (canvas / 108.0 * 20.2, canvas / 108.0 * 20.4)

    ribbon = [to_pixels(point, emblem_scale, offset) for point in ribbon_polygon()]
    draw.polygon(ribbon, fill=gradient_color(0.45))

    # Re-paint the ribbon with the diagonal brand gradient.
    ribbon_mask = Image.new("L", (canvas, canvas), 0)
    ImageDraw.Draw(ribbon_mask).polygon(ribbon, fill=255)
    gradient_layer = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    gradient_pixels = []
    x0, y0 = to_pixels((10, 12), emblem_scale, offset)
    x1, y1 = to_pixels((52, 58), emblem_scale, offset)
    span = max(math.hypot(x1 - x0, y1 - y0), 1.0)
    for y in range(canvas):
        for x in range(canvas):
            t = ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / (span * span)
            gradient_pixels.append(gradient_color(t) + (255,))
    gradient_layer.putdata(gradient_pixels)
    image.paste(gradient_layer, (0, 0), ribbon_mask)

    fold = [to_pixels(point, emblem_scale, offset) for point in fold_polygon()]
    fold_mask = Image.new("L", (canvas, canvas), 0)
    ImageDraw.Draw(fold_mask).polygon(fold, fill=255)
    fold_layer = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    fold_pixels = []
    fx0, fy0 = to_pixels((31, 19), emblem_scale, offset)
    fx1, fy1 = to_pixels((59, 43), emblem_scale, offset)
    span = max(math.hypot(fx1 - fx0, fy1 - fy0), 1.0)
    for y in range(canvas):
        for x in range(canvas):
            t = ((x - fx0) * (fx1 - fx0) + (y - fy0) * (fy1 - fy0)) / (span * span)
            fold_pixels.append(fold_color(t) + (255,))
    fold_layer.putdata(fold_pixels)
    image.paste(fold_layer, (0, 0), fold_mask)

    return image


def main():
    for density, size in DENSITIES.items():
        folder = os.path.join(RES, "mipmap-" + density)
        os.makedirs(folder, exist_ok=True)
        big = render_icon(size)

        big.resize((size, size), Image.LANCZOS).save(
            os.path.join(folder, "ic_launcher.png")
        )

        # Round variant: the same art inside a circular mask.
        mask = Image.new("L", big.size, 0)
        ImageDraw.Draw(mask).ellipse([0, 0, big.size[0] - 1, big.size[1] - 1], fill=255)
        round_icon = Image.new("RGBA", big.size, (0, 0, 0, 0))
        round_icon.paste(big, (0, 0), mask)
        round_icon.resize((size, size), Image.LANCZOS).save(
            os.path.join(folder, "ic_launcher_round.png")
        )
        print("wrote", density, size)


if __name__ == "__main__":
    main()
