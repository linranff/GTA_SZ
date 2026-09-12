"""Shenzhen Concert Hall. Dark street hall and canopy; not the library book."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "concert-hall":
        raise ValueError("concert-hall builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    s = scale
    gold = spec["gold_hall"]
    lobby = spec["glass_lobby"]
    gx, gy = float(gold["east_m"]), float(gold["north_m"])
    gw, gd, gh = float(gold["width_m"]), float(gold["depth_m"]), float(gold["height_m"])
    b.box("concrete", (0, -8 * s, 0.5 * s), (110 * s, 80 * s, 1.0 * s))
    b.box("darkglass", (gx * s, gy * s + 10 * s, gh * 0.42 * s), (gw * 0.88 * s, gd * 0.62 * s, gh * 0.8 * s))
    b.box("gold", (gx * s, gy * s - 6 * s, gh * 0.55 * s), (gw * 0.7 * s, gd * 0.52 * s, gh * 0.72 * s))
    b.box(
        "landmarkglass",
        (float(lobby["east_m"]) * s, (float(lobby["north_m"]) - 6) * s, float(lobby["height_m"]) * 0.45 * s),
        (float(lobby["width_m"]) * s, 8 * s, float(lobby["height_m"]) * 0.7 * s),
    )
    b.box("darkglass", (0, -gd * 0.72 * s, 8 * s), (38 * s, 20 * s, 16 * s))
    # Thin street canopy, not a thick hat in front of the hall.
    b.box("steel", (0, -gd * 0.92 * s, 12.4 * s), (52 * s, 22 * s, 1.4 * s))
    b.box("steel", (0, -gd * 1.22 * s, 9.6 * s), (36 * s, 14 * s, 1.0 * s))
    for x in (-14 * s, 14 * s):
        b.box("steel", (x, -gd * 1.08 * s, 5.2 * s), (0.9 * s, 0.9 * s, 10.2 * s))
    count = int(spec["fins"]["count"])
    for i in range(count):
        t = (i + 0.5) / count
        x = (gx - gw * 0.5 + t * gw) * s
        b.tube("steel", (x, (gy - gd * 0.5) * s, 2 * s), (x, (gy - gd * 0.5) * s, gh * 0.88 * s), 0.16 * s, 5)
    b.frame = previous
    return {
        "id": "concert-hall",
        "scale": scale,
        "max_height": gh * scale,
        "source_spec": "data/landmarks/concert-hall.json",
    }
