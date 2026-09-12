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
    b.box("water", (x, y - ry * 0.96, 3.6 * scale), (rx * 1.35, 16 * scale, 7.2 * scale))
    b.frame = previous
    return {
        "id": "xiangmi",
        "scale": scale,
        "max_height": 0.14 * scale,
        "source_spec": "data/landmarks/xiangmi.json",
        "scope": "lake_only",
    }
