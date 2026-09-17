"""Caiwuwei street blocks. Context only; not copies of KK100 or Diwang."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "caiwuwei":
        raise ValueError("caiwuwei builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    street = spec["street"]
    sw, sd = float(street["width_m"]) * scale, float(street["depth_m"]) * scale
    b.box("asphalt", (0, 0, 0.08 * scale), (sw, sd, 0.14 * scale))
    b.box("silver", (0, 0, 11 * scale), (sw * 0.82, 12 * scale, 1.2 * scale))
    b.box("steel", (0, 0, 7.5 * scale), (1.6 * scale, sd * 0.92, 6 * scale))
    b.box("darkglass", (0, -14.8 * scale, 3.2 * scale), (12 * scale, 3.2 * scale, 5.6 * scale))
    b.box("gold", (0, -14.8 * scale, 7.2 * scale), (20 * scale, 3.8 * scale, 8.6 * scale))
    b.box("gold", (-7 * scale, -14.4 * scale, 10.0 * scale), (6 * scale, 2.4 * scale, 2.6 * scale))
    b.box("gold", (7 * scale, -14.4 * scale, 10.0 * scale), (6 * scale, 2.4 * scale, 2.6 * scale))
    b.box("gold", (0, -14.8 * scale, 19.4 * scale), (4.4 * scale, 3.6 * scale, 28 * scale))
    # 蔡屋围 four plates on the south gold canopy.
    for x in (-7.2 * scale, -2.4 * scale, 2.4 * scale, 7.2 * scale):
        b.box("civicred", (x, -16.8 * scale, 7.4 * scale), (3.8 * scale, 0.7 * scale, 2.0 * scale))
        b.box("led", (x, -17.0 * scale, 7.4 * scale), (1.6 * scale, 0.28 * scale, 0.85 * scale))
    max_h = 0
    for block in spec["blocks"]:
        h = float(block["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(block["east_m"]) * scale, float(block["north_m"]) * scale
        w, d = float(block["width_m"]) * scale, float(block["depth_m"]) * scale
        b.box(block["material"], (cx, cy, h * 0.5), (w, d, h))
        if h > 18 * scale:
            b.box(block["material"], (cx, cy, h + h * 0.08), (w * 0.7, d * 0.7, h * 0.16))
        b.box("darkglass", (cx, cy, h * 0.48), (w * 0.88, d * 0.88, h * 0.72))
        b.box("darkglass", (cx, cy, h * 0.5), (max(w * 0.1, 2.4 * scale), d * 1.02, h * 0.9))
        for i in range(4):
            z = h * (0.28 + i * 0.16)
            b.box("steel", (cx, cy, z), (w * 1.04, d * 1.04, 0.45 * scale))
        # Shop neon on each street block; light-face doors only. Keep the gold canopy plates.
        if block["material"] in ("stone", "concrete"):
            b.box("darkglass", (cx, cy - d * 0.52, 2.2 * scale), (min(w * 0.18, 6 * scale), 2.4 * scale, 3.0 * scale))
        b.box("civicred", (cx, cy - d * 0.52, 4.6 * scale), (min(w * 0.36, 9 * scale), 0.7 * scale, 1.8 * scale))
        b.box("led", (cx, cy - d * 0.54, 4.6 * scale), (min(w * 0.14, 3.4 * scale), 0.28 * scale, 0.75 * scale))
    b.frame = previous
    return {"id": "caiwuwei", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/caiwuwei.json"}
