"""Hanking Center as seen in Commons: one polygonal glass shaft plus crystal podium."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "hanking":
        raise ValueError("hanking builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    h = float(spec["height"]["value"]) * scale
    shaft = spec["shaft"]
    rx = float(shaft["rx_m"]) * scale
    ry = float(shaft["ry_m"]) * scale
    sides = int(shaft.get("sides", 6))
    b.loft(
        "landmarkglass",
        [
            (0, 0, 0, rx, ry),
            (0, 0, h * 0.48, rx * 0.96, ry * 0.9),
            (8.4 * scale, 2.2 * scale, h * 0.72, rx * 0.62, ry * 0.42),
            (14.8 * scale, 0, h, rx * 0.26, ry * 0.18),
        ],
        n=sides,
        power=1.15,
    )
    # Lower-shaft floor rings only. Higher rings would float off the taper.
    for zf in (0.18, 0.32, 0.44):
        z = h * zf
        b.loft(
            "steel",
            [(0, 0, z, rx * 1.04, ry * 1.04), (0, 0, z + 0.55 * scale, rx * 1.04, ry * 1.04)],
            n=sides,
            power=1,
        )
    # Three chunky south-skin mullions only. Orbiting boxes read as flagpoles.
    for i in range(3):
        t = (i + 0.5) / 3
        x = (-0.52 + t * 1.04) * rx
        b.box(
            "steel",
            (x, -ry * 1.12, h * 0.42),
            (5.2 * scale, 3.4 * scale, h * 0.78),
        )
    podium = spec["podium"]
    pw, pd, ph = float(podium["width_m"]) * scale, float(podium["depth_m"]) * scale, float(podium["height_m"]) * scale
    b.loft(
        "darkglass",
        [
            (0, -10 * scale, 0, pw * 1.22, pd * 1.05),
            (12 * scale, -28 * scale, ph * 0.7, pw * 0.88, pd * 0.7),
            (28 * scale, -52 * scale, ph * 1.85, pw * 0.36, pd * 0.28),
        ],
        n=6,
        power=1.3,
    )
    b.box("concrete", (0, 0, 0.8 * scale), (pw * 1.15, pd * 1.1, 1.6 * scale))
    # 汉京 gold fascia plus four plates on the crystal podium; no extra shaft flags.
    b.box("gold", (0, -10 * scale - pd * 1.02, ph * 0.28), (40 * scale, 1.6 * scale, 4.4 * scale))
    for x in (-14 * scale, -4.6 * scale, 4.6 * scale, 14 * scale):
        b.box("civicred", (x, -10 * scale - pd * 1.12, ph * 0.28), (7.2 * scale, 0.8 * scale, 2.8 * scale))
        b.box("led", (x, -10 * scale - pd * 1.16, ph * 0.28), (2.8 * scale, 0.3 * scale, 1.2 * scale))
    b.frame = previous
    return {"id": "hanking", "scale": scale, "max_height": h, "source_spec": "data/landmarks/hanking.json"}
