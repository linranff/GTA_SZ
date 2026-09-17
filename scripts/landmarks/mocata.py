"""MOCAPE / 两馆. Two black megaliths with a shared silver cloud."""
from __future__ import annotations


def _stone(b, scale, stone, height, material, yaw=0.0, slim=1.0, wide=1.0):
    cx = float(stone["east_m"]) * scale
    cy = float(stone["north_m"]) * scale
    rx = float(stone["rx_m"]) * scale * wide
    ry = float(stone["ry_m"]) * scale * slim
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
    for zf, krx, kry in ((0.28, 0.76, 0.35), (0.50, 0.72, 0.33), (0.72, 0.70, 0.31)):
        z = h * zf
        b.loft(
            "steel",
            [(0, 0, z, rx * krx, ry * kry), (0, 0, z + 0.5 * scale, rx * krx, ry * kry)],
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
    b.box("stone", (0, 0, podium + podium * 0.08), (length * 0.7, width * 0.7, podium * 0.16))
    for xf in (-0.28, 0.0, 0.28):
        b.box("darkglass", (length * xf, -width * 0.51, podium * 0.5), (max(length * 0.08, 4 * scale), 1.4 * scale, podium * 0.86))
    _stone(b, scale, spec["west_stone"], height, "darkglass", yaw=0.38, slim=0.62, wide=0.98)
    _stone(b, scale, spec["east_stone"], height, "darkglass", yaw=-0.32, slim=0.86, wide=1.12)
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
    b.box("steel", (0, -28 * scale, podium + 1.2 * scale), (18 * scale, 36 * scale, 2.4 * scale))
    b.box("landmarkglass", (0, -28 * scale, podium + 5.4 * scale), (16 * scale, 9.2 * scale, 9.6 * scale))
    # Lobby door under the gold fascia; not another plinth seam.
    b.box("darkglass", (0, -32.2 * scale, podium + 2.6 * scale), (10 * scale, 2.4 * scale, 4.2 * scale))
    # 两馆 gold fascia plus three plates; keep the megaliths.
    b.box("gold", (0, -32.2 * scale, podium + 6.8 * scale), (16 * scale, 1.6 * scale, 4.0 * scale))
    for x in (-5 * scale, 0, 5 * scale):
        b.box("civicred", (x, -33.2 * scale, podium + 6.8 * scale), (4.2 * scale, 0.8 * scale, 2.2 * scale))
        b.box("led", (x, -33.4 * scale, podium + 6.8 * scale), (1.7 * scale, 0.3 * scale, 0.95 * scale))
    b.box("concrete", (0, 0, 0.7 * scale), (length * 1.04, width * 1.04, 1.4 * scale))
    b.frame = previous
    return {
        "id": "mocata",
        "scale": scale,
        "max_height": height * scale,
        "source_spec": "data/landmarks/mocata.json",
    }
