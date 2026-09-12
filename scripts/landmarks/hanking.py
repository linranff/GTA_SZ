"""Hanking Center as seen in Commons: one polygonal glass shaft plus crystal podium."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "hanking":
        raise ValueError("hanking builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    h = float(spec["height"]["value"]) * scale
    shaft = spec["shaft"]
    rx = float(shaft["rx_m"]) * scale
    ry = float(shaft["ry_m"]) * scale
    b.loft(
        "landmarkglass",
        [
            (0, 0, 0, rx, ry),
            (0, 0, h * 0.48, rx * 0.96, ry * 0.9),
            (8.4 * scale, 2.2 * scale, h * 0.72, rx * 0.62, ry * 0.42),
            (14.8 * scale, 0, h, rx * 0.26, ry * 0.18),
        ],
        n=int(shaft.get("sides", 6)),
        power=1.15,
    )
    podium = spec["podium"]
    pw, pd, ph = float(podium["width_m"]) * scale, float(podium["depth_m"]) * scale, float(podium["height_m"]) * scale
    b.loft(
        "darkglass",
        [
            (0, -10 * scale, 0, pw * 1.22, pd * 1.05),
            (12 * scale, -28 * scale, ph * 0.7, pw * 0.88, pd * 0.7),
            (28 * scale, -52 * scale, ph * 1.85, pw * 0.36, pd * 0.28),
        ],
        n=6,
        power=1.3,
    )
    b.box("concrete", (0, 0, 0.8 * scale), (pw * 1.15, pd * 1.1, 1.6 * scale))
    b.frame = previous
    return {"id": "hanking", "scale": scale, "max_height": h, "source_spec": "data/landmarks/hanking.json"}
