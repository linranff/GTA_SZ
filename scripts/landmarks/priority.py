"""Source-led priority buildings, using the existing city_mesh.B interface.

The supplied JSON contains WGS84 footprints and unscaled local metres. Heights
for Qijie/Fortune remain estimates; MixC part heights are unverified OSM tags.
No photos are embedded as textures. The builder adds no floor/interior plans.
"""
import math


def _edges(ring):
    points = ring[:-1] if ring[0] == ring[-1] else ring
    signed_area = sum(a[0] * c[1] - c[0] * a[1]
                      for a, c in zip(points, points[1:] + points[:1]))
    sign = 1 if signed_area > 0 else -1
    for a, c in zip(points, points[1:] + points[:1]):
        dx, dy = c[0] - a[0], c[1] - a[1]
        width = math.hypot(dx, dy)
        if width > 1e-7:
            yield a, c, width, (dx / width, dy / width), (sign * dy / width, -sign * dx / width)


def _panel(b, material, a, tangent, normal, offset, width, z0, z1, depth):
    x, y = a[0] + tangent[0] * offset, a[1] + tangent[1] * offset
    x += normal[0] * depth
    y += normal[1] * depth
    xx, yy = x + tangent[0] * width, y + tangent[1] * width
    b.face(material, [(x, y, z0), (xx, yy, z0), (xx, yy, z1), (x, y, z1)])


def _band(b, ring, z, scale, material='silver', thickness=.18):
    b.footprint(material, ring, z, z + thickness * scale, 1.008)


def _qijie(b, ring, height, levels, scale):
    # Source photographs show a light structural grid, narrow blue-grey bays,
    # recessed vertical balcony strips and a broad lower commercial zone.
    b.footprint('concrete', ring, 0, height)
    lower = 16.5 * scale
    b.footprint('darkglass', ring, .25 * scale, lower, 1.002)
    upper_levels = levels - 5
    pitch = (height - lower) / upper_levels
    for row in range(upper_levels + 1):
        _band(b, ring, lower + row * pitch, scale, thickness=.28)
    for a, c, width, tangent, normal in _edges(ring):
        count = max(1, round(width / (3.25 * scale)))
        bay = width / count
        for col in range(count):
            # The grid is an exterior approximation, not a unit/floor layout.
            for row in range(upper_levels):
                z0 = lower + row * pitch + .42 * scale
                _panel(b, 'landmarkglass' if col % 4 else 'darkglass', a,
                       tangent, normal, col * bay + .25 * scale,
                       max(.1 * scale, bay - .5 * scale), z0,
                       lower + (row + 1) * pitch - .26 * scale, .035 * scale)
                if count >= 8 and col in (2, count - 3):
                    # Shallow balcony lips keep the observed vertical recess
                    # readable without inventing measured balcony projections.
                    xx = a[0] + tangent[0] * (col + .5) * bay
                    yy = a[1] + tangent[1] * (col + .5) * bay
                    b.tube('silver', (xx - tangent[0] * bay * .42 + normal[0] * .45 * scale,
                                      yy - tangent[1] * bay * .42 + normal[1] * .45 * scale, z0),
                           (xx + tangent[0] * bay * .42 + normal[0] * .45 * scale,
                            yy + tangent[1] * bay * .42 + normal[1] * .45 * scale, z0), .08 * scale, 4)
            _panel(b, 'silver', a, tangent, normal, col * bay, .2 * scale,
                   lower, height + .35 * scale, .09 * scale)
        for floor in range(1, 5):
            _panel(b, 'silver', a, tangent, normal, 0, width,
                   floor * lower / 5, floor * lower / 5 + .3 * scale, .09 * scale)
    _band(b, ring, height, scale, 'concrete', .6)


