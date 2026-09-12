"""Qijie Gongguan / Harbin Building. OSM H-plan; not the brown Qinghai tower."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "qijie-gongguan":
        raise ValueError("qijie-gongguan builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    height = float(spec["height_m"]["value"]) * scale
    ring = [(x * scale, y * scale) for x, y in spec["plan_ring_m"]]
    b.footprint("silver", ring, 0, height)
    b.footprint("darkglass", ring, height * 0.05, height * 0.97, scale=0.88)
    for i in range(9):
        z = height * (0.1 + i * 0.09)
        b.footprint("steel", ring, z, z + 0.7 * scale, scale=1.012)
    b.box("landmarkglass", (-6 * scale, 0, height * 0.5), (8 * scale, 22 * scale, height * 0.86))
    b.box("landmarkglass", (6 * scale, 0, height * 0.5), (8 * scale, 22 * scale, height * 0.86))
    b.box("darkglass", (-12 * scale, -24 * scale, height * 0.48), (16 * scale, 3.6 * scale, height * 0.8))
    b.box("darkglass", (12 * scale, -24 * scale, height * 0.48), (16 * scale, 3.6 * scale, height * 0.8))
    b.box("silver", (0, -23 * scale, height * 0.5), (3.2 * scale, 4 * scale, height * 0.86))
    b.box("landmarkglass", (0, -21 * scale, height * 0.5), (7 * scale, 6 * scale, height * 0.88))
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        b.box("darkglass", (sx * 22 * scale, sy * 20 * scale, height * 0.5), (5.5 * scale, 5.5 * scale, height * 0.86))
    b.box("concrete", (0, 0, 0.7 * scale), (42 * scale, 38 * scale, 1.4 * scale))
    b.frame = previous
    return {
        "id": "qijie-gongguan",
        "scale": scale,
        "max_height": height,
        "source_spec": "data/landmarks/qijie-gongguan.json",
        "plan": "osm-h",
    }
