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
    b.box("water", (0, -length * 0.48, 3.2 * scale), (width * 0.42, 14 * scale, 6.2 * scale))
    b.box("concrete", (0, length * 0.46, 0.18 * scale), (width * 0.35, 10 * scale, 0.28 * scale))
    for i in range(8):
        y = (-0.38 + i * 0.1) * length
        for sign in (-1, 1):
            x = sign * width * 0.28
            b.tube("bark", (x, y, 0), (x, y, 9 * scale), 0.4 * scale, 5)
            b.loft("leaf", [(x, y, 6 * scale, 6 * scale, 6 * scale), (x, y, 14 * scale, 1.2 * scale, 1.2 * scale)], n=6)
    b.frame = previous
    return {
        "id": "futian-axis",
        "scale": scale,
        "max_height": 14 * scale,
        "source_spec": "data/landmarks/futian-axis.json",
    }
