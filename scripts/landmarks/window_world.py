"""Window of the World. Eiffel-scale marker in a miniature park; not Paris."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "window-world":
        raise ValueError("window-world builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    pad = spec["pad"]
    pw, pd = float(pad["width_m"]) * scale, float(pad["depth_m"]) * scale
    b.box("park", (0, 0, 0.15 * scale), (pw, pd, 0.3 * scale))
    b.box("concrete", (0, -pd * 0.38, 0.2 * scale), (pw * 0.28, 16 * scale, 0.32 * scale))
    # 世界之窗 four plates on the south gate lintel; keep the Eiffel where it is.
    gate_y = -pd * 0.38
    b.box("darkglass", (0, gate_y, 5.2 * scale), (28 * scale, 2.8 * scale, 8.4 * scale))
    b.box("gold", (0, gate_y, 10.4 * scale), (42 * scale, 3.6 * scale, 4.8 * scale))
    for x in (-15.6 * scale, -5.2 * scale, 5.2 * scale, 15.6 * scale):
        b.box("civicred", (x, gate_y - 1.9 * scale, 10.4 * scale), (8.4 * scale, 0.8 * scale, 3.2 * scale))
        b.box("led", (x, gate_y - 2.1 * scale, 10.4 * scale), (3.4 * scale, 0.3 * scale, 1.4 * scale))
    eiffel = spec["eiffel"]
    h = float(eiffel["height_m"]) * scale
    half = float(eiffel["base_half_m"]) * scale
    for sx, sy in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        b.tube(
            "steel",
            (sx * half, sy * half, 0),
            (sx * 3.2 * scale, sy * 3.2 * scale, h * 0.58),
            2.0 * scale,
            5,
        )
        b.tube(
            "steel",
            (sx * half * 0.55, sy * half * 0.55, h * 0.32),
            (sx * 1.6 * scale, sy * 1.6 * scale, h * 0.78),
            1.1 * scale,
            5,
        )
    b.loft(
        "silver",
        [
            (0, 0, h * 0.5, 8.5 * scale, 8.5 * scale),
            (0, 0, h * 0.8, 3.6 * scale, 3.6 * scale),
            (0, 0, h, 1.2 * scale, 1.2 * scale),
        ],
        n=8,
        power=1,
    )
    b.box("steel", (0, 0, h * 0.58), (18 * scale, 18 * scale, 1.8 * scale))
    # South lattice only. Orbiting tubes hide; 4 legs alone look like poles.
    b.tube("steel", (-half, -half * 1.08, 0), (half, -half * 1.08, h * 0.56), 2.2 * scale, 5)
    b.tube("steel", (half, -half * 1.08, 0), (-half, -half * 1.08, h * 0.56), 2.2 * scale, 5)
    b.tube("steel", (-half * 0.55, -half * 0.62, h * 0.32), (half * 0.55, -half * 0.62, h * 0.76), 0.85 * scale, 5)
    b.tube("steel", (half * 0.55, -half * 0.62, h * 0.32), (-half * 0.55, -half * 0.62, h * 0.76), 0.85 * scale, 5)
    b.tube("steel", (0, 0, h), (0, 0, h + 8 * scale), 0.4 * scale, 5)
    # Distant album also shows a small Arc, not a second Eiffel.
    ax, ay = 34 * scale, -pd * 1.06
    b.box("stone", (ax - 11 * scale, ay, 11 * scale), (3.2 * scale, 6.2 * scale, 22 * scale))
    b.box("stone", (ax + 11 * scale, ay, 11 * scale), (3.2 * scale, 6.2 * scale, 22 * scale))
    # 凯旋门石墩南皮字牌；不填拱洞，不加满宽南板。
    for sx in (-1, 1):
        b.box("civicred", (ax + sx * 11 * scale, ay - 3.25 * scale, 11 * scale), (2.8 * scale, 0.7 * scale, 2.4 * scale))
        b.box("led", (ax + sx * 11 * scale, ay - 3.4 * scale, 11 * scale), (1.1 * scale, 0.28 * scale, 1.0 * scale))
    # Wider hoop so the Arc reads next to the Eiffel, not a garden wicket.
    b.loft(
        "stone",
        [
            (ax - 15.2 * scale, ay, 16.4 * scale, 1.8 * scale, 2.4 * scale),
            (ax - 12.6 * scale, ay, 26.8 * scale, 1.8 * scale, 2.4 * scale),
            (ax - 8.2 * scale, ay, 34.2 * scale, 1.9 * scale, 2.5 * scale),
            (ax, ay, 37.8 * scale, 2.0 * scale, 2.6 * scale),
            (ax + 8.2 * scale, ay, 34.2 * scale, 1.9 * scale, 2.5 * scale),
            (ax + 12.6 * scale, ay, 26.8 * scale, 1.8 * scale, 2.4 * scale),
            (ax + 15.2 * scale, ay, 16.4 * scale, 1.8 * scale, 2.4 * scale),
        ],
        n=12,
        power=1,
    )
    b.frame = previous
    return {
        "id": "window-world",
        "scale": scale,
        "max_height": h + 6 * scale,
        "source_spec": "data/landmarks/window-world.json",
    }
