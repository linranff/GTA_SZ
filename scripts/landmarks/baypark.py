"""Shenzhen Bay Park. Shoreline / promenade / water, not a tower."""
from __future__ import annotations

import math


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "baypark":
        raise ValueError("baypark builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    fp = spec["first_pass"]
    along = float(fp["along_m"]) * scale
    land = float(fp["land_depth_m"]) * scale
    water_w = float(fp["water_width_m"]) * scale
    path_w = float(fp["promenade_width_m"]) * scale
    yaw = math.radians(float(fp.get("yaw_deg", 0)))
    c, s = math.cos(yaw), math.sin(yaw)

    def rot(x, y):
        return (x * c - y * s, x * s + y * c)

    park_cx, park_cy = rot(0, land * 0.5)
    path_cx, path_cy = rot(0, 0)
    water_cx, water_cy = rot(0, -(water_w * 0.5 + path_w * 0.5))
    b.loft(
        "park",
        [
            (park_cx, park_cy, 0.05 * scale, along * 0.5, land * 0.5),
            (park_cx, park_cy, 0.35 * scale, along * 0.5, land * 0.5),
        ],
        n=10,
        power=1.6,
    )
    path = []
    for i in range(9):
        t = i / 8
        x = (-0.5 + t) * along
        y = math.sin(t * math.pi) * 22 * scale
        px, py = rot(x, y)
        path.append((px, py, 0.22 * scale, 16 * scale, path_w * 0.6))
    b.loft("concrete", path, n=6, power=1)
    b.loft(
        "water",
        [
            (water_cx, water_cy, 0.02 * scale, along * 0.52, water_w * 0.5),
            (water_cx, water_cy, 1.15 * scale, along * 0.52, water_w * 0.5),
        ],
        n=10,
        power=1.4,
    )
    wall_cx, wall_cy = rot(0, -(water_w * 0.82 + path_w))
    b.box("water", (wall_cx, wall_cy, 0.55 * scale), (along * 0.55, 28 * scale, 1.1 * scale))
    for t in (-0.4, -0.2, 0.0, 0.2, 0.4):
        x = along * t
        y = math.sin((t + 0.5) * math.pi) * 22 * scale
        px, py = rot(x, y + path_w * 1.4)
        b.tube("bark", (px, py, 0), (px, py, 12 * scale), 0.45 * scale, 5)
        b.loft("leaf", [(px, py, 8 * scale, 9 * scale, 9 * scale), (px, py, 18 * scale, 1.3 * scale, 1.3 * scale)], n=6)
    for t in (-0.32, 0.28):
        sx, sy = rot(along * t, path_w * 0.9)
        b.box("stone", (sx, sy, 0.35 * scale), (18 * scale, 4.5 * scale, 0.7 * scale))
    # 湾公园 four plates on the two existing stones. Do not thicken water.
    for t, offs in ((-0.32, (-0.35, 0.35)), (0.28, (-0.35, 0.35))):
        for u in offs:
            sx, sy = rot(along * t + 6 * u * scale, path_w * 0.9 - 1.2 * scale)
            b.box("civicred", (sx, sy, 2.4 * scale), (6.4 * scale, 0.8 * scale, 2.2 * scale))
            b.box("led", (*rot(along * t + 6 * u * scale, path_w * 0.9 - 1.4 * scale), 2.4 * scale), (2.6 * scale, 0.3 * scale, 0.95 * scale))
    for t in (-0.28, 0.0, 0.28):
        px, py = rot(along * t, -(water_w * 0.35 + path_w * 1.6))
        b.tube("bark", (px, py, 0), (px, py, 14 * scale), 0.55 * scale, 5)
        b.loft("leaf", [(px, py, 9 * scale, 11 * scale, 11 * scale), (px, py, 22 * scale, 1.5 * scale, 1.5 * scale)], n=6)
    for t in (-0.4, -0.14, 0.14, 0.4):
        px, py = rot(along * t, -(water_w * 0.52 + path_w * 1.9))
        b.tube("bark", (px, py, 0), (px, py, 15 * scale), 0.6 * scale, 5)
        b.loft("leaf", [(px, py, 10 * scale, 12 * scale, 12 * scale), (px, py, 24 * scale, 1.6 * scale, 1.6 * scale)], n=6)
    b.frame = previous
    return {
        "id": "baypark",
        "scale": scale,
        "max_height": 0.7 * scale,
        "source_spec": "data/landmarks/baypark.json",
    }
