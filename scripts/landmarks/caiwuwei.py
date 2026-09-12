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
    b.box("silver", (0, 0, 10 * scale), (sw * 0.72, 8 * scale, 0.7 * scale))
    b.box("steel", (0, 0, 7 * scale), (1.1 * scale, sd * 0.9, 5.2 * scale))
    max_h = 0
    for block in spec["blocks"]:
        h = float(block["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(block["east_m"]) * scale, float(block["north_m"]) * scale
        w, d = float(block["width_m"]) * scale, float(block["depth_m"]) * scale
        b.box(block["material"], (cx, cy, h * 0.5), (w, d, h))
        b.box("darkglass", (cx, cy, h * 0.48), (w * 0.88, d * 0.88, h * 0.72))
    b.frame = previous
    return {"id": "caiwuwei", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/caiwuwei.json"}
