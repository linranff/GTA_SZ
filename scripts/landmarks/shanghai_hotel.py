"""Shanghai Hotel. White drum, mid glass band, small dome; not Grand Skylight."""
from __future__ import annotations

import math


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "shanghai-hotel":
        raise ValueError("shanghai-hotel builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    drum = spec["drum"]
    rx, ry = float(drum["rx_m"]) * scale, float(drum["ry_m"]) * scale
    h = float(drum["height_m"]) * scale
    wing = spec["wing"]
    b.box(
        "silver",
        (float(wing["east_m"]) * scale, float(wing["north_m"]) * scale, float(wing["height_m"]) * 0.5 * scale),
        (float(wing["width_m"]) * scale, float(wing["depth_m"]) * scale, float(wing["height_m"]) * scale),
    )
    b.loft("silver", [(0, 0, 0, rx, ry), (0, 0, h * 0.38, rx, ry)], n=16, power=1)
    b.loft("landmarkglass", [(0, 0, h * 0.36, rx * 1.01, ry * 1.01), (0, 0, h * 0.78, rx * 1.01, ry * 1.01)], n=16, power=1)
    b.loft("silver", [(0, 0, h * 0.76, rx, ry), (0, 0, h * 0.92, rx, ry)], n=16, power=1)
    b.loft("silver", [(0, 0, h * 0.9, rx * 1.05, ry * 1.05), (0, 0, h * 0.96, rx * 1.05, ry * 1.05)], n=16, power=1)
    dome = float(spec["dome"]["height_m"]) * scale
    b.loft(
        "silver",
        [
            (0, 0, h * 0.96, rx * 0.62, ry * 0.62),
            (0, 0, h + dome * 0.42, rx * 0.52, ry * 0.52),
            (0, 0, h + dome * 0.78, rx * 0.32, ry * 0.32),
            (0, 0, h + dome * 0.98, rx * 0.16, ry * 0.16),
        ],
        n=14,
        power=1,
    )
    for i in range(12):
        t = i / 12 * math.tau
        x, y = rx * 1.08 * math.cos(t), ry * 1.08 * math.sin(t)
        b.tube("silver", (x, y, h * 0.76), (x, y, h * 0.98), 0.55 * scale, 5)
    b.box("concrete", (0, -ry * 1.15, 3.2 * scale), (28 * scale, 14 * scale, 6.4 * scale))
    b.frame = previous
    return {
        "id": "shanghai-hotel",
        "scale": scale,
        "max_height": h + dome,
        "source_spec": "data/landmarks/shanghai-hotel.json",
    }
