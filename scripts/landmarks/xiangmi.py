"""Xiangmi Lake only. Park and lake are not yet split; do not merge them."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "xiangmi":
        raise ValueError("xiangmi builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    lake = spec["lake"]
    x, y = float(lake["east_m"]) * scale, float(lake["north_m"]) * scale
    rx, ry = float(lake["rx_m"]) * scale, float(lake["ry_m"]) * scale
    b.loft(
        "water",
        [
            (x, y, 0.04 * scale, rx, ry),
            (x, y, 1.1 * scale, rx, ry),
        ],
        n=12,
        power=1,
    )
    # Thin rim only so the lake reads as a water body, not a park fill.
    b.loft(
        "park",
        [
            (x, y, 0.02 * scale, rx * 1.08, ry * 1.08),
            (x, y, 0.08 * scale, rx * 1.08, ry * 1.08),
        ],
        n=12,
        power=1,
    )
    b.box("water", (x, y - ry * 1.12, 0.55 * scale), (rx * 0.72, 26 * scale, 1.1 * scale))
    # 香蜜湖 four plates on a south rim fascia; lake only, do not thicken water.
    b.box("gold", (x, y - ry * 1.12, 3.2 * scale), (rx * 0.16, 2.2 * scale, 5.2 * scale))
    for xf in (-0.36, -0.12, 0.12, 0.36):
        b.box("civicred", (x + rx * 0.055 * xf, y - ry * 1.12 - 1.2 * scale, 3.4 * scale), (7.2 * scale, 0.8 * scale, 2.6 * scale))
        b.box("led", (x + rx * 0.055 * xf, y - ry * 1.12 - 1.4 * scale, 3.4 * scale), (2.8 * scale, 0.3 * scale, 1.1 * scale))
    for t in (-0.36, 0.0, 0.36):
        tx, ty = x + rx * t, y - ry * 1.38
        b.tube("bark", (tx, ty, 0), (tx, ty, 12 * scale), 0.5 * scale, 5)
        b.loft("leaf", [(tx, ty, 8 * scale, 10 * scale, 10 * scale), (tx, ty, 20 * scale, 1.4 * scale, 1.4 * scale)], n=6)
    for t in (-0.5, -0.18, 0.18, 0.5):
        tx, ty = x + rx * t, y - ry * 1.62
        b.tube("bark", (tx, ty, 0), (tx, ty, 13 * scale), 0.55 * scale, 5)
        b.loft("leaf", [(tx, ty, 9 * scale, 11 * scale, 11 * scale), (tx, ty, 22 * scale, 1.5 * scale, 1.5 * scale)], n=6)
    b.frame = previous
    return {
        "id": "xiangmi",
        "scale": scale,
        "max_height": 0.14 * scale,
        "source_spec": "data/landmarks/xiangmi.json",
        "scope": "lake_only",
    }
