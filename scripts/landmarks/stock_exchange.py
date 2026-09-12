"""SZSE operating centre: square tower on a raised cantilevered podium."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "stock-exchange":
        raise ValueError("stock-exchange builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    h = float(spec["height"]["value"]) * scale
    tw, td = float(spec["tower"]["width_m"]) * scale, float(spec["tower"]["depth_m"]) * scale
    plat = spec["platform"]
    z0 = float(plat["z0"]) * scale
    thick = float(plat["thickness_m"]) * scale
    pw, pd = float(plat["width_m"]) * scale, float(plat["depth_m"]) * scale
    b.box("darkglass", (0, 0, h * 0.5), (tw, td, h))
    b.box("darkglass", (0, 0, z0 + thick * 0.55), (pw, pd, thick * 1.35))
    b.box("stone", (-pw * 0.28, -pd * 0.48, 4.5 * scale), (pw * 0.18, 2.4 * scale, 9 * scale))
    # South diagrid as boxes so preview scale still reads as structure.
    for i, xf in enumerate((-0.36, -0.18, 0.0, 0.18, 0.36)):
        px = xf * pw
        b.box("steel", (px, -pd * 0.32, z0 * 0.48), (4.6 * scale, 7.2 * scale, z0 * 0.92))
        b.tube("steel", (px, -pd * 0.5, 1.2 * scale), (px * 0.22, -pd * 0.04, z0), 2.4 * scale, 6)
        b.tube("steel", (px, pd * 0.42, 1.2 * scale), (px * 0.28, pd * 0.06, z0), 1.6 * scale, 6)
        if i:
            b.tube("steel", (px, -pd * 0.22, 2.0 * scale), ((xf - 0.18) * pw * 0.35, pd * 0.04, z0), 1.2 * scale, 5)
    b.box("concrete", (0, 0, 0.8 * scale), (tw * 1.15, td * 1.15, 1.6 * scale))
    b.frame = previous
    return {"id": "stock-exchange", "scale": scale, "max_height": h, "source_spec": "data/landmarks/stock-exchange.json"}
