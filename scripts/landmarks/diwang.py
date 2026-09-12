"""Shun Hing Square / 地王 twin teal tubes. Must stay distinct from KK100."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "diwang":
        raise ValueError("diwang builder requires the diwang specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    tubes = spec["tubes"]
    offset = float(tubes["offset_m"]) * 1.55 * scale
    rx = float(tubes["radius_m"]) * scale
    ry = rx * 0.66
    shaft = float(tubes["shaft_top_m"]) * scale
    crown = float(tubes["crown_top_m"]) * scale
    mast = float(tubes["mast_top_m"]) * scale
    dark = float(tubes["base_dark_m"]) * scale
    for sign in (-1, 1):
        cx = sign * offset
        b.loft("landmarkglass", [(cx, 0, dark, rx, ry), (cx, 0, shaft, rx * 0.98, ry * 0.98)], n=18, power=1)
        b.loft("darkglass", [(cx, 0, 0, rx * 1.04, ry * 1.04), (cx, 0, dark, rx, ry)], n=14, power=1)
        b.loft("silver", [(cx, 0, shaft, rx * 1.08, ry * 1.08), (cx, 0, crown, rx * 0.88, ry * 0.88)], n=14, power=1)
        b.tube("steel", (cx, 0, crown), (cx, 0, mast), 0.45 * scale, 8, 0.12 * scale)
    b.box("landmarkglass", (0, 0, shaft * 0.5), (max(0.6 * scale, offset * 0.55), ry * 1.35, shaft))
    b.box("concrete", (0, 0, 0.8 * scale), (offset * 2.6 + rx, ry * 2.8, 1.6 * scale))
    b.frame = previous
    return {"id": "diwang", "scale": scale, "max_height": float(tubes["mast_top_m"]) * scale, "source_spec": "data/landmarks/diwang.json"}
