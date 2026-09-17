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
    wx = float(wing["east_m"]) * scale
    wy = float(wing["north_m"]) * scale
    ww = float(wing["width_m"]) * scale
    wd = float(wing["depth_m"]) * scale
    wh = float(wing["height_m"]) * scale
    b.box("silver", (wx, wy, wh * 0.5), (ww, wd, wh))
    if wh > 16 * scale:
        b.box("silver", (wx, wy, wh + wh * 0.08), (ww * 0.7, wd * 0.7, wh * 0.16))
    b.box("darkglass", (wx, wy, wh * 0.5), (max(ww * 0.1, 2.4 * scale), wd * 1.02, wh * 0.9))
    for i in range(4):
        z = wh * (0.28 + i * 0.16)
        b.box("steel", (wx, wy, z), (ww * 1.04, wd * 1.04, 0.45 * scale))
    b.loft("silver", [(0, 0, 0, rx, ry), (0, 0, h * 0.38, rx, ry)], n=16, power=1)
    b.loft("landmarkglass", [(0, 0, h * 0.34, rx * 1.16, ry * 1.16), (0, 0, h * 0.8, rx * 1.16, ry * 1.16)], n=16, power=1)
    # 上海宾馆 mid-drum neon ring; gold band, smaller led core.
    b.loft("gold", [(0, 0, h * 0.52, rx * 1.185, ry * 1.185), (0, 0, h * 0.58, rx * 1.185, ry * 1.185)], n=16, power=1)
    b.loft("led", [(0, 0, h * 0.538, rx * 1.19, ry * 1.19), (0, 0, h * 0.562, rx * 1.19, ry * 1.19)], n=16, power=1)
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
        x, y = rx * 1.16 * math.cos(t), ry * 1.16 * math.sin(t)
        b.tube("silver", (x, y, h * 0.76), (x, y, h * 0.98), 1.15 * scale, 5)
    b.box("landmarkglass", (0, -ry * 1.22, h * 0.56), (rx * 1.72, 4.8 * scale, h * 0.36))
    # 上海宾馆 neon on the south glass face; keep the mid-drum ring.
    b.box("gold", (0, -ry * 1.22 - 2.5 * scale, h * 0.56), (rx * 1.62, 0.8 * scale, h * 0.07))
    b.box("civicred", (0, -ry * 1.22 - 2.6 * scale, h * 0.56), (rx * 1.42, 0.5 * scale, h * 0.05))
    b.box("led", (0, -ry * 1.22 - 2.7 * scale, h * 0.56), (rx * 0.55, 0.28 * scale, h * 0.02))
    b.box("concrete", (0, -ry * 2.16, 3.2 * scale), (28 * scale, 16 * scale, 6.4 * scale))
    b.box("darkglass", (0, -ry * 2.16, 2.6 * scale), (16 * scale, 12 * scale, 4.6 * scale))
    b.box("landmarkglass", (0, -ry * 2.32, 4.2 * scale), (22 * scale, 3.2 * scale, 5.6 * scale))
    # 上海宾馆 gold fascia plus four plates; keep the mid-drum ring.
    glass_south = -ry * 2.32 - 1.6 * scale
    b.box("darkglass", (0, glass_south, 2.8 * scale), (14 * scale, 2.4 * scale, 3.8 * scale))
    b.box("gold", (0, glass_south - 0.2 * scale, 6.4 * scale), (24 * scale, 1.4 * scale, 3.6 * scale))
    for x in (-10.5 * scale, -3.5 * scale, 3.5 * scale, 10.5 * scale):
        b.box("civicred", (x, glass_south - 1.0 * scale, 6.4 * scale), (5.6 * scale, 1.0 * scale, 2.4 * scale))
        b.box("led", (x, glass_south - 1.2 * scale, 6.4 * scale), (2.4 * scale, 0.4 * scale, 1.2 * scale))
    b.frame = previous
    return {
        "id": "shanghai-hotel",
        "scale": scale,
        "max_height": h + dome,
        "source_spec": "data/landmarks/shanghai-hotel.json",
    }
