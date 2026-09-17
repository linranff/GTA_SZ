"""One Shenzhen Bay cluster. Heights reported; plan offsets estimated."""
from __future__ import annotations


def _tower(b, scale, tower):
    h = float(tower["height_m"]) * scale
    cx, cy = float(tower["east_m"]) * scale, float(tower["north_m"]) * scale
    rx = float(tower["width_m"]) * 0.52 * scale
    ry = float(tower["depth_m"]) * 0.52 * scale
    tall = tower["id"] == "t7"
    skin = "darkglass" if tall else "landmarkglass"
    b.loft(
        skin,
        [
            (cx, cy, 0, rx, ry),
            (cx, cy, h * 0.74, rx * 0.96, ry * 0.96),
            (cx, cy, h, rx * (0.72 if tall else 0.86), ry * (0.72 if tall else 0.86)),
        ],
        n=8,
        power=1,
    )
    if tall:
        b.loft(
            "silver",
            [
                (cx, cy, h - 10 * scale, rx * 0.7, ry * 0.7),
                (cx, cy, h + 6 * scale, rx * 0.38, ry * 0.38),
            ],
            n=8,
            power=1,
        )
        for i in range(14):
            z = h * (0.1 + i * 0.06)
            b.loft(
                "silver",
                [
                    (cx, cy, z, rx * 1.06, ry * 1.06),
                    (cx, cy, z + 1.25 * scale, rx * 1.06, ry * 1.06),
                ],
                n=8,
                power=1,
            )
    else:
        b.box("silver", (cx, cy, h - 2.2 * scale), (rx * 1.15, ry * 1.15, 4.4 * scale))
        for i in range(8):
            z = h * (0.14 + i * 0.1)
            b.loft(
                "silver",
                [
                    (cx, cy, z, rx * 1.05, ry * 1.05),
                    (cx, cy, z + 1.05 * scale, rx * 1.05, ry * 1.05),
                ],
                n=8,
                power=1,
            )
    return h


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "bay-one":
        raise ValueError("bay-one builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    max_h = 0
    for tower in spec["towers"]:
        max_h = max(max_h, _tower(b, scale, tower))
    b.box("stone", (6 * scale, -6 * scale, 7.2 * scale), (118 * scale, 96 * scale, 14.4 * scale))
    b.box("stone", (6 * scale, -6 * scale, 14.4 * scale + 14.4 * scale * 0.08), (82.6 * scale, 67.2 * scale, 14.4 * scale * 0.16))
    for i in range(3):
        z = 14.4 * scale * (0.28 + i * 0.22)
        b.box("steel", (6 * scale, -6 * scale, z), (122.7 * scale, 99.8 * scale, 0.45 * scale))
    b.box("landmarkglass", (6 * scale, -52 * scale, 6.4 * scale), (108 * scale, 9.6 * scale, 10.8 * scale))
    b.box("darkglass", (6 * scale, -54.1 * scale, 2.8 * scale), (28 * scale, 2.4 * scale, 5.2 * scale))
    # 湾一号 gold fascia plus four plates on the south glass face.
    b.box("gold", (6 * scale, -56.2 * scale, 6.8 * scale), (64 * scale, 2.4 * scale, 5.6 * scale))
    for x in (-28 * scale, -8 * scale, 12 * scale, 32 * scale):
        b.box("civicred", (x, -57.6 * scale, 6.8 * scale), (12 * scale, 0.9 * scale, 3.6 * scale))
        b.box("led", (x, -57.8 * scale, 6.8 * scale), (4.8 * scale, 0.35 * scale, 1.5 * scale))
    b.box("concrete", (6 * scale, -6 * scale, 0.8 * scale), (124 * scale, 102 * scale, 1.6 * scale))
    b.frame = previous
    return {
        "id": "bay-one",
        "scale": scale,
        "tower_count": len(spec["towers"]),
        "max_height": max_h,
        "source_spec": "data/landmarks/bay-one.json",
    }
