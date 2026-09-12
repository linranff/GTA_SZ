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
            (mw * 0.32, -md * 0.58, mh * 0.1, 22 * scale, 8 * scale),
            (mw * 0.42, -md * 0.72, mh * 0.52, 30 * scale, 11 * scale),
            (mw * 0.24, -md * 0.5, mh * 0.98, 16 * scale, 7 * scale),
        ],
        n=6,
        power=1,
    )
    b.box("darkglass", (0, -md * 0.42, mh * 0.38), (mw * 0.45, 6 * scale, mh * 0.5))
    ox, oy = float(office["east_m"]) * scale, float(office["north_m"]) * scale
    ow, od, oh = float(office["width_m"]) * scale, float(office["depth_m"]) * scale, float(office["height_m"]) * scale
    b.box("landmarkglass", (ox, oy, oh * 0.5), (ow, od, oh))
    b.box("concrete", (0, 0, 0.5 * scale), (mw * 1.05, md * 1.05, 1.0 * scale))
    b.frame = previous
    return {"id": "mixc-luohu", "scale": scale, "max_height": oh, "source_spec": "data/landmarks/mixc-luohu.json"}
