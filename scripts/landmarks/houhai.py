"""Houhai / Super HQ waterfront district marker. Not Beijing Houhai."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "houhai":
        raise ValueError("houhai builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    water = spec["water"]
    ww, wd = float(water["width_m"]) * scale, float(water["depth_m"]) * scale
    b.box("water", (0, float(water["south_m"]) * scale, 0.55 * scale), (ww, wd, 1.1 * scale))
    b.box("park", (0, float(water["south_m"]) * scale + wd * 0.62, 0.12 * scale), (ww, 10 * scale, 0.18 * scale))
    max_h = 0
    for block in spec["blocks"]:
        h = float(block["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(block["east_m"]) * scale, float(block["north_m"]) * scale
        w, d = float(block["width_m"]) * scale, float(block["depth_m"]) * scale
        b.box(block["material"], (cx, cy, h * 0.5), (w, d, h))
    b.box("asphalt", (0, 8 * scale, 0.08 * scale), (ww * 0.9, 8 * scale, 0.14 * scale))
    b.frame = previous
    return {"id": "houhai", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/houhai.json"}
