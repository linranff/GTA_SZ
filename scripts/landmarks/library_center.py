"""Shenzhen Library Central / 中心馆. Open-book glass leaves, not the concert hall."""
from __future__ import annotations

import math


def _leaf(b, lm, leaf, ribs, scale):
    yaw = math.radians(float(leaf["yaw_deg"]))
    previous = b.frame
    b.frame = (lm["x"] + float(leaf["east_m"]) * scale, lm["z"] + float(leaf["north_m"]) * scale, yaw)
    w = float(leaf["width_m"]) * scale
    d = float(leaf["depth_m"]) * scale
    h = float(leaf["height_m"]) * scale
    b.box("landmarkglass", (0, 0, h * 0.42), (w, d, h * 0.84))
    b.box("darkglass", (0, 0, h * 0.38), (w * 0.94, d * 0.94, h * 0.68))
    # Inward folded page ridge, not a chimney on the roof.
    b.loft(
        "landmarkglass",
        [
            (0, d * 0.46, h * 1.08, w * 0.46, d * 0.08),
            (0, d * 0.12, h * 0.92, w * 0.5, d * 0.22),
            (0, -d * 0.28, h * 0.78, w * 0.5, d * 0.18),
        ],
        n=6,
        power=1,
    )
    count = int(ribs)
    for i in range(count):
        t = (i + 0.5) / count
        y = -d * 0.5 + t * d
        for x in (-w * 0.5, w * 0.5):
            b.tube("silver", (x, y, 1.2 * scale), (x, y, h * 0.82), 0.16 * scale, 5)
    b.box("steel", (0, 0, h * 0.82), (w * 1.04, d * 1.02, 0.7 * scale))
    b.frame = previous


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "library-center":
        raise ValueError("library-center builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    b.box("stone", (0, 0, 0.8 * scale), (64 * scale, 72 * scale, 1.2 * scale))
    b.box("darkglass", (0, -10 * scale, 5 * scale), (12 * scale, 16 * scale, 10 * scale))
    b.frame = previous
    ribs = spec["ribs"]["count"]
    _leaf(b, lm, spec["west_leaf"], ribs, scale)
    _leaf(b, lm, spec["east_leaf"], ribs, scale)
    height = max(float(spec["west_leaf"]["height_m"]), float(spec["east_leaf"]["height_m"]))
    return {
        "id": "library-center",
        "scale": scale,
        "max_height": height * scale,
        "source_spec": "data/landmarks/library-center.json",
    }
