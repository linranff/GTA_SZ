"""Select a reproducible 600 m study segment on an actual mapped coastal cycleway."""
import json
from pathlib import Path
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform, substring

ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'data/processed/shenzhen_bay'
roads=json.loads((folder/'roads.geojson').read_text())['features']
buildings=json.loads((folder/'buildings.geojson').read_text())['features']
road=next(f for f in roads if f['id']=='way/255653770')
station=next(f for f in buildings if f['id']=='way/1194924337')
to_m=Transformer.from_crs(4326,32649,always_xy=True).transform
to_ll=Transformer.from_crs(32649,4326,always_xy=True).transform
line=transform(to_m,shape(road['geometry']))
anchor=transform(to_m,shape(station['geometry'])).representative_point()
center=line.project(anchor)
start=max(0,min(center-300,line.length-600))
segment=substring(line,start,min(start+600,line.length))
geo=transform(to_ll,segment)
feature={'type':'Feature','id':'pilot_600m','geometry':mapping(geo),'properties':{
    'name':'深圳湾公园地铁站附近滨海骑行道样板候选',
    'source_osm_way':road['id'],'source_tags':road['properties']['tags'],
    'selection_anchor':station['id'],'length_m':round(segment.length,2),
    'station_anchor_distance_m':round(line.distance(anchor),2),
    'source_chainage_start_m':round(start,2),
    'status':'candidate_reference_only',
    'unknown':['width','elevation','current pavement','furniture styles','current access rules'],
    'note':'600m is an editorial production extent, not an official trail name or measured construction boundary.'}}
(folder/'pilot_route.geojson').write_text(json.dumps({'type':'FeatureCollection','features':[feature],
    'attribution':'© OpenStreetMap contributors','license':'ODbL-1.0'},ensure_ascii=False,indent=2))
print(json.dumps(feature['properties'],ensure_ascii=False,indent=2))
