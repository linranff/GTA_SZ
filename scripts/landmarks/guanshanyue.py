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
    b.box("stone", (14 * s, 6 * s, height * 1.08 * s), (w * 0.595 * s, d * 0.616 * s, height * 0.16 * s))
    b.box("darkglass", (14 * s, 6 * s, height * 0.5 * s), (max(w * 0.08, 2.4) * s, d * 0.9 * s, height * 0.86 * s))
    for i in range(4):
        z = height * (0.28 + i * 0.16) * s
        b.box("steel", (14 * s, 6 * s, z), (w * 0.88 * s, d * 0.92 * s, 0.4 * s))
    b.box("landmarkglass", (-8 * s, -d * 1.08 * s, height * 0.5 * s), (42 * s, 8 * s, height * 0.98 * s))
    for i in range(12):
        x = (-27 + (i + 0.5) * 3.6) * s
        y = -d * 1.08 * s - 5.6 * s
        b.box("silver", (x, y, height * 0.48 * s), (3.0 * s, 3.0 * s, height * 0.9 * s))
    b.box("landmarkglass", (-10 * s, -d * 0.22 * s, height * 0.48 * s), (14 * s, d * 0.28 * s, height * 0.86 * s))
    b.box("concrete", (-8 * s, -d * 0.72 * s, 0.55 * s), (28 * s, 10 * s, 1.1 * s))
    # South door under the gold fascia; do not pull the round hall south.
    b.box("darkglass", (-3 * s, -d * 1.08 * s - 6.5 * s, height * 0.12 * s), (16 * s, 2.4 * s, 4.4 * s))
    # 关山月 gold fascia plus four plates; do not pull the round hall south.
    b.box("gold", (-3 * s, -d * 1.08 * s - 6.5 * s, height * 0.28 * s), (38 * s, 1.4 * s, 3.6 * s))
    for x in (-18 * s, -8 * s, 2 * s, 12 * s):
        b.box("civicred", (x, -d * 1.08 * s - 7.4 * s, height * 0.28 * s), (5.6 * s, 0.7 * s, 2.4 * s))
        b.box("led", (x, -d * 1.08 * s - 7.6 * s, height * 0.28 * s), (2.2 * s, 0.28 * s, 1.0 * s))
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
