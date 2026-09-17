"""Futian station ground plaza. Entrances and sunken court, not the underground hall."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "futian-station":
        raise ValueError("futian-station builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    s = scale
    plaza = spec["plaza"]
    sink = spec["sink"]
    pavilions = spec["pavilions"]
    canopy = spec["canopy"]
    pw, pd = float(plaza["width_m"]), float(plaza["depth_m"])
    b.box("stone", (0, pd * 0.28 * s, 0.18 * s), (pw * 0.95 * s, pd * 0.38 * s, 0.32 * s))
    b.box("stone", (0, -pd * 0.32 * s, 0.18 * s), (pw * 0.7 * s, pd * 0.22 * s, 0.32 * s))
    b.box("asphalt", (0, 0, 0.08 * s), (pw * 1.05 * s, 10 * s, 0.12 * s))
    b.box(
        "concrete",
        (0, -6 * s, -float(sink["down_m"]) * 0.5 * s),
        (float(sink["width_m"]) * s, float(sink["depth_m"]) * s, float(sink["down_m"]) * s),
    )
    b.box("landmarkglass", (0, -6 * s, 1.2 * s), ((float(sink["width_m"]) - 8) * s, 2.2 * s, 2.4 * s))
    b.box("silver", (0, -10 * s, 14.8 * s), (28 * s, 10 * s, 1.2 * s))
    b.box("landmarkglass", (0, -12 * s, 8.2 * s), (22 * s, 6 * s, 15.8 * s))
    # South entrance door under the gold fascia; do not move the canopy.
    b.box("darkglass", (0, -14.8 * s, 5.2 * s), (14 * s, 2.4 * s, 8.4 * s))
    # 福田站 gold fascia plus three plates on the south entrance; do not move the canopy.
    b.box("gold", (0, -14.8 * s, 10.4 * s), (20 * s, 2.0 * s, 4.8 * s))
    for x in (-6 * s, 0, 6 * s):
        b.box("civicred", (x, -16.0 * s, 10.4 * s), (4.8 * s, 0.8 * s, 2.4 * s))
        b.box("led", (x, -16.2 * s, 10.4 * s), (2.0 * s, 0.3 * s, 1.0 * s))
    count = int(pavilions["count"])
    spacing = float(pavilions["spacing_m"])
    start = -spacing * (count - 1) * 0.5
    height = float(pavilions["height_m"])
    for i in range(count):
        x = (start + i * spacing) * s
        y = 22 * s
        pw = (float(pavilions["width_m"]) + 9) * s
        pd = (float(pavilions["depth_m"]) + 6) * s
        ph = height * 1.72 * s
        b.box("landmarkglass", (x, y, height * 0.58 * s), (pw, pd, ph))
        b.box("darkglass", (x, y, height * 0.58 * s), (max(pw * 0.1, 2.2 * s), pd * 1.02, ph * 0.86))
        for j in range(3):
            z = ph * (0.28 + j * 0.22)
            b.box("steel", (x, y, z), (pw * 1.04, pd * 1.04, 0.4 * s))
        b.box("silver", (x, y, (height + 3.2) * s), ((float(pavilions["width_m"]) + 10) * s, (float(pavilions["depth_m"]) + 7) * s, 1.4 * s))
        b.tube("steel", (x, y - 4 * s, 0), (x, y, height * s), 0.18 * s, 5)
    b.box(
        "steel",
        (0, 22 * s, float(canopy["height_m"]) * s),
        (float(canopy["length_m"]) * s, 2.4 * s, 0.45 * s),
    )
    b.box("silver", (0, 22 * s, (float(canopy["height_m"]) + 0.6) * s), (float(canopy["width_m"]) * s, 10 * s, 0.4 * s))
    b.frame = previous
    return {
        "id": "futian-station",
        "scale": scale,
        "max_height": (float(canopy["height_m"]) + 0.8) * scale,
        "source_spec": "data/landmarks/futian-station.json",
        "scope": "ground-plaza-only",
    }
