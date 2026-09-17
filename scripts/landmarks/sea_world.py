"""Minghua at Sea World. A ship hull, not a tower, not inside Shenzhen Bay Park."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "sea-world":
        raise ValueError("sea-world builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    hull = spec["hull"]
    length = float(hull["length_m"]) * scale
    beam = float(hull["beam_m"]) * scale
    height = float(hull["height_m"]) * scale
    b.loft(
        "silver",
        [
            (-length * 0.48, 0, 0, beam * 0.16, beam * 0.28),
            (-length * 0.28, 0, height * 0.42, beam * 0.52, beam * 0.58),
            (0, 0, height * 0.5, beam * 0.58, beam * 0.58),
            (length * 0.32, 0, height * 0.46, beam * 0.46, beam * 0.5),
            (length * 0.48, 0, height * 0.28, beam * 0.14, beam * 0.2),
        ],
        n=12,
        power=1,
    )
    b.box("darkglass", (-length * 0.06, 0, height * 0.52), (length * 0.55, beam * 0.62, height * 0.28))
    b.box("gold", (length * 0.08, 0, height * 0.76), (length * 0.26, beam * 0.36, height * 0.16))
    b.box("gold", (length * 0.12, -beam * 0.08, height * 0.98), (length * 0.14, beam * 0.22, height * 0.22))
    b.box("gold", (length * 0.1, -beam * 0.94, height * 0.82), (length * 0.22, 4.6 * scale, height * 0.22))
    b.box("steel", (length * 0.18, -beam * 0.22, height + 8 * scale), (3.6 * scale, 3.6 * scale, 20 * scale))
    b.box("steel", (length * 0.08, -beam * 0.18, height + 6 * scale), (2.4 * scale, 2.4 * scale, 14 * scale))
    b.box("darkglass", (-length * 0.18, -beam * 1.28, height * 0.62), (length * 0.22, 5.2 * scale, height * 0.16))
    b.box("water", (0, -beam * 1.45, 0.55 * scale), (length * 1.22, beam * 2.1, 1.1 * scale))
    b.box("water", (0, beam * 1.5, 0.5 * scale), (length * 1.1, beam * 1.8, 1.0 * scale))
    b.frame = previous
    return {"id": "sea-world", "scale": scale, "max_height": height + 6 * scale, "source_spec": "data/landmarks/sea-world.json"}
