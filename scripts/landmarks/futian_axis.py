"""Futian civic axis lawn. Not a substitute for civic, halls, or convention."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "futian-axis":
        raise ValueError("futian-axis builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    axis = spec["axis"]
    length = float(axis["length_m"]) * scale
    width = float(axis["width_m"]) * scale
    b.box("park", (0, 0, 0.12 * scale), (width, length, 0.22 * scale))
    b.box("pavement", (-width * 0.38, 0, 0.16 * scale), (18 * scale, length, 0.2 * scale))
    b.box("pavement", (width * 0.38, 0, 0.16 * scale), (18 * scale, length, 0.2 * scale))
    b.box("water", (0, 0, 0.7 * scale), (16 * scale, length * 0.62, 1.2 * scale))
    b.box("water", (0, -length * 0.48, 0.55 * scale), (width * 0.42, 14 * scale, 1.1 * scale))
    b.box("concrete", (0, length * 0.46, 0.18 * scale), (width * 0.35, 10 * scale, 0.28 * scale))
    for i in range(8):
        y = (-0.38 + i * 0.1) * length
        for sign in (-1, 1):
            x = sign * width * 0.28
            b.tube("bark", (x, y, 0), (x, y, 9 * scale), 0.4 * scale, 5)
            b.loft("leaf", [(x, y, 6 * scale, 6 * scale, 6 * scale), (x, y, 14 * scale, 1.2 * scale, 1.2 * scale)], n=6)
    for sign in (-1, 1, 0):
        x = sign * width * 0.16
        y = -length * 0.44
        b.tube("bark", (x, y, 0), (x, y, 11 * scale), 0.5 * scale, 5)
        b.loft("leaf", [(x, y, 7 * scale, 8 * scale, 8 * scale), (x, y, 16 * scale, 1.4 * scale, 1.4 * scale)], n=6)
    for sign in (-1, 1):
        x = sign * width * 0.22
        y = -length * 0.68
        b.tube("bark", (x, y, 0), (x, y, 12 * scale), 0.55 * scale, 5)
        b.loft("leaf", [(x, y, 8 * scale, 9 * scale, 9 * scale), (x, y, 18 * scale, 1.5 * scale, 1.5 * scale)], n=6)
    # Mid-axis plaza just south of the look-at point; the geographic south
    # pad sat behind the front camera on this long N-S lawn.
    plaza_y = -length * 0.08
    b.box("stone", (0, plaza_y, 2.2 * scale), (width * 0.32, 16 * scale, 4.4 * scale))
    # 福田中轴 four plates on the plaza south face. Do not thicken water.
    for x in (-12 * scale, -4 * scale, 4 * scale, 12 * scale):
        b.box("civicred", (x, plaza_y - 8.2 * scale, 2.8 * scale), (6.4 * scale, 0.8 * scale, 2.2 * scale))
        b.box("led", (x, plaza_y - 8.4 * scale, 2.8 * scale), (2.6 * scale, 0.3 * scale, 0.95 * scale))
    b.frame = previous
    return {
        "id": "futian-axis",
        "scale": scale,
        "max_height": 14 * scale,
        "source_spec": "data/landmarks/futian-axis.json",
    }
