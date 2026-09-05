"""Source-grounded Tencent Seafront Towers exterior; see data/landmarks/tencent.json.

No bpy dependency and no export side effects. All source dimensions are real
metres in east, north, up coordinates. Published, map-derived and estimated
dimensions remain separately labelled in the specification.
"""
import math


def _v(obj, key):
    value = obj[key]
    return value['value'] if isinstance(value, dict) else value


class _Mesh:
    def __init__(self, b, scale, offset):
        self.b, self.scale, self.offset = b, scale, offset

    def face(self, material, points, uv=None):
        dx, dy = self.offset
        pts = [((x + dx) * self.scale, (y + dy) * self.scale, z * self.scale)
               for x, y, z in points]
        self.b.face(material, pts, uv)

    def prism(self, material, ring, bottom, top, roof='roof'):
        for p, q in zip(ring, ring[1:] + ring[:1]):
            length = math.dist(p, q)
            self.face(material, [(*p, bottom), (*q, bottom), (*q, top), (*p, top)],
                      [(0, 0), (length / 8, 0), (length / 8, (top-bottom) / 12),
                       (0, (top-bottom) / 12)])
        # The input footprints are simple, approximately convex blade outlines.
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
        for p, q in zip(ring, ring[1:] + ring[:1]):
            self.face(roof, [(cx, cy, top), (*p, top), (*q, top)])
            self.face(material, [(cx, cy, bottom), (*q, bottom), (*p, bottom)])


def _ccw(ring):
    ring = [tuple(p) for p in ring]
    if sum(p[0]*q[1]-q[0]*p[1] for p, q in zip(ring, ring[1:]+ring[:1])) < 0:
        ring.reverse()
    return ring


def _rectangle(center, width, depth, angle):
    c, s = math.cos(angle), math.sin(angle)
    return [(center[0]+x*c-y*s, center[1]+x*s+y*c)
            for x, y in [(-width/2, -depth/2), (width/2, -depth/2),
                         (width/2, depth/2), (-width/2, depth/2)]]


def _tower(m, tower, facade, podium):
    ring = _ccw(_v(tower, 'footprint_m'))
    height, screen = _v(tower, 'height_m'), _v(tower, 'roof_screen_m')
    ground = _v(podium, 'height_m')
    bay, course = _v(facade, 'bay_width_m'), _v(facade, 'floor_course_m')
    projection, mullion = _v(facade, 'max_projection_m'), _v(facade, 'mullion_width_m')
    m.prism('landmarkglass', ring, 0, height-screen)
    for p, q in zip(ring, ring[1:]+ring[:1]):
        m.face('darkglass', [(*p, height-screen), (*q, height-screen),
                            (*q, height), (*p, height)])
    floors = max(1, round((height-screen-ground) / course))
    course = (height-screen-ground) / floors
    for edge, (p, q) in enumerate(zip(ring, ring[1:]+ring[:1])):
        length = math.dist(p, q)
        if length < 0.10:
            continue
        tx, ty = (q[0]-p[0])/length, (q[1]-p[1])/length
        nx, ny = ty, -tx  # CCW exterior normal.
        bays = max(1, round(length/bay))
        pitch = length / bays

        def point(u, z, out=0):
            return p[0]+tx*u+nx*out, p[1]+ty*u+ny*out, z

        # One slightly folded glazing quad plus one return per module. Coarse
        # mullion strips provide depth/readability without one box per pane.
        for floor in range(floors):
            z0, z1 = ground+floor*course, ground+(floor+1)*course
            for col in range(bays):
                u0, u1 = col*pitch+mullion/2, (col+1)*pitch-mullion/2
                module = (col*7+floor*3+edge) % 6
                low, high = (0.08, projection*(0.45+0.25*(module % 3)))
                if module % 2:
                    low, high = high, low
                mat = 'darkglass' if (col*13+floor*7+edge) % 17 == 0 else 'landmarkglass'
                pts = [point(u0, z0+.06, low), point(u1, z0+.06, low),
                       point(u1, z1-.06, high), point(u0, z1-.06, high)]
                m.face(mat, pts, [(0, 0), (1, 0), (1, 1), (0, 1)])
                m.face('silver', [point(u1, z0+.06), pts[1], pts[2], point(u1, z1-.06)])
            m.face('silver', [point(0, z1-.06, .035), point(length, z1-.06, .035),
                              point(length, z1+.06, .035), point(0, z1+.06, .035)])
        # Vertical grid includes the roof screen and the generous ground lobby.
        for col in range(bays+1):
            u = col*pitch
            m.face('silver', [point(u-mullion/2, 0, .07), point(u+mullion/2, 0, .07),
                              point(u+mullion/2, height, .07), point(u-mullion/2, height, .07)])
        m.face('silver', [point(0, height-.35, .10), point(length, height-.35, .10),
                          point(length, height, .10), point(0, height, .10)])
    center = _v(tower, 'center_m')
    angle = math.radians(_v(tower, 'rotation_deg'))
    width, depth = _v(tower, 'width_m'), _v(tower, 'depth_m')
    parapet = _v(facade, 'parapet_height_m')
    # An open screen surrounds a recessed roof deck: do not cap it at the top,
    # which would hide the garden/plant when the viewer approaches from above.
    roof_ring = _rectangle(center, width-4, depth-4, angle)
    roof_z = height-screen+parapet
    m.prism('roof', roof_ring, roof_z, roof_z+.15)
    if tower['id'] == 'north':
        m.prism('park', _rectangle(center, width*.53, depth*.66, angle),
                roof_z+.16, roof_z+.25, 'park')
    plant_height = _v(tower, 'roof_equipment_height_m')
    for sign in [-1, 1]:
        pc = (center[0]+sign*width*.22*math.cos(angle),
              center[1]+sign*width*.22*math.sin(angle))
        m.prism('steel', _rectangle(pc, width*.14, depth*.32, angle),
                roof_z+.15, min(height-.35, roof_z+.15+plant_height))


