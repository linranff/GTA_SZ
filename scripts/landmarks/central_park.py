"""Shenzhen Central Park. North-south green belt in segments, not one lawn."""
from __future__ import annotations

import math


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "central-park":
        raise ValueError("central-park builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    belt = spec["belt"]
    count = int(belt["segment_count"])
    width = float(belt["segment_width_m"]) * scale
    depth = float(belt["segment_depth_m"]) * scale
    gap = float(belt["gap_m"]) * scale
    yaw = math.radians(float(belt.get("yaw_deg", 0)))
    c, s = math.cos(yaw), math.sin(yaw)
    pitch = depth + gap
    start = -((count - 1) * pitch) * 0.5
    for i in range(count):
        y0 = start + i * pitch
        cx, cy = -s * y0, c * y0
        b.box("park", (cx, cy, 0.18 * scale), (width, depth, 0.36 * scale))
        # Futian River suggestion along the east edge of each slab.
        rx, ry = cx + c * (width * 0.42), cy + s * (width * 0.42)
        b.box("water", (rx, ry, 0.7 * scale), (16 * scale, depth * 0.86, 1.2 * scale))
        for t in (-0.28, 0.28):
            tx, ty = cx + c * (width * t), cy + s * (width * t)
            b.tube("bark", (tx, ty, 0), (tx, ty, 10 * scale), 0.4 * scale, 5)
            b.loft("leaf", [(tx, ty, 7 * scale, 8.5 * scale, 8.5 * scale), (tx, ty, 18 * scale, 1.4 * scale, 1.4 * scale)], n=6)
        if i == 0:
            for t in (-0.22, 0.0, 0.22):
                local_y = y0 - depth * 0.72
                tx, ty = -s * local_y + c * (width * t), c * local_y + s * (width * t)
                b.tube("bark", (tx, ty, 0), (tx, ty, 12 * scale), 0.5 * scale, 5)
                b.loft("leaf", [(tx, ty, 8 * scale, 10 * scale, 10 * scale), (tx, ty, 20 * scale, 1.5 * scale, 1.5 * scale)], n=6)
        if i == 1:
            # Visitor pad on the south-of-center slab so the front camera
            # still sees it; the true south tip sat behind that camera.
            local_y = y0 - depth * 0.42
            px, py = -s * local_y, c * local_y
            b.box("stone", (px, py, 3.6 * scale), (36 * scale, 16 * scale, 7.2 * scale))
            b.box("darkglass", (px, py - 8.1 * scale, 1.8 * scale), (16 * scale, 2.4 * scale, 3.4 * scale))
            # 中心公园 four plates on the pad south face. Do not thicken water.
            sign_y = local_y - 8.2 * scale
            for t in (-0.36, -0.12, 0.12, 0.36):
                sx = -s * sign_y + c * (14 * t * scale)
                sy = c * sign_y + s * (14 * t * scale)
                b.box("civicred", (sx, sy, 3.8 * scale), (6.4 * scale, 0.8 * scale, 2.4 * scale))
                b.box("led", (sx - s * 0.2 * scale, sy + c * 0.2 * scale, 3.8 * scale), (2.6 * scale, 0.3 * scale, 1.0 * scale))
        if i < count - 1:
            gx, gy = -s * (y0 + depth * 0.5 + gap * 0.5), c * (y0 + depth * 0.5 + gap * 0.5)
            b.box("asphalt", (gx, gy, 0.12 * scale), (width * 1.05, gap * 0.7, 0.16 * scale))
    b.frame = previous
    return {
        "id": "central-park",
        "scale": scale,
        "max_height": 0.36 * scale,
        "source_spec": "data/landmarks/central-park.json",
    }
