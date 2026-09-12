"""SEG Plaza. Octagonal dark glass shaft on a white mall; antenna already gone."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "seg":
        raise ValueError("seg builder requires the seg specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    rings = [(float(item["z"]), float(item["radius"])) for item in spec["profile"]["rings"]]
    power = float(spec["profile"].get("power", 0.92))
    b.loft("darkglass", [(0, 0, z * scale, r * scale, r * scale) for z, r in rings], n=8, power=power)
    h = rings[-1][0] * scale
    r_top = rings[-1][1] * scale
    b.loft("silver", [(0, 0, h - 4 * scale, r_top * 1.02, r_top * 1.02), (0, 0, h + 1.2 * scale, r_top * 0.92, r_top * 0.92)], n=8, power=1)
    b.tube("steel", (-2.4 * scale, 0, h), (-2.4 * scale, 0, h + 8 * scale), 0.22 * scale, 5)
    b.tube("steel", (2.4 * scale, 0, h), (2.4 * scale, 0, h + 8 * scale), 0.22 * scale, 5)
    podium = spec["podium"]
    pw = float(podium["width_m"]) * scale
    pd = float(podium["depth_m"]) * scale
    ph = float(podium["height_m"]) * scale
    b.box("stone", (0, 0, ph * 0.45), (pw, pd, ph * 0.9))
    b.box("stone", (-pw * 0.46, -pd * 0.48, ph * 0.4), (22 * scale, 22 * scale, ph * 0.78))
    b.box("darkglass", (pw * 0.42, -pd * 0.46, ph * 0.42), (pw * 0.38, pd * 0.38, ph * 0.78))
    b.box("landmarkglass", (pw * 0.36, -pd * 0.48, ph * 0.3), (9 * scale, 6 * scale, ph * 0.48))
    b.box("darkglass", (0, pd * 0.42, ph * 0.38), (pw * 0.72, 6 * scale, ph * 0.55))
    b.box("silver", (0, 0, ph + 0.35 * scale), (pw * 0.96, pd * 0.9, 0.7 * scale))
    b.box("concrete", (0, 0, 0.6 * scale), (pw * 1.04, pd * 1.04, 1.2 * scale))
    b.frame = previous
    return {"id": "seg", "scale": scale, "max_height": h + 8 * scale, "source_spec": "data/landmarks/seg.json"}
