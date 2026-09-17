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
    for i in range(10):
        z = h * (0.12 + i * 0.08)
        b.box("silver", (0, -td * 0.54, z), (tw * 0.96, 2.2 * scale, 1.2 * scale))
        b.box("steel", (0, td * 0.52, z), (tw * 0.92, 1.4 * scale, 0.7 * scale))
    for i in range(7):
        t = (i + 0.5) / 7
        x = -tw * 0.46 + t * tw * 0.92
        b.box("silver", (x, -td * 0.62, h * 0.52), (4.2 * scale, 4.4 * scale, h * 0.88))
    b.box("steel", (-tw * 0.5, -td * 0.5, h * 0.5), (2.6 * scale, 2.6 * scale, h))
    b.box("steel", (tw * 0.5, -td * 0.5, h * 0.5), (2.6 * scale, 2.6 * scale, h))
    b.box("darkglass", (0, 0, z0 + thick * 0.55), (pw, pd, thick * 1.35))
    b.box("stone", (-pw * 0.28, -pd * 0.48, 4.5 * scale), (pw * 0.18, 2.4 * scale, 9 * scale))
    # 深交所 gold fascia plus three plates; stay outside the slab.
    b.box("gold", (0, -pd * 0.5 - 0.2 * scale, z0 + thick * 0.55), (pw * 0.42, 1.6 * scale, 6.0 * scale))
    for x in (-pw * 0.16, 0, pw * 0.16):
        b.box("civicred", (x, -pd * 0.5 - 1.1 * scale, z0 + thick * 0.55), (10 * scale, 1.2 * scale, 4.2 * scale))
        b.box("led", (x, -pd * 0.5 - 1.3 * scale, z0 + thick * 0.55), (4.0 * scale, 0.4 * scale, 1.6 * scale))
    # South diagrid as boxes so preview scale still reads as structure.
    for i, xf in enumerate((-0.36, -0.18, 0.0, 0.18, 0.36)):
        px = xf * pw
        b.box("steel", (px, -pd * 0.88, z0 * 0.48), (4.6 * scale, 7.2 * scale, z0 * 0.92))
        b.tube("steel", (px, -pd * 1.08, 1.2 * scale), (px * 0.22, -pd * 0.04, z0), 2.4 * scale, 6)
        b.tube("steel", (px, pd * 0.42, 1.2 * scale), (px * 0.28, pd * 0.06, z0), 1.6 * scale, 6)
        if i:
            b.tube("steel", (px, -pd * 0.22, 2.0 * scale), ((xf - 0.18) * pw * 0.35, pd * 0.04, z0), 1.2 * scale, 5)
    b.box("concrete", (0, 0, 0.8 * scale), (tw * 1.15, td * 1.15, 1.6 * scale))
    # Open undercroft under the cantilever; not another fascia or south-shifted sign.
    b.box("darkglass", (0, -pd * 0.72, z0 * 0.28), (pw * 0.26, 8.2 * scale, z0 * 0.46))
    b.frame = previous
    return {"id": "stock-exchange", "scale": scale, "max_height": h, "source_spec": "data/landmarks/stock-exchange.json"}
