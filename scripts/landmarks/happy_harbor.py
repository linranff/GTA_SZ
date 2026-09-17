"""Bay Glory. White A-frame wheel with capsule gondolas; not the Oh Bay mall."""
from __future__ import annotations

import math


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "happy-harbor":
        raise ValueError("happy-harbor builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    wheel = spec["wheel"]
    height = float(wheel["height_m"]) * scale
    radius = float(wheel["diameter_m"]) * 0.5 * scale
    hub_z = height * 0.72
    pad = spec["pad"]
    b.box("concrete", (0, 0, 0.6 * scale), (float(pad["width_m"]) * scale, float(pad["depth_m"]) * scale, 1.2 * scale))
    b.box("water", (0, -float(pad["depth_m"]) * 1.64 * scale, 0.55 * scale), (140 * scale, 36 * scale, 1.1 * scale))
    b.box("landmarkglass", (-28 * scale, 18 * scale, 6 * scale), (36 * scale, 16 * scale, 12 * scale))
    b.tube("silver", (-22 * scale, -18 * scale, 1 * scale), (0, 0, hub_z), 5.2 * scale, 8)
    b.tube("silver", (22 * scale, -18 * scale, 1 * scale), (0, 0, hub_z), 5.2 * scale, 8)
    b.loft(
        "silver",
        [(0, 0, hub_z - 3.2 * scale, 4.5 * scale, 4.5 * scale), (0, 0, hub_z + 3.2 * scale, 4.5 * scale, 4.5 * scale)],
        n=10,
        power=1,
    )
    spokes = int(wheel["gondolas"])
    for i in range(spokes):
        angle = i * math.tau / spokes
        x = math.cos(angle) * radius
        z = hub_z + math.sin(angle) * radius
        b.tube("silver", (0, 0, hub_z), (x, 0, z), 0.28 * scale, 5)
        b.loft(
            "landmarkglass",
            [
                (x, 0, z - 3.8 * scale, 7.8 * scale, 3.6 * scale),
                (x, 0, z + 3.8 * scale, 7.8 * scale, 3.6 * scale),
            ],
            n=8,
            power=1,
        )
    b.frame = previous
    return {
        "id": "happy-harbor",
        "scale": scale,
        "max_height": height,
        "source_spec": "data/landmarks/happy-harbor.json",
        "coverage": "outside",
    }
