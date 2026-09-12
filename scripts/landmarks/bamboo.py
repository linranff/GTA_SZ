"""China Resources Headquarters (春笋) massing candidate.

Real metres in east/north/up. Height is reported; radii are estimated from a
secondary diameter note plus Commons photos. Not a survey model.
"""
from __future__ import annotations

import math


def _rings(spec):
    return [(float(item["z"]), float(item["radius"])) for item in spec["profile"]["rings"]]


def build(b, lm, spec, scale=0.6):
    if not math.isfinite(scale) or scale <= 0:
        raise ValueError("scale must be a positive finite number")
    if spec.get("id") != "bamboo":
        raise ValueError("bamboo builder requires the bamboo specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)

    def p(x, y, z):
        return (x * scale, y * scale, z * scale)

    rings = _rings(spec)
    # Silver-white skin first; inner glass is a thinner core so the shoot reads metal, not slate.
    b.loft("silver", [(0, 0, z * scale, r * scale, r * scale) for z, r in rings], n=24, power=1)
    inner = [(0, 0, z * scale, r * scale * 0.91, r * scale * 0.91) for z, r in rings if z <= 365]
    if len(inner) >= 2:
        b.loft("landmarkglass", inner, n=20, power=1)

    lobby_h = float(spec["lobby"]["height_m"])
    lobby = [(0, 0, z * scale, r * scale * 0.78, r * scale * 0.78) for z, r in rings if z <= lobby_h + 0.01]
    if len(lobby) >= 2:
        b.loft("darkglass", lobby, n=16, power=1)

    count = int(spec["mullions"]["count"])
    body = [(z, r) for z, r in rings if z <= 382]
    for i in range(count):
        ang = i * math.tau / count
        c, s = math.cos(ang), math.sin(ang)
        for (z0, r0), (z1, r1) in zip(body, body[1:]):
            out = 0.22
            b.tube(
                "steel",
                p((r0 + out) * c, (r0 + out) * s, z0),
                p((r1 + out) * c, (r1 + out) * s, z1),
                0.2 * scale,
                5,
                0.15 * scale,
            )
        # Open, slightly splayed lobby columns — photos show the shoot standing on legs, not a puck.
        b.tube("silver", p(32.5 * c, 32.5 * s, 0), p((body[1][1] + 0.3) * c, (body[1][1] + 0.3) * s, lobby_h), 0.72 * scale, 6)

    tip_z, tip_r = rings[-2]
    peak_z, peak_r = rings[-1]
    b.tube("steel", p(0, 0, tip_z), p(0, 0, peak_z + 1.2), max(0.2, tip_r) * scale, 8, max(0.08, peak_r) * scale)

    b.loft(
        "concrete",
        [(0, 0, 0, 27.2 * scale, 27.2 * scale), (0, 0, 0.35 * scale, 26.4 * scale, 26.4 * scale)],
        n=20,
        power=1,
    )

    b.frame = previous
    return {
        "id": "bamboo",
        "scale": scale,
        "ring_count": len(rings),
        "mullions": count,
        "max_height": rings[-1][0] * scale,
        "source_spec": "data/landmarks/bamboo.json",
    }
