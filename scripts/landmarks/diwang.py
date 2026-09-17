"""Shun Hing Square / 地王 twin teal tubes. Must stay distinct from KK100."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "diwang":
        raise ValueError("diwang builder requires the diwang specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    tubes = spec["tubes"]
    offset = float(tubes["offset_m"]) * 1.55 * scale
    rx = float(tubes["radius_m"]) * scale
    # 2026-09-16 in-game review: 0.66 made two needles. Shun Hing Square is a
    # slender slab (~1:9), so give each tube real depth.
    ry = rx * 1.05
    shaft = float(tubes["shaft_top_m"]) * scale
    crown = float(tubes["crown_top_m"]) * scale
    mast = float(tubes["mast_top_m"]) * scale
    dark = float(tubes["base_dark_m"]) * scale
    for sign in (-1, 1):
        cx = sign * offset
        b.loft("landmarkglass", [(cx, 0, dark, rx, ry), (cx, 0, shaft, rx * 0.98, ry * 0.98)], n=18, power=1)
        for i in range(9):
            z = dark + (shaft - dark) * (0.12 + i * 0.09)
            b.loft(
                "silver",
                [(cx, 0, z, rx * 1.05, ry * 1.05), (cx, 0, z + 0.7 * scale, rx * 1.05, ry * 1.05)],
                n=18,
                power=1,
            )
        b.loft("darkglass", [(cx, 0, 0, rx * 1.04, ry * 1.04), (cx, 0, dark, rx, ry)], n=14, power=1)
        # Flat-topped crown with a short shoulder; the twin masts carry the height.
        b.loft("silver", [(cx, 0, shaft - 6 * scale, rx * 1.06, ry * 1.06), (cx, 0, crown, rx * 0.96, ry * 0.96), (cx, 0, crown + 2 * scale, rx * 0.72, ry * 0.72)], n=14, power=1)
        b.tube("steel", (cx, 0, crown), (cx, 0, mast), 0.95 * scale, 8, 0.22 * scale)
        # Per-tube south skin only. A full-width slab hid both tubes.
        b.box("landmarkglass", (cx, -ry * 1.58, shaft * 0.48), (rx * 1.05, 4.2 * scale, shaft * 0.82))
        # 地王 one gold board plus plate per tube; no full-width slab.
        b.box("gold", (cx, -ry * 1.58 - 1.4 * scale, dark * 0.62), (rx * 0.95, 1.2 * scale, 3.6 * scale))
        b.box("civicred", (cx, -ry * 1.58 - 2.2 * scale, dark * 0.62), (rx * 0.72, 0.8 * scale, 2.6 * scale))
        b.box("led", (cx, -ry * 1.58 - 2.4 * scale, dark * 0.62), (rx * 0.28, 0.3 * scale, 1.1 * scale))
    b.box("landmarkglass", (0, 0, shaft * 0.5), (max(0.6 * scale, offset * 0.55), ry * 1.35, shaft))
    # Narrow mid-link only. A full-width south slab hid both tubes.
    b.box("concrete", (0, 0, 0.8 * scale), (offset * 2.6 + rx, ry * 2.8, 1.6 * scale))
    b.frame = previous
    return {"id": "diwang", "scale": scale, "max_height": float(tubes["mast_top_m"]) * scale, "source_spec": "data/landmarks/diwang.json"}
