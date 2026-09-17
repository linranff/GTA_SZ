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
    # loft rx/ry are horizontal only. Hex-ish XZ cells, hex-packed, no ears.
    b.box("darkglass", (0, -width * 0.22, height * 0.3), (length * 0.7, 6 * scale, height * 0.22))
    cell_w, cell_h = 11.2 * scale, 7.2 * scale
    for row in range(5):
        # Larger XZ cells so 3/4 is honeycomb, not a south dot grid. Stay south of -width*0.42.
        y = -width * (0.56 if row % 2 == 0 else 0.48)
        xoff = 0.0 if row % 2 == 0 else cell_w * 0.5
        z = height * 0.16 + row * cell_h * 0.78
        cols = range(-4, 5) if row % 2 == 0 else range(-4, 4)
        for col in cols:
            x = col * cell_w * 0.92 + xoff
            if abs(x) > length * 0.34:
                continue
            b.box("steel", (x, y, z), (cell_w * 0.9, 2.4 * scale, cell_h * 0.42))
            b.box("steel", (x, y, z + cell_h * 0.26), (cell_w * 0.56, 2.4 * scale, cell_h * 0.26))
            b.box("steel", (x, y, z - cell_h * 0.26), (cell_w * 0.56, 2.4 * scale, cell_h * 0.26))
            b.box("darkglass", (x, y - 2.2 * scale, z), (cell_w * 0.72, 3.2 * scale, cell_h * 0.32))
            b.box("darkglass", (x, y - 2.2 * scale, z + cell_h * 0.24), (cell_w * 0.44, 3.2 * scale, cell_h * 0.2))
            b.box("darkglass", (x, y - 2.2 * scale, z - cell_h * 0.24), (cell_w * 0.44, 3.2 * scale, cell_h * 0.2))
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
