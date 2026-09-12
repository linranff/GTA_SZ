"""Coastal City. Mall plus two offices; not a single tower."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "coastal-city":
        raise ValueError("coastal-city builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    max_h = 0
    for block in spec["blocks"]:
        h = float(block["height_m"]) * scale
        max_h = max(max_h, h)
        material = block["material"]
        b.box(
            material,
            (float(block["east_m"]) * scale, float(block["north_m"]) * scale, h * 0.5),
            (float(block["width_m"]) * scale, float(block["depth_m"]) * scale, h),
        )
    mall = spec["blocks"][0]
    mw, md, mh = float(mall["width_m"]) * scale, float(mall["depth_m"]) * scale, float(mall["height_m"]) * scale
    b.box("landmarkglass", (0, -md * 0.52, mh * 0.38), (mw * 0.88, 4.5 * scale, mh * 0.42))
    for i, x in enumerate((-48 * scale, -16 * scale, 16 * scale, 48 * scale)):
        b.box("silver", (x, -md * 0.62, mh * 0.55), (14 * scale, 5.2 * scale, mh * 0.86))
    b.box("steel", (0, 0, mh + 4 * scale), (mw * 0.55, 8 * scale, 8 * scale))
    b.box("concrete", (4 * scale, 8 * scale, 0.6 * scale), (200 * scale, 130 * scale, 1.2 * scale))
    b.frame = previous
    return {"id": "coastal-city", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/coastal-city.json"}
