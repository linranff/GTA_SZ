"""Dongmen old street. Plaza plus low commercial blocks; not a tower."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "dongmen":
        raise ValueError("dongmen builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    plaza = spec["plaza"]
    pw, pd = float(plaza["width_m"]) * scale, float(plaza["depth_m"]) * scale
    b.box("pavement", (0, 0, 0.12 * scale), (pw, pd, 0.24 * scale))
    b.box("stone", (0, 0, 0.2 * scale), (14 * scale, 14 * scale, 0.28 * scale))
    max_h = 0
    for block in spec["blocks"]:
        h = float(block["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(block["east_m"]) * scale, float(block["north_m"]) * scale
        w, d = float(block["width_m"]) * scale, float(block["depth_m"]) * scale
        if block.get("id") == "south":
            gap = 28 * scale
            wing = (w - gap) * 0.5
            for sign in (-1, 1):
                wx = cx + sign * (wing * 0.5 + gap * 0.5)
                b.box(block["material"], (wx, cy, h * 0.5), (wing, d, h))
                b.box("darkglass", (wx, cy, h * 0.42), (wing * 0.9, d * 0.9, h * 0.7))
            continue
        b.box(block["material"], (cx, cy, h * 0.5), (w, d, h))
        b.box("darkglass", (cx, cy, h * 0.42), (w * 0.9, d * 0.9, h * 0.7))
    b.box("asphalt", (0, -pd * 0.85, 0.08 * scale), (pw * 1.4, 7 * scale, 0.14 * scale))
    gate_y = -pd * 1.08
    b.box("stone", (-10 * scale, gate_y, 6 * scale), (2.4 * scale, 2.2 * scale, 12 * scale))
    b.box("stone", (10 * scale, gate_y, 6 * scale), (2.4 * scale, 2.2 * scale, 12 * scale))
    b.box("gold", (0, gate_y, 13.2 * scale), (26 * scale, 3.2 * scale, 2.4 * scale))
    b.box("gold", (0, gate_y, 10.4 * scale), (18 * scale, 2.4 * scale, 1.6 * scale))
    b.frame = previous
    return {"id": "dongmen", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/dongmen.json"}
