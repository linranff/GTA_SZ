"""Guomao Building. Ribbed square shaft, circular crown, big podium; not KK100."""
from __future__ import annotations


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "guomao":
        raise ValueError("guomao builder requires the guomao specification")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    w = float(spec["plan"]["width_m"]) * scale
    d = float(spec["plan"]["depth_m"]) * scale
    h = float(spec["height"]["value"]) * scale
    podium = spec["podium"]
    pw, pd, ph = float(podium["width_m"]) * scale, float(podium["depth_m"]) * scale, float(podium["height_m"]) * scale
    b.box("darkglass", (0, 0, ph * 0.5), (pw, pd, ph))
    b.box("landmarkglass", (0, -pd * 0.72, ph * 0.42), (pw * 0.88, 5 * scale, ph * 0.55))
    # 国贸 gold fascia plus four plates on the podium south glass.
    b.box("gold", (0, -pd * 0.72 - 1.8 * scale, ph * 0.42), (pw * 0.72, 1.6 * scale, 4.4 * scale))
    for x in (-pw * 0.28, -pw * 0.1, pw * 0.1, pw * 0.28):
        b.box("civicred", (x, -pd * 0.72 - 2.8 * scale, ph * 0.42), (6.4 * scale, 0.8 * scale, 2.6 * scale))
        b.box("led", (x, -pd * 0.72 - 3.0 * scale, ph * 0.42), (2.6 * scale, 0.3 * scale, 1.1 * scale))
    b.box("park", (0, 0, ph + 0.15 * scale), (pw * 0.92, pd * 0.92, 0.3 * scale))
    b.box("park", (0, -pd * 0.52, ph + 0.55 * scale), (pw * 0.78, 12 * scale, 1.2 * scale))
    b.box("park", (0, -pd * 0.72, ph * 0.9), (pw * 0.84, 14 * scale, 5.2 * scale))
    b.box("silver", (0, 0, ph + (h - ph) * 0.5), (w, d, h - ph))
    shaft_h = h - ph
    for i in range(8):
        z = ph + shaft_h * (0.14 + i * 0.1)
        b.box("steel", (0, 0, z), (w * 1.04, d * 1.04, 0.55 * scale))
    count = int(spec["ribs"]["count"])
    for i in range(count):
        t = (i + 0.5) / count
        x = -w * 0.5 + t * w
        b.box("steel", (x, -d * 1.08, (ph + h) * 0.5), (2.2 * scale, 3.2 * scale, h - ph - 8 * scale))
        b.box("steel", (x, d * 0.52, (ph + h) * 0.5), (0.55 * scale, 1.2 * scale, h - ph - 8 * scale))
    crown = spec["crown"]
    cr = float(crown["radius_m"]) * scale
    ch = float(crown["height_m"]) * scale
    b.loft(
        "darkglass",
        [
            (0, 0, h + 0.4 * scale, cr * 1.18, cr * 1.18),
            (0, 0, h + ch, cr * 1.2, cr * 1.2),
        ],
        n=16,
        power=1,
    )
    b.loft(
        "silver",
        [
            (0, 0, h + ch, cr * 0.55, cr * 0.55),
            (0, 0, h + ch + 2.8 * scale, cr * 0.32, cr * 0.32),
        ],
        n=12,
        power=1,
    )
    b.loft(
        "silver",
        [
            (-pw * 0.28, pd * 0.12, ph + 0.4 * scale, 14 * scale, 14 * scale),
            (-pw * 0.28, pd * 0.12, ph + 8 * scale, 12 * scale, 12 * scale),
        ],
        n=12,
        power=1,
    )
    b.box("concrete", (0, 0, 0.6 * scale), (pw * 1.06, pd * 1.06, 1.2 * scale))
    b.frame = previous
    return {"id": "guomao", "scale": scale, "max_height": h + 2.4 * scale, "source_spec": "data/landmarks/guomao.json"}
