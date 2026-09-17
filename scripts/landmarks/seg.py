"""SEG Plaza. Octagonal dark glass shaft on a white mall; antenna already gone."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "seg":
        raise ValueError("seg builder requires the seg specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    rings = [(float(item["z"]), float(item["radius"])) for item in spec["profile"]["rings"]]
    power = float(spec["profile"].get("power", 0.92))
    b.loft("darkglass", [(0, 0, z * scale, r * scale, r * scale) for z, r in rings], n=8, power=power)
    h = rings[-1][0] * scale
    r_top = rings[-1][1] * scale

    def _r_at(z_m):
        for (z0, r0), (z1, r1) in zip(rings, rings[1:]):
            if z0 <= z_m <= z1:
                t = 0 if z1 == z0 else (z_m - z0) / (z1 - z0)
                return r0 + (r1 - r0) * t
        return rings[-1][1]

    # Skip the gold letter board around 84 m. Rings stay on the octagon, not a slab.
    for z_m in (55, 72, 100, 130, 165, 200, 230, 260):
        r = _r_at(z_m) * scale
        z = z_m * scale
        b.loft(
            "steel",
            [(0, 0, z, r * 1.04, r * 1.04), (0, 0, z + 0.7 * scale, r * 1.04, r * 1.04)],
            n=8,
            power=1,
        )
    b.loft("silver", [(0, 0, h - 4 * scale, r_top * 1.02, r_top * 1.02), (0, 0, h + 1.2 * scale, r_top * 0.92, r_top * 0.92)], n=8, power=1)
    b.box("steel", (-4.2 * scale, -r_top * 1.02, h + 10 * scale), (4.6 * scale, 4.6 * scale, 20 * scale))
    b.box("steel", (4.2 * scale, -r_top * 1.02, h + 10 * scale), (4.6 * scale, 4.6 * scale, 20 * scale))
    podium = spec["podium"]
    pw = float(podium["width_m"]) * scale
    pd = float(podium["depth_m"]) * scale
    ph = float(podium["height_m"]) * scale
    b.box("stone", (0, 0, ph * 0.45), (pw, pd, ph * 0.9))
    b.box("darkglass", (0, 0, ph * 0.45), (max(pw * 0.08, 3.6 * scale), pd * 1.02, ph * 0.82))
    b.box("stone", (-pw * 0.46, -pd * 0.98, ph * 0.4), (24 * scale, 24 * scale, ph * 0.78))
    # SW stone pavilion door and plate; not another mall through-slot.
    b.box("darkglass", (-pw * 0.46, -pd * 0.98 - 12.15 * scale, ph * 0.18), (8 * scale, 2.4 * scale, ph * 0.22))
    b.box("civicred", (-pw * 0.46, -pd * 0.98 - 12.15 * scale, ph * 0.42), (10 * scale, 0.7 * scale, 2.2 * scale))
    b.box("led", (-pw * 0.46, -pd * 0.98 - 12.3 * scale, ph * 0.42), (4.0 * scale, 0.28 * scale, 0.9 * scale))
    b.box("darkglass", (pw * 0.42, -pd * 0.94, ph * 0.42), (pw * 0.38, pd * 0.38, ph * 0.78))
    b.box("landmarkglass", (pw * 0.36, -pd * 1.02, ph * 0.3), (10 * scale, 6.8 * scale, ph * 0.48))
    b.box("darkglass", (0, pd * 0.42, ph * 0.38), (pw * 0.72, 6 * scale, ph * 0.55))
    b.box("silver", (0, 0, ph + 0.35 * scale), (pw * 0.96, pd * 0.9, 0.7 * scale))
    # South-face mall door on the white stone; not another through-slot.
    b.box("darkglass", (0, -pd * 0.5 - 0.15 * scale, ph * 0.18), (pw * 0.16, 2.4 * scale, ph * 0.22))
    # SEG three letter plates on the white mall south fascia.
    for x in (-8 * scale, 0, 8 * scale):
        b.box("civicred", (x, -pd * 0.52, ph * 0.72), (6.8 * scale, 2.2 * scale, 5.6 * scale))
        b.box("led", (x, -pd * 0.54, ph * 0.72), (2.8 * scale, 0.8 * scale, 2.4 * scale))
    # Narrow gold letter board on the shaft south; not a full-width slab.
    shaft_r = 17.5 * scale
    shaft_z = ph + 48 * scale
    b.box("gold", (0, -shaft_r - 0.5 * scale, shaft_z), (14 * scale, 1.4 * scale, 16 * scale))
    for x in (-4.2 * scale, 0, 4.2 * scale):
        b.box("civicred", (x, -shaft_r - 1.3 * scale, shaft_z), (3.4 * scale, 0.7 * scale, 8 * scale))
        b.box("led", (x, -shaft_r - 1.5 * scale, shaft_z), (1.4 * scale, 0.28 * scale, 3.2 * scale))
    b.box("concrete", (0, 0, 0.6 * scale), (pw * 1.04, pd * 1.04, 1.2 * scale))
    b.frame = previous
    return {"id": "seg", "scale": scale, "max_height": h + 16 * scale, "source_spec": "data/landmarks/seg.json"}
