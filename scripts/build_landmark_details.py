"""Build independent source-grounded landmark assets; never overwrite city roads.

Run with Blender --background --factory-startup --python this_file.py.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from city_mesh import *
import hashlib
from landmarks import tencent, lianhua, priority, civic

city = json.loads((O/'city.json').read_text())
scale = city['meta']['horizontalScale']
origin = city['meta']['originWGS84']
project = lambda lon, lat: ((lon-origin[0])*102850*scale, (lat-origin[1])*111320*scale)
terrain = json.loads((O/'terrain-detail.json').read_text())
tc = json.loads((R/'data/landmarks/tencent.json').read_text())
specs = json.loads((R/'data/landmarks/priority-models.json').read_text())['models']
civic_spec = json.loads((R/'data/landmarks/civic.json').read_text())
objects, records, collisions, replacements = [], [], [], ['landmark_tencent_', 'landmark_lianhua_']
reports = []


def footprint(identifier, ring):
    ring = [[round(x, 4), round(z, 4)] for x, z in ring]
    if ring[-1] != ring[0]:
        ring.append(ring[0])
    collisions.append({'id': identifier, 'rings': [ring]})


def arrival(x, z):
    # Reuse the connected navigation graph for a genuinely reachable destination.
    nav = json.loads((O/'navigation.json').read_text())
    parent = list(range(len(nav['nodes'])))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    adjacency = defaultdict(list)
    for a, b in nav['edges']:
        parent[find(a)] = find(b)
        adjacency[a].append(b)
        adjacency[b].append(a)
    counts = defaultdict(int)
    for i in range(len(parent)):
        counts[find(i)] += 1
    main = max(counts, key=counts.get)
    candidates = [i for i in range(len(parent)) if find(i) == main and adjacency[i]]
    i = min(candidates, key=lambda i: math.dist(nav['nodes'][i], (x, z)))
    a = nav['nodes'][i]
    j = min(adjacency[i], key=lambda j: math.dist(nav['nodes'][j], (x, z)))
    q = nav['nodes'][j]
    return {'arrival': a, 'yaw': math.atan2(q[0]-a[0], q[1]-a[1]), 'arrivalRoad': '周边连通道路'}


def collect(b, name, report=None, smooth=False):
    obs = b.finish(name, smooth)
    objects.extend(obs)
    reports.append({'id': name, 'triangles': sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in obs),
                    'meshes': len(obs), 'report': report})


# Tencent: the legacy marker is a bus stop. Keep geometry anchored through the
# spec, move the map/photo marker to the actual tower group, and replace circles
# with the mapped ground footprint.
legacy = next(lm for lm in city['landmarks'] if lm['id'] == 'tencent')
b = B()
report = tencent.build(b, legacy, tc, scale)
collect(b, 'detail_tencent', report)
tower_rings = []
for tower in tc['towers']:
    ring = [project(*p) for p in tower['footprint_lonlat']]
    tower_rings.append(ring)
    footprint('detail-tencent-'+tower['id'], ring)
centers = [tower['center_m']['value'] for tower in tc['towers']]
mid = [(centers[0][i]+centers[1][i])/2 for i in range(2)]
x, z = legacy['x']+mid[0]*scale, legacy['z']+mid[1]*scale
sc, nc = centers
angle = math.atan2(nc[1]-sc[1], nc[0]-sc[0])
connector = tencent._rectangle(mid, math.dist(sc, nc), tc['podium']['connector_width_m']['value'], angle)
footprint('detail-tencent-connector', [(legacy['x']+a*scale, legacy['z']+c*scale) for a, c in connector])
records.append({**legacy, 'x': x, 'z': z, 'lon': origin[0]+x/(102850*scale), 'lat': origin[1]+z/(111320*scale),
                'detailCollision': True, 'photoDistance': 270, 'photoTargetHeight': 67,
                'photoElevation': .20, 'photoAngle': 1.7, 'sourceStatus': tc['status']})

# Full terrain patch and mapped trail network, exported separately by material.
b = B()
collect(b, 'detail_lianhua', lianhua.build(b, None, terrain, scale), smooth=True)
legacy_hill = next(lm for lm in city['landmarks'] if lm['id'] == 'lianhua')
g = terrain['grid']
records.append({**legacy_hill, 'x': g['x0']+(g['columns']-1)*g['dx']/2,
                'z': g['z0']+(g['rows']-1)*g['dz']/2, 'photoDistance': 1430,
                'photoTargetHeight': 18, 'photoElevation': .35,
                'sourceStatus': '30m DSM; local datum and flat-city edges adapted'})
records[-1]['lon'] = origin[0]+records[-1]['x']/(102850*scale)
records[-1]['lat'] = origin[1]+records[-1]['z']/(111320*scale)

base_ids = {'way/694152192', 'way/694152193'}
for spec in specs:
    x, z = project(*spec['centerWGS84'])
    lm = {'id': spec['id'], 'name': spec['name'], 'x': x, 'z': z,
          'lon': spec['centerWGS84'][0], 'lat': spec['centerWGS84'][1],
          'height': max(c['heightMeters'] for c in spec['components'])*scale,
          'area': '南山 · 华润城' if spec['id'] == 'mixc-world' else '福田 · 竹子林' if spec['id'] == 'fortune-plaza' else '福田 · 香蜜湖',
          'excludeRadius': 0, 'detailCollision': True, 'sourceStatus': spec['modelStatus'], **arrival(x, z)}
    lm['photoDistance'] = 430 if spec['id'] == 'mixc-world' else 150 if spec['id'] == 'fortune-plaza' else 165
    lm['photoTargetHeight'] = lm['height']*.4
    lm['photoElevation'] = .22
    if spec['id'] == 'fortune-plaza':
        lm['photoAngle'] = 0
    b = B()
    result = priority.build(b, lm, spec, scale)
    collect(b, 'detail_'+spec['id'], result)
    lm.update({key: result[key] for key in ['height', 'sourceIds', 'limitations']})
    records.append(lm)
    base_ids.update(spec['baseBuildingIds'])
    for part in spec['components']:
        footprint('detail-'+spec['id']+'-'+part['id'], [project(*p) for p in part.get('renderFootprintWGS84', part['footprintWGS84'])])

# The ordinary-building pipeline excludes base_ids in both base meshes and
# near facade meshes. Its signed asset manifest is checked at integration time.
# This keeps all four affected neighbourhoods on the current ordinary art style.

# Civic Center is an independent replacement: never regenerate the shared
# roads/car GLB just to replace its previous two-red-cylinder approximation.
for name, color, roughness, metal, emission in [
    ('civic_roof_blue', (.035,.29,.52), .29,.52,0),
    ('civic_roof_seam', (.09,.34,.49), .34,.55,0),
    ('civic_fascia', (.72,.79,.79), .38,.34,0),
    ('civic_soffit', (.79,.76,.66), .73,.08,.08),
    ('civic_mullion', (.58,.68,.69), .32,.62,0),
    ('civic_glass', (.045,.22,.27), .15,.55,0),
    ('civic_office_roof', (.27,.35,.36), .65,.12,0),
    ('civic_yellow', (.94,.58,.014), .39,.18,0),
    ('civic_red', (.72,.024,.012), .42,.12,0),
    ('civic_tower_roof', (.63,.66,.64), .46,.3,0),
    ('civic_stone', (.52,.55,.51), .8,0,0),
    ('civic_paving_joint', (.27,.30,.29), .9,0,0),
    ('civic_eave_light', (1,.79,.49), .3,0,.55),
    ('civic_flood_light', (1,.73,.40), .3,0,.55),
]:
    material(name,color,roughness,metal,emission)
legacy_civic = next(lm for lm in city['landmarks'] if lm['id']=='civic')
b = B()
report = civic.build(b,legacy_civic,civic_spec,scale)
collect(b,'detail_civic',report,smooth=True)
# Keep office mullions/tower corners crisp while the canopy curves interpolate.
for ob in objects:
    if ob.name.startswith('detail_civic_') and ob.name not in ['detail_civic_civic_roof_blue','detail_civic_civic_soffit','detail_civic_civic_yellow']:
        for polygon in ob.data.polygons:
            polygon.use_smooth=False
replacements.append('landmark_civic_')
records.append({**legacy_civic,'height':84.7*scale,'excludeRadius':0,'detailCollision':True,
                'photoDistance':360,'photoTargetHeight':22,'photoElevation':.26,'photoAngle':0,
                'sourceStatus':civic_spec['status'],'limitations':civic_spec['limitations']})
for part in civic_spec['parts']:
    collisions.append({'id':'detail-civic-'+part['role'],
                       'rings': [[[round(legacy_civic['x']+x*scale,4),round(legacy_civic['z']+y*scale,4)] for x,y in ring]
                                 for ring in part.get('podiumRingsMeters',part['ringsMeters'])]})

asset = export('landmark-detail', objects)
bpy.ops.wm.save_as_mainfile(filepath=str(A/'landmark-details.blend'))
source_paths = ['data/landmarks/tencent.json', 'data/landmarks/priority-models.json', 'public/city/terrain-detail.json',
                'scripts/landmarks/tencent.py', 'scripts/landmarks/priority.py', 'scripts/landmarks/lianhua.py',
                'scripts/build_landmark_details.py', 'scripts/city_mesh.py']
source_paths += ['data/landmarks/civic.json','scripts/landmarks/civic.py','scripts/prepare_civic_center.py']
manifest = {'schemaVersion': 1, 'asset': '/city/landmark-detail.glb', 'assetStats': asset,
            'replacedMeshPrefixes': replacements, 'baseBuildingIds': sorted(base_ids), 'landmarks': records,
            'baseBuildingExclusionsRequired': True, 'collisionFootprints': collisions, 'terrain': {'url': '/city/terrain-detail.json'},
            'modelReports': reports, 'sourceSha256': {p: hashlib.sha256((R/p).read_bytes()).hexdigest() for p in source_paths},
            'coordinateSystem': 'Blender east,north,up; GLB y-up; runtime preserves root Z reflection',
            'horizontalScale': scale, 'verticalScale': scale,
            'generator': {'blender': bpy.app.version_string},
            'limitations': ['DSM resolution 30m; canopy and flat-city edge adaptation are not surveyed bare earth',
                            'Facade detail and Fortune/Qijie heights include explicitly labelled photo/typology estimates',
                            'MixC only restores mapped tower parts; shopping-street and mall exterior remain pending']}
(O/'landmark-detail.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
print('LANDMARK_DETAILS', json.dumps({'asset': asset, 'models': reports}, ensure_ascii=False), flush=True)
