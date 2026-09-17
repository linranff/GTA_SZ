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
    mx, my = float(mall.get("east_m", 0)) * scale, float(mall.get("north_m", 0)) * scale
    for i in range(4):
        z = mh * (0.22 + i * 0.16)
        b.box("steel", (mx, my, z), (mw * 1.04, md * 1.04, 0.45 * scale))
    b.box("landmarkglass", (0, -md * 0.62, mh * 0.38), (mw * 0.88, 4.5 * scale, mh * 0.42))
    b.box("stone", (0, -md * 0.84, mh * 0.22), (mw * 0.96, 10 * scale, mh * 0.36))
    b.box("darkglass", (0, -md * 0.84 - 5.1 * scale, mh * 0.10), (mw * 0.16, 2.4 * scale, mh * 0.14))
    # Upper setback and a dark center slot so the mall is not one brick.
    b.box("stone", (0, 8 * scale, mh + 5.2 * scale), (mw * 0.42, md * 0.48, 10.4 * scale))
    b.box("darkglass", (0, -md * 0.12, mh * 0.62), (28 * scale, md * 0.52, mh * 0.88))
    for x in (-56 * scale, 56 * scale):
        b.box("darkglass", (x, my, mh * 0.5), (8 * scale, md * 0.88, mh * 0.86))
    for x in (-72 * scale, -40 * scale, -8 * scale, 24 * scale, 56 * scale):
        b.box("landmarkglass", (x, -md * 1.06, mh * 0.28), (18 * scale, 3.6 * scale, mh * 0.22))
    for i, x in enumerate((-48 * scale, -16 * scale, 16 * scale, 48 * scale)):
        b.box("silver", (x, -md * 1.02, mh * 0.82), (22 * scale, 4.8 * scale, mh * 0.72))
    # 海岸城 three plates in the gaps between silver boxes, same y as lightboxes.
    for x in (-32 * scale, 0, 32 * scale):
        b.box("civicred", (x, -md * 1.02, mh * 0.94), (12 * scale, 2.2 * scale, 6.2 * scale))
        b.box("led", (x, -md * 1.04, mh * 0.94), (5.2 * scale, 1.0 * scale, 2.8 * scale))
    for block in spec["blocks"]:
        if block.get("id") not in ("office-a", "office-b"):
            continue
        h = float(block["height_m"]) * scale
        cx, cy = float(block["east_m"]) * scale, float(block["north_m"]) * scale
        d = float(block["depth_m"]) * scale
        w = float(block["width_m"]) * scale
        for i in range(6):
            z = h * (0.18 + i * 0.12)
            b.box("steel", (cx, cy, z), (w * 1.04, d * 1.04, 0.55 * scale))
        for x in (-5 * scale, 0, 5 * scale):
            b.box("civicred", (cx + x, cy - d * 0.52, h * 0.42), (4.2 * scale, 0.8 * scale, 3.0 * scale))
            b.box("led", (cx + x, cy - d * 0.54, h * 0.42), (1.7 * scale, 0.3 * scale, 1.3 * scale))
    b.box("steel", (0, 0, mh + 4 * scale), (mw * 0.55, 8 * scale, 8 * scale))
    b.box("concrete", (4 * scale, 8 * scale, 0.6 * scale), (200 * scale, 130 * scale, 1.2 * scale))
    b.frame = previous
    return {"id": "coastal-city", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/coastal-city.json"}
