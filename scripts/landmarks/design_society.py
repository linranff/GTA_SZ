"""Design Society / SWCAC. Folded white volumes, green slope, cantilever; not Minghua."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "design-society":
        raise ValueError("design-society builder requires that specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    s = scale
    # Street photos: one folded white mass, planted stair slope, a cantilevered window box.
    b.box("silver", (-18 * s, 6 * s, 8 * s), (88 * s, 62 * s, 16 * s))
    b.loft(
        "silver",
        [
            (-36 * s, 4 * s, 14 * s, 38 * s, 28 * s),
            (-8 * s, 10 * s, 24 * s, 32 * s, 24 * s),
            (22 * s, 8 * s, 30 * s, 22 * s, 18 * s),
        ],
        n=6,
        power=1,
    )
    b.loft(
        "park",
        [
            (-48 * s, -48 * s, 0.3 * s, 36 * s, 18 * s),
            (-28 * s, -18 * s, 16 * s, 22 * s, 12 * s),
        ],
        n=6,
        power=1,
    )
    b.box("silver", (36 * s, -42 * s, 22 * s), (44 * s, 46 * s, 12 * s))
    b.box("landmarkglass", (36 * s, -72 * s, 22 * s), (44 * s, 22 * s, 11 * s))
    b.box("silver", (36 * s, -64 * s, 28 * s), (38 * s, 12 * s, 4.4 * s))
    b.box("darkglass", (8 * s, -28 * s, 6 * s), (22 * s, 6 * s, 10 * s))
    b.box("concrete", (0, 0, 0.5 * s), (120 * s, 80 * s, 1.0 * s))
    b.box("water", (0, -52 * s, 0.55 * s), (130 * s, 22 * s, 1.1 * s))
    b.frame = previous
    return {
        "id": "design-society",
        "scale": scale,
        "max_height": 32 * scale,
        "source_spec": "data/landmarks/design-society.json",
        "coverage": "outside",
    }
