"""Hi-Tech Park, first street segment: 科技南路 × 深南大道 at 高新园站.

The district is rebuilt segment by segment from the OSM footprints already in
public/city/city.json (spec.segments[].buildings). No estimated massing blocks and
no asphalt slab over the real roads: the base blocks under these footprints are cut
by exclude_base_buildings.mjs (spec.baseBuildingIds) and this module puts a proper
tower with floor courses, lobby and parapet back on each footprint.
"""
from __future__ import annotations

import math


def _centroid(ring):
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def _longest_edge(ring):
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    best = None
    for i, (x, y) in enumerate(pts):
        xx, yy = pts[(i + 1) % len(pts)]
        length = math.hypot(xx - x, yy - y)
        if best is None or length > best[0]:
            best = (length, (x, y), (xx, yy))
    return best


def _tower(b, building, scale):
    ring = [(float(x) * scale, float(y) * scale) for x, y in building["footprint_m"]]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    h = float(building["height_m"]) * scale
    mat = building["material"]
    lobby = min(6.0 * scale, h * 0.14)
    # Shaft, recessed dark lobby, roof parapet and plant room.
    b.footprint(mat, ring, lobby, h)
    b.footprint("darkglass", ring, 0.0, lobby, scale=0.96)
    b.footprint("silver", ring, lobby - 0.5 * scale, lobby + 0.3 * scale, scale=1.02)
    b.footprint("concrete", ring, h, h + 1.4 * scale, scale=0.98)
    b.footprint("concrete", ring, h + 1.4 * scale, h + 4.2 * scale, scale=0.42)
    # Floor courses every ~3.9 m real; glass towers read them as thin silver lines.
    floor = 3.9 * scale
    z = lobby + floor
    band_mat = "silver" if mat in ("landmarkglass", "darkglass") else "steel"
    while z < h - floor * 0.5:
        b.footprint(band_mat, ring, z, z + 0.22 * scale, scale=1.012)
        z += floor
    # Entrance canopy on the longest street-facing edge, with the building's name plate.
    length, (x0, y0), (x1, y1) = _longest_edge(ring)
    cx, cy = _centroid(ring)
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    nx, ny = my - cy, cx - mx
    n = math.hypot(nx, ny) or 1.0
    nx, ny = nx / n, ny / n
    if (mx - cx) * nx + (my - cy) * ny < 0:
        nx, ny = -nx, -ny
    ex, ey = (x1 - x0) / length, (y1 - y0) / length
    angle = math.atan2(ey, ex)
    previous = b.frame
    bx, by, a = previous
    ox, oy = b.pt((mx + nx * 2.2 * scale, my + ny * 2.2 * scale, 0))[:2]
    b.frame = (ox, oy, a + angle)
    canopy_w = min(length * 0.45, 18 * scale)
    b.box("steel", (0, 0, 4.4 * scale), (canopy_w, 4.4 * scale, 0.3 * scale))
    for sx in (-canopy_w * 0.42, canopy_w * 0.42):
        b.tube("steel", (sx, 1.6 * scale, 0), (sx, 1.6 * scale, 4.3 * scale), 0.14 * scale, 8)
    b.box("gold", (0, -0.6 * scale, lobby + 1.6 * scale), (min(length * 0.5, 16 * scale), 0.5 * scale, 1.5 * scale))
    b.box("led", (0, -0.9 * scale, lobby + 1.6 * scale), (min(length * 0.34, 9 * scale), 0.2 * scale, 0.7 * scale))
    b.frame = previous
    return h + 4.2 * scale


def build(b, lm, spec, scale=0.6):
    if spec.get("id") != "tech-park":
        raise ValueError("tech-park builder requires that specification")
    segments = spec.get("segments") or []
    if not segments:
        raise ValueError("tech-park spec has no segments; blocks_v1 massing is superseded")
    previous = b.frame
    b.frame = (lm["x"], lm["z"], 0)
    max_h = 0.0
    built = []
    for segment in segments:
        for building in segment["buildings"]:
            max_h = max(max_h, _tower(b, building, scale))
            built.append(building["osm_id"])
    b.frame = previous
    return {
        "id": "tech-park",
        "scale": scale,
        "max_height": max_h,
        "source_spec": "data/landmarks/tech-park.json",
        "segments": [s["id"] for s in segments],
        "osm_footprints": built,
    }
