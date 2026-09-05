"""OSM-derived compressed Shenzhen exterior world. WGS84 -> local meters * .60.
Roads are deliberately flattened for the first driving prototype. All output
is a derivative OSM database (ODbL); unknown building heights are estimates.
"""
import json, math, re, random
from pathlib import Path
from collections import Counter
from shapely.geometry import shape, box, Point, Polygon, LineString, mapping
from shapely.ops import unary_union, polygonize, transform
from shapely.strtree import STRtree
R=Path(__file__).resolve().parents[1]; OUT=R/'public/city';OUT.mkdir(exist_ok=True)
BBOX=[113.915,22.497,114.135,22.575]; SCALE=.60; ORIGIN=[114.025,22.536]
bounds=box(*BBOX)
def project(x,y,z=None):return ((x-ORIGIN[0])*102850*SCALE,(y-ORIGIN[1])*111320*SCALE)
def load(layer):return json.load(open(R/f'data/processed/shenzhen_study/{layer}.geojson'))['features']
def parts(g,kind):
 if g.is_empty:return []
 if g.geom_type==kind:return [g]
 if hasattr(g,'geoms'):return [p for v in g.geoms for p in parts(v,kind)]
 return []
def coords(ring):return [[round(x,2),round(y,2)] for x,y in ring.coords]
def poly(g):return [coords(g.exterior),*[coords(r) for r in g.interiors]]
coasts=[shape(f['geometry']).intersection(bounds) for f in load('coastline') if shape(f['geometry']).intersects(bounds)]
land=max(polygonize(unary_union([bounds.boundary,*coasts])),key=lambda p:p.area)
land=transform(project,land).simplify(.5,preserve_topology=True)
# Mainland south of Futian is delimited by Shenzhen River; prevent Hong Kong
# roads/buildings from becoming part of this selected Shenzhen play area.
mainland=transform(project,Polygon([(113.90,22.49),(113.99,22.49),(114.02,22.513),(114.033,22.519),(114.049,22.518),(114.064,22.519),(114.079,22.523),(114.09,22.529),(114.104,22.527),(114.116,22.526),(114.14,22.538),(114.15,22.59),(113.90,22.59)]))
land=land.intersection(mainland)
landparts=parts(land,'Polygon')
allowed={'trunk','primary','secondary','tertiary','residential','unclassified','service','trunk_link','primary_link','secondary_link','tertiary_link'}
roads=[]
for f in load('roads'):
 t=f['properties']['tags'];k=t.get('highway');g=shape(f['geometry'])
 if k not in allowed or not g.intersects(bounds) or t.get('access') in ['private','no'] or t.get('motor_vehicle')=='no':continue
 # Flatten grade separation consistently, including tunnel centerlines. No
 # claim of surveyed bridge/tunnel reconstruction in this iteration.
 g=transform(project,g.intersection(bounds)).intersection(land.buffer(12))
 try: lanes=max(1,min(5,int(t.get('lanes','2').split(';')[0])))
 except:lanes=2
 width=max(5.8,min(16,lanes*3.0))
 if k=='service':width=4.5
 for line in parts(g,'LineString'):
  line=line.simplify(.8)
  if line.length<3:continue
  roads.append({'id':f['id'],'name':t.get('name','支路'),'kind':k,'width':width,'oneway':t.get('oneway')=='yes','points':coords(line),'grade':t.get('layer','0')})
roadlines=[LineString(r['points']) for r in roads];tree=STRtree(roadlines)
landmarks=[
 ('bamboo','中国华润大厦 · 春笋',113.94161,22.517785,392,'南山 · 后海',70),
 ('tencent','腾讯滨海大厦',113.93108,22.525955,248,'南山 · 科技园',100),
 ('pingan','平安金融中心',114.050355,22.536640,599.1,'福田 · CBD',78),
 ('civic','深圳市民中心',114.05452,22.54637,45,'福田 · 市民中心',240),
 ('kk100','京基100',114.101581,22.545734,441.8,'罗湖 · 蔡屋围',65),
 ('diwang','地王大厦',114.105523,22.545342,384,'罗湖 · 蔡屋围',70),
 ('baypark','深圳湾公园',113.988,22.5241,0,'南山 · 深圳湾',0),
 ('talent','深圳人才公园',113.94417,22.51366,0,'南山 · 后海',0),
 ('lianhua','莲花山公园',114.05324,22.55663,0,'福田 · 莲花山',0),
 ('xiangmi','香蜜湖',114.02683,22.55057,0,'福田 · 香蜜湖',0)]
