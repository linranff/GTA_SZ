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
        y = -d * (0.94 if i % 2 == 0 else 0.10)
        south.append((xf * w, y))
        north.append((xf * w, y + d * 0.24))
    ring = south + list(reversed(north))
    ring.append(ring[0])
    b.footprint("landmarkglass", ring, 0.4 * scale, h * 0.94)
    for zf in (0.24, 0.44, 0.64, 0.82):
        z0 = h * zf
        b.footprint("steel", ring, z0, z0 + 0.55 * scale, scale=1.012)
    for x, y in south:
        b.box("silver", (x, y - 4.2 * scale, h * 0.5), (3.4 * scale, 3.8 * scale, h * 0.9))
    # 大剧院 four plates on the silver column south faces, not in the fold recesses.
    for i, (x, y) in enumerate(south):
        if i % 2:
            continue
        col_y = y - 4.2 * scale
        b.box("civicred", (x, col_y - 2.0 * scale, h * 0.28), (6.4 * scale, 0.8 * scale, 2.8 * scale))
        b.box("led", (x, col_y - 2.2 * scale, h * 0.28), (2.6 * scale, 0.3 * scale, 1.2 * scale))
    b.box("concrete", (0, 0, 0.5 * scale), (w * 1.1, d * 1.15, 1.0 * scale))
    # South ground void against the fold; not a roof hat and not a south-shifted sign.
    b.box("darkglass", (0, -d * 0.96, 3.1 * scale), (w * 0.16, 6.2 * scale, 6.0 * scale))
    b.frame = previous
    return {"id": "grand-theater", "scale": scale, "max_height": h * 1.08, "source_spec": "data/landmarks/grand-theater.json"}
