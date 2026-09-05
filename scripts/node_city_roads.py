import json,shapely
from shapely.geometry import LineString
from pathlib import Path
p=Path('public/city');c=json.loads((p/'city.json').read_text());lines=[LineString(r['points']) for r in c['roads']];network=shapely.unary_union(lines);lookup={};nodes=[];edges=[]
def add(pt):
 key=tuple(round(v,1) for v in pt)
 if key not in lookup:lookup[key]=len(nodes);nodes.append(list(key))
 return lookup[key]
for line in network.geoms:
 prev=None
 for pt in line.coords:
  i=add(pt)
  if prev is not None and prev!=i:edges.append([prev,i])
  prev=i
(p/'navigation.json').write_text(json.dumps({'nodes':nodes,'edges':edges},separators=(',',':')))
print('Noded road graph',len(nodes),'nodes',len(edges),'edges')