marks=[]
for id,name,lon,lat,h,area,radius in landmarks:
 x,z=project(lon,lat); p=Point(x,z)
 # Arrival point lies on a driveable surface, never at tower centre.
 ri=int(tree.nearest(p));line=roadlines[ri];q=line.interpolate(line.project(p));dd=min(line.length,max(0,line.project(p))+4);p2=line.interpolate(dd)
 if q.distance(p2)<1:p2=line.interpolate(max(0,line.project(p)-4))
 marks.append({'id':id,'name':name,'lon':lon,'lat':lat,'x':round(x,2),'z':round(z,2),'height':h*SCALE,'area':area,'excludeRadius':radius*SCALE,'arrival':[round(q.x,2),round(q.y,2)],'yaw':math.atan2(p2.x-q.x,p2.y-q.y)})
buildings=[];seen=set();est=Counter()
for f in load('buildings'):
 g=shape(f['geometry']);t=f['properties']['tags']
 if not g.intersects(bounds):continue
 g=transform(project,g.intersection(bounds)); center=g.centroid
 if not land.contains(center) or any(math.hypot(center.x-m['x'],center.y-m['z'])<m['excludeRadius'] for m in marks):continue
 if t.get('building') in ['roof','garage','garages','shed','construction'] or t.get('building:part'):continue
 for p in parts(g,'Polygon'):
  if p.area<22:continue
  seed=f['properties']['osm_id'];rnd=random.Random(seed)
  key=(round(p.centroid.x),round(p.centroid.y))
  if key in seen:continue
  seen.add(key)
  raw=t.get('height','');lev=t.get('building:levels','')
  try:h=float(re.search(r'[0-9.]+',raw).group())*SCALE;status='osm_height'
  except:
   try:h=float(lev)*3.3*SCALE;status='osm_levels_estimated'
   except:h=rnd.choice([18,24,30,39,54,72,96])*SCALE;status='typology_estimate'
  h=max(5,min(290,h));est[status]+=1
  # Preserve footprint shape, reserve pavement clearance where the compressed
  # real streets require it. Reject clipped slivers instead of blocking roads.
  near=tree.query(p.buffer(12)); buffers=[roadlines[i].buffer(roads[int(i)]['width']/2+2.0) for i in near]
  if buffers:p=p.difference(unary_union(buffers))
  for pp in parts(p,'Polygon'):
   if pp.area<20:continue
   pp=pp.simplify(.4)
   typ='office' if h>48 or t.get('building') in ['commercial','office'] else 'residential'
   buildings.append({'id':f['id'],'name':t.get('name',''),'rings':poly(pp),'height':round(h,1),'heightSource':status,'style':typ,'seed':seed})
green=[];water=[]
for layer,dest in [('green',green),('water',water)]:
 for f in load(layer):
  g=shape(f['geometry']);t=f['properties']['tags']
  if not g.intersects(bounds):continue
  if layer=='water' and t.get('natural')=='wetland':continue
  g=transform(project,g.intersection(bounds)).intersection(land)
  for p in parts(g,'Polygon'):
   if p.area<180:continue
   dest.append({'name':t.get('name',''),'rings':poly(p.simplify(1))})
spawnpoint=Point(*project(113.9490,22.5217))
# Pick a westbound Binhai segment beside Houhai to open with Spring Bamboo in view.
choices=[i for i,r in enumerate(roads) if '滨海大道' in r['name'] and '辅' not in r['name'] and r['kind'] in ['trunk','primary']]
si=min(choices,key=lambda i:roadlines[i].distance(spawnpoint));sl=roadlines[si];sp=sl.interpolate(sl.project(spawnpoint));yaw=-math.pi/2
metadata={'version':'0.2','source':'OpenStreetMap contributors / Geofabrik Guangdong 2026-09-04','license':'ODbL-1.0','bboxWGS84':BBOX,'originWGS84':ORIGIN,'horizontalScale':SCALE,'verticalScale':SCALE,'coordinateSystem':'local east/north; equirectangular at Shenzhen latitude, metres scaled 0.60','roadTreatment':'prototype roads flattened; one-way tags kept but arcade driving unrestricted','heightStatus':dict(est),'counts':{'roads':len(roads),'buildings':len(buildings),'green':len(green),'water':len(water),'landmarks':len(marks)},'extent':[round(v,2) for v in land.bounds]}
city={'meta':metadata,'land':[poly(p) for p in landparts],'coast':[coords(transform(project,l).simplify(.6)) for l in coasts if l.geom_type=='LineString'],'roads':roads,'buildings':buildings,'green':green,'water':water,'landmarks':marks,'spawn':{'x':round(sp.x,2),'z':round(sp.y,2),'yaw':yaw,'road':roads[si]['name']}}
(OUT/'city.json').write_text(json.dumps(city,ensure_ascii=False,separators=(',',':')))
(OUT/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
print(json.dumps(metadata,ensure_ascii=False,indent=2));print('spawn',city['spawn']);print('bytes',(OUT/'city.json').stat().st_size)
