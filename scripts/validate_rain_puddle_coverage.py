"""Exact CPU proof of the rounded runtime layout; never counts summed road strips as union area."""
import json,math,time,hashlib,gzip
from pathlib import Path
import shapely
from shapely.geometry import Polygon,LineString,Point,box
from PIL import Image,ImageDraw
start=time.perf_counter();out=Path('artifacts/city/rain-puddles-candidate')
city=json.loads(Path('public/city/city.json').read_text());detail=json.loads(Path('public/city/landmark-detail.json').read_text());source=json.loads((out/'unverified-layout.json').read_text())
def poly(r):return shapely.make_valid(Polygon(r[0],r[1:]))
excluded=set(detail['baseBuildingIds']);buildings=[b for b in city['buildings'] if b['id'] not in excluded]+detail['collisionFootprints']
land=shapely.union_all([poly(r) for r in city['land']]);blocked=shapely.union_all([poly(b['rings']) for b in city['water']+city['green']+buildings]);roads=[]
for r in city['roads']:
 if r['grade']!='0' or r['kind'].endswith('_link') or r['width']<3.2:continue
 for a,b in zip(r['points'],r['points'][1:]):
  if math.dist(a,b)>=8:roads.append(LineString([a,b]).buffer(r['width']/2,cap_style=2))
eligible=shapely.union_all(roads).intersection(land).difference(blocked);shapely.prepare(eligible)
print(json.dumps({'stage':'eligible-union','m2':eligible.area,'seconds':time.perf_counter()-start}),flush=True)
def fract(n):return n-math.floor(n)
def shape(p,apron=1,steps=12):
 x,z,dx,dz,length,width,lateral,rw,seed,alpha=p;phase=fract(math.sin((seed+23)*127.1+311.7)*43758.5453123)*math.pi*2;left=[];right=[]
 for i in range(steps+1):
  t=([0,.10,.50,.90,1][i] if steps==4 else i/steps);taper=max(0,math.sin(math.pi*t))**.24;along=(t-.5)*length;wander=width*.10*math.sin(t*10+phase)*taper
  l=(.84+.12*math.sin(t*13+phase)+.09*math.sin(t*31+phase*.6))*width*taper*apron if 0<i<steps else 0
  r=(.82+.14*math.sin(t*17+phase+1.4)+.09*math.cos(t*37+phase))*width*taper*apron if 0<i<steps else 0
  for result,offset in [(left,wander-l),(right,wander+r)]:result.append((x+dx*along-dz*offset,z+dz*along+dx*offset))
 return Polygon(left+right[::-1])
fields=['x','z','dx','dz','length','width','lateral','roadWidth','seed','alpha'];precision=[2,2,6,6,2,2,2,2,0,3]
values=[];water=[];aprons=[];rejected=0
for p in source['pools']:
 row=[round(p[k],dec) if dec else int(p[k]) for k,dec in zip(fields,precision)];wet=shape(row,1.08)
 if not all(eligible.covers(shape(row,1.08,steps).buffer(.03,quad_segs=2)) for steps in [12,6,4]):
  rejected+=1;continue
 values.append(row);water.append(shape(row));aprons.append(wet)
print(json.dumps({'stage':'rounded-containment','accepted':len(values),'rejected':rejected,'seconds':time.perf_counter()-start}),flush=True)
water_union=shapely.union_all(water);apron_union=shapely.union_all(aprons);sum_water=sum(p.area for p in water);overlap=sum_water-water_union.area
s=city['spawn'];centre=Point(s['x'],s['z']);distances=[math.hypot(v[0]-s['x'],v[1]-s['z']) for v in values];order=sorted(range(len(values)),key=lambda i:distances[i]);local=[]
for radius in [80,120,180,250,440,900]:
 clip=centre.buffer(radius,quad_segs=128);rd=eligible.intersection(clip);wet=water_union.intersection(clip);count=sum(d<radius for d in distances)
 old=shapely.union_all([water[i] for i in order[:120 if radius<=440 else 240]]).intersection(clip)
 local.append({'radiusM':radius,'roadUnionM2':rd.area,'waterUnionM2':wet.area,'fraction':wet.area/rd.area,'poolCentres':count,'oldCappedFraction':old.area/rd.area})
