"""Extract OSM geometry as layered GeoJSON; keep observed tags, never infer height.

Source polygons are assembled by libosmium, including multipolygon relations and holes.
Study outputs retain intersecting features in full. Regional outputs are spatially
clipped, so neither is an authoritative routing graph or administrative boundary.
"""
import json
import re
from collections import Counter
from pathlib import Path

import osmium
from pyproj import Transformer
from shapely import wkb
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[1]
REGIONS = json.loads((ROOT / 'config/regions.json').read_text())['regions']
STUDY = box(*REGIONS['shenzhen_study']['bbox'])
PROJECT = Transformer.from_crs(4326, 32649, always_xy=True).transform
LAYERS = ['roads', 'buildings', 'green', 'water', 'coastline', 'railways', 'pois']
LANDMARK = re.compile('深圳湾|人才公园|春笋|华润.*大厦|腾讯|莲花山|香蜜|市民中心|滨海大道|深南大道|北环大道|科技园|三和|富士康')

class Extractor(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.factory = osmium.geom.WKBFactory()
        self.layers = {k: [] for k in LAYERS}
        self.failures = Counter()
        self.seen = Counter()

    def store(self, layer, typ, oid, tags, geom):
        if geom.is_empty or not geom.intersects(STUDY):
            return
        if not geom.is_valid:
            self.failures[f'{layer}:invalid_geometry_skipped'] += 1
            return
        props = {'osm_type': typ, 'osm_id': oid, 'tags': tags,
                 'name': tags.get('name:zh', tags.get('name', '')),
                 'source': 'OpenStreetMap', 'license': 'ODbL-1.0'}
        if layer == 'buildings':
            props['height_status'] = ('tagged_unverified' if 'height' in tags
                                      else 'levels_only_unverified' if 'building:levels' in tags
                                      else 'unknown')
            props['facade_status'] = 'reference_required'
            props['model_status'] = 'not_modeled'
        # A water way can validly produce a centerline and an area. Distinguish
        # representations while preserving the original OSM ID in properties.
        feature_id = f'{typ}/{oid}' + (f'/{geom.geom_type}' if layer == 'water' else '')
        self.layers[layer].append({'type': 'Feature', 'id': feature_id,
                                   'properties': props, 'geometry': mapping(geom)})

    def node(self, n):
        if not n.location.valid():
            return
        b = STUDY.bounds
        if not (b[0] <= n.location.lon <= b[2] and b[1] <= n.location.lat <= b[3]):
            return
        tags = dict(n.tags)
        if not tags:
            return
        if (tags.get('amenity') in {'bench', 'drinking_water', 'toilets', 'bicycle_rental', 'shelter'}
                or tags.get('railway') == 'subway_entrance'
                or tags.get('tourism') in {'viewpoint', 'artwork', 'attraction'}
                or LANDMARK.search(tags.get('name', ''))):
            self.store('pois', 'node', n.id, tags, Point(n.location.lon, n.location.lat))

    def way(self, w):
        tags = dict(w.tags)
        layer = ('roads' if 'highway' in tags else
                 'coastline' if tags.get('natural') == 'coastline' else
                 'railways' if 'railway' in tags else
                 'water' if 'waterway' in tags else None)
        if not layer:
            return
        # Cheap extent rejection before GEOS geometry construction.
        coords = [(n.lon, n.lat) for n in w.nodes if n.location.valid()]
        if len(coords) != len(w.nodes) or len(coords) < 2:
            self.failures[f'{layer}:missing_nodes'] += 1
            return
        xs, ys = zip(*coords)
        b = STUDY.bounds
        if max(xs) < b[0] or min(xs) > b[2] or max(ys) < b[1] or min(ys) > b[3]:
            return
        try:
            geom = wkb.loads(self.factory.create_linestring(w), hex=True)
            self.store(layer, 'way', w.id, tags, geom)
        except (RuntimeError, ValueError) as exc:
            self.failures[f'{layer}:geometry_error'] += 1

    def area(self, a):
        tags = dict(a.tags)
        layer = ('buildings' if 'building' in tags or 'building:part' in tags else
                 'water' if tags.get('natural') in {'water', 'wetland'} or tags.get('landuse') in {'reservoir', 'basin'} else
                 'green' if tags.get('leisure') in {'park', 'garden', 'nature_reserve', 'pitch'}
                     or tags.get('landuse') in {'forest', 'grass', 'meadow', 'recreation_ground'}
                     or tags.get('natural') in {'wood', 'scrub', 'grassland'} else None)
        if not layer:
            return
        try:
            geom = wkb.loads(self.factory.create_multipolygon(a), hex=True)
            self.store(layer, 'way' if a.from_way() else 'relation', a.orig_id(), tags, geom)
        except (RuntimeError, ValueError):
            self.failures[f'{layer}:area_error'] += 1

def main():
    pbf = ROOT / 'data/raw/guangdong.osm.pbf'
    with osmium.io.Reader(str(pbf)) as reader:
        snapshot = reader.header().get('osmosis_replication_timestamp')
    handler = Extractor()
    print('Reading regional PBF and assembling multipolygons...', flush=True)
    # libosmium still stores all node locations before this filter, but avoids
    # millions of Python callbacks for untagged coordinate-only nodes.
    native_filter = osmium.filter.KeyFilter('highway', 'building', 'building:part',
        'natural', 'landuse', 'leisure', 'waterway', 'railway', 'amenity', 'tourism', 'name')
    handler.apply_file(str(pbf), locations=True, idx='flex_mem', filters=[native_filter])
    report = {'source_snapshot_utc': snapshot, 'regions': {},
              'geometry_failures': dict(handler.failures),
              'limitations': ['Study box includes neighboring jurisdictions.',
                  'Counts refer to OSM features/segments, not unique roads or physical buildings.',
                  'OSM is incomplete; source snapshot does not mean current survey.',
                  'Heights and access tags are unverified; no height is invented.',
                  'No elevation, facade textures or finished 3D models are included.',
                  'Clipped roads are geometry references, not a ready navigation graph.']}
    landmarks = []
    for key, region in REGIONS.items():
        dest = ROOT / 'data/processed' / key
        dest.mkdir(parents=True, exist_ok=True)
        clip = box(*region['bbox'])
        stats = {'name': region['name'], 'bbox': region['bbox'], 'counts': {}}
        for layer, features in handler.layers.items():
            selected = []
            for feature in features:
                geom = shape(feature['geometry'])
                if not geom.intersects(clip):
                    continue
                output = feature
                if key != 'shenzhen_study':
                    geom = geom.intersection(clip)
                    if geom.is_empty:
                        continue
                    output = {**feature, 'geometry': mapping(geom)}
                if layer == 'water':
                    props = output['properties']
                    output = {**output, 'id': f"{props['osm_type']}/{props['osm_id']}/{geom.geom_type}"}
                selected.append(output)
                if key == 'shenzhen_study' and LANDMARK.search(feature['properties']['name']):
                    landmarks.append({'id': feature['id'], 'layer': layer,
                                      'name': feature['properties']['name'],
                                      'lon': geom.representative_point().x,
                                      'lat': geom.representative_point().y,
                                      'tags': feature['properties']['tags']})
            collection = {'type': 'FeatureCollection', 'name': f'{key}_{layer}',
                          'attribution': '© OpenStreetMap contributors',
                          'license': 'https://www.openstreetmap.org/copyright',
                          'source_snapshot_utc': snapshot, 'features': selected}
            (dest / f'{layer}.geojson').write_text(json.dumps(collection, ensure_ascii=False, separators=(',', ':')))
            stats['counts'][layer] = len(selected)
            if layer == 'buildings':
                stats['building_height_status'] = dict(Counter(f['properties']['height_status'] for f in selected))
            if layer == 'roads':
                stats['road_classes'] = dict(Counter(f['properties']['tags'].get('highway') for f in selected))
                stats['explicit_cycleway_km'] = round(sum(transform(PROJECT, shape(f['geometry'])).length
                    for f in selected if f['properties']['tags'].get('highway') == 'cycleway') / 1000, 2)
        report['regions'][key] = stats
        print(key, stats['counts'], flush=True)
    (ROOT / 'data/processed/coverage_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    (ROOT / 'data/processed/landmarks.json').write_text(json.dumps(landmarks, ensure_ascii=False, indent=2))
    print('Done. Snapshot:', snapshot, 'Geometry warnings:', dict(handler.failures))

if __name__ == '__main__':
    main()
