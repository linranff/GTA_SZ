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
    b.box("darkglass", (gx * s, gy * s + 10 * s, gh * 0.82 * s + gh * 0.064 * s), (gw * 0.616 * s, gd * 0.434 * s, gh * 0.128 * s))
    b.box("silver", (gx * s, gy * s + 10 * s, gh * 0.42 * s), (2.6 * s, gd * 0.64 * s, gh * 0.76 * s))
    for i in range(4):
        z = gh * (0.22 + i * 0.16) * s
        b.box("steel", (gx * s, gy * s + 10 * s, z), (gw * 0.92 * s, gd * 0.65 * s, 0.5 * s))
    b.loft(
        "gold",
        [
            (gx * s, gy * s - 16 * s, 0, gw * 0.4 * s, gd * 0.32 * s),
            (gx * s, gy * s - 13 * s, gh * 0.48 * s, gw * 0.36 * s, gd * 0.28 * s),
            (gx * s, gy * s - 7 * s, gh * 0.94 * s, gw * 0.22 * s, gd * 0.18 * s),
        ],
        n=8,
        power=1,
    )
    b.box(
        "landmarkglass",
        (float(lobby["east_m"]) * s, (float(lobby["north_m"]) - 6) * s, float(lobby["height_m"]) * 0.45 * s),
        (float(lobby["width_m"]) * s, 8 * s, float(lobby["height_m"]) * 0.7 * s),
    )
    b.box("darkglass", (0, -gd * 0.84 * s, 10 * s), (38 * s, 20 * s, 20 * s))
    # 音乐厅 three plates on the lower canopy south lip; do not move the canopy.
    for x in (-10 * s, 0, 10 * s):
        b.box("gold", (x, -gd * 1.22 * s - 7.1 * s, 9.6 * s), (7.6 * s, 1.0 * s, 2.2 * s))
        b.box("civicred", (x, -gd * 1.22 * s - 7.2 * s, 9.6 * s), (5.4 * s, 0.7 * s, 1.6 * s))
        b.box("led", (x, -gd * 1.22 * s - 7.3 * s, 9.6 * s), (2.2 * s, 0.3 * s, 0.7 * s))
    # Thin street canopy, not a thick hat in front of the hall.
    b.box("steel", (0, -gd * 1.08 * s, 12.4 * s), (52 * s, 22 * s, 1.4 * s))
    b.box("steel", (0, -gd * 1.22 * s, 9.6 * s), (36 * s, 14 * s, 1.0 * s))
    for x in (-14 * s, 14 * s):
        b.box("steel", (x, -gd * 1.16 * s, 5.2 * s), (2.6 * s, 2.6 * s, 10.2 * s))
    count = int(spec["fins"]["count"])
    gold_y = gy * s - 12 * s
    gold_d = gd * 0.62 * s
    south = gold_y - gold_d * 0.5 - 1.05 * s
    for i in range(count):
        t = (i + 0.5) / count
        x = (gx - gw * 0.39 + t * gw * 0.78) * s
        b.box("steel", (x, south, gh * 0.55 * s), (1.6 * s, 2.0 * s, gh * 0.68 * s))
    b.frame = previous
    return {
        "id": "concert-hall",
        "scale": scale,
        "max_height": gh * scale,
        "source_spec": "data/landmarks/concert-hall.json",
    }