def _bridge(m, bridge, towers):
    side = _v(bridge, 'lateral_fraction')
    centers = []
    for tower in towers:
        x, y = _v(tower, 'center_m')
        a = math.radians(_v(tower, 'rotation_deg'))
        distance = _v(tower, 'width_m')*side
        if side:
            sleeve_width = _v(bridge, 'width_m')+_v(bridge, 'sleeve_extra_width_m')
            end_distance = (_v(tower, 'width_m')-sleeve_width)/2 + _v(bridge, 'end_overhang_m')
            # Ensure the framed end wall is outside the tower glass; otherwise
            # it can disappear inside the footprint on the longer south blade.
            distance = math.copysign(max(abs(distance), end_distance), side)
        centers.append((x+math.cos(a)*distance, y+math.sin(a)*distance))
    south, north = centers
    dx, dy = north[0]-south[0], north[1]-south[1]
    distance = math.hypot(dx, dy)
    tx, ty = dx/distance, dy/distance
    nx, ny = ty, -tx
    # Connect through the cores, then wrap the blade ends with independently
    # rotated sleeves below. The photographed big windows face the blade ends,
    # not the south/north broad facades of a generic connecting box.
    ends = [0, 0]
    start = (south[0]-tx*ends[0], south[1]-ty*ends[0])
    length = distance+sum(ends)
    width, bottom = _v(bridge, 'width_m'), _v(bridge, 'bottom_m')
    height = _v(bridge, 'height_m')
    top, inset = bottom+height, _v(bridge, 'window_inset_m')

    def point(u, v, z):
        return start[0]+tx*u+nx*v, start[1]+ty*u+ny*v, z

    ring = _ccw([point(u, v, 0)[:2] for u, v in [(0, -width/2), (0, width/2),
                                                 (length, width/2), (length, -width/2)]])
    m.prism('gold', ring, bottom, top, 'gold')
    # The precise sleeve widths remain photo estimates; the angular relationship
    # of the two blade towers comes from the mapped footprints.
    for tower, center in zip(towers, centers):
        a = math.radians(_v(tower, 'rotation_deg'))
        c, s = math.cos(a), math.sin(a)
        sleeve_width = (width+_v(bridge, 'sleeve_extra_width_m') if side else
                        _v(tower, 'width_m')+_v(bridge, 'end_overhang_m'))
        sleeve_depth = _v(tower, 'depth_m')+2*_v(bridge, 'end_overhang_m')
        m.prism('gold', _rectangle(center, sleeve_width, sleeve_depth, a), bottom, top, 'gold')

        def sleeve_point(x, y, z):
            return center[0]+x*c-y*s, center[1]+x*s+y*c, z

        for sign in ([-1, 1] if not side else [1 if side > 0 else -1]):
            x = sign*(sleeve_width/2+.04)
            left, right = -sleeve_depth/2+inset, sleeve_depth/2-inset
            pane = [sleeve_point(x, left, bottom+inset), sleeve_point(x, right, bottom+inset),
                    sleeve_point(x, right, top-inset), sleeve_point(x, left, top-inset)]
            if sign < 0:
                pane.reverse()
            m.face('darkglass', pane)
            columns = max(2, round((right-left)/3.3))
            for i in range(1, columns):
                y = left+i*(right-left)/columns
                strip = [sleeve_point(x+sign*.03, y-.045, bottom+inset),
                         sleeve_point(x+sign*.03, y+.045, bottom+inset),
                         sleeve_point(x+sign*.03, y+.045, top-inset),
                         sleeve_point(x+sign*.03, y-.045, top-inset)]
                if sign < 0:
                    strip.reverse()
                m.face('silver', strip)
    # Side screens use real lamella geometry at a deliberately coarser pitch.
    for sign in [-1, 1]:
        v = sign*(width/2+.045)
        panel = [point(inset, v, bottom+height*.25), point(length-inset, v, bottom+height*.25),
                 point(length-inset, v, top-height*.25), point(inset, v, top-height*.25)]
        if sign < 0:
            panel.reverse()
        m.face('landmarkglass', panel)
        rows = max(2, round(height/_v(bridge, 'panel_pitch_m')))
        for i in range(1, rows):
            z = bottom+i*height/rows
            strip = [point(0, v+sign*.035, z-.12), point(length, v+sign*.035, z-.12),
                     point(length, v+sign*.035, z+.12), point(0, v+sign*.035, z+.12)]
            if sign < 0:
                strip.reverse()
            m.face('gold', strip)
    # Visible roof gardens are schematic; exact planting/atria layout is unknown.
    if bridge['id'] != 'culture':
        garden = _ccw([point(u, v, 0)[:2] for u, v in
                        [(ends[0]+5, -width*.32), (ends[0]+5, width*.32),
                         (length-ends[1]-5, width*.32), (length-ends[1]-5, -width*.32)]])
        m.prism('park', garden, top+.03, top+.18, 'park')


