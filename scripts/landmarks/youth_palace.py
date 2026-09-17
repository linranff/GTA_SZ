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
    rcx = float(red["east_m"]) * s
    rcy = (float(red["north_m"]) + 18) * s
    rw = float(red["width_m"]) * s
    rd = float(red["depth_m"]) * s
    rh = float(red["height_m"]) * s
    b.box("civicred", (rcx, rcy, rh * 0.5), (rw, rd, rh))
    b.box("darkglass", (rcx, rcy, rh * 0.5), (max(rw * 0.08, 2.4 * s), rd * 1.02, rh * 0.86))
    for i in range(4):
        z = rh * (0.28 + i * 0.16)
        b.box("steel", (rcx, rcy, z), (rw * 1.04, rd * 1.04, 0.45 * s))
    b.box(
        "civicred",
        ((float(red["east_m"]) - 8) * s, (float(red["north_m"]) + 18) * s, (float(red["height_m"]) + 4) * s),
        (18 * s, float(red["depth_m"]) * 0.7 * s, 8 * s),
    )
    cx, cy = float(yellow["east_m"]) * s, (float(yellow["north_m"]) + 16) * s
    rx, ry = float(yellow["rx_m"]) * s, float(yellow["ry_m"]) * s
    yh = float(yellow["height_m"]) * s
    b.loft("gold", [(cx, cy, 0, rx, ry), (cx, cy, yh, rx, ry)], n=16, power=1)
    # 黄鼓南皮门洞和三牌；3/4 从拱侧看见。不再给拱下三牌加层。
    drum_south = cy - ry - 0.35 * s
    b.box("darkglass", (cx, drum_south, 2.8 * s), (10 * s, 2.4 * s, 4.8 * s))
    for xoff in (-8 * s, 0, 8 * s):
        b.box("civicred", (cx + xoff, drum_south - 0.15 * s, yh * 0.42), (6.4 * s, 0.8 * s, 2.8 * s))
        b.box("led", (cx + xoff, drum_south - 0.35 * s, yh * 0.42), (2.6 * s, 0.3 * s, 1.2 * s))
    span = float(arch["span_m"]) * s
    ah = float(arch["height_m"]) * s
    # Plaza photo: a rounded white barrel-arch in FRONT of the red/yellow volumes.
    fy = -36 * s
    arch_rings = []
    edge_rings = []
    for i in range(13):
        t = i / 12 * math.pi
        x = -span * 0.5 * math.cos(t)
        z = 3.2 * s + (ah - 3.2 * s) * math.sin(t)
        arch_rings.append((x, fy, z, 8.4 * s, 5.4 * s))
        edge_rings.append((x, fy - 2.6 * s, z + 0.8 * s, 3.0 * s, 3.2 * s))
    b.loft("silver", arch_rings, n=8, power=1)
    b.loft("steel", edge_rings, n=6, power=1)
    b.box("silver", (-span * 0.48, fy, ah * 0.24), (15.2 * s, 11.4 * s, ah * 0.46))
    b.box("silver", (span * 0.48, fy, ah * 0.24), (15.2 * s, 11.4 * s, ah * 0.46))
    b.box("darkglass", (0, fy - 8 * s, ah * 0.22), (span * 0.62, 6.4 * s, ah * 0.36))
    # 少年宫 gold fascia plus three plates; keep fy with the arch.
    b.box("gold", (0, fy - 10.4 * s, ah * 0.28), (42 * s, 1.6 * s, 5.2 * s))
    for x in (-14 * s, 0, 14 * s):
        b.box("civicred", (x, fy - 11.5 * s, ah * 0.28), (8.4 * s, 1.2 * s, 3.8 * s))
        b.box("led", (x, fy - 11.7 * s, ah * 0.28), (3.4 * s, 0.5 * s, 1.8 * s))
    b.box("landmarkglass", (0, -6 * s, 6 * s), (14 * s, 16 * s, 12 * s))
    b.frame = previous
    return {
        "id": "youth-palace",
        "scale": scale,
        "max_height": max(float(red["height_m"]), float(yellow["height_m"])) * scale,
        "source_spec": "data/landmarks/youth-palace.json",
    }
