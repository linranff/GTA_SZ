"""Bijia Hill. Three east-west ridges, not one ellipsoid."""
from __future__ import annotations


def _ridge(b, scale, east, north, height, rx, ry, material):
    rings = []
    for z, kx, ky in (
        (0, 0.58, 0.48),
        (height * 0.22, 0.36, 0.26),
        (height * 0.52, 0.16, 0.12),
        (height, 0.05, 0.04),
    ):
        rings.append((east * scale, north * scale, z * scale, rx * kx * scale, ry * ky * scale))
    b.loft(material, rings, n=10, power=1.35)


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "bijia":
        raise ValueError("bijia builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    for east, north, rx, ry in ((-10, 120, 68, 38), (220, 80, 78, 40), (510, 70, 68, 36)):
        b.loft(
            "park",
            [
                (east * scale, north * scale, 0.04 * scale, rx * scale, ry * scale),
                (east * scale, north * scale, 1.1 * scale, rx * 0.8 * scale, ry * 0.76 * scale),
            ],
            n=8,
            power=1.4,
        )
    max_h = 0
    for peak in spec["peaks"]:
        h = float(peak["relative_height_m"])
        max_h = max(max_h, h)
        material = "park"
        _ridge(b, scale, peak["east_m"], peak["north_m"], h, peak["rx_m"], peak["ry_m"], material)
        b.loft(
            "stone",
            [
                (float(peak["east_m"]) * scale, float(peak["north_m"]) * scale, h * 0.86 * scale, float(peak["rx_m"]) * 0.09 * scale, float(peak["ry_m"]) * 0.07 * scale),
                (float(peak["east_m"]) * scale, float(peak["north_m"]) * scale, h * scale, float(peak["rx_m"]) * 0.035 * scale, float(peak["ry_m"]) * 0.028 * scale),
            ],
            n=8,
            power=1.2,
        )
    # Fat grounded ridgeline. A thin mid-air loft read as a green blade.
    b.loft(
        "park",
        [
            (-280 * scale, 40 * scale, 0.2 * scale, 170 * scale, 100 * scale),
            (95 * scale, 125 * scale, 16 * scale, 250 * scale, 120 * scale),
            (470 * scale, 210 * scale, 0.2 * scale, 180 * scale, 105 * scale),
        ],
        n=10,
        power=1.2,
    )
    b.loft(
        "park",
        [
            (470 * scale, 210 * scale, 0.2 * scale, 160 * scale, 95 * scale),
            (595 * scale, 95 * scale, 14 * scale, 210 * scale, 100 * scale),
            (720 * scale, -20 * scale, 0.2 * scale, 140 * scale, 85 * scale),
        ],
        n=10,
        power=1.2,
    )
    # One ridge kiosk on the west peak, not three temple hats.
    wx, wy, wh = -280 * scale, 40 * scale, 68 * scale
    b.box("stone", (wx, wy - 10 * scale, wh * 0.9), (8 * scale, 7 * scale, 5.2 * scale))
    b.box("gold", (wx, wy - 10 * scale, wh * 0.9 + 2.9 * scale), (9.6 * scale, 8.4 * scale, 1.2 * scale))
    b.box("civicred", (wx, wy - 10 * scale - 3.6 * scale, wh * 0.9), (6.4 * scale, 0.8 * scale, 2.4 * scale))
    b.box("led", (wx, wy - 10 * scale - 3.8 * scale, wh * 0.9), (2.6 * scale, 0.3 * scale, 1.0 * scale))
    b.frame = previous
    return {
        "id": "bijia",
        "scale": scale,
        "max_height": max_h * scale,
        "source_spec": "data/landmarks/bijia.json",
    }