def build(b, lm, spec, scale=0.6):
    """Append geometry to B without finishing/exporting; preserve B.frame.

    lm.x/lm.z are scene coordinates. If lm.lon/lat changes to the building's
    centre, the anchor correction keeps the mapped footprints in place.
    Returns a compact integration report. The material names already exist in
    city_mesh.M. This function does not read files or mutate lm/spec.
    """
    if not math.isfinite(scale) or scale <= 0:
        raise ValueError('scale must be a positive finite number')
    if spec.get('id') != 'tencent':
        raise ValueError('Tencent builder requires the tencent specification')
    anchor = spec['anchor']
    longitude, latitude = lm.get('lon', anchor['lon']), lm.get('lat', anchor['lat'])
    projection = spec['projection']
    offset = ((anchor['lon']-longitude)*projection['east_metres_per_degree'],
              (anchor['lat']-latitude)*projection['north_metres_per_degree'])
    previous = b.frame
    b.frame = (lm['x'], lm['z'], 0)
    m = _Mesh(b, scale, offset)
    towers = sorted(spec['towers'], key=lambda t: t['id'] != 'south')
    try:
        for tower in towers:
            _tower(m, tower, spec['facade'], spec['podium'])
        # Ground connector: podium / entry foyer with a modest projecting deck.
        sc, nc = [_v(t, 'center_m') for t in towers]
        center = ((sc[0]+nc[0])/2, (sc[1]+nc[1])/2)
        angle = math.atan2(nc[1]-sc[1], nc[0]-sc[0])
        length, width = math.dist(sc, nc), _v(spec['podium'], 'connector_width_m')
        height, margin = _v(spec['podium'], 'height_m'), _v(spec['podium'], 'terrace_margin_m')
        m.prism('darkglass', _rectangle(center, length, width, angle), 0, height)
        m.prism('concrete', _rectangle(center, length+margin, width+margin, angle),
                height, height+.35)
        for bridge in spec['bridges']:
            _bridge(m, bridge, towers)
    finally:
        b.frame = previous
    return {'id': 'tencent', 'scale': scale, 'tower_count': len(towers),
            'bridge_count': len(spec['bridges']),
            'max_height': max(_v(t, 'height_m') for t in towers)*scale,
            'source_spec': 'data/landmarks/tencent.json'}


def ground_footprints(lm, spec, scale=0.6):
    """Scene east/north collision polygons for towers and ground connector only."""
    anchor, projection = spec['anchor'], spec['projection']
    dx = (anchor['lon']-lm.get('lon', anchor['lon']))*projection['east_metres_per_degree']
    dy = (anchor['lat']-lm.get('lat', anchor['lat']))*projection['north_metres_per_degree']
    rings = [_ccw(_v(t, 'footprint_m')) for t in spec['towers']]
    sc, nc = [_v(t, 'center_m') for t in sorted(spec['towers'], key=lambda t: t['id'] != 'south')]
    center = ((sc[0]+nc[0])/2, (sc[1]+nc[1])/2)
    angle = math.atan2(nc[1]-sc[1], nc[0]-sc[0])
    rings.append(_rectangle(center, math.dist(sc, nc), _v(spec['podium'], 'connector_width_m'), angle))
    return [[[lm['x']+(x+dx)*scale, lm['z']+(y+dy)*scale] for x, y in ring] for ring in rings]
