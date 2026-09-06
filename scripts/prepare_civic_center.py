"""Derive Civic Center exterior polygons from the existing OSM extract.

Ordinary Python/Shapely step; no Blender import or scene mutation.
"""
import hashlib
import json
from pathlib import Path
from shapely.geometry import Polygon, box, mapping
from shapely.ops import unary_union, triangulate
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parents[1]
source = ROOT/'data/processed/futian/buildings.geojson'
features = {f['id']: f for f in json.loads(source.read_text())['features']}
center = [114.05452, 22.54637]
# Normalise the mapped roof envelope to the documented 486m span. The depth
# uses the widely published 154m dimension, explicitly secondary evidence.
sx, sy = .979, .949


def polygon(identifier):
    return Polygon([((p[0]-center[0])*102850*sx, (p[1]-center[1])*111320*sy)
                    for p in features[identifier]['geometry']['coordinates'][0]],
                   [[((p[0]-center[0])*102850*sx, (p[1]-center[1])*111320*sy)
                     for p in ring] for ring in features[identifier]['geometry']['coordinates'][1:]])


def rings(poly):
    poly = orient(poly, sign=1)
    return [[[round(x, 5), round(y, 5)] for x, y in ring.coords]
            for ring in [poly.exterior, *poly.interiors]]


def triangles(poly, grid=None):
    cells = [poly]
    if grid:
        x0, y0, x1, y1 = poly.bounds
        cells = []
        x = x0
        while x < x1:
            y = y0
            while y < y1:
                clipped = poly.intersection(box(x, y, x+grid, y+grid))
                if clipped.area > .00001:
                    cells.extend([clipped] if clipped.geom_type == 'Polygon' else
                                 [p for p in clipped.geoms if p.geom_type == 'Polygon'])
                y += grid
            x += grid
    return [[[round(x, 5), round(y, 5)] for x, y in list(t.exterior.coords)[:3]]
            for cell in cells for t in triangulate(cell) if cell.covers(t)]


roof_ids = [f'way/{i}' for i in range(783584159, 783584167)] + ['relation/8531208', 'way/783584168']
roof = unary_union([polygon(i) for i in roof_ids])
assert roof.geom_type == 'Polygon' and roof.is_valid
parts = []
for identifier, role in [('relation/10837976', 'west-office'), ('relation/10837977', 'east-office'),
                         ('way/616988599', 'yellow-round'), ('way/616988601', 'red-square')]:
    p = polygon(identifier)
    cx,cy = list(p.centroid.coords)[0]
    parts.append({'id': identifier, 'role': role, 'ringsMeters': rings(p),
                  'roofTrianglesMeters': triangles(p), 'centerMeters': [cx,cy]})
    if not role.endswith('office'):
        parts[-1]['podiumRingsMeters'] = rings(box(cx-26,cy-29,cx+26,cy+29))
        parts[-1]['podiumStatus'] = 'Photo-fitted rectangular glazed base, inside mapped service-road corridors'

spec = {
    'id': 'civic', 'name': '深圳市民中心', 'centerWGS84': center,
    'status': 'Mapped component footprints; roof surface, facade details and lighting fitted to two user photographs',
    'sources': [
        {'url': 'https://2bur.cscec.com/xwzx6/qykw6/201810/P020181022582902814473.pdf',
         'publisher': '中建二局', 'evidence': '486m roof span; maximum 84.7m; blue wing roof'},
        {'url': 'https://pnr.sz.gov.cn/attachment/1/1285/1285348/10537364.pdf',
         'publisher': '深圳市规划和自然资源局', 'evidence': '深圳市地名志下册866–867页; five-storey wings and coloured towers'},
        {'url': 'https://litemagic.com/en/Case/casepage.aspx?id=100000073374632',
         'publisher': 'LiteMagic', 'evidence': '2700K column/soffit flood lighting; red/yellow towers and blue canopy'},
        {'path': str(source.relative_to(ROOT)), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
         'sourceIds': roof_ids + [p['id'] for p in parts], 'evidence': 'OSM footprint only; height tags not treated as measured'}],
    'parameters': {'roofSpanMeters': 486, 'roofDepthMeters': 154, 'maximumHeightMeters': 84.7,
                   'footprintNormalization': [sx, sy], 'wingHeightMeters': 19,
                   'roofSurface': 'Photo fitted smooth centre arch, lower shoulders, raised outer tips'},
    'roof': {'ringsMeters': rings(roof), 'trianglesMeters': triangles(roof, 4)},
    'parts': parts,
    'limitations': ['Roof depth 154m is secondary-source corroborated, not confirmed from accessible primary text.',
                    'OSM tower height 91.5m conflicts with documented total 84.7m and is not used.',
                    'Roof section, facade panel spacing, sloping tower tops and stairs are exterior photo estimates.',
                    'No interiors or photographic textures; service roads below the canopy remain passable.']
}
refs = ['443caddf-7884-4916-b256-51c5c7fdbff6', '6351dbac-a5c1-4f71-a919-8dda687c43b5']
spec['userReferences'] = []
for name, view in zip(refs, ['north looking south: red left/yellow right', 'south looking north: yellow left/red right']):
    p = Path('/var/folders/d7/wvgz98n12052lfd2pwxqc4q80000gn/T')/f'codex-clipboard-{name}.png'
    spec['userReferences'].append({'name': p.name, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None,
                                   'view': view, 'usage': 'Shape/colour reference only; image not shipped'})
(ROOT/'data/landmarks/civic.json').write_text(json.dumps(spec, ensure_ascii=False, separators=(',', ':'))+'\n')
print(json.dumps({'roofTriangles': len(spec['roof']['trianglesMeters']), 'boundsMeters': roof.bounds, 'parts': len(parts)}))
