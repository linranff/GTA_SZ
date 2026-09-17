"""KK100 massing. Dark rounded taper; mall photos are not this tower."""
from __future__ import annotations

import math


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "kk100":
        raise ValueError("kk100 builder requires the kk100 specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)

    def p(x, y, z):
        return (x * scale, y * scale, z * scale)

    rings = [(float(item["z"]), float(item["radius"])) for item in spec["profile"]["rings"]]
    power = float(spec["profile"].get("power", 0.72))
    # 2026-09-16 in-game review: 0.58 read as a needle. Reported plan is a rounded
    # rectangle roughly 60 x 45 m, so keep the short axis at ~0.78 of the long one.
    aspect = 0.78
    body = [(z, r) for z, r in rings if z <= 400]
    b.loft("darkglass", [(0, 0, z * scale, r * 1.22 * scale, r * aspect * scale) for z, r in body], n=10, power=power)
    b.loft(
        "darkglass",
        [
            (0, 0, 400 * scale, 16.5 * 1.22 * scale, 16.5 * aspect * scale),
            (0, 0, 416 * scale, 18.4 * 1.22 * scale, 18.4 * aspect * scale),
            (0, 0, 428 * scale, 9.2 * 1.22 * scale, 9.2 * aspect * scale),
            (0, 0, 438 * scale, 2.4 * 1.22 * scale, 2.4 * aspect * scale),
        ],
        n=10,
        power=0.85,
    )
    lobby_h = float(spec["lobby"]["height_m"])
    lobby = [(0, 0, z * scale, r * 1.12 * scale, r * aspect * 0.92 * scale) for z, r in rings if z <= lobby_h + 2]
    if len(lobby) >= 2:
        b.loft("landmarkglass", lobby, n=16, power=power)
    b.box(
        "landmarkglass",
        (0, -rings[0][1] * aspect * 1.28 * scale, lobby_h * 0.48 * scale),
        (rings[0][1] * 1.18 * scale, 6.2 * scale, lobby_h * 0.88 * scale),
    )
    # 京基100 gold fascia plus three plates on the south lobby glass.
    lobby_south = -rings[0][1] * aspect * 1.28 * scale - 3.2 * scale
    b.box("gold", (0, lobby_south + 0.6 * scale, lobby_h * 0.42 * scale), (24 * scale, 1.6 * scale, 4.4 * scale))
    for x in (-7.2 * scale, 0, 7.2 * scale):
        b.box("civicred", (x, lobby_south - 0.4 * scale, lobby_h * 0.42 * scale), (5.6 * scale, 0.8 * scale, 2.4 * scale))
        b.box("led", (x, lobby_south - 0.6 * scale, lobby_h * 0.42 * scale), (2.2 * scale, 0.3 * scale, 1.0 * scale))
    # Southeast photo reads dense floor courses, weak verticals — not a candle spike.
    band_n = int(spec.get("bands", {}).get("count", 18))
    z0, z1 = 24.0, 400.0
    for i in range(band_n):
        z = z0 + (z1 - z0) * i / max(1, band_n - 1)
        r = rings[0][1]
        for (a, ra), (c, rc) in zip(rings, rings[1:]):
            if a <= z <= c:
                t = 0 if c == a else (z - a) / (c - a)
                r = ra + (rc - ra) * t
                break
        b.loft(
            "steel",
            [
                (0, 0, z * scale, r * 1.2 * scale, r * aspect * 1.02 * scale),
                (0, 0, (z + 3.2) * scale, r * 1.2 * scale, r * aspect * 1.02 * scale),
            ],
            n=16,
            power=power,
        )
    # Crown hugs the taper (no mushroom cap): a thin silver skin over the top rings.
    b.loft(
        "silver",
        [
            (0, 0, 368 * scale, 18.6 * 1.25 * scale, 18.6 * aspect * 1.03 * scale),
            (0, 0, 400 * scale, 16.8 * 1.25 * scale, 16.8 * aspect * 1.03 * scale),
            (0, 0, 420 * scale, 12.6 * 1.25 * scale, 12.6 * aspect * 1.03 * scale),
            (0, 0, 434 * scale, 5.6 * 1.25 * scale, 5.6 * aspect * 1.03 * scale),
        ],
        n=10,
        power=0.85,
    )
    mast = float(spec["profile"]["mast_top_m"])
    b.tube("steel", p(0, 0, rings[-1][0]), p(0, 0, mast), 0.35 * scale, 8, 0.1 * scale)
    b.loft("concrete", [(0, 0, 0, 24.8 * scale, 24.8 * scale), (0, 0, 0.45 * scale, 24.2 * scale, 24.2 * scale)], n=16, power=power)
    b.frame = previous
    return {"id": "kk100", "scale": scale, "max_height": mast * scale, "source_spec": "data/landmarks/kk100.json"}
