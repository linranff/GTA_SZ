"""Check provenance, relief, map-scale identity, replacement and source drift."""
import hashlib
import json
import math
from pathlib import Path
from shapely.geometry import Polygon, Point, LineString
from landmarks.lianhua import height_at

R = Path(__file__).resolve().parents[1]
load = lambda p: json.loads((R/p).read_text())
m = load('public/city/landmark-detail.json')
t = load('public/city/terrain-detail.json')
city = load('public/city/city.json')
errors = []


def check(condition, reason):
    if not condition:
        errors.append(reason)


check(m['horizontalScale'] == m['verticalScale'] == city['meta']['horizontalScale'] == .6, 'Coordinate scale mismatch')
for path, expected in m['sourceSha256'].items():
    check(hashlib.sha256((R/path).read_bytes()).hexdigest() == expected, 'Source changed since GLB build: '+path)
asset = R/'public/city/landmark-detail.glb'
check(asset.stat().st_size == m['assetStats']['bytes'], 'Asset byte count stale; run optimize_landmark_details.mjs')
check(hashlib.sha256(asset.read_bytes()).hexdigest() == m['assetStats'].get('sha256'), 'Asset checksum stale')
g = t['grid']
check(len(g['heights']) == g['columns']*g['rows'], 'Terrain grid length mismatch')
check(all(math.isfinite(h) and 0 <= h < 100 for h in g['heights']), 'Terrain elevations outside plausible game range')
check(t['nativeResolutionMeters'] == 30 and t['meshSpacingMeters'] == 15, 'Source resolution must remain explicit')
check(1800 < t['stats']['parkWidthMeters'] < 1950 and 1200 < t['stats']['parkDepthMeters'] < 1350, 'Lianhua area scale regression')
check(height_at(g, t['peak']['x'], t['peak']['z']) > 45, 'Main peak flattened by road/perimeter treatment')
check(height_at(g, g['x0']-100, g['z0']) == 0, 'Outside terrain height must be zero')
check('landmark_tencent_' in m['replacedMeshPrefixes'] and 'landmark_lianhua_' in m['replacedMeshPrefixes'], 'Old procedural landmark meshes must be replaced')
if m.get('baseBuildingExclusionsRequired'):
    exclusion_path = R/'public/city/building-exclusions.json'
    check(exclusion_path.exists(), 'Rebuild ordinary buildings with landmark exclusions')
    if exclusion_path.exists():
        exclusions = json.loads(exclusion_path.read_text())
        check(set(m['baseBuildingIds']) <= set(exclusions['excludedIds']), 'Base meshes do not exclude all replacement footprints')
        for name in ['buildings.glb', 'facades.glb']:
            asset_path = R/'public/city'/name
            check(asset_path.exists() and hashlib.sha256(asset_path.read_bytes()).hexdigest() == exclusions.get('assets', {}).get(name, {}).get('sha256'),
                  'Base exclusion asset hash mismatch: '+name)
for footprint in m['collisionFootprints']:
    poly = Polygon(footprint['rings'][0], footprint['rings'][1:])
    check(poly.is_valid and poly.area > .5, 'Invalid collision footprint '+footprint['id'])
for mark in m['landmarks']:
    check(all(math.isfinite(mark[k]) for k in ['x', 'z', 'height', 'yaw']), 'Nonfinite landmark '+mark['id'])
    check(mark['photoDistance'] > mark['height']*.8, 'Photo view too close '+mark['id'])
    check(not any(Polygon(f['rings'][0], f['rings'][1:]).contains(Point(*mark['arrival']))
                  for f in m['collisionFootprints']), 'Arrival placed inside replacement building '+mark['id'])
    check(height_at(g, *mark['arrival']) < .2, 'Arrival needs slope-aware review '+mark['id'])
if any(mark['id']=='civic' for mark in m['landmarks']):
    civic = load('data/landmarks/civic.json')
    by_role = {part['role']: part for part in civic['parts']}
    check(by_role['yellow-round']['centerMeters'][0] < 0 < by_role['red-square']['centerMeters'][0],
          'Civic yellow/red tower orientation reversed')
    check('landmark_civic_' in m['replacedMeshPrefixes'], 'Legacy civic roof/towers remain')
    solids = [Polygon(f['rings'][0], f['rings'][1:]) for f in m['collisionFootprints'] if f['id'].startswith('detail-civic-')]
    for road_id in ['way/616988593', 'way/617152037']:
        road = next(road for road in city['roads'] if road['id']==road_id)
        path = LineString(road['points'])
        check(min(p.distance(path) for p in solids) > road['width']/2+1.15,
              'Civic service passage obstructed: '+road_id)
report = {'passed': not errors, 'errors': errors, 'landmarks': [x['id'] for x in m['landmarks']],
          'assetSha256': hashlib.sha256(asset.read_bytes()).hexdigest(),
          'terrain': t['stats'], 'replacedChunks': [p for p in m['replacedMeshPrefixes'] if p.startswith('block_')]}
(R/'artifacts/city/landmark-detail-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(bool(errors))
