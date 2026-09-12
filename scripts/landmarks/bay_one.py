"""One Shenzhen Bay cluster. Heights reported; plan offsets estimated."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "bay-one":
        raise ValueError("bay-one builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    max_h = 0
    for tower in spec["towers"]:
        h = float(tower["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(tower["east_m"]) * scale, float(tower["north_m"]) * scale
        w, d = float(tower["width_m"]) * scale, float(tower["depth_m"]) * scale
        material = "darkglass" if tower["id"] == "t7" else "landmarkglass"
        b.box(material, (cx, cy, h * 0.5), (w, d, h))
        b.box("silver", (cx, cy, h - 1.5 * scale), (w * 0.55, d * 0.55, 3.0 * scale))
    b.box("concrete", (8 * scale, -4 * scale, 1.0 * scale), (110 * scale, 90 * scale, 2.0 * scale))
    b.frame = previous
    return {"id": "bay-one", "scale": scale, "tower_count": len(spec["towers"]), "max_height": max_h, "source_spec": "data/landmarks/bay-one.json"}
