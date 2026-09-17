"""Shenzhen Book City Central. Sunken mall and roof lawn, not a tower."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "book-mall":
        raise ValueError("book-mall builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    s = scale
    length = float(spec["length_m"]["value"])
    width = float(spec["width_m"]["value"])
    eave = float(spec["eave_height_m"]["value"])
    walk = float(spec["walk_axis_m"]["value"])
    sink = float(spec["sink_m"]["value"])
    court = float(spec["courts"]["size_m"])
    b.box("stone", (0, 0, -sink * 0.5 * s), ((width + 8) * s, (length + 8) * s, sink * s))
    b.box("concrete", (0, length * 0.22 * s, eave * 0.35 * s), (width * s, (length * 0.42) * s, eave * 0.7 * s))
    for sign in (-1, 1):
        cx, cy = (width * 0.3) * sign * s, -length * 0.2 * s
        ww, dd, hh = width * 0.36 * s, (length * 0.36) * s, eave * 0.7 * s
        b.box("concrete", (cx, cy, eave * 0.35 * s), (ww, dd, hh))
        if hh > 6 * s:
            b.box("concrete", (cx, cy, eave * 0.35 * s + hh * 0.58), (ww * 0.7, dd * 0.7, hh * 0.16))
        b.box("darkglass", (cx, cy, eave * 0.35 * s), (max(ww * 0.08, 2.2 * s), dd * 1.02, hh * 0.86))
        for i in range(3):
            z = hh * (0.32 + i * 0.18)
            b.box("steel", (cx, cy, z), (ww * 1.04, dd * 1.04, 0.4 * s))
        # Concrete wing shop door; do not move the sunken south fascia.
        b.box("darkglass", (cx, cy - dd * 0.52, 2.4 * s), (min(ww * 0.18, 6 * s), 2.4 * s, 3.2 * s))
        b.box("civicred", (cx, cy - dd * 0.52, 5.2 * s), (min(ww * 0.36, 8 * s), 0.7 * s, 1.8 * s))
        b.box("led", (cx, cy - dd * 0.54, 5.2 * s), (min(ww * 0.14, 3.2 * s), 0.28 * s, 0.75 * s))
    b.box("landmarkglass", (0, 8 * s, (eave * 0.55) * s), (walk * s, (length - 36) * s, eave * 0.9 * s))
    b.box("park", (0, length * 0.18 * s, (eave + 0.35) * s), ((width - 6) * s, (length * 0.5) * s, 0.7 * s))
    b.box("park", (0, length * 0.12 * s, (eave + 0.55) * s), (walk * s, (length * 0.58) * s, 0.4 * s))
    half = court * 0.5 * s
    south_y = -length * 0.42 * s
    b.box("darkglass", (0, south_y, -sink * 0.35 * s), ((court + 18) * s, (court + 14) * s, sink * 0.95 * s))
    b.box("stone", (0, south_y, -sink * 0.12 * s), ((court + 4) * s, (court + 2) * s, 0.45 * s))
    for sign in (-1, 1):
        b.box("landmarkglass", ((court * 0.58) * sign * s, south_y, eave * 0.28 * s), (1.8 * s, (court + 4) * s, eave * 0.55 * s))
    for i in range(4):
        b.box(
            "stone",
            (0, south_y - (court * 0.42 + i * 3.4) * s, (-sink * 0.12 - i * sink * 0.16) * s),
            (court * 0.5 * s, 3.0 * s, 0.4 * s),
        )
    b.box("stone", (0, south_y - 8 * s, eave * 0.46 * s), (walk * 1.55 * s, 16 * s, eave * 0.86 * s))
    b.box("landmarkglass", (0, south_y - 14 * s, eave * 0.55 * s), (walk * 1.52 * s, 22 * s, eave * 0.98 * s))
    # South door under the gold fascia; do not merge the four plates.
    b.box("darkglass", (0, south_y - 14 * s - 10.4 * s, eave * 0.28 * s), (walk * 0.72 * s, 2.4 * s, eave * 0.38 * s))
    # 深圳书城 gold fascia plus four plates; keep the wider spacing.
    b.box("gold", (0, south_y - 14 * s - 10.4 * s, eave * 0.62 * s), (walk * 1.55 * s, 1.6 * s, 4.8 * s))
    for xf in (-0.72, -0.24, 0.24, 0.72):
        b.box("civicred", ((walk * xf) * s, south_y - 14 * s - 11.3 * s, eave * 0.62 * s), (5.4 * s, 1.2 * s, 3.2 * s))
        b.box("led", ((walk * xf) * s, south_y - 14 * s - 11.5 * s, eave * 0.62 * s), (2.2 * s, 0.5 * s, 1.4 * s))
    b.box("steel", (0, south_y - 18 * s, eave * 0.28 * s), (walk * 1.08 * s, 6.4 * s, eave * 0.48 * s))
    for xf in (-0.36, -0.12, 0.12, 0.36):
        b.box("steel", ((walk * xf) * s, south_y - 14 * s, eave * 0.52 * s), (2.6 * s, 22 * s, eave * 0.92 * s))
    b.loft(
        "darkglass",
        [
            (0, length * 0.2 * s, 0, half, half),
            (0, length * 0.2 * s, eave * s, half, half),
        ],
        n=14,
        power=1,
    )
    for sign in (-1, 1):
        b.box("park", ((width * 0.62) * sign * s, -length * 0.15 * s, 0.4 * s), (22 * s, 36 * s, 0.8 * s))
        b.box("park", ((width * 0.62) * sign * s, length * 0.15 * s, 0.4 * s), (22 * s, 36 * s, 0.8 * s))
    b.box("steel", (0, 0, (eave + 1.2) * s), (6 * s, 18 * s, 2.4 * s))
    for sign in (-1, 1):
        cx, cy = (width * 0.44) * sign * s, -length * 0.08 * s
        ww, dd, hh = 16 * s, length * 0.62 * s, eave * 0.78 * s
        b.box("concrete", (cx, cy, eave * 0.42 * s), (ww, dd, hh))
        if hh > 6 * s:
            b.box("concrete", (cx, cy, eave * 0.42 * s + hh * 0.58), (ww * 0.7, dd * 0.7, hh * 0.16))
        b.box("darkglass", (cx, cy, eave * 0.42 * s), (max(ww * 0.08, 2.2 * s), dd * 1.02, hh * 0.86))
        for i in range(3):
            z = hh * (0.32 + i * 0.18)
            b.box("steel", (cx, cy, z), (ww * 1.04, dd * 1.04, 0.4 * s))
        b.box("landmarkglass", ((width * 0.44) * sign * s, -length * 0.28 * s, eave * 0.32 * s), (4 * s, 18 * s, eave * 0.5 * s))
    b.frame = previous
    return {
        "id": "book-mall",
        "scale": scale,
        "max_height": (eave + 1.6) * scale,
        "source_spec": "data/landmarks/book-mall.json",
    }
