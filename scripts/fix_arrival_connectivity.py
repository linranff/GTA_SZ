import json,math,collections
from pathlib import Path
p=Path('public/city');c=json.loads((p/'city.json').read_text());n=json.loads((p/'navigation.json').read_text());par=list(range(len(n['nodes'])));adj=collections.defaultdict(list)
def find(x):
 while par[x]!=x:par[x]=par[par[x]];x=par[x]
 return x
for a,b in n['edges']:par[find(a)]=find(b);adj[a].append(b);adj[b].append(a)
main=collections.Counter(find(i) for i in range(len(par))).most_common(1)[0][0];mainnodes=[i for i in range(len(par)) if find(i)==main]
for m in c['landmarks']:
 nearest=min(range(len(par)),key=lambda i:math.dist(m['arrival'],n['nodes'][i]))
 if find(nearest)==main:continue
 i=min(mainnodes,key=lambda i:math.dist(m['arrival'],n['nodes'][i]));d=math.dist(m['arrival'],n['nodes'][i]);assert d<100,(m['name'],d)
 m['arrival']=n['nodes'][i];j=min(adj[i],key=lambda j:math.dist(n['nodes'][j],[m['x'],m['z']]));a,b=n['nodes'][i],n['nodes'][j];m['yaw']=math.atan2(b[0]-a[0],b[1]-a[1]);print('Moved arrival to connected road',m['name'],round(d,1),'m')
(p/'city.json').write_text(json.dumps(c,ensure_ascii=False,separators=(',',':')))
