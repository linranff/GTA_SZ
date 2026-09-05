"""Place original community hubs beside mapped roads, never inside carriageways/water/buildings."""
from pathlib import Path
import json, math
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree
root=Path(__file__).resolve().parent.parent
city=json.loads((root/'public/city/city.json').read_text())
land=unary_union([Polygon(p[0],p[1:]) for p in city['land']])
obstacles=[Polygon(b['rings'][0],b['rings'][1:]).buffer(2) for b in city['buildings']]+[Polygon(w['rings'][0],w['rings'][1:]).buffer(2) for w in city['water']]
roads=[LineString(r['points']).buffer(r['width']/2+1) for r in city['roads'] if len(r['points'])>1]
tree=STRtree(obstacles+roads)
spawn=city['spawn'];marks={m['id']:m for m in city['landmarks']}
seeds=[('hub','海湾生活驿站',[spawn['x']+math.sin(spawn['yaw'])*60,spawn['z']+math.cos(spawn['yaw'])*60]),('office','科苑下班驿站',marks['tencent']['arrival']),('workshop','公园城市养护站',marks['baypark']['arrival'])]
sites=[]
for ident,name,target in seeds:
 candidates=[]
 for road in city['roads']:
  if road['kind'] not in ['primary','secondary','tertiary','residential','service','trunk']:continue
  for a,b in zip(road['points'],road['points'][1:]):
   length=math.dist(a,b)
   if length<.5:continue
   yaw=math.atan2(b[0]-a[0],b[1]-a[1])
   for i in range(max(2,math.ceil(length/12))+1):
    t=i/max(2,math.ceil(length/12));px=a[0]+(b[0]-a[0])*t;pz=a[1]+(b[1]-a[1])*t
    if math.dist([px,pz],target)>260:continue
    for side in [-1,1]:
     nx=math.cos(yaw)*side;nz=-math.sin(yaw)*side;offset=road['width']/2+8
     x=px+nx*offset;z=pz+nz*offset;heading=math.atan2(nx,nz);co=math.cos(heading);si=math.sin(heading)
     corners=[(x+lx*co+lz*si,z-lx*si+lz*co) for lx,lz in [(-7.1,-5.1),(7.1,-5.1),(7.1,5.1),(-7.1,5.1)]]
     shape=Polygon(corners)
     if not land.covers(shape) or len(tree.query(shape,predicate='intersects')):continue
     candidates.append((math.dist([px,pz],target),dict(id=ident,name=name,x=x,z=z,heading=heading,arrival=[px,pz],yaw=yaw,road=road['name'],roadWidth=road['width'],footprint=corners)))
 if not candidates:raise RuntimeError('No safe hub site: '+ident)
 site=min(candidates,key=lambda c:c[0])[1];sites.append(site)
result={'version':1,'source':'Original fictional community services on mapped vacant roadside plots','sites':sites}
(root/'public/city/life-sites.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
