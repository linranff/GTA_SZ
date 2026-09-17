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
    b.box("water", (lx, ly - ry * 1.18, 0.55 * scale), (rx * 1.7, 24 * scale, 1.1 * scale))
    max_h = 0
    for block in spec["blocks"]:
        h = float(block["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(block["east_m"]) * scale, float(block["north_m"]) * scale
        if block.get("id") == "south-low":
            cy = ly - ry * 2.24
        w, d = float(block["width_m"]) * scale, float(block["depth_m"]) * scale
        if block.get("id") == "south-low":
            # Two shoreline wings with a water gap; one warehouse hid the lake.
            gap = 36 * scale
            wing = (w - gap) * 0.5
            for sign in (-1, 1):
                wx = cx + sign * (wing * 0.5 + gap * 0.5)
                b.box(block["material"], (wx, cy, h * 0.5), (wing, d, h))
                b.box("concrete", (wx, cy, 0.4 * scale), (wing * 1.08, d * 1.08, 0.8 * scale))
                for i in range(3):
                    z = h * (0.32 + i * 0.18)
                    b.box("steel", (wx, cy, z), (wing * 1.04, d * 1.04, 0.4 * scale))
                b.box("landmarkglass", (wx, cy - d * 1.02, h * 0.38), (wing * 0.88, 5.2 * scale, h * 0.55))
                b.box("silver", (wx, cy - d * 1.02, h * 0.72), (wing * 0.92, 7.2 * scale, 2.4 * scale))
            b.box("darkglass", (cx, cy - d * 1.02, h * 0.32), (gap * 0.72, 5.2 * scale, h * 0.52))
            b.box("gold", (cx, cy - d * 1.02, h * 0.78), (gap * 0.95, 6.4 * scale, 2.8 * scale))
            for xf in (-0.28, 0.0, 0.28):
                b.box("civicred", (cx + gap * xf, cy - d * 1.02, h * 0.92), (8.4 * scale, 2.0 * scale, 3.0 * scale))
                b.box("led", (cx + gap * xf, cy - d * 1.04, h * 0.92), (3.4 * scale, 0.7 * scale, 1.3 * scale))
            continue
        b.box(block["material"], (cx, cy, h * 0.5), (w, d, h))
        if h > 18 * scale:
            b.box(block["material"], (cx, cy, h + h * 0.08), (w * 0.7, d * 0.7, h * 0.16))
        b.box("darkglass", (cx, cy, h * 0.5), (max(w * 0.1, 2.4 * scale), d * 1.02, h * 0.9))
        b.box("concrete", (cx, cy, 0.4 * scale), (w * 1.08, d * 1.08, 0.8 * scale))
        for i in range(4):
            z = h * (0.28 + i * 0.16)
            b.box("steel", (cx, cy, z), (w * 1.04, d * 1.04, 0.45 * scale))
        if block.get("id") == "west-retail":
            # West stone shop door and plates; do not move the south-low gold.
            b.box("darkglass", (cx, cy - d * 0.52, 2.4 * scale), (min(w * 0.18, 8 * scale), 2.4 * scale, 3.2 * scale))
            b.box("civicred", (cx, cy - d * 0.52, 5.2 * scale), (min(w * 0.36, 10 * scale), 0.7 * scale, 1.8 * scale))
            b.box("led", (cx, cy - d * 0.54, 5.2 * scale), (min(w * 0.14, 4 * scale), 0.28 * scale, 0.75 * scale))
    b.frame = previous
    return {
        "id": "oct-harbour",
        "scale": scale,
        "max_height": max_h,
        "source_spec": "data/landmarks/oct-harbour.json",
        "block_count": len(spec["blocks"]),
    }
