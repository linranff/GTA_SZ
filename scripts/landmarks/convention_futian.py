"""Futian Convention Center. Super-long roof; not the Bao'an World Expo halls."""
from __future__ import annotations

import math


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "convention-futian":
        raise ValueError("convention-futian builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    s = scale
    length = float(spec["length_m"]["value"])
    width = float(spec["width_m"]["value"])
    height = float(spec["height_m"]["value"])
    roof = spec["roof"]
    thick = float(roof["thickness_m"])
    hang = float(roof["overhang_m"])
    hall_n = int(spec["halls"]["count"])
    hall_h = float(spec["halls"]["height_m"])
    b.box("concrete", (0, 0, 1.0 * s), (length * s, width * s, 2.0 * s))
    bay = length / hall_n
    for i in range(hall_n):
        x = (-length * 0.5 + (i + 0.5) * bay) * s
        material = "landmarkglass" if i in (0, hall_n - 1) else "concrete"
        hw, hd, hh = (bay - 6) * s, (width - 24) * s, hall_h * s
        b.box(material, (x, 0, hall_h * 0.5 * s), (hw, hd, hh))
        if hh > 16 * s:
            b.box(material, (x, 0, hh + hh * 0.08), (hw * 0.7, hd * 0.7, hh * 0.16))
        for j in range(3):
            z = hh * (0.28 + j * 0.22)
            b.box("steel", (x, 0, z), (hw * 1.04, hd * 1.04, 0.4 * s))
        col_h = (height - thick) * s
        b.box("steel", (x, (-width * 0.42) * s, col_h * 0.5), (3.4 * s, 3.4 * s, col_h))
        b.box("steel", (x, (width * 0.42) * s, col_h * 0.5), (3.4 * s, 3.4 * s, col_h))
        b.box("steel", (x, (-width * 0.62) * s, col_h * 0.5), (22.4 * s, 22.4 * s, col_h))
    roof_rings = []
    for i in range(9):
        t = i / 8
        x = (-0.5 + t) * (length + hang * 2) * s
        z = (height + math.sin(t * math.pi) * 56 - thick * 0.35) * s
        roof_rings.append((x, 0, z, 8 * s, (width + hang * 2) * 0.5 * s))
    b.loft("silver", roof_rings, n=6, power=1)
    fascia = []
    for i in range(9):
        t = i / 8
        x = (-0.5 + t) * (length + hang * 2) * s
        z = (height + math.sin(t * math.pi) * 56 - thick * 0.15) * s
        fascia.append((x, (-width * 0.56 - hang) * s, z, 14 * s, 7.2 * s))
    b.loft("silver", fascia, n=6, power=1)
    b.box("steel", (0, 0, (height - thick - 1.2) * s), ((length + 4) * s, 3.2 * s, 2.0 * s))
    b.box("darkglass", (0, (width * 0.46) * s, 8 * s), ((length - 20) * s, 8 * s, 16 * s))
    # 会展中心 four plates on the south column faces, not behind them.
    col_south = (-width * 0.62) * s - 11.3 * s
    for i in (2, 3, 4, 5):
        x = (-length * 0.5 + (i + 0.5) * bay) * s
        b.box("civicred", (x, col_south, hall_h * 0.55 * s), (16 * s, 1.6 * s, 7.2 * s))
        b.box("led", (x, col_south - 0.3 * s, hall_h * 0.55 * s), (6.4 * s, 0.55 * s, 3.0 * s))
    b.frame = previous
    return {
        "id": "convention-futian",
        "scale": scale,
        "max_height": height * scale,
        "source_spec": "data/landmarks/convention-futian.json",
    }