lod_areas={str(steps):sum(shape(p,1,steps).area for p in values) for steps in [6,4]}
coverage={'lodWaterFraction':{steps:area/eligible.area for steps,area in lod_areas.items()},'method':'Exact Shapely polygon union of final centimetre-rounded, seed-reconstructed outlines; road union clipped to land minus water, green and current building footprints. Bridge/tunnel/link and width<3.2m excluded. Sloped candidates rejected by source generator; denominator retains those flat-road prototype surfaces conservatively.','minutesAfterRain':20,'target':[.25,.3333333333],'eligibleRoadUnionM2':eligible.area,'waterUnionM2':water_union.area,'fraction':water_union.area/eligible.area,'apronUnionM2':apron_union.area,'outsideEligibleM2':water_union.difference(eligible).area,'overlapM2':overlap,'safetyBufferM':.03,'rejectedExactContainment':rejected,'spawn':local}
stats=source['stats']|{'accepted':len(values),'estimatedWetArea':apron_union.area,'estimatedPuddleArea':water_union.area}
packed={'version':1,'stride':10,'values':[x for row in values for x in row],'stats':stats,'coverage':coverage}
asset=json.dumps(packed,separators=(',',':')).encode();(out/'puddles-layout.json').write_bytes(asset)
report={'scope':'CPU geometry proof, not a rendered screenshot or GPU/performance claim','generation':json.loads((out/'generation.json').read_text()),'coverage':coverage,'pools':len(values),'bytes':len(asset),'gzipBytes':len(gzip.compress(asset)),'sha256':hashlib.sha256(asset).hexdigest(),'seconds':time.perf_counter()-start,'errors':[]}
if not .25<=coverage['fraction']<=1/3:report['errors'].append('water coverage outside 25–33%')
if coverage['outsideEligibleM2']>1e-5:report['errors'].append('water outside eligible asphalt')
if overlap>1:report['errors'].append('overlapping water above 1m2 total tolerance')
if len(asset)>8_000_000:report['errors'].append('raw layout above 8MB')
fallback=[q for i in order[:180] for q in values[i]]
source_path=Path('src/city-rain-puddles.ts');module=source_path.read_text();marker='\n// Embedded prevalidated opening layout; rebuilt by validate_rain_puddle_coverage.py.\n';module=module.split(marker)[0]+marker+'const SPAWN_FALLBACK:number[]='+json.dumps(fallback,separators=(',',':'))+';\n';source_path.write_text(module)
(out/'coverage-validation.json').write_text(json.dumps(report,indent=2))
def parts(g):return [g] if g.geom_type=='Polygon' else [p for p in getattr(g,'geoms',[]) if p.geom_type=='Polygon']
img=Image.new('RGB',(1800,950),(21,30,34));draw=ImageDraw.Draw(img)
for panel,radius in enumerate([440,120]):
 ox=panel*900;scale=850/(radius*2);bounds=box(s['x']-radius,s['z']-radius,s['x']+radius,s['z']+radius)
 def coord(p):return (ox+25+(p[0]-s['x']+radius)*scale,55+(s['z']+radius-p[1])*scale)
 for geom,colour in [(eligible,(92,94,95)),(apron_union,(55,80,88)),(water_union,(67,165,185))]:
  for p in parts(geom.intersection(bounds)):
   draw.polygon([coord(q) for q in p.exterior.coords],fill=colour)
   for r in p.interiors:draw.polygon([coord(q) for q in r.coords],fill=(21,30,34))
 draw.text((ox+25,20),f'CPU top-down / spawn {radius}m radius / water {local[4 if panel==0 else 1]["fraction"]:.1%}',fill='white')
 px,py=coord((s['x'],s['z']));draw.ellipse((px-5,py-5,px+5,py+5),fill=(255,190,90))
img.save(out/'spawn-coverage-plan.png')
print(json.dumps({k:v for k,v in report.items() if k!='generation'},indent=2));assert not report['errors'],report['errors']
