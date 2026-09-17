"""Shenzhen Talent Park. Inner lake and a token tree grid, not a building."""
from __future__ import annotations

import math


def _tree(b, scale, x, y):
    b.tube("bark", (x, y, 0), (x, y, 12.0 * scale), 0.45 * scale, 5)
    b.loft(
        "leaf",
        [
            (x, y, 8.0 * scale, 9.5 * scale, 9.5 * scale),
            (x, y, 22.0 * scale, 1.2 * scale, 1.2 * scale),
        ],
        n=6,
        power=1,
    )


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "talent":
        raise ValueError("talent builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    lake = spec["lake"]
    lx, ly = float(lake["east_m"]) * scale, float(lake["north_m"]) * scale
    rx, ry = float(lake["rx_m"]) * scale, float(lake["ry_m"]) * scale
    b.loft(
        "water",
        [
            (lx, ly, 0.06 * scale, rx, ry),
            (lx, ly, 1.2 * scale, rx, ry),
        ],
        n=12,
        power=1,
    )
    rim = []
    for i in range(17):
        t = i / 16 * math.tau
        rim.append(
            (
                lx + rx * 1.16 * math.cos(t),
                ly + ry * 1.16 * math.sin(t),
                0.14 * scale,
                16 * scale,
                12 * scale,
            )
        )
    b.loft("park", rim, n=6, power=1)
    b.box("concrete", (lx, ly + ry * 1.08, 0.9 * scale), (rx * 0.55, 8.0 * scale, 1.6 * scale))
    b.box("water", (lx, ly - ry * 1.08, 0.55 * scale), (rx * 1.55, 22 * scale, 1.1 * scale))
    b.box("concrete", (lx, ly - ry * 1.08, 0.7 * scale), (rx * 1.6, 6 * scale, 1.2 * scale))
    # 人才公园 four plates on the south path fascia; keep the lake.
    b.box("gold", (lx, ly - ry * 1.08, 3.4 * scale), (rx * 0.72, 2.2 * scale, 5.2 * scale))
    for xf in (-0.36, -0.12, 0.12, 0.36):
        b.box("civicred", (lx + rx * 0.28 * xf, ly - ry * 1.08 - 1.2 * scale, 3.6 * scale), (7.2 * scale, 0.8 * scale, 2.8 * scale))
        b.box("led", (lx + rx * 0.28 * xf, ly - ry * 1.08 - 1.4 * scale, 3.6 * scale), (2.8 * scale, 0.3 * scale, 1.2 * scale))
    for i in range(10):
        t = 0.12 + i * 0.08
        ang = math.tau * 0.62 + t * 1.4
        _tree(b, scale, lx + rx * 1.28 * math.cos(ang), ly + ry * 1.28 * math.sin(ang))
    for i in (-3, -2, 2, 3):
        _tree(b, scale, lx + i * 24 * scale, ly - ry * 1.24)
    for i in (-2, 0, 2):
        _tree(b, scale, lx + i * 28 * scale, ly - ry * 1.58)
    for i in (-3, -1, 1, 3):
        _tree(b, scale, lx + i * 22 * scale, ly - ry * 1.86)
    b.frame = previous
    return {
        "id": "talent",
        "scale": scale,
        "max_height": 22.0 * scale,
        "source_spec": "data/landmarks/talent.json",
    }
