"""MixC Luohu. Beige mall, curved glass court, copper fold; not MixC World."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "mixc-luohu":
        raise ValueError("mixc-luohu builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    mall, office = spec["mall"], spec["office"]
    mw, md, mh = float(mall["width_m"]) * scale, float(mall["depth_m"]) * scale, float(mall["height_m"]) * scale
    b.box("stone", (-mw * 0.18, 4 * scale, mh * 0.48), (mw * 0.7, md * 0.85, mh * 0.96))
    b.box("stone", (-mw * 0.18, 4 * scale, mh * 0.96 + mh * 0.08), (mw * 0.49, md * 0.595, mh * 0.16))
    b.box("darkglass", (-mw * 0.18, 4 * scale, mh * 0.48), (max(mw * 0.07, 2.8 * scale), md * 0.88, mh * 0.9))
    for i in range(4):
        z = mh * (0.22 + i * 0.16)
        b.box("steel", (-mw * 0.18, 4 * scale, z), (mw * 0.73, md * 0.88, 0.45 * scale))
    b.loft(
        "landmarkglass",
        [
            (mw * 0.08, -md * 0.42, 0, 24 * scale, 16 * scale),
            (mw * 0.08, -md * 0.42, mh * 0.92, 24 * scale, 16 * scale),
        ],
        n=14,
        power=1,
    )
    b.loft(
        "civicred",
        [
            (mw * 0.3, -md * 0.42, mh * 0.12, 20 * scale, 8 * scale),
            (mw * 0.32, -md * 0.4, mh * 0.5, 24 * scale, 9 * scale),
            (mw * 0.28, -md * 0.42, mh * 0.9, 18 * scale, 8 * scale),
        ],
        n=6,
        power=1,
    )
    b.box("darkglass", (0, -md * 0.42, mh * 0.38), (mw * 0.45, 6 * scale, mh * 0.5))
    b.box("stone", (-mw * 0.22, -md * 0.72, mh * 0.28), (mw * 0.46, 14 * scale, mh * 0.38))
    b.box("landmarkglass", (-mw * 0.18, -md * 0.82, mh * 0.22), (mw * 0.36, 6 * scale, mh * 0.28))
    b.loft(
        "civicred",
        [
            (mw * 0.22, -md * 0.74, mh * 0.18, 16 * scale, 6 * scale),
            (mw * 0.26, -md * 0.78, mh * 0.52, 20 * scale, 7 * scale),
            (mw * 0.2, -md * 0.72, mh * 0.86, 14 * scale, 6 * scale),
        ],
        n=6,
        power=1,
    )
    ox, oy = float(office["east_m"]) * scale, float(office["north_m"]) * scale
    ow, od, oh = float(office["width_m"]) * scale, float(office["depth_m"]) * scale, float(office["height_m"]) * scale
    b.box("landmarkglass", (ox, oy, oh * 0.5), (ow, od, oh))
    for i in range(7):
        z = oh * (0.16 + i * 0.11)
        b.box("steel", (ox, oy, z), (ow * 1.04, od * 1.04, 0.55 * scale))
    # Office plates above the mall so they are not buried in the podium.
    for x in (-6 * scale, 0, 6 * scale):
        b.box("civicred", (ox + x, oy - od * 0.52, oh * 0.42), (4.8 * scale, 0.8 * scale, 3.2 * scale))
        b.box("led", (ox + x, oy - od * 0.54, oh * 0.42), (2.0 * scale, 0.3 * scale, 1.4 * scale))
    # Mall door on the south stone face, below the gold plates.
    b.box("darkglass", (-mw * 0.22, -md * 0.72 - 7.1 * scale, mh * 0.12), (mw * 0.18, 2.4 * scale, mh * 0.16))
    # 万象城 gold fascia plus three plates on the south stone; keep the office plates.
    sign_y = -md * 0.72 - 7.15 * scale
    b.box("gold", (-mw * 0.22, -md * 0.72 - 6.4 * scale, mh * 0.42), (32 * scale, 1.6 * scale, 6.0 * scale))
    for x in (-10 * scale, 0, 10 * scale):
        b.box("civicred", (-mw * 0.22 + x, sign_y, mh * 0.42), (8 * scale, 1.2 * scale, 4.4 * scale))
        b.box("led", (-mw * 0.22 + x, sign_y - 0.2 * scale, mh * 0.42), (3.2 * scale, 0.5 * scale, 1.8 * scale))
    b.box("concrete", (0, 0, 0.5 * scale), (mw * 1.05, md * 1.05, 1.0 * scale))
    b.frame = previous
    return {"id": "mixc-luohu", "scale": scale, "max_height": oh, "source_spec": "data/landmarks/mixc-luohu.json"}
