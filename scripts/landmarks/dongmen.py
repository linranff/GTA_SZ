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
                for i in range(3):
                    z = h * (0.32 + i * 0.18)
                    b.box("steel", (wx, cy, z), (wing * 1.04, d * 1.04, 0.4 * scale))
                # Shop neon and a stone-face door under it; not a second gate.
                b.box("darkglass", (wx, cy - d * 0.52, 2.2 * scale), (wing * 0.16, 2.4 * scale, 2.8 * scale))
                b.box("civicred", (wx, cy - d * 0.52, h * 0.22), (wing * 0.42, 0.7 * scale, 1.8 * scale))
                b.box("led", (wx, cy - d * 0.54, h * 0.22), (wing * 0.16, 0.28 * scale, 0.75 * scale))
            continue
        b.box(block["material"], (cx, cy, h * 0.5), (w, d, h))
        if h > 12 * scale:
            b.box(block["material"], (cx, cy, h + h * 0.08), (w * 0.7, d * 0.7, h * 0.16))
        b.box("darkglass", (cx, cy, h * 0.42), (w * 0.9, d * 0.9, h * 0.7))
        b.box("darkglass", (cx, cy, h * 0.5), (max(w * 0.1, 2.4 * scale), d * 1.02, h * 0.9))
        for i in range(3):
            z = h * (0.32 + i * 0.18)
            b.box("steel", (cx, cy, z), (w * 1.04, d * 1.04, 0.4 * scale))
        if block.get("id") in ("east", "west"):
            b.box("darkglass", (cx, cy - d * 0.52, 2.2 * scale), (min(w * 0.22, 5.2 * scale), 2.4 * scale, 3.0 * scale))
            b.box("civicred", (cx, cy - d * 0.52, 4.2 * scale), (min(w * 0.55, 10 * scale), 0.7 * scale, 1.8 * scale))
            b.box("led", (cx, cy - d * 0.54, 4.2 * scale), (min(w * 0.22, 4 * scale), 0.28 * scale, 0.75 * scale))
    b.box("asphalt", (0, -pd * 0.85, 0.08 * scale), (pw * 1.4, 7 * scale, 0.14 * scale))
    for x in (-48 * scale, -24 * scale, 24 * scale, 48 * scale):
        b.box("stone", (x, -pd * 0.92, 6.4 * scale), (3.2 * scale, 3.2 * scale, 12.8 * scale))
        b.box("civicred", (x, -pd * 0.92, 13.2 * scale), (3.6 * scale, 3.6 * scale, 1.8 * scale))
    gate_y = -pd * 1.68
    b.box("stone", (-11 * scale, gate_y, 7 * scale), (4.2 * scale, 3.8 * scale, 14 * scale))
    b.box("stone", (11 * scale, gate_y, 7 * scale), (4.2 * scale, 3.8 * scale, 14 * scale))
    b.box("darkglass", (0, gate_y, 6.2 * scale), (18 * scale, 3.2 * scale, 10.4 * scale))
    b.box("gold", (0, gate_y, 15.2 * scale), (36 * scale, 8.8 * scale, 3.8 * scale))
    b.box("gold", (0, gate_y, 11.6 * scale), (26 * scale, 7.2 * scale, 2.4 * scale))
    b.box("gold", (0, gate_y, 8.4 * scale), (20 * scale, 6.2 * scale, 1.6 * scale))
    # 东门老街 four character plates, proud of the lintel south face only.
    sign_y = gate_y - 4.55 * scale
    for x in (-13.2 * scale, -4.4 * scale, 4.4 * scale, 13.2 * scale):
        b.box("civicred", (x, sign_y, 15.2 * scale), (6.2 * scale, 0.7 * scale, 2.6 * scale))
        b.box("led", (x, sign_y - 0.18 * scale, 15.2 * scale), (4.8 * scale, 0.32 * scale, 1.7 * scale))
    b.frame = previous
    return {"id": "dongmen", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/dongmen.json"}
