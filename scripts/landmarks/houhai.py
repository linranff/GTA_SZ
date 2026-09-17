"""Houhai / Super HQ waterfront district marker. Not Beijing Houhai."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "houhai":
        raise ValueError("houhai builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    water = spec["water"]
    ww, wd = float(water["width_m"]) * scale, float(water["depth_m"]) * scale
    b.box("water", (0, float(water["south_m"]) * scale, 0.7 * scale), (ww, wd, 1.4 * scale))
    b.box("water", (0, float(water["south_m"]) * scale - wd * 0.22, 0.55 * scale), (ww * 0.55, 22 * scale, 1.1 * scale))
    b.box("park", (0, float(water["south_m"]) * scale + wd * 0.62, 0.12 * scale), (ww, 10 * scale, 0.18 * scale))
    max_h = 0
    for block in spec["blocks"]:
        h = float(block["height_m"]) * scale
        max_h = max(max_h, h)
        cx, cy = float(block["east_m"]) * scale, float(block["north_m"]) * scale
        w, d = float(block["width_m"]) * scale, float(block["depth_m"]) * scale
        b.box(block["material"], (cx, cy, h * 0.5), (w, d, h))
        if h > 18 * scale:
            b.box(block["material"], (cx, cy, h + h * 0.08), (w * 0.7, d * 0.7, h * 0.16))
        b.box("darkglass", (cx, cy, h * 0.5), (max(w * 0.1, 2.4 * scale), d * 1.02, h * 0.9))
        if block["material"] in ("silver", "concrete"):
            b.box("darkglass", (cx, cy - d * 0.52, 2.4 * scale), (min(w * 0.18, 6 * scale), 2.4 * scale, 3.2 * scale))
            b.box("civicred", (cx, cy - d * 0.52, 5.2 * scale), (min(w * 0.36, 9 * scale), 0.7 * scale, 1.8 * scale))
            b.box("led", (cx, cy - d * 0.54, 5.2 * scale), (min(w * 0.14, 3.4 * scale), 0.28 * scale, 0.75 * scale))
    b.box("asphalt", (0, 8 * scale, 0.08 * scale), (ww * 0.9, 8 * scale, 0.14 * scale))
    for ex, h, mat in ((-48, 92, "landmarkglass"), (8, 118, "silver"), (64, 84, "darkglass")):
        cx, cy = ex * scale, -44 * scale
        hh = h * scale
        b.loft(
            mat,
            [
                (cx, cy, 0, 12 * scale, 9 * scale),
                (cx, cy, hh * 0.78, 11 * scale, 8.2 * scale),
                (cx, cy, hh, 7.4 * scale, 5.6 * scale),
            ],
            n=8,
            power=1,
        )
        for i in range(6):
            t = 0.16 + i * 0.12
            z = hh * t
            if t <= 0.78:
                u = t / 0.78
                rx = (12 + (11 - 12) * u) * 1.04 * scale
                ry = (9 + (8.2 - 9) * u) * 1.04 * scale
            else:
                u = (t - 0.78) / 0.22
                rx = (11 + (7.4 - 11) * u) * 1.04 * scale
                ry = (8.2 + (5.6 - 8.2) * u) * 1.04 * scale
            b.loft(
                "steel",
                [(cx, cy, z, rx, ry), (cx, cy, z + 0.55 * scale, rx, ry)],
                n=8,
                power=1,
            )
        b.box("landmarkglass", (cx, cy - 8 * scale, hh * 0.42), (16 * scale, 3.6 * scale, hh * 0.62))
    # Waterfront podium so the three HQ shafts read as one cluster. Do not thicken water.
    b.box("stone", (8 * scale, -54 * scale, 5.6 * scale), (128 * scale, 18 * scale, 11.2 * scale))
    b.box("landmarkglass", (8 * scale, -62 * scale, 4.8 * scale), (110 * scale, 5.2 * scale, 7.6 * scale))
    # Podium door under the gold fascia; do not thicken water.
    b.box("darkglass", (8 * scale, -64.4 * scale, 2.4 * scale), (28 * scale, 2.4 * scale, 4.4 * scale))
    # 后海 gold fascia plus four plates on the glass south face; do not thicken water.
    b.box("gold", (8 * scale, -64.4 * scale, 5.6 * scale), (110 * scale, 1.6 * scale, 5.2 * scale))
    for xf in (-18 * scale, -6 * scale, 6 * scale, 18 * scale):
        b.box("civicred", (8 * scale + xf, -65.3 * scale, 5.6 * scale), (8.4 * scale, 0.8 * scale, 3.2 * scale))
        b.box("led", (8 * scale + xf, -65.5 * scale, 5.6 * scale), (3.4 * scale, 0.3 * scale, 1.4 * scale))
    b.frame = previous
    return {"id": "houhai", "scale": scale, "max_height": max_h, "source_spec": "data/landmarks/houhai.json"}
