"""Reproducible Lianhuashan relief from a pinned public Copernicus DSM tile.

The source is a 30 m surface model, not a surveyed bare-earth DTM. The game
flattens streets, so we remove a recorded local datum and blend the park edge
and vehicle corridors to that plane. No arbitrary hill-shaped primitive.
"""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
import requests
from shapely.geometry import Point, LineString, shape, mapping
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/landmarks'
OUT = ROOT / 'public/city'
SPECS = ROOT / 'data/landmarks'
TILE = 'Copernicus_DSM_COG_10_N22_00_E114_00_DEM'
URL = f'https://copernicus-dem-30m.s3.amazonaws.com/{TILE}/{TILE}.tif'
NOTICE = ('produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and '
          '© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS '
          'by the European Union and ESA; all rights reserved')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def smoothstep(t):
    t = min(1., max(0., t))
    return t * t * (3 - 2 * t)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true', help='Require cached source and checksum manifest')
    args = parser.parse_args()
    for path in (RAW, OUT, SPECS):
        path.mkdir(parents=True, exist_ok=True)
    tif = RAW / f'{TILE}.tif'
    manifest_path = RAW / f'{TILE}.manifest.json'
    if not tif.exists():
        if args.offline:
            parser.error('Missing cached Copernicus tile; run once without --offline')
        partial = tif.with_suffix('.part')
        try:
            with requests.get(URL, stream=True, timeout=(20, 90)) as response:
                response.raise_for_status()
                with partial.open('wb') as target:
                    for chunk in response.iter_content(1024 * 1024):
                        target.write(chunk)
            partial.replace(tif)
        finally:
            partial.unlink(missing_ok=True)
    checksum = digest(tif)
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if checksum != manifest['sha256']:
            raise ValueError('Cached DSM checksum changed; do not silently replace the baseline')
    else:
        if args.offline:
            parser.error('Missing source manifest; first run must record acquisition provenance')
        manifest = {'url': URL, 'sha256': checksum, 'bytes': tif.stat().st_size,
                    'accessedAt': datetime.now(timezone.utc).isoformat(), 'release': 'AWS Copernicus DEM 2021',
                    'horizontalCRS': 'EPSG:4326', 'verticalDatum': 'EGM2008', 'type': 'DSM',
                    'nativeGridArcSeconds': 1, 'nominalResolutionMeters': 30,
                    'provider': 'Copernicus / ESA / EU, hosted by Sinergise on AWS',
                    'licenceURL': 'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM',
                    'derivativeNotice': NOTICE}
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

    city_path = OUT / 'city.json'
    city = json.loads(city_path.read_text())
    scale = city['meta']['horizontalScale']
    origin = city['meta']['originWGS84']
    assert scale == city['meta']['verticalScale'] == .6
    project = lambda lon, lat, z=None: ((lon-origin[0])*102850*scale, (lat-origin[1])*111320*scale)
    inverse = lambda x, z: (x/(102850*scale)+origin[0], z/(111320*scale)+origin[1])
    green_path = ROOT / 'data/processed/shenzhen_study/green.geojson'
    source = next(f for f in json.loads(green_path.read_text())['features']
                  if f['id'] == 'way/41281446')
    park = transform(project, shape(source['geometry']))
    x_min, z_min, x_max, z_max = park.bounds
    # 15 m mesh sampling interpolates the 30 m source; it adds no claimed accuracy.
    step = 15 * scale
    x0, z0 = math.floor(x_min/step)*step, math.floor(z_min/step)*step
    columns, rows = math.ceil((x_max-x0)/step)+1, math.ceil((z_max-z0)/step)+1
    xs = x0 + np.arange(columns) * step
    zs = z0 + np.arange(rows) * step
    positions = [(float(x), float(z)) for z in zs for x in xs]
    points = [Point(x, z) for x, z in positions]
    inside = np.array([park.covers(p) for p in points])
    boundary_dist = np.array([park.boundary.distance(p) if hit else 0
                              for p, hit in zip(points, inside)])
    with rasterio.open(tif) as dataset:
        # Read a tiny window once; bilinear sampling is at pixel centers.
        west, south = inverse(x0-step, z0-step)
        east, north = inverse(xs[-1]+step, zs[-1]+step)
        window = rasterio.windows.from_bounds(west, south, east, north, dataset.transform)
        window = rasterio.windows.Window(math.floor(window.col_off)-2, math.floor(window.row_off)-2,
                                         math.ceil(window.width)+5, math.ceil(window.height)+5)
        tile_data = dataset.read(1, window=window).astype(float)
        inv_transform = ~dataset.window_transform(window)
        raw = []
        for x, z in positions:
            lon, lat = inverse(x, z)
            c, r = inv_transform * (lon, lat)
            c -= .5
            r -= .5
            i, j = math.floor(c), math.floor(r)
            u, v = c-i, r-j
            val = ((1-v)*((1-u)*tile_data[j, i]+u*tile_data[j, i+1]) +
                   v*((1-u)*tile_data[j+1, i]+u*tile_data[j+1, i+1]))
            raw.append(float(val))
    raw = np.array(raw)
    assert np.isfinite(raw).all() and raw[inside].min() > -100
    # Low border quartile resists tree/building contamination at the urban edge.
    edge = raw[inside & (boundary_dist < 45*scale)]
    datum = round(float(np.percentile(edge, 25)), 3)
    # Only flatten perimeter streets; flattening the service path at the summit
    # would incorrectly cut a trench through the main peak. Interior roads are
    # draped on the height field and share the runtime ground-height sampler.
    road_shapes = [LineString(r['points']).buffer(r['width']/2 + 1.5 + step*math.sqrt(2))
                   for r in city['roads'] if r['kind'] != 'service'
                   and LineString(r['points']).distance(park) < 50*scale]
    road_tree = STRtree(road_shapes)
    lakes = [shape(f['geometry']) for f in json.loads((ROOT/'data/processed/shenzhen_study/water.geojson').read_text())['features']
             if f['properties']['tags'].get('name') == '莲花湖']
    lake = transform(project, unary_union(lakes))
    lake_flat = lake.buffer(step*math.sqrt(2))
    heights = []
    for idx, (point, hit) in enumerate(zip(points, inside)):
        if not hit:
            heights.append(0.)
            continue
        edge_weight = smoothstep(boundary_dist[idx] / (55*scale))
        road_distance = point.distance(road_shapes[int(road_tree.nearest(point))]) if road_shapes else 1000
        road_weight = smoothstep(road_distance / (30*scale))
        lake_weight = smoothstep(point.distance(lake_flat) / (20*scale)) if not lake.is_empty else 1.
        heights.append(round(max(0., raw[idx]-datum)*scale*edge_weight*road_weight*lake_weight, 3))
    grid = {'x0': x0, 'z0': z0, 'dx': step, 'dz': step, 'columns': columns, 'rows': rows, 'heights': heights}
    def height_at(x, z):
        u, v = (x-x0)/step, (z-z0)/step
        i, j = math.floor(u), math.floor(v)
        if i < 0 or j < 0 or i >= columns-1 or j >= rows-1:
            return 0.
        u, v = u-i, v-j
        q = j*columns+i
        if u >= v:
            return heights[q]*(1-u)+heights[q+1]*(u-v)+heights[q+columns+1]*v
        return heights[q]*(1-v)+heights[q+columns+1]*u+heights[q+columns]*(v-u)
    paths = []
    draped_roads = []
    for road in city['roads']:
        line = LineString(road['points'])
        if road['kind'] != 'service' or not line.intersects(park):
            continue
        samples = [line.interpolate(d) for d in np.linspace(0, line.length, max(2, math.ceil(line.length/(8*scale))))]
        if max(height_at(p.x, p.y) for p in samples) < .2:
            continue
        draped_roads.append({'id': road['id'], 'width': road['width'],
                             'points': [[round(p.x, 3), round(p.y, 3), round(height_at(p.x, p.y), 3)] for p in samples]})
    roads_source = ROOT / 'data/processed/shenzhen_study/roads.geojson'
    for feature in json.loads(roads_source.read_text())['features']:
        tags = feature['properties']['tags']
        if tags.get('highway') not in ('path', 'footway', 'steps'):
            continue
        geometry = transform(project, shape(feature['geometry']))
        if geometry.geom_type != 'LineString' or not geometry.intersects(park):
            continue
        clipped = geometry.intersection(park.buffer(-4*scale)).difference(lake.buffer(2*scale))
        for line in ([clipped] if clipped.geom_type == 'LineString' else getattr(clipped, 'geoms', [])):
            if line.geom_type != 'LineString' or line.length < 4:
                continue
            # Densify to avoid trails cutting through terrain between mapped nodes.
            samples = [line.interpolate(d) for d in np.linspace(0, line.length, max(2, math.ceil(line.length/(8*scale))))]
            paths.append({'id': feature['id'], 'kind': tags['highway'], 'width': 1.6*scale,
                          'points': [[round(p.x, 3), round(p.y, 3), round(height_at(p.x, p.y)+.12, 3)] for p in samples]})
    peak_world = project(114.0543242, 22.5561333)
    stats = {'sourceRangeMeters': [round(float(raw[inside].min()), 3), round(float(raw[inside].max()), 3)],
             'gameReliefMeters': max(heights), 'realReliefMeters': round(max(heights)/scale, 3),
             'parkWidthMeters': round((x_max-x_min)/scale, 2), 'parkDepthMeters': round((z_max-z_min)/scale, 2),
             'parkAreaSquareMeters': round(park.area/scale**2, 2),
             'peakHeightGame': round(height_at(*peak_world), 3), 'paths': len(paths)}
    spec = {'schemaVersion': 1, 'id': 'lianhua', 'name': '莲花山公园',
            'sourceManifest': str(manifest_path.relative_to(ROOT)), 'sourceSha256': checksum,
            'boundarySource': {'id': source['id'], 'url': 'https://www.openstreetmap.org/way/41281446',
                               'fileSha256': digest(green_path)},
            'sources': [{'url': 'https://www.sz.gov.cn/szzt2010/gysz/csgy/content/post_10776567.html',
                         'facts': {'parkAreaHectares': 181, 'peakElevationMeters': 100},
                         'notes': '官方为约100m，OSM峰点ele=106；不以此强制归一化DSM。'},
                        {'url': 'https://registry.opendata.aws/copernicus-dem/', 'role': 'DSM specification'}],
            'coordinateSystem': 'local east,north,up; game metres', 'horizontalScale': scale, 'verticalScale': scale,
            'nativeResolutionMeters': 30, 'meshSpacingMeters': 15, 'verticalDatumMetersRemoved': datum,
            'processing': ['Bilinear interpolation of native 1 arc-second DSM',
                           'Subtract lower quartile of park border DSM as local flat-city datum',
                           '55m park-edge, 30m road-corridor and 20m lake-edge smooth blends to existing flat city',
                           'No vertical exaggeration; source includes canopy; not a measured DTM'],
            'confidence': 'source-grounded regional relief; ground surface and border transitions estimated',
            'derivativeNotice': NOTICE, 'stats': stats}
    terrain = {**spec, 'grid': grid, 'boundary': mapping(park), 'paths': paths,
               'drapedRoads': draped_roads,
               'peak': {'x': peak_world[0], 'z': peak_world[1], 'height': height_at(*peak_world)},
               'protectedRoadBuffers': [mapping(r) for r in road_shapes]}
    (OUT/'terrain-detail.json').write_text(json.dumps(terrain, ensure_ascii=False, separators=(',', ':'))+'\n')
    (SPECS/'lianhua.json').write_text(json.dumps(spec, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
