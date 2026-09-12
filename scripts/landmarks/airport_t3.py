"""Bao'an Airport T3. Shortened Fuksas honeycomb tube; not the whole airfield."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "airport-t3":
        raise ValueError("airport-t3 builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    tube = spec["tube"]
    length = float(tube["length_m"]) * scale
    width = float(tube["width_m"]) * scale
    height = float(tube["height_m"]) * scale
    b.loft(
        "silver",
        [
            (-length * 0.48, 0, height * 0.14, width * 0.2, width * 0.18),
            (-length * 0.22, 0, height * 0.7, width * 0.46, width * 0.38),
            (0, 0, height * 0.84, width * 0.5, width * 0.42),
            (length * 0.22, 0, height * 0.68, width * 0.44, width * 0.36),
            (length * 0.48, 0, height * 0.14, width * 0.18, width * 0.16),
        ],
        n=18,
        power=1.2,
    )
    # loft rx/ry are horizontal only — vertical honeycomb must be XZ boxes, south of the eave.
    b.box("darkglass", (0, -width * 0.22, height * 0.3), (length * 0.7, 6 * scale, height * 0.22))
    for i in range(-3, 4):
        x = length * i * 0.11
        y = -width * 0.78
        z = height * 0.32
        w = 15 * scale
        hh = 12 * scale
        for zoff, wf, hf in (
            (0.0, 1.0, 0.36),
            (0.26, 0.8, 0.24),
            (-0.26, 0.8, 0.24),
            (0.44, 0.52, 0.18),
            (-0.44, 0.52, 0.18),
        ):
            b.box("steel", (x, y, z + hh * zoff), (w * wf * 1.12, 2.6 * scale, hh * hf))
            b.box("darkglass", (x, y - 2.2 * scale, z + hh * zoff), (w * wf, 4.2 * scale, hh * hf * 0.82))
    b.box("concrete", (0, 0, 0.8 * scale), (length * 0.95, width * 0.7, 1.6 * scale))
    b.box("asphalt", (0, -width * 0.95, 0.1 * scale), (length * 1.15, 18 * scale, 0.16 * scale))
    b.frame = previous
    return {
        "id": "airport-t3",
        "scale": scale,
        "max_height": height,
        "source_spec": "data/landmarks/airport-t3.json",
        "coverage": "outside",
    }
