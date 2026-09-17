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
    b.footprint("silver", ring, height, height + height * 0.08, scale=0.72)
    for i in range(9):
        z = height * (0.1 + i * 0.09)
        b.footprint("steel", ring, z, z + 0.7 * scale, scale=1.012)
    b.box("landmarkglass", (-6 * scale, 0, height * 0.5), (8 * scale, 22 * scale, height * 0.86))
    b.box("landmarkglass", (6 * scale, 0, height * 0.5), (8 * scale, 22 * scale, height * 0.86))
    b.box("darkglass", (-13 * scale, -28 * scale, height * 0.46), (18 * scale, 7.2 * scale, height * 0.78))
    b.box("darkglass", (13 * scale, -28 * scale, height * 0.46), (18 * scale, 7.2 * scale, height * 0.78))
    b.box("silver", (0, -18 * scale, height * 0.46), (9.4 * scale, 9.2 * scale, height * 0.82))
    b.box("darkglass", (0, -18 * scale, height * 0.46), (2.4 * scale, 9.4 * scale, height * 0.78))
    b.box("landmarkglass", (0, -31 * scale, height * 0.48), (10.5 * scale, 8.0 * scale, height * 0.86))
    # 七街公馆 gold fascia plus three plates; keep the H-plan, do not move the glass south.
    b.box("darkglass", (0, -34.6 * scale, height * 0.08), (8.4 * scale, 3.2 * scale, 3.8 * scale))
    b.box("gold", (0, -34.6 * scale, height * 0.22), (12 * scale, 1.6 * scale, 4.0 * scale))
    for x in (-3.2 * scale, 0, 3.2 * scale):
        b.box("civicred", (x, -35.6 * scale, height * 0.22), (2.6 * scale, 0.7 * scale, 2.0 * scale))
        b.box("led", (x, -35.8 * scale, height * 0.22), (1.1 * scale, 0.28 * scale, 0.85 * scale))
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
