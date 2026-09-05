"""Pinned-map bridge crossings, park luminaire placement and opposite-shore DSM.
Heights/fixtures are game design, not a survey of current Shenzhen bridges/lights.
"""
from pathlib import Path
import json,math,hashlib
import numpy as np
import shapely
from shapely.geometry import Polygon,LineString,Point,box
from shapely.strtree import STRtree
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/city/coastal';OUT.mkdir(exist_ok=True)
c=json.loads((ROOT/'public/city/city.json').read_text())
def poly(r):return shapely.make_valid(Polygon(r[0],r[1:]))
def parts(g):
 if g.geom_type in ['Polygon','LineString']:yield g
 elif hasattr(g,'geoms'):
  for child in g.geoms:yield from parts(child)
land=shapely.union_all([poly(r) for r in c['land']]);inland=shapely.union_all([poly(p['rings']) for p in c['water']]);water=box(-12000,-16000,12000,4500).difference(land).union(inland)
crossings=[]
for road in c['roads']:
 if float(road['grade'] or 0)<0 or road['width']<4 or len(road['points'])<2:continue
 if road['kind'] in ['footway','cycleway','path','steps','pedestrian','track']:continue
 line=LineString(road['points']);cross=line.intersection(water)
 for part in parts(cross):
  if part.geom_type!='LineString' or part.length<8:continue
  crossings.append({'id':road['id'],'name':road['name'],'width':road['width'],'points':[[round(x,4),round(z,4)] for x,z in part.coords],'length':round(part.length,2),'height':2.8,'ramp':70})
# Highway water intersections already have an OSM bridge tag in most cases;
# also cover missing tags, excluding tunnels. Keep exact IDs in the manifest.
roads=[LineString(r['points']).buffer(r['width']/2+3,cap_style=2) for r in c['roads'] if len(r['points'])>1]
buildings=[poly(b['rings']).buffer(4) for b in c['buildings']]
protected=shapely.union_all(roads+buildings+[inland.buffer(7),land.boundary.buffer(6)])
lights=[];occupied=[]
for i,g in enumerate(c['green']):
 name=g.get('name','');p=poly(g['rings']).intersection(land).difference(protected)
 if not name or not any(k in name for k in ['公园','广场','花园','园林','流花山','海韵','白鹭','沙山','山谷']):continue
 if '红树林' in name or '湿地' in name:continue
 for patch in parts(p):
  if patch.geom_type!='Polygon' or patch.area<1800:continue
  lo=patch.bounds;spacing=95 if patch.area>18000 else 65
  for x in np.arange(math.ceil(lo[0]/spacing)*spacing,lo[2],spacing):
   for z in np.arange(math.ceil(lo[1]/spacing)*spacing,lo[3],spacing):
    pt=Point(float(x),float(z));d=patch.boundary.distance(pt)
    if not patch.contains(pt) or d<6 or d>70:continue
    if any(math.hypot(x-a,z-b)<55 for a,b in occupied):continue
    if len(lights)>=220:break
    occupied.append((x,z));lights.append({'id':f'park-{i}-{len(lights)}','name':name,'x':float(x),'z':float(z),'height':12,'radius':34,'color':[.76,.84,1],'power':.9})
