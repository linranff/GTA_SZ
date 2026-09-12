"""Shenzhen Bay Sports Center. Peanut lattice; east lobe has a through-oculus."""
from __future__ import annotations

import math


def _lobe(b, scale, cx, rx, ry, height, material, n=16):
    rings = []
    for z, k in ((0, 0.62), (height * 0.32, 1.0), (height * 0.62, 0.96), (height, 0.42)):
        rings.append((cx * scale, 0, z * scale, rx * k * scale, ry * k * scale))
    b.loft(material, rings, n=n, power=1)


def _standing_oculus(b, scale, cx, rx, height):
    rings = []
    for i in range(19):
        t = i / 18 * math.tau
        y = rx * 0.72 * scale * math.sin(t)
        z = height * 0.48 * scale + height * 0.42 * scale * math.cos(t)
        rings.append((cx * scale, y, z, 11 * scale, 9 * scale))
    b.loft("silver", rings, n=8, power=1)


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "bay-sports":
        raise ValueError("bay-sports builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    lobes = spec["lobes"]
    height = float(lobes["height_m"])
    west, east = lobes["west"], lobes["east"]
    _lobe(b, scale, west["cx"], west["rx"], west["ry"], height * 0.92, "silver")
    _lobe(b, scale, east["cx"], east["rx"] * 0.82, east["ry"] * 0.82, height * 0.86, "silver")
    _standing_oculus(b, scale, east["cx"], east["rx"], height * 0.9)
    wx, ex = west["cx"] * scale, east["cx"] * scale
    b.loft(
        "silver",
        [
            (wx * 0.2 + ex * 0.8, 0, height * 0.2 * scale, 26 * scale, 18 * scale),
            ((wx + ex) * 0.5, 0, height * 0.36 * scale, 34 * scale, 22 * scale),
            (wx * 0.8 + ex * 0.2, 0, height * 0.2 * scale, 26 * scale, 18 * scale),
        ],
        n=12,
        power=1,
    )
    b.loft(
        "darkglass",
        [
            (ex, 0, 0.3 * scale, 20 * scale, 14 * scale),
            (ex, 0, height * 0.18 * scale, 22 * scale, 16 * scale),
        ],
        n=12,
        power=1,
    )
    for i in range(10):
        t = i / 9
        x = (west["cx"] + (east["cx"] - west["cx"]) * t) * scale
        b.tube("steel", (x, -22 * scale, 2 * scale), (x, 22 * scale, height * 0.64 * scale), 0.72 * scale, 5)
    b.box("concrete", (4 * scale, 0, 0.8 * scale), (150 * scale, 78 * scale, 1.6 * scale))
    b.frame = previous
    return {"id": "bay-sports", "scale": scale, "max_height": height * scale, "source_spec": "data/landmarks/bay-sports.json"}
