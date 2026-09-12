"""Shenzhen North station. Long-span shed; not Futian underground station."""
from __future__ import annotations

import math


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "shenzhen-north":
        raise ValueError("shenzhen-north builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    shed = spec["shed"]
    w, d, h = float(shed["width_m"]) * scale, float(shed["depth_m"]) * scale, float(shed["height_m"]) * scale
    plaza = spec["plaza"]
    b.box("concrete", (0, 0, 4 * scale), (w, d, 8 * scale))
    b.box("darkglass", (0, 0, h * 0.42), (w * 0.92, d * 0.72, h * 0.38))
    b.loft(
        "silver",
        [
            (0, -d * 0.12, h * 0.48, w * 0.6, d * 0.5),
            (0, 0, h * 1.28, w * 0.5, d * 0.4),
            (0, d * 0.08, h * 0.56, w * 0.5, d * 0.4),
        ],
        n=12,
        power=1.2,
    )
    pw, pd = float(plaza["width_m"]) * scale, float(plaza["depth_m"]) * scale
    b.box("pavement", (float(plaza["east_m"]) * scale, -d * 0.55, 0.35 * scale), (pw, pd * 0.55, 0.7 * scale))
    b.box("pavement", (-w * 0.72, -d * 0.2, 0.28 * scale), (pw * 0.55, pd * 0.55, 0.56 * scale))
    b.box("pavement", (w * 0.72, -d * 0.2, 0.28 * scale), (pw * 0.55, pd * 0.55, 0.56 * scale))
    fascia = []
    for i in range(7):
        t = i / 6
        x = (-0.5 + t) * w * 0.96
        z = h * (0.62 + math.sin(t * math.pi) * 0.55)
        fascia.append((x, -d * 0.48, z, 10 * scale, 3.2 * scale))
    b.loft("silver", fascia, n=6, power=1)
    for x in (-w * 0.38, -w * 0.12, w * 0.12, w * 0.38):
        b.box("steel", (x, -d * 0.48, h * 0.4), (3.2 * scale, 3.2 * scale, h * 0.78))
    b.box("asphalt", (0, -d * 0.72, 0.08 * scale), (w * 1.1, 16 * scale, 0.14 * scale))
    b.frame = previous
    return {
        "id": "shenzhen-north",
        "scale": scale,
        "max_height": h,
        "source_spec": "data/landmarks/shenzhen-north.json",
        "coverage": "outside",
    }
