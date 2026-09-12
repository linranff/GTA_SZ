"""Guan Shanyue Art Museum. Glass curtain wall plus beige stone wing; not Civic Center."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "guanshanyue":
        raise ValueError("guanshanyue builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    s = scale
    height = float(spec["height"]["value"])
    body = spec["body"]
    hall = spec["round_hall"]
    w, d = float(body["width_m"]), float(body["depth_m"])
    radius = float(hall["radius_m"])
    hall_h = float(hall["height_m"])
    b.box("stone", (14 * s, 6 * s, height * 0.5 * s), (w * 0.85 * s, d * 0.88 * s, height * s))
    b.box("landmarkglass", (-8 * s, -d * 0.62 * s, height * 0.5 * s), (42 * s, 8 * s, height * 0.98 * s))
    for i in range(12):
        x = (-27 + (i + 0.5) * 3.6) * s
        b.tube("silver", (x, -d * 0.68 * s, 1.2 * s), (x, -d * 0.68 * s, height * 0.92 * s), 0.2 * s, 5)
    b.box("landmarkglass", (-10 * s, -d * 0.22 * s, height * 0.48 * s), (14 * s, d * 0.28 * s, height * 0.86 * s))
    b.box("concrete", (-8 * s, -d * 0.72 * s, 0.55 * s), (28 * s, 10 * s, 1.1 * s))
    b.loft(
        "stone",
        [
            (8 * s, 12 * s, 0, radius * s, radius * s),
            (8 * s, 12 * s, hall_h * s, radius * 0.92 * s, radius * 0.92 * s),
        ],
        n=16,
        power=1,
    )
    b.box("concrete", (0, -4 * s, 0.5 * s), ((w + 16) * s, (d + 20) * s, 1.0 * s))
    b.box("park", (0, 22 * s, 0.2 * s), ((w + 8) * s, 18 * s, 0.35 * s))
    b.frame = previous
    return {
        "id": "guanshanyue",
        "scale": scale,
        "max_height": hall_h * scale,
        "source_spec": "data/landmarks/guanshanyue.json",
    }
