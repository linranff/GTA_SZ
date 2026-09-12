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
    eiffel = spec["eiffel"]
    h = float(eiffel["height_m"]) * scale
    half = float(eiffel["base_half_m"]) * scale
    for sx, sy in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        b.tube(
            "steel",
            (sx * half, sy * half, 0),
            (sx * 3.2 * scale, sy * 3.2 * scale, h * 0.58),
            1.6 * scale,
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
    b.tube("steel", (0, 0, h), (0, 0, h + 8 * scale), 0.4 * scale, 5)
    # Distant album also shows a small Arc, not a second Eiffel.
    ax, ay = 34 * scale, -pd * 0.22
    b.box("stone", (ax - 8 * scale, ay, 8 * scale), (2.8 * scale, 5.5 * scale, 16 * scale))
    b.box("stone", (ax + 8 * scale, ay, 8 * scale), (2.8 * scale, 5.5 * scale, 16 * scale))
    b.loft(
        "stone",
        [
            (ax - 11 * scale, ay, 13 * scale, 3.2 * scale, 4.2 * scale),
            (ax - 9.2 * scale, ay, 20 * scale, 3.4 * scale, 4.4 * scale),
            (ax - 5.4 * scale, ay, 26 * scale, 3.6 * scale, 4.6 * scale),
            (ax, ay, 30.2 * scale, 3.8 * scale, 4.8 * scale),
            (ax + 5.4 * scale, ay, 26 * scale, 3.6 * scale, 4.6 * scale),
            (ax + 9.2 * scale, ay, 20 * scale, 3.4 * scale, 4.4 * scale),
            (ax + 11 * scale, ay, 13 * scale, 3.2 * scale, 4.2 * scale),
        ],
        n=10,
        power=1,
    )
    b.box("stone", (ax, ay, 29.2 * scale), (24 * scale, 5.2 * scale, 2.4 * scale))
    b.frame = previous
    return {
        "id": "window-world",
        "scale": scale,
        "max_height": h + 6 * scale,
        "source_spec": "data/landmarks/window-world.json",
    }
