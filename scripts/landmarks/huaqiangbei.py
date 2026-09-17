"""Huaqiangbei market street. Midrise blocks; not SEG Plaza."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "huaqiangbei":
        raise ValueError("huaqiangbei builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    street = spec["street"]
    b.box(
        "asphalt",
        (0, 0, 0.08 * scale),
        (float(street["width_m"]) * scale, float(street["length_m"]) * scale, 0.14 * scale),
    )
    max_h = 0
    for block in spec["blocks"]:
        h = float(block["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(block["east_m"]) * scale, float(block["north_m"]) * scale
        w, d = float(block["width_m"]) * scale, float(block["depth_m"]) * scale
        b.box(block["material"], (cx, cy, h * 0.5), (w, d, h))
        if h > 18 * scale:
            b.box(block["material"], (cx, cy, h + h * 0.08), (w * 0.7, d * 0.7, h * 0.16))
        b.box("darkglass", (cx, cy, h * 0.46), (w * 0.9, d * 0.9, h * 0.68))
        b.box("darkglass", (cx, cy, h * 0.5), (max(w * 0.1, 2.4 * scale), d * 1.02, h * 0.9))
        for i in range(4):
            z = h * (0.28 + i * 0.16)
            b.box("steel", (cx, cy, z), (w * 1.04, d * 1.04, 0.45 * scale))
        # Shop neon on each market block south face; keep the street gold pylons.
        if block["material"] in ("stone", "concrete", "silver"):
            b.box("darkglass", (cx, cy - d * 0.52, 2.4 * scale), (min(w * 0.18, 6 * scale), 2.4 * scale, 3.2 * scale))
        b.box("civicred", (cx, cy - d * 0.52, 5.2 * scale), (min(w * 0.36, 9 * scale), 0.7 * scale, 1.8 * scale))
        b.box("led", (cx, cy - d * 0.54, 5.2 * scale), (min(w * 0.14, 3.4 * scale), 0.28 * scale, 0.75 * scale))
    length = float(street["length_m"]) * scale
    b.box("silver", (0, 0, 11 * scale), (26 * scale, length * 0.92, 1.1 * scale))
    b.box("steel", (0, 0, 8 * scale), (1.6 * scale, length * 0.88, 6 * scale))
    for y in (-length * 0.32, 0, length * 0.32):
        b.box("silver", (0, y, 11.2 * scale), (34 * scale, 22 * scale, 1.8 * scale))
        # 每道南金牌雨篷下都开暗门，不只中间一道。
        b.box("darkglass", (0, y - 16.8 * scale, 3.2 * scale), (12 * scale, 3.2 * scale, 5.6 * scale))
        # Hang gold south of the canopy so the street view is not a silver slab.
        b.box("gold", (0, y - 16.8 * scale, 7.4 * scale), (18 * scale, 3.6 * scale, 9.0 * scale))
        b.box("gold", (-8 * scale, y - 16.4 * scale, 10.2 * scale), (6 * scale, 2.4 * scale, 2.8 * scale))
        b.box("gold", (8 * scale, y - 16.4 * scale, 10.2 * scale), (6 * scale, 2.4 * scale, 2.8 * scale))
        # Tall street pylon so 3/4 still sees gold above the side blocks.
        b.box("gold", (0, y - 16.8 * scale, 19.6 * scale), (4.4 * scale, 3.6 * scale, 28 * scale))
        # 华强北 three character plates: red blocks, small led cores.
        sign_y = y - 16.8 * scale - 1.95 * scale
        for x in (-5.6 * scale, 0, 5.6 * scale):
            b.box("civicred", (x, sign_y, 7.4 * scale), (5.2 * scale, 0.7 * scale, 3.6 * scale))
            b.box("led", (x, sign_y - 0.14 * scale, 7.4 * scale), (2.2 * scale, 0.28 * scale, 1.5 * scale))
    b.frame = previous
    return {"id": "huaqiangbei", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/huaqiangbei.json"}
