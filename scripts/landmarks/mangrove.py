"""Futian mangrove. Mudflat and vegetation belt; no pier."""
from __future__ import annotations

import math


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "mangrove":
        raise ValueError("mangrove builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    belt = spec["belt"]
    along = float(belt["along_m"]) * scale
    veg = float(belt["vegetation_depth_m"]) * scale
    mud = float(belt["mudflat_depth_m"]) * scale
    yaw = math.radians(float(belt.get("yaw_deg", 0)))
    c, s = math.cos(yaw), math.sin(yaw)

    def rot(x, y):
        return (x * c - y * s, x * s + y * c)

    land_cx, land_cy = rot(0, veg * 0.55)
    veg_cx, veg_cy = rot(0, 0)
    mud_cx, mud_cy = rot(0, -(mud * 0.5 + veg * 0.15))
    b.loft(
        "park",
        [
            (land_cx, land_cy, 0.05 * scale, along * 0.5, veg * 0.45),
            (land_cx, land_cy, 0.3 * scale, along * 0.5, veg * 0.45),
        ],
        n=10,
        power=1.7,
    )
    # Canopy as three leaf bands, not individual trees or a dock.
    for t in (-0.36, -0.12, 0.12, 0.36):
        vx, vy = rot(along * t, veg * 0.05)
        b.loft(
            "leaf",
            [
                (vx, vy, 0.6 * scale, along * 0.14, veg * 0.26),
                (vx, vy, 5.5 * scale, along * 0.12, veg * 0.2),
                (vx, vy, 8.0 * scale, along * 0.04, veg * 0.06),
            ],
            n=8,
            power=1.4,
        )
    for t in (-0.2, 0.22):
        vx, vy = rot(along * t * 0.55, veg * 0.42)
        b.loft(
            "leaf",
            [
                (vx, vy, 0.5 * scale, along * 0.1, veg * 0.18),
                (vx, vy, 4.2 * scale, along * 0.08, veg * 0.14),
                (vx, vy, 6.4 * scale, along * 0.03, veg * 0.05),
            ],
            n=8,
            power=1.4,
        )
    b.loft(
        "water",
        [
            (mud_cx, mud_cy, 0.02 * scale, along * 0.52, mud * 0.5),
            (mud_cx, mud_cy, 1.2 * scale, along * 0.52, mud * 0.5),
        ],
        n=10,
        power=1.5,
    )
    wall_cx, wall_cy = rot(0, -(mud * 0.95 + veg * 0.15))
    b.box("water", (wall_cx, wall_cy, 0.55 * scale), (along * 0.52, 28 * scale, 1.1 * scale))
    # 红树林 four plates on the south canopy fascia; not a pier.
    fascia_y = -veg * 0.06
    gx, gy = rot(0, fascia_y)
    b.box("gold", (gx, gy, 3.2 * scale), (36 * scale, 2.2 * scale, 5.2 * scale))
    for along_off in (-14.0, -4.6, 4.6, 14.0):
        sx, sy = rot(along_off * scale, fascia_y - 1.2 * scale)
        b.box("civicred", (sx, sy, 3.4 * scale), (7.2 * scale, 0.8 * scale, 2.6 * scale))
        b.box("led", (*rot(along_off * scale, fascia_y - 1.4 * scale), 3.4 * scale), (2.8 * scale, 0.3 * scale, 1.1 * scale))
    for t in (-0.24, 0.0, 0.24):
        vx, vy = rot(along * t, -(mud * 0.22 + veg * 0.2))
        b.loft(
            "leaf",
            [
                (vx, vy, 0.8 * scale, along * 0.1, veg * 0.16),
                (vx, vy, 6.2 * scale, along * 0.08, veg * 0.12),
                (vx, vy, 10.0 * scale, along * 0.03, veg * 0.04),
            ],
            n=8,
            power=1.4,
        )
    for t in (-0.36, -0.12, 0.12, 0.36):
        vx, vy = rot(along * t, -(mud * 0.55 + veg * 0.4))
        b.loft(
            "leaf",
            [
                (vx, vy, 0.9 * scale, along * 0.09, veg * 0.14),
                (vx, vy, 6.8 * scale, along * 0.07, veg * 0.1),
                (vx, vy, 11.2 * scale, along * 0.03, veg * 0.04),
            ],
            n=8,
            power=1.4,
        )
    b.frame = previous
    return {
        "id": "mangrove",
        "scale": scale,
        "max_height": 8.0 * scale,
        "source_spec": "data/landmarks/mangrove.json",
        "no_pier": True,
    }
