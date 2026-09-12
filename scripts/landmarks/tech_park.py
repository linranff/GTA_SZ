"""Hi-Tech Park street blocks. Not Tencent and not MixC World towers."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "tech-park":
        raise ValueError("tech-park builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    b.box("asphalt", (0, 0, 0.08 * scale), (220 * scale, 14 * scale, 0.14 * scale))
    b.box("asphalt", (20 * scale, 0, 0.08 * scale), (12 * scale, 90 * scale, 0.14 * scale))
    b.box("silver", (0, 0, 9.5 * scale), (18 * scale, 160 * scale, 0.8 * scale))
    b.box("steel", (0, 0, 6.5 * scale), (1.1 * scale, 150 * scale, 5 * scale))
    max_h = 0
    for block in spec["blocks"]:
        h = float(block["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(block["east_m"]) * scale, float(block["north_m"]) * scale
        w, d = float(block["width_m"]) * scale, float(block["depth_m"]) * scale
        b.box(block["material"], (cx, cy, h * 0.5), (w, d, h))
    b.frame = previous
    return {"id": "tech-park", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/tech-park.json"}
