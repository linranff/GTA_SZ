"""Lizhi Park. Urban oasis plus lake, not a tower."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "lizhi":
        raise ValueError("lizhi builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    oasis = spec["oasis"]
    w, d = float(oasis["width_m"]) * scale, float(oasis["depth_m"]) * scale
    b.box("park", (0, d * 0.32, 0.12 * scale), (w, d * 0.36, 0.2 * scale))
    b.box("park", (0, -d * 0.38, 0.12 * scale), (w, d * 0.22, 0.2 * scale))
    lake = spec["lake"]
    lx, ly = float(lake["east_m"]) * scale, float(lake["north_m"]) * scale
    rx, ry = float(lake["rx_m"]) * scale, float(lake["ry_m"]) * scale
    b.loft(
        "water",
        [
            (lx, ly, 0.06 * scale, rx, ry),
            (lx, ly, 1.15 * scale, rx, ry),
        ],
        n=16,
        power=1,
    )
    b.loft(
        "water",
        [
            (lx, -d * 0.44, 0.08 * scale, 86 * scale, 58 * scale),
            (lx, -d * 0.44, 1.2 * scale, 86 * scale, 58 * scale),
        ],
        n=14,
        power=1,
    )
    for tx, ty in ((-210, 150), (220, 170), (-200, -30), (210, -20), (-50, 90), (70, 110), (-230, -170), (240, -150)):
        x, y = tx * scale, ty * scale
        b.tube("bark", (x, y, 0), (x, y, 14.0 * scale), 0.55 * scale, 5)
        b.loft(
            "leaf",
            [(x, y, 9.0 * scale, 12.0 * scale, 12.0 * scale), (x, y, 24.0 * scale, 1.6 * scale, 1.6 * scale)],
            n=6,
        )
    b.box("concrete", (0, d * 0.42, 0.16 * scale), (w * 0.35, 5 * scale, 0.24 * scale))
    b.frame = previous
    return {
        "id": "lizhi",
        "scale": scale,
        "max_height": 18.0 * scale,
        "source_spec": "data/landmarks/lizhi.json",
    }
