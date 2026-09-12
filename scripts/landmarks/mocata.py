"""MOCAPE / 两馆. Two black megaliths with a shared silver cloud."""
from __future__ import annotations


def _stone(b, scale, stone, height, material, yaw=0.0):
    cx = float(stone["east_m"]) * scale
    cy = float(stone["north_m"]) * scale
    rx = float(stone["rx_m"]) * scale
    ry = float(stone["ry_m"]) * scale
    h = height * scale
    previous = b.frame
    b.frame = (previous[0] + cx, previous[1] + cy, previous[2] + yaw)
    b.loft(
        material,
        [
            (0, 0, 0, rx * 0.52, ry * 0.26),
            (0, 0, 3 * scale, rx * 0.78, ry * 0.36),
            (0, 0, h * 0.72, rx * 0.68, ry * 0.3),
            (0, 0, h, rx * 0.48, ry * 0.2),
        ],
        n=6,
        power=1.0,
    )
    b.frame = previous


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "mocata":
        raise ValueError("mocata builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    height = float(spec["height"]["value"])
    env = spec["envelope"]
    length = float(env["length_m"]) * scale
    width = float(env["width_m"]) * scale
    podium = float(spec["main_level_m"]["value"]) * scale
    b.box("stone", (0, 0, podium * 0.5), (length, width, podium))
    _stone(b, scale, spec["west_stone"], height, "darkglass", yaw=0.88)
    _stone(b, scale, spec["east_stone"], height, "darkglass", yaw=-0.88)
    b.loft(
        "silver",
        [
            (0, 0, 12 * scale, 22 * scale, 14 * scale),
            (4 * scale, 0, 22 * scale, 28 * scale, 16 * scale),
            (0, 0, 31 * scale, 16 * scale, 11 * scale),
        ],
        n=12,
        power=1,
    )
    b.box("steel", (0, 0, podium + 1.2 * scale), (18 * scale, 36 * scale, 2.4 * scale))
    b.box("concrete", (0, 0, 0.7 * scale), (length * 1.04, width * 1.04, 1.4 * scale))
    b.frame = previous
    return {
        "id": "mocata",
        "scale": scale,
        "max_height": height * scale,
        "source_spec": "data/landmarks/mocata.json",
    }
