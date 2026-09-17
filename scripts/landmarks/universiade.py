"""Universiade Sports Centre. Three crystal venues around a lake; not Bao'an Stadium."""
from __future__ import annotations

import math


def _crystal(b, scale, item, material):
    cx = float(item["east_m"]) * scale
    cy = float(item["north_m"]) * scale
    rx = float(item["rx_m"]) * scale
    ry = float(item["ry_m"]) * scale
    h = float(item["height_m"]) * scale
    b.loft(
        material,
        [
            (cx, cy, 0, rx * 0.92, ry * 0.92),
            (cx, cy, h * 0.45, rx, ry),
            (cx, cy, h, rx * 0.22, ry * 0.22),
        ],
        n=6,
        power=1.15,
    )
    for i in range(6):
        t = i / 6 * 6.283185307179586
        x0, y0 = cx + rx * 0.92 * math.cos(t), cy + ry * 0.92 * math.sin(t)
        x1, y1 = cx + rx * 0.18 * math.cos(t), cy + ry * 0.18 * math.sin(t)
        b.tube("steel", (x0, y0, h * 0.12), (x1, y1, h * 0.96), 1.55 * scale, 5)
    return h


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "universiade":
        raise ValueError("universiade builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    lake = spec["lake"]
    b.loft(
        "water",
        [
            (float(lake["east_m"]) * scale, float(lake["north_m"]) * scale, 0.08 * scale, float(lake["rx_m"]) * scale, float(lake["ry_m"]) * scale),
            (float(lake["east_m"]) * scale, float(lake["north_m"]) * scale, 1.15 * scale, float(lake["rx_m"]) * scale, float(lake["ry_m"]) * scale),
        ],
        n=12,
        power=1,
    )
    h1 = _crystal(b, scale, spec["stadium"], "silver")
    h2 = _crystal(b, scale, spec["gym"], "landmarkglass")
    h3 = _crystal(b, scale, spec["pool"], "silver")
    # South-face ribs on the front crystal. Around-crystal tubes stay invisible at this distance.
    st = spec["stadium"]
    sx = float(st["east_m"]) * scale
    sy = float(st["north_m"]) * scale
    srx = float(st["rx_m"]) * scale
    sry = float(st["ry_m"]) * scale
    sh = float(st["height_m"]) * scale
    for i in range(-2, 3):
        b.box(
            "steel",
            (sx + i * srx * 0.26, sy - sry * 1.02, sh * 0.46),
            (6.4 * scale, 6.8 * scale, sh * 0.82),
        )
    lx, ly = float(lake["east_m"]) * scale, float(lake["north_m"]) * scale
    b.box("water", (lx, ly + float(lake["ry_m"]) * 0.95 * scale, 0.55 * scale), (float(lake["rx_m"]) * 1.4 * scale, 16 * scale, 1.1 * scale))
    # South terrace so the front camera sees water, not only the north lake.
    b.box(
        "water",
        (0, -float(spec["stadium"]["ry_m"]) * 1.12 * scale, 0.55 * scale),
        (float(spec["stadium"]["rx_m"]) * 1.85 * scale, 22 * scale, 1.1 * scale),
    )
    b.box("park", (-20 * scale, 120 * scale, 0.1 * scale), (160 * scale, 90 * scale, 0.16 * scale))
    b.box("park", (80 * scale, 40 * scale, 0.1 * scale), (70 * scale, 50 * scale, 0.16 * scale))
    b.frame = previous
    return {
        "id": "universiade",
        "scale": scale,
        "max_height": max(h1, h2, h3),
        "source_spec": "data/landmarks/universiade.json",
        "coverage": "outside",
    }
