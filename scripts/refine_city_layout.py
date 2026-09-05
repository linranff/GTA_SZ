"""Choose practical exterior arrival roads and a skyline-facing opening.
These are gameplay staging locations, distinct from surveyed landmark centres.
"""
import json,math
from pathlib import Path
from shapely.geometry import Point,LineString
p=Path('public/city/city.json');c=json.loads(p.read_text());scale=.6
project=lambda x,y:((x-114.025)*102850*scale,(y-22.536)*111320*scale)
roads=[r for r in c['roads'] if r['kind'] in ['primary','secondary','tertiary','trunk'] and '辅' not in r['name']]
lines=[LineString(r['points']) for r in roads]
views={'bamboo':(113.9428,22.522),'tencent':(113.935,22.526),'pingan':(114.0505,22.5301),'civic':(114.0545,22.542),'kk100':(114.1017,22.5405),'diwang':(114.1095,22.5455),'baypark':(113.988,22.5253),'talent':(113.9428,22.515),'lianhua':(114.049,22.554),'xiangmi':(114.024,22.550)}
for m in c['landmarks']:
 q=Point(*project(*views[m['id']]));i=min(range(len(lines)),key=lambda i:lines[i].distance(q));l=lines[i];at=l.project(q);a=l.interpolate(at);b=l.interpolate(min(l.length,at+6))
 if a.distance(b)<1:b=l.interpolate(max(0,at-6))
 yaw=math.atan2(b.x-a.x,b.y-a.y)
 if math.sin(yaw)*(m['x']-a.x)+math.cos(yaw)*(m['z']-a.y)<0:yaw+=math.pi
 m['arrival']=[round(a.x,2),round(a.y,2)];m['yaw']=yaw;m['arrivalRoad']=roads[i]['name']
m=next(m for m in c['landmarks'] if m['id']=='bamboo');c['spawn']={'x':m['arrival'][0],'z':m['arrival'][1],'yaw':m['yaw'],'road':m['arrivalRoad']}
p.write_text(json.dumps(c,ensure_ascii=False,separators=(',',':')))
print(c['spawn']);print([(m['name'],m['arrivalRoad']) for m in c['landmarks']])
