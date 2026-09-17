"""Hi-Tech Park street blocks. Not Tencent and not MixC World towers."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "tech-park":
        raise ValueError("tech-park builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    b.box("asphalt", (0, 0, 0.08 * scale), (220 * scale, 14 * scale, 0.14 * scale))
    b.box("asphalt", (20 * scale, 0, 0.08 * scale), (12 * scale, 90 * scale, 0.14 * scale))
    b.box("silver", (0, 0, 10.2 * scale), (24 * scale, 170 * scale, 1.2 * scale))
    b.box("steel", (0, 0, 7 * scale), (1.6 * scale, 160 * scale, 5.6 * scale))
    for y in (-48 * scale, 0, 48 * scale):
        b.box("silver", (0, y, 10.4 * scale), (32 * scale, 22 * scale, 1.6 * scale))
        b.box("gold", (0, y - 16.4 * scale, 7.0 * scale), (18 * scale, 3.6 * scale, 8.6 * scale))
        b.box("gold", (-7 * scale, y - 16.0 * scale, 9.8 * scale), (5.6 * scale, 2.4 * scale, 2.6 * scale))
        b.box("gold", (7 * scale, y - 16.0 * scale, 9.8 * scale), (5.6 * scale, 2.4 * scale, 2.6 * scale))
        b.box("gold", (0, y - 16.4 * scale, 19.2 * scale), (4.2 * scale, 3.6 * scale, 28 * scale))
        if y < 0:
            b.box("darkglass", (0, y - 16.4 * scale, 3.2 * scale), (12 * scale, 3.2 * scale, 5.6 * scale))
            # 科技园 four plates proud of the south gold canopy.
            for x in (-6.4 * scale, -2.1 * scale, 2.1 * scale, 6.4 * scale):
                b.box("civicred", (x, y - 18.7 * scale, 5.8 * scale), (3.8 * scale, 1.0 * scale, 2.6 * scale))
                b.box("led", (x, y - 18.9 * scale, 5.8 * scale), (1.6 * scale, 0.32 * scale, 1.1 * scale))
    max_h = 0
    for block in spec["blocks"]:
        h = float(block["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(block["east_m"]) * scale, float(block["north_m"]) * scale
        w, d = float(block["width_m"]) * scale, float(block["depth_m"]) * scale
        b.box(block["material"], (cx, cy, h * 0.5), (w, d, h))
        if h > 18 * scale:
            b.box(block["material"], (cx, cy, h + h * 0.08), (w * 0.7, d * 0.7, h * 0.16))
        b.box("darkglass", (cx, cy, h * 0.5), (max(w * 0.1, 2.4 * scale), d * 1.02, h * 0.9))
        for i in range(4):
            z = h * (0.28 + i * 0.16)
            b.box("steel", (cx, cy, z), (w * 1.04, d * 1.04, 0.45 * scale))
        # Shop neon on each block south face; light-face doors only. Do not thicken the distant gold.
        if block["material"] in ("stone", "concrete", "silver"):
            b.box("darkglass", (cx, cy - d * 0.52, 2.2 * scale), (min(w * 0.18, 6 * scale), 2.4 * scale, 3.0 * scale))
        b.box("civicred", (cx, cy - d * 0.52, min(5.2 * scale, h * 0.28)), (min(w * 0.36, 9 * scale), 0.7 * scale, 1.8 * scale))
        b.box("led", (cx, cy - d * 0.54, min(5.2 * scale, h * 0.28)), (min(w * 0.14, 3.4 * scale), 0.28 * scale, 0.75 * scale))
    b.frame = previous
    return {"id": "tech-park", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/tech-park.json"}
