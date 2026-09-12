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
        b.box("darkglass", (cx, cy, h * 0.46), (w * 0.9, d * 0.9, h * 0.68))
    length = float(street["length_m"]) * scale
    b.box("silver", (0, 0, 11 * scale), (22 * scale, length * 0.92, 0.7 * scale))
    b.box("steel", (0, 0, 8 * scale), (1.2 * scale, length * 0.88, 6 * scale))
    for y in (-length * 0.32, 0, length * 0.32):
        b.box("silver", (0, y, 11 * scale), (28 * scale, 18 * scale, 1.4 * scale))
    b.frame = previous
    return {"id": "huaqiangbei", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/huaqiangbei.json"}
