"""Bijia Hill. Three east-west ridges, not one ellipsoid."""
from __future__ import annotations


def _ridge(b, scale, east, north, height, rx, ry, material):
    rings = []
    for z, kx, ky in (
        (0, 0.82, 0.7),
        (height * 0.28, 0.58, 0.42),
        (height * 0.62, 0.28, 0.2),
        (height, 0.08, 0.06),
    ):
        rings.append((east * scale, north * scale, z * scale, rx * kx * scale, ry * ky * scale))
    b.loft(material, rings, n=10, power=1.35)


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "bijia":
        raise ValueError("bijia builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    b.loft(
        "park",
        [
            (180 * scale, 80 * scale, 0.04 * scale, 220 * scale, 120 * scale),
            (180 * scale, 80 * scale, 1.2 * scale, 200 * scale, 108 * scale),
        ],
        n=10,
        power=1.5,
    )
    max_h = 0
    for peak in spec["peaks"]:
        h = float(peak["relative_height_m"])
        max_h = max(max_h, h)
        material = "park"
        _ridge(b, scale, peak["east_m"], peak["north_m"], h, peak["rx_m"], peak["ry_m"], material)
    # Low saddles so the three peaks read as one pen-rest ridge.
    for east, north, h in ((90, 130, 28), (590, 90, 22)):
        _ridge(b, scale, east, north, h, 160, 90, "park")
    b.frame = previous
    return {
        "id": "bijia",
        "scale": scale,
        "max_height": max_h * scale,
        "source_spec": "data/landmarks/bijia.json",
    }
