"""Inspect Overture coverage, provenance and heuristic overlap, without auto-merging."""
import hashlib
import json
from collections import Counter
from pathlib import Path
from shapely.geometry import box, shape, mapping
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
path = ROOT/'data/raw/shenzhen_bay_overture_buildings.geojson'
data = json.loads(path.read_text())
state = json.loads(Path(str(path)+'.state').read_text())
boundary = box(113.925,22.485,114.02,22.55)
osm_data = json.loads((ROOT/'data/processed/shenzhen_bay/buildings.geojson').read_text())
osm_geoms = [shape(f['geometry']) for f in osm_data['features']]
tree = STRtree(osm_geoms)
counts = Counter()
sources = Counter()
heights = Counter()
features = []
for f in data['features']:
    g = shape(f['geometry'])
    counts['downloaded'] += 1
    if not g.is_valid or g.is_empty or g.geom_type not in {'Polygon','MultiPolygon'}:
        counts['invalid_or_nonpolygon_skipped'] += 1
        continue
    if not g.intersects(boundary):
        counts['outside_bbox_skipped'] += 1
        continue
    g = g.intersection(boundary)
    if g.area <= 0:
        counts['zero_area_skipped'] += 1
        continue
    props = f['properties']
    for source in props.get('sources') or []:
        sources[source.get('dataset','unknown')] += 1
    heights['height_present_unverified' if props.get('height') is not None else 'height_missing'] += 1
    overlap = any(g.intersection(osm_geoms[i]).area / min(g.area, osm_geoms[i].area) >= .5
                  for i in tree.query(g, predicate='intersects') if osm_geoms[i].area > 0)
    status = 'overlaps_osm_review_required' if overlap else 'candidate_addition_review_required'
    counts[status] += 1
    features.append({**f, 'geometry':mapping(g), 'properties':{**props, 'merge_status':status,
        'height_status':'tagged_unverified' if props.get('height') is not None else 'unknown',
        'facade_status':'reference_required','model_status':'not_modeled'}})
output = ROOT/'data/processed/shenzhen_bay/overture_buildings.geojson'
output.write_text(json.dumps({'type':'FeatureCollection','features':features,
    'license':'ODbL-1.0','attribution_url':'https://docs.overturemaps.org/attribution/',
    'release':state['last_release']},ensure_ascii=False,separators=(',',':')))
report = {'release':state['last_release'],'downloaded_utc':state['last_run'],
    'bbox':state['bbox'],'counts':dict(counts),'heights':dict(heights),'source_dataset_occurrences':dict(sources),
    'osm_features':len(osm_geoms),
    'overlap_method':'Intersection area >= 50% of smaller polygon; heuristic only, not identity matching.',
    'limitations':['Do not add OSM and Overture counts to count physical buildings.',
                  'Candidate additions may be outdated, false positives, parts, or differently delineated structures.',
                  'No footprint has been independently surveyed or approved as a final model.']}
(ROOT/'data/processed/building_comparison.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
(ROOT/'data/raw/overture.manifest.json').write_text(json.dumps({
    'source':'Overture Maps Foundation','client':'overturemaps 1.0.2','release':state['last_release'],
    'downloaded_utc':state['last_run'],'bbox':state['bbox'],'bytes':path.stat().st_size,
    'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
    'license':'ODbL-1.0','attribution_url':'https://docs.overturemaps.org/attribution/',
    'source_datasets':list(sources),'source_state':path.name+'.state',
    'download_command':'.venv/bin/overturemaps download --bbox=113.925,22.485,114.02,22.55 -f geojson --type=building --release='+state['last_release']+' -o data/raw/shenzhen_bay_overture_buildings.geojson'
},ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
