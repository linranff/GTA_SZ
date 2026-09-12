"""Shenzhen Children's Palace. White arch, red fold, yellow drum; not Civic Center."""
from __future__ import annotations

import math


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "youth-palace":
        raise ValueError("youth-palace builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    red = spec["red_volume"]
    yellow = spec["yellow_volume"]
    arch = spec["arch"]
    s = scale
    b.box("concrete", (0, -8 * s, 0.5 * s), (120 * s, 90 * s, 1.0 * s))
    b.box(
        "civicred",
        (float(red["east_m"]) * s, (float(red["north_m"]) + 18) * s, float(red["height_m"]) * 0.5 * s),
        (float(red["width_m"]) * s, float(red["depth_m"]) * s, float(red["height_m"]) * s),
    )
    b.box(
        "civicred",
        ((float(red["east_m"]) - 8) * s, (float(red["north_m"]) + 18) * s, (float(red["height_m"]) + 4) * s),
        (18 * s, float(red["depth_m"]) * 0.7 * s, 8 * s),
    )
    cx, cy = float(yellow["east_m"]) * s, (float(yellow["north_m"]) + 16) * s
    rx, ry = float(yellow["rx_m"]) * s, float(yellow["ry_m"]) * s
    yh = float(yellow["height_m"]) * s
    b.loft("gold", [(cx, cy, 0, rx, ry), (cx, cy, yh, rx, ry)], n=16, power=1)
    span = float(arch["span_m"]) * s
    ah = float(arch["height_m"]) * s
    # Plaza photo: a rounded white barrel-arch in FRONT of the red/yellow volumes.
    fy = -22 * s
    arch_rings = []
    edge_rings = []
    for i in range(11):
        t = i / 10 * math.pi
        x = -span * 0.5 * math.cos(t)
        z = 3.2 * s + (ah - 3.2 * s) * math.sin(t)
        arch_rings.append((x, fy, z, 14 * s, 28 * s))
        edge_rings.append((x, fy - 4.2 * s, z + 1.6 * s, 5.6 * s, 12 * s))
    b.loft("silver", arch_rings, n=8, power=1)
    b.loft("steel", edge_rings, n=6, power=1)
    b.box("landmarkglass", (0, -6 * s, 6 * s), (14 * s, 16 * s, 12 * s))
    b.frame = previous
    return {
        "id": "youth-palace",
        "scale": scale,
        "max_height": max(float(red["height_m"]), float(yellow["height_m"])) * scale,
        "source_spec": "data/landmarks/youth-palace.json",
    }
