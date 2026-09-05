"""Union coplanar road surfaces, reserve EVERY vehicle lane, seed foot traffic.
OSM derivative data, same local east/north coordinates as city.json.
"""
import json,math,random
from pathlib import Path
import shapely
from shapely.geometry import LineString,Polygon,Point,box
from shapely.strtree import STRtree
P=Path('public/city');c=json.loads((P/'city.json').read_text());rng=random.Random(408)
roads=c['roads'];lines=[LineString(r['points']) for r in roads]
vehicle=[l.buffer(r['width']/2,cap_style=2,join_style=2) for l,r in zip(lines,roads)]
idx=STRtree(vehicle);asphalt=shapely.union_all(vehicle);shapely.prepare(asphalt)
walks=shapely.union_all([l.buffer(r['width']/2+(2.4 if r['kind'] in ['trunk','primary','secondary','tertiary'] else 1.2),cap_style=2,join_style=2) for l,r in zip(lines,roads)])
paving=walks.difference(asphalt);lane_safe=asphalt.buffer(.45);markings=[];lamps=[];seeds=[]
def clear(x,y,margin=0):
 p=Point(x,y);return not any(vehicle[i].distance(p)<margin+.001 for i in idx.query(p.buffer(margin+.01)))
for r,l in zip(roads,lines):
 width=r['width'];main=r['kind'] in ['trunk','primary','secondary','tertiary']
 for a,b in zip(r['points'],r['points'][1:]):
  dx,dy=b[0]-a[0],b[1]-a[1];d=math.hypot(dx,dy)
  if d<.01:continue
  nx,ny=-dy/d,dx/d
  if main and d>6:
   for off in [-width/2+.35,width/2-.35]:markings.append(LineString([(a[0]+nx*off,a[1]+ny*off),(b[0]+nx*off,b[1]+ny*off)]).buffer(.055,cap_style=2))
   lanes=max(2,round(width/3))
   for j in range(1,lanes):
    off=-width/2+j*width/lanes
    for t in range(4,int(d)-4,10):
     t1=min(d-4,t+3.5);markings.append(LineString([(a[0]+dx*t/d+nx*off,a[1]+dy*t/d+ny*off),(a[0]+dx*t1/d+nx*off,a[1]+dy*t1/d+ny*off)]).buffer(.055,cap_style=2))
  if main:
   for t in range(12,int(d)-5,42):
    for side in [-1,1]:
     x,y=a[0]+dx*t/d+nx*(width/2+1.2)*side,a[1]+dy*t/d+ny*(width/2+1.2)*side
     if clear(x,y,.35):lamps.append([round(x,2),round(y,2),round(nx*side,5),round(ny*side,5)])
  # Sidewalk paths are cut into short safe walking intervals, excluding roads.
  if r['kind']!='trunk' and d>15:
   for side in [-1,1]:
    off=(width/2+1.15)*side
    path=LineString([(a[0]+nx*off,a[1]+ny*off),(b[0]+nx*off,b[1]+ny*off)])
    near=[vehicle[i].buffer(.45) for i in idx.query(path.buffer(.5))];free=path.difference(shapely.union_all(near)) if near else path
    parts=[free] if free.geom_type=='LineString' else getattr(free,'geoms',[])
    for line in parts:
     if line.geom_type=='LineString' and line.length>8:
      aa,bb=line.coords[0],line.coords[-1];seeds.append([*[round(v,2) for v in aa],*[round(v,2) for v in bb]])
# Coastal promenade paths take precedence when populating the bay.
for coast in c['coast']:
 for a,b in zip(coast,coast[1:]):
  d=math.dist(a,b)
  if d<8:continue
  nx,ny=-(b[1]-a[1])/d,(b[0]-a[0])/d;aa=[a[0]+nx*2.5,a[1]+ny*2.5];bb=[b[0]+nx*2.5,b[1]+ny*2.5]
  if all(clear(*q,.5) for q in [aa,bb]):seeds.append([*aa,*bb])
# Markings are a union too, so repeated OSM ways cannot make flickering stripes.
markings=shapely.union_all(markings).intersection(asphalt)
def triangles(g):
 out=[]
 for t in shapely.constrained_delaunay_triangles(g).geoms:
  if t.geom_type=='Polygon':out.append([[round(x,4),round(y,4)] for x,y in list(t.exterior.coords)[:3]])
  elif hasattr(t,'geoms'):
   for tt in t.geoms:out.extend(triangles(tt))
 return out
result={}
for n,g in [('asphalt',asphalt),('pavement',paving),('roadline',markings)]:
 result[n]=triangles(g);print(n,len(result[n]),flush=True)
(P/'street-surfaces.json').write_text(json.dumps(result,separators=(',',':')))
(P/'lamps.json').write_text(json.dumps(lamps,separators=(',',':')))
(P/'pedestrian-paths.json').write_text(json.dumps(seeds,separators=(',',':')))
trees=json.loads((P/'trees.json').read_text());kept=[t for t in trees if clear(t[0],t[1],(4.4 if t[2]==1 else 4.1)*t[3]+1)]
(P/'trees.json').write_text(json.dumps(kept,separators=(',',':')))
(P/'street-validation.json').write_text(json.dumps({'inputTrees':len(trees),'treesOutsideAllVehicleLanes':len(kept),'removedTrees':len(trees)-len(kept),'pedestrianPaths':len(seeds),'lamps':len(lamps),'roadSurfaceMethod':'planar polygon union; constrained triangulation; no duplicate faces'},indent=2))
# Fixed staging choice is gameplay art direction, not a claimed surveyed POI.
c['spawn']={'x':-2664.20293141859,'z':-862.2368664502956,'yaw':-1.7200612514194764,'road':'滨海大道'}
(P/'city.json').write_text(json.dumps(c,ensure_ascii=False,separators=(',',':')))
print('trees',len(trees),'→',len(kept),'walking paths',len(seeds),'lamps',len(lamps),flush=True)
