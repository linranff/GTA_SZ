"""Ping An Finance Center massing. Height reported; radii estimated from photos."""
from __future__ import annotations

import math


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "pingan":
        raise ValueError("pingan builder requires the pingan specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)

    def p(x, y, z):
        return (x * scale, y * scale, z * scale)

    rings = [(float(item["z"]), float(item["radius"])) for item in spec["profile"]["rings"]]
    power = float(spec["profile"].get("power", 0.55))
    shaft = [item for item in rings if item[0] <= 562]
    crown = [item for item in rings if item[0] >= 540]
    aspect = 0.82
    b.loft("silver", [(0, 0, z * scale, r * 1.0 * scale, r * aspect * scale) for z, r in shaft], n=8, power=power)
    b.loft("landmarkglass", [(0, 0, z * scale, r * 0.92 * scale, r * aspect * 0.88 * scale) for z, r in shaft], n=8, power=power)
    b.loft("silver", [(0, 0, z * scale, r * 1.0 * scale, r * aspect * scale) for z, r in crown], n=8, power=power)

    lobby_h = float(spec["lobby"]["height_m"])
    lobby = [(0, 0, z * scale, r * scale * 0.9, r * scale * 0.9) for z, r in rings if z <= lobby_h + 0.01]
    if len(lobby) >= 2:
        b.loft("darkglass", lobby, n=16, power=power)

    # Face-center ribs so the south camera sees them, plus octagon corners.
    samples = [(z, r) for z, r in rings if 10 <= z <= 562]
    for i in range(8):
        ang = i * math.pi / 4
        c, s = math.cos(ang), math.sin(ang)
        for (z0, r0), (z1, r1) in zip(samples, samples[1:]):
            b.tube("steel", p(r0 * 1.22 * c, r0 * 1.22 * s, z0), p(r1 * 1.22 * c, r1 * 1.22 * s, z1), 2.8 * scale, 5)
    for a0, a1 in ((0.0, math.pi), (math.pi / 2, -math.pi / 2), (math.pi / 4, math.pi + math.pi / 4), (3 * math.pi / 4, -math.pi / 4)):
        r0, r1 = samples[0][1], samples[-1][1]
        b.tube(
            "steel",
            p(r0 * 1.26 * math.cos(a0), r0 * 1.26 * math.sin(a0), samples[0][0]),
            p(r1 * 1.26 * math.cos(a1), r1 * 1.26 * math.sin(a1), samples[-1][0]),
            2.2 * scale,
            6,
        )

    def r_at(z):
        for (a, ra), (c, rc) in zip(samples, samples[1:]):
            if a <= z <= c:
                t = 0 if c == a else (z - a) / (c - a)
                return ra + (rc - ra) * t
        return samples[-1][1]

    for i in range(5):
        z0 = 40 + i * 100
        z1 = min(540, z0 + 115)
        r0, r1 = r_at(z0), r_at(z1)
        b.tube("steel", p(-r0 * 1.22, -r0 * 1.2, z0), p(r1 * 1.22, -r1 * 1.2, z1), 3.2 * scale, 5)
        b.tube("steel", p(r0 * 1.22, -r0 * 1.2, z0), p(-r1 * 1.22, -r1 * 1.2, z1), 3.2 * scale, 5)

    mast = float(spec["profile"]["mast_top_m"])
    b.tube("steel", p(0, 0, rings[-1][0]), p(0, 0, mast), 0.45 * scale, 8, 0.12 * scale)
    b.loft("concrete", [(0, 0, 0, 30 * scale, 30 * scale), (0, 0, 0.8 * scale, 29 * scale, 29 * scale)], n=16, power=power)
    b.frame = previous
    return {"id": "pingan", "scale": scale, "max_height": rings[-1][0] * scale, "source_spec": "data/landmarks/pingan.json"}
