"""Futian COCO Park. Open-block low-rise around a courtyard, not a tower."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "coco-park":
        raise ValueError("coco-park builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    court = spec["courtyard"]
    cw, cd = float(court["width_m"]) * scale, float(court["depth_m"]) * scale
    b.box("concrete", (0, 0, 0.15 * scale), (cw, cd, 0.3 * scale))
    b.box("stone", (0, 0, 0.08 * scale), (cw * 0.55, cd * 0.55, 0.12 * scale))
    max_h = 0
    for wing in spec["wings"]:
        h = float(wing["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(wing["east_m"]) * scale, float(wing["north_m"]) * scale
        w, d = float(wing["width_m"]) * scale, float(wing["depth_m"]) * scale
        b.box("stone", (cx, cy, h * 0.5), (w, d, h))
        if wing.get("id") == "east":
            for yoff in (-24 * scale, -8 * scale, 8 * scale, 24 * scale):
                b.box("landmarkglass", (cx + w * 0.48, yoff, 7.4 * scale), (3.6 * scale, 11 * scale, 10 * scale))
        elif wing.get("id") == "west":
            for yoff in (-24 * scale, -8 * scale, 8 * scale, 24 * scale):
                b.box("landmarkglass", (cx - w * 0.48, yoff, 7.4 * scale), (3.6 * scale, 11 * scale, 10 * scale))
        else:
            b.box("darkglass", (cx, cy, h * 0.42), (w * 0.86, d * 0.86, h * 0.62))
        b.box("concrete", (cx, cy, 0.35 * scale), (w * 1.04, d * 1.04, 0.7 * scale))
    b.loft(
        "landmarkglass",
        [
            (0, -cd * 0.95, 0, 18 * scale, 12 * scale),
            (0, -cd * 0.95, 18 * scale, 18 * scale, 12 * scale),
        ],
        n=12,
        power=1,
    )
    b.box("darkglass", (0, -cd * 1.08, 14 * scale), (16 * scale, 2.4 * scale, 5 * scale))
    for x in (-cw * 0.36, -cw * 0.12, cw * 0.12, cw * 0.36):
        b.box("stone", (x, -cd * 1.02, 4.2 * scale), (1.8 * scale, 2.4 * scale, 8.4 * scale))
    b.box("silver", (0, -cd * 1.04, 8.8 * scale), (cw * 0.82, 7 * scale, 1.5 * scale))
    b.box("landmarkglass", (0, -cd * 0.98, 5.2 * scale), (cw * 0.7, 3.2 * scale, 6.2 * scale))
    b.box("silver", (0, 0, 12 * scale), (cw * 0.92, 4 * scale, 1.2 * scale))
    b.box("asphalt", (0, -cd * 1.15, 0.1 * scale), (cw * 1.15, 8 * scale, 0.16 * scale))
    b.frame = previous
    return {
        "id": "coco-park",
        "scale": scale,
        "max_height": max_h,
        "source_spec": "data/landmarks/coco-park.json",
        "wing_count": len(spec["wings"]),
    }
