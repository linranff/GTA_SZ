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
    count = int(pavilions["count"])
    spacing = float(pavilions["spacing_m"])
    start = -spacing * (count - 1) * 0.5
    height = float(pavilions["height_m"])
    for i in range(count):
        x = (start + i * spacing) * s
        y = 22 * s
        b.box(
            "landmarkglass",
            (x, y, height * 0.58 * s),
            ((float(pavilions["width_m"]) + 3) * s, (float(pavilions["depth_m"]) + 2) * s, height * 1.16 * s),
        )
        b.box("silver", (x, y, (height + 1.2) * s), ((float(pavilions["width_m"]) + 8) * s, (float(pavilions["depth_m"]) + 6) * s, 1.1 * s))
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
