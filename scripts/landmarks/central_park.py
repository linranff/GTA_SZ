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
            b.loft("leaf", [(tx, ty, 7 * scale, 7 * scale, 7 * scale), (tx, ty, 16 * scale, 1.2 * scale, 1.2 * scale)], n=6)
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
