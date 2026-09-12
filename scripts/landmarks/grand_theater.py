"""Shenzhen Grand Theater. Folded glass cube, not a tower."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "grand-theater":
        raise ValueError("grand-theater builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    form = spec["form"]
    w, d, h = float(form["width_m"]) * scale, float(form["depth_m"]) * scale, float(form["height_m"]) * scale
    # Hall sits north; south facade is one zigzag wall, not a colonnade.
    b.box("landmarkglass", (0, d * 0.28, h * 0.48), (w * 0.94, d * 0.52, h * 0.96))
    b.box("darkglass", (0, d * 0.32, h * 0.5), (w * 0.74, d * 0.34, h * 0.68))
    n = 8
    south = []
    north = []
    for i in range(n):
        xf = (i / (n - 1) - 0.5) * 0.96
        y = -d * (0.6 if i % 2 == 0 else 0.14)
        south.append((xf * w, y))
        north.append((xf * w, y + d * 0.24))
    ring = south + list(reversed(north))
    ring.append(ring[0])
    b.footprint("landmarkglass", ring, 0.4 * scale, h * 0.94)
    for x, y in south:
        b.box("silver", (x, y - 1.1 * scale, h * 0.5), (1.0 * scale, 1.3 * scale, h * 0.86))
    b.box("concrete", (0, 0, 0.5 * scale), (w * 1.1, d * 1.15, 1.0 * scale))
    b.frame = previous
    return {"id": "grand-theater", "scale": scale, "max_height": h * 1.08, "source_spec": "data/landmarks/grand-theater.json"}
