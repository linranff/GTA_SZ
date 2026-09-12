"""OCT Harbour. Inner lake plus split shoreline commercial volumes."""
from __future__ import annotations

import math


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "oct-harbour":
        raise ValueError("oct-harbour builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    lake = spec["lake"]
    lx, ly = float(lake["east_m"]) * scale, float(lake["north_m"]) * scale
    rx, ry = float(lake["rx_m"]) * scale, float(lake["ry_m"]) * scale
    b.loft(
        "water",
        [
            (lx, ly, 0.06 * scale, rx, ry),
            (lx, ly, 1.1 * scale, rx, ry),
        ],
        n=10,
        power=1,
    )
    rim = []
    for i in range(13):
        t = i / 12 * math.tau
        rim.append(
            (
                lx + rx * 1.18 * math.cos(t),
                ly + ry * 1.18 * math.sin(t),
                0.14 * scale,
                18 * scale,
                14 * scale,
            )
        )
    b.loft("park", rim, n=6, power=1)
    b.box("concrete", (lx, ly + ry * 1.08, 0.18 * scale), (rx * 0.8, 8 * scale, 0.28 * scale))
    b.box("water", (lx, ly - ry * 1.02, 3.6 * scale), (rx * 1.45, 18 * scale, 7.2 * scale))
    max_h = 0
    for block in spec["blocks"]:
        h = float(block["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(block["east_m"]) * scale, float(block["north_m"]) * scale
        w, d = float(block["width_m"]) * scale, float(block["depth_m"]) * scale
        b.box(block["material"], (cx, cy, h * 0.5), (w, d, h))
        b.box("concrete", (cx, cy, 0.4 * scale), (w * 1.08, d * 1.08, 0.8 * scale))
    b.frame = previous
    return {
        "id": "oct-harbour",
        "scale": scale,
        "max_height": max_h,
        "source_spec": "data/landmarks/oct-harbour.json",
        "block_count": len(spec["blocks"]),
    }