def _fortune(b, ring, height, levels, scale, component):
    b.footprint('landmarkglass', ring, 0, height)
    lower = 12 * scale
    b.footprint('darkglass', ring, .15 * scale, lower, 1.002)
    floor_pitch = (height - lower) / max(1, levels - 3)
    for floor in range(levels - 2):
        _band(b, ring, lower + floor * floor_pitch, scale, 'silver', .48)
    for a, c, width, tangent, normal in _edges(ring):
        count = max(2, round(width / (2.6 * scale)))
        for column in range(count + 1):
            # Fine curtain-wall mullions sit above broad white spandrel bands.
            _panel(b, 'silver', a, tangent, normal, column * width / count,
                   .07 * scale, lower, height, .045 * scale)
        # Subdivided curved surfaces have no concrete corner at each sample.
        # Keep the old narrow corner treatment on the rectangular B tower.
        if not component.get('renderFootprintLocalMeters'):
            _panel(b, 'concrete', a, tangent, normal, 0, min(width, .7 * scale),
                   0, height + 2.8 * scale, .08 * scale)
        for wall in component.get('facadeSolidWallSpans', []):
            start = [v * scale for v in wall['startLocalMeters']]
            end = [v * scale for v in wall['endLocalMeters']]
            forward = math.dist(a, start) + math.dist(c, end) < .0001 * scale
            reverse = math.dist(a, end) + math.dist(c, start) < .0001 * scale
            if forward or reverse:
                wall_width = min(width, wall['widthMeters'] * scale)
                offset = 0 if forward else width - wall_width
                _panel(b, 'concrete', a, tangent, normal, offset, wall_width,
                       0, height + 2.8 * scale, .09 * scale)
        # Open crown grille visible in the overall photograph.
        crown_count = max(2, round(width / (1.3 * scale)))
        for column in range(crown_count + 1):
            x = a[0] + (c[0] - a[0]) * column / crown_count
            y = a[1] + (c[1] - a[1]) * column / crown_count
            b.tube('silver', (x, y, height), (x, y, height + 2.5 * scale), .10 * scale, 5)
        b.tube('silver', (*a, height + 2.5 * scale), (*c, height + 2.5 * scale), .18 * scale, 6)
    _band(b, ring, lower, scale, 'concrete', .75)


def _mixc_part(b, ring, height, levels, scale):
    # The part footprints, rather than an invented tower profile, generate the
    # three differently elevated wings of each of the B/C/D towers.
    b.footprint('landmarkglass', ring, 0, height)
    for floor in range(1, levels + 1):
        _band(b, ring, floor * height / levels, scale, 'silver', .12)
    for a, c, width, tangent, normal in _edges(ring):
        count = max(2, round(width / (2.7 * scale)))
        for column in range(count + 1):
            _panel(b, 'silver', a, tangent, normal, width * column / count,
                   .085 * scale, 0, height, .04 * scale)
        b.tube('silver', (*a, height + .8 * scale), (*c, height + .8 * scale), .08 * scale, 5)
    _band(b, ring, height, scale, 'concrete', .3)


def build(b, lm, spec, scale=.6):
    """Append one model group and return its traceable replacement metadata.

    ``lm`` must supply project-local ``x`` and ``z`` (already scaled); alternatively
    ``lm`` may be None and coordinates are derived from the project's origin.
    Caller exports ``b.finish(...)`` and removes only ``baseBuildingIds`` from
    the old building mesh. The input spec is one entry in priority-models.json.
    """
    if not math.isfinite(scale) or scale <= 0:
        raise ValueError('scale must be positive and finite')
    lon, lat = spec['centerWGS84']
    lm = lm or {'x': (lon - 114.025) * 102850 * scale,
                'z': (lat - 22.536) * 111320 * scale}
    previous_frame = b.frame
    b.frame = (lm['x'], lm['z'], 0)
    try:
        for component in spec['components']:
            source_ring = component.get('renderFootprintLocalMeters', component['footprintLocalMeters'])
            ring = [[p[0] * scale, p[1] * scale] for p in source_ring]
            height = component['heightMeters'] * scale
            levels = component['levels']
            if len(ring) < 4 or ring[0] != ring[-1] or height <= 0 or levels <= 0:
                raise ValueError('invalid closed footprint/height/levels: ' + component['id'])
            if not all(math.isfinite(v) for p in ring for v in p):
                raise ValueError('non-finite footprint: ' + component['id'])
            if sum(a[0] * c[1] - c[0] * a[1] for a, c in zip(ring, ring[1:])) < 0:
                ring = list(reversed(ring))
            if component['style'] == 'fortune':
                _fortune(b, ring, height, levels, scale, component)
            else:
                {'qijie': _qijie, 'mixc': _mixc_part}[component['style']](
                    b, ring, height, levels, scale)
    finally:
        b.frame = previous_frame
    return {
        'id': spec['id'], 'name': spec['name'], 'x': lm['x'], 'z': lm['z'],
        'lon': lon, 'lat': lat,
        'height': max(c['heightMeters'] + {'fortune': 2.8, 'qijie': .6, 'mixc': .88}[c['style']]
                      for c in spec['components']) * scale,
        'baseBuildingIds': list(spec['baseBuildingIds']),
        'sourceIds': list(spec['sourceIds']), 'modelStatus': spec['modelStatus'],
        'heightStatus': sorted({c['heightStatus'] for c in spec['components']}),
        'limitations': list(spec['limitations']),
        'renderGeometryStatus': sorted({c.get('renderFootprintProvenance', {}).get('status', c['footprintStatus'])
                                        for c in spec['components']}),
        'referenceDataset': 'data/landmarks/priority-places.json',
        'parameterDataset': 'data/landmarks/priority-models.json',
    }
