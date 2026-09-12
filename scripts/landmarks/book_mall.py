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
        b.box(
            "concrete",
            ((width * 0.3) * sign * s, -length * 0.2 * s, eave * 0.35 * s),
            (width * 0.36 * s, (length * 0.36) * s, eave * 0.7 * s),
        )
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
    b.box("stone", (0, south_y - 6 * s, eave * 0.28 * s), (walk * 1.35 * s, 8 * s, eave * 0.5 * s))
    b.box("landmarkglass", (0, south_y - 8 * s, eave * 0.26 * s), (walk * 1.05 * s, 5 * s, eave * 0.42 * s))
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
        b.box("concrete", ((width * 0.44) * sign * s, -length * 0.08 * s, eave * 0.42 * s), (16 * s, length * 0.62 * s, eave * 0.78 * s))
        b.box("landmarkglass", ((width * 0.44) * sign * s, -length * 0.28 * s, eave * 0.32 * s), (4 * s, 18 * s, eave * 0.5 * s))
    b.frame = previous
    return {
        "id": "book-mall",
        "scale": scale,
        "max_height": (eave + 1.6) * scale,
        "source_spec": "data/landmarks/book-mall.json",
    }
