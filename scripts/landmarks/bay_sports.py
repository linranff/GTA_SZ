"""Shenzhen Bay Sports Center. Peanut lattice; east lobe has a through-oculus."""
from __future__ import annotations


def _lobe(b, scale, cx, rx, ry, height, material, n=16):
    rings = []
    for z, k in ((0, 0.62), (height * 0.32, 1.0), (height * 0.62, 0.96), (height, 0.42)):
        rings.append((cx * scale, 0, z * scale, rx * k * scale, ry * k * scale))
    b.loft(material, rings, n=n, power=1)


def _south_oculus(b, scale, cx, rx, ry, height):
    # Vertical dark capsule on the south skin, not a TV rectangle or YZ torus.
    ox = cx * scale
    y = -ry * 1.02 * scale
    oz = height * 0.5 * scale
    w, hh = rx * 0.48 * scale, height * 0.42 * scale
    b.loft(
        "darkglass",
        [
            (ox, y - 4.2 * scale, oz - hh, w * 0.42, 5.2 * scale),
            (ox, y - 4.2 * scale, oz, w * 0.72, 6.4 * scale),
            (ox, y - 4.2 * scale, oz + hh, w * 0.42, 5.2 * scale),
        ],
        n=12,
        power=1,
    )
    b.loft(
        "silver",
        [
            (ox, y - 2.2 * scale, oz - hh * 1.12, w * 0.55, 3.2 * scale),
            (ox, y - 2.2 * scale, oz, w * 0.88, 3.6 * scale),
            (ox, y - 2.2 * scale, oz + hh * 1.12, w * 0.55, 3.2 * scale),
        ],
        n=12,
        power=1,
    )


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "bay-sports":
        raise ValueError("bay-sports builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    lobes = spec["lobes"]
    height = float(lobes["height_m"])
    west, east = lobes["west"], lobes["east"]
    _lobe(b, scale, west["cx"], west["rx"], west["ry"], height * 0.92, "silver")
    _lobe(b, scale, east["cx"], east["rx"] * 0.82, east["ry"] * 0.82, height * 0.86, "silver")
    _south_oculus(b, scale, east["cx"], east["rx"], east["ry"], height * 0.9)
    # West lobe: three small south capsules so it is not a blank potato. Keep east oculus.
    wy = -west["ry"] * 1.02 * scale
    for i, xf in enumerate((-0.28, 0.02, 0.3)):
        x = (west["cx"] + xf * west["rx"]) * scale
        z = height * (0.4 + (i % 2) * 0.06) * scale
        w = west["rx"] * 0.28 * scale
        hh = height * 0.28 * scale
        b.loft(
            "darkglass",
            [
                (x, wy - 3.8 * scale, z - hh, w * 0.48, 4.4 * scale),
                (x, wy - 3.8 * scale, z, w * 0.88, 5.4 * scale),
                (x, wy - 3.8 * scale, z + hh, w * 0.48, 4.4 * scale),
            ],
            n=8,
            power=1,
        )
    # 春茧 four plates on the south saddle fascia, not under the capsules.
    b.box("gold", ((west["cx"] + east["cx"]) * 0.5 * scale, -23.2 * scale, 4.6 * scale), (48 * scale, 2.4 * scale, 6.8 * scale))
    for x in (-16 * scale, -5.5 * scale, 5.5 * scale, 16 * scale):
        b.box("civicred", (x, -24.5 * scale, 4.8 * scale), (8.4 * scale, 0.9 * scale, 3.2 * scale))
        b.box("led", (x, -24.7 * scale, 4.8 * scale), (3.4 * scale, 0.32 * scale, 1.4 * scale))
    wx, ex = west["cx"] * scale, east["cx"] * scale
    b.loft(
        "darkglass",
        [
            ((wx + ex) * 0.5, 0, height * 0.04 * scale, 7 * scale, 10 * scale),
            ((wx + ex) * 0.5, 0, height * 0.2 * scale, 9 * scale, 12 * scale),
        ],
        n=8,
        power=1,
    )
    b.loft(
        "silver",
        [
            (wx * 0.2 + ex * 0.8, 0, height * 0.2 * scale, 26 * scale, 18 * scale),
            ((wx + ex) * 0.5, 0, height * 0.36 * scale, 34 * scale, 22 * scale),
            (wx * 0.8 + ex * 0.2, 0, height * 0.2 * scale, 26 * scale, 18 * scale),
        ],
        n=12,
        power=1,
    )
    b.loft(
        "darkglass",
        [
            (ex, 0, 0.3 * scale, 20 * scale, 14 * scale),
            (ex, 0, height * 0.18 * scale, 22 * scale, 16 * scale),
        ],
        n=12,
        power=1,
    )
    for i in range(10):
        t = i / 9
        x = (west["cx"] + (east["cx"] - west["cx"]) * t) * scale
        b.tube("steel", (x, -22 * scale, 2 * scale), (x, 22 * scale, height * 0.64 * scale), 0.72 * scale, 5)
    b.box("concrete", (4 * scale, 0, 0.8 * scale), (150 * scale, 78 * scale, 1.6 * scale))
    b.frame = previous
    return {"id": "bay-sports", "scale": scale, "max_height": height * scale, "source_spec": "data/landmarks/bay-sports.json"}