manifest={'schemaVersion':1,'citySha256':hashlib.sha256((ROOT/'public/city/city.json').read_bytes()).hexdigest(),'waterHeight':-.25,'crossings':crossings,'parkLights':lights,'artDirection':'Bridge clearance/ramp and park fixtures are gameplay reconstruction, not surveyed bridge elevations or existing lamp locations.'}
(OUT/'infrastructure.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
# World-space near-shore distance. R=distance from any mapped shore, G=water.
extent=[-10000,-13000,10000,3000];w,h=2048,1536;mask=Image.new('L',(w,h),255);draw=ImageDraw.Draw(mask)
def pixel(r):return [((x-extent[0])/(extent[2]-extent[0])*(w-1),(z-extent[1])/(extent[3]-extent[1])*(h-1)) for x,z in r]
for p in parts(land):
 if p.geom_type!='Polygon':continue
 draw.polygon(pixel(p.exterior.coords),fill=0)
 for ring in p.interiors:draw.polygon(pixel(ring.coords),fill=255)
for p in parts(inland):
 if p.geom_type=='Polygon':draw.polygon(pixel(p.exterior.coords),fill=255)
a=np.asarray(mask)>0;distance=np.where(a,120.,0.);current=a.copy();step=max((extent[3]-extent[1])/h,(extent[2]-extent[0])/w)
for ring in range(1,math.ceil(120/step)+1):
 pad=np.pad(current,1,constant_values=True);eroded=pad[1:-1,1:-1]&pad[:-2,1:-1]&pad[2:,1:-1]&pad[1:-1,:-2]&pad[1:-1,2:]&pad[:-2,:-2]&pad[2:,2:]&pad[:-2,2:]&pad[2:,:-2];distance[current&~eroded]=(ring-.5)*step;current=eroded
rgba=np.zeros((h,w,3),np.uint8);rgba[:,:,0]=np.minimum(255,distance/120*255);rgba[:,:,1]=a*255
Image.fromarray(rgba).save(OUT/'shore-distance.png')
manifest['shoreDistance']={'url':'/city/coastal/shore-distance.png','extent':extent,'maxDistance':120}
(OUT/'infrastructure.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
print(json.dumps({'crossings':len(crossings),'bridgeNames':sorted(set(b['name'] for b in crossings if '后海' in b['name'])),'parkLights':len(lights),'parks':len(set(l['name'] for l in lights))},ensure_ascii=False),flush=True)
# Distant terrain from the two locally pinned 30m Copernicus source tiles.
import rasterio
sources=[]
for lon in [113,114]:
 p=ROOT/f'data/raw/landmarks/Copernicus_DSM_COG_10_N22_00_E{lon}_00_DEM.tif'
 if not p.exists():raise FileNotFoundError(p)
 sources.append(rasterio.open(p))
xs=np.arange(-9500,9501,70);zs=np.arange(-11000,-2300,70);xx,zz=np.meshgrid(xs,zs);lons=xx.ravel()/61710+114.025;lats=zz.ravel()/66792+22.536;heights=np.zeros(lons.shape)
for lon,ds in zip([113,114],sources):
 inds=np.flatnonzero((lons>=lon)&(lons<lon+1));coords=list(zip(lons[inds],lats[inds]));heights[inds]=np.array([v[0] for v in ds.sample(coords)])*.6
# Hide sampled sea and any overlap with the existing modelled city mainland.
valid=(heights>1.5)&(heights<1200);inside=shapely.contains(land,shapely.points(xx.ravel(),zz.ravel()));valid&=~inside
positions=np.column_stack((xx.ravel(),heights,zz.ravel())).round(3);indices=[];cols=len(xs)
for j in range(len(zs)-1):
 for i in range(cols-1):
  a=j*cols+i;b=a+1;d=a+cols;e=d+1
  for tri in [(a,d,b),(b,d,e)]:
   if valid[list(tri)].all():indices.extend(tri)
# Compact to referenced vertices only.
unique=np.unique(indices);mapping={int(v):i for i,v in enumerate(unique)};indices=[mapping[i] for i in indices]
far={'schemaVersion':1,'positions':positions[unique].ravel().tolist(),'indices':indices,'samplingGameMetres':70,'verticalScale':.6,'originWGS84':[114.025,22.536],'sourceType':'Copernicus 30m DSM, distant context only','sources':[]}
for ds in sources:
 p=Path(ds.name);far['sources'].append(json.loads(p.with_suffix('.manifest.json').read_text()));ds.close()
(OUT/'far-shore.json').write_text(json.dumps(far,separators=(',',':')))
print('far shore vertices',len(unique),'triangles',len(indices)//3,flush=True)
