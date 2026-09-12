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
    b.box("gold", (length * 0.08, 0, height * 0.72), (length * 0.22, beam * 0.32, height * 0.12))
    b.tube("steel", (length * 0.18, 0, height * 0.72), (length * 0.18, 0, height + 6 * scale), 0.35 * scale, 5)
    b.box("water", (0, -beam * 1.2, 1.1 * scale), (length * 1.12, beam * 1.5, 2.2 * scale))
    b.box("water", (0, beam * 1.35, 0.4 * scale), (length * 1.05, beam * 1.6, 0.8 * scale))
    b.frame = previous
    return {"id": "sea-world", "scale": scale, "max_height": height + 6 * scale, "source_spec": "data/landmarks/sea-world.json"}
