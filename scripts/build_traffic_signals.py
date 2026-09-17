"""Signalised junctions: mast-arm traffic lights on every approach of trunk/primary/secondary/tertiary crossings.

  .venv/bin/python scripts/build_traffic_signals.py --prepare   # junctions -> public/city/signals/traffic-signals.json
  blender -b --python scripts/build_traffic_signals.py           # model -> public/city/signals/traffic-signal.glb + manifest

Junctions come from shared polyline vertices in city.json. Most arterials are drawn as two one-way
carriageways, so a crossing of two dual carriageways is four nodes 10–25 m apart; nodes within 30 m are
clustered into one junction and its arms are the outward road directions merged by heading. Each arm
that carries traffic INTO the junction gets one pole on the driver's right, a mast arm over the incoming
lanes and a three-aspect head facing the approaching traffic. Phase groups are the two heading axes.
Pole positions have shapely clearance proofs (land, no water, outside buildings, off every carriageway).
This is a game adaptation of Shenzhen's common cantilever signal, not a survey of real signal positions.
"""
from pathlib import Path
import sys, math, json, random

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/city/signals'; OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'artifacts/city/traffic-signals'; ART.mkdir(parents=True,exist_ok=True)
SIGNAL_KINDS={'trunk','primary','secondary','tertiary'}
CYCLE={'greenA':13,'amber':3,'allRed':1.2,'greenB':10}  # seconds; total = 13+3+1.2+10+3+1.2 = 31.4

def prepare():
 import shapely
 from shapely.geometry import Polygon, Point, LineString
 from shapely.strtree import STRtree
 rng=random.Random(20260917)
 c=json.loads((ROOT/'public/city/city.json').read_text())
 def poly(rings):return shapely.make_valid(Polygon(rings[0],rings[1:]))
 land=shapely.union_all([poly(r) for r in c['land']]); water=shapely.union_all([poly(p['rings']) for p in c['water']])
 buildings=[poly(p['rings']) for p in c['buildings']]
 for extra in ['landmark-detail.json','landmark-candidates.json']:
  path=ROOT/'public/city'/extra
  if path.exists():buildings.extend(poly(p['rings']) for p in json.loads(path.read_text()).get('collisionFootprints',[]))
 building_index=STRtree(buildings)
 roads=[r for r in c['roads'] if r['grade']=='0']
 carriageways=[LineString(r['points']).buffer(r['width']/2,cap_style=2,join_style=2) for r in roads]
 road_index=STRtree(carriageways)
 for g in [land,water]:shapely.prepare(g)
 # 1. Shared vertices of signal-grade roads; an interior vertex contributes two arms, an endpoint one.
 signal_roads=[r for r in roads if r['kind'] in SIGNAL_KINDS]
 key=lambda p:(round(p[0]*2),round(p[1]*2))
 node_arms={}  # key -> list of (road index, vertex index)
 for ri,r in enumerate(signal_roads):
  for vi,p in enumerate(r['points']):node_arms.setdefault(key(p),[]).append((ri,vi))
 candidates=[]
 for k,arms in node_arms.items():
  ids={signal_roads[ri]['id'] for ri,_ in arms}
  degree=sum(2 if 0<vi<len(signal_roads[ri]['points'])-1 else 1 for ri,vi in arms)
  if degree>=3 and len(ids)>=2:candidates.append((k[0]/2,k[1]/2,arms))
 # 2. Cluster nodes within 30 m (union-find over a grid).
 parent=list(range(len(candidates)))
 def find(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 grid={}
 for i,(x,z,_) in enumerate(candidates):grid.setdefault((math.floor(x/30),math.floor(z/30)),[]).append(i)
 for i,(x,z,_) in enumerate(candidates):
  cx,cz=math.floor(x/30),math.floor(z/30)
  for dx in (-1,0,1):
   for dz in (-1,0,1):
    for j in grid.get((cx+dx,cz+dz),[]):
     if j>i and math.hypot(candidates[j][0]-x,candidates[j][1]-z)<30:parent[find(i)]=find(j)
 clusters={}
 for i in range(len(candidates)):clusters.setdefault(find(i),[]).append(i)
 checks={'clusters':len(clusters),'colinear':0,'noApproach':0,'poleBlocked':0,'armsPlaced':0}
 junctions=[]
 def turn(a,b):return abs(math.atan2(math.sin(a-b),math.cos(a-b)))
 def chain(ri,vi,step,centre,limit=110):
  """Outward polyline from vertex `vi` of way `ri`, continuing across way endpoints onto the straightest
  signal-grade continuation (< 40°) with the same traffic sense. Returns (points, incoming)."""
  r=signal_roads[ri];pts=r['points'];out=[pts[vi]];incoming=(not r['oneway']) or step==-1;visited={r['id']};i=vi
  while True:
   while 0<=i+step<len(pts):
    i+=step;out.append(pts[i])
    if math.hypot(pts[i][0]-centre[0],pts[i][1]-centre[1])>limit:return out,incoming
   if len(out)<2:return out,incoming
   end=out[-1];h=math.atan2(end[0]-out[-2][0],end[1]-out[-2][1]);best=None
   for rj,vj in node_arms.get(key(end),[]):
    q=signal_roads[rj]
    if q['id'] in visited:continue
    for st in (-1,1):
     if not 0<=vj+st<len(q['points']):continue
     if q['oneway'] and (st==-1)!=incoming:continue  # keep the traffic sense of the first way
     n=q['points'][vj+st];t=turn(math.atan2(n[0]-end[0],n[1]-end[1]),h)
     if t<math.radians(40) and (best is None or t<best[0]):best=(t,rj,vj,st)
   if not best:return out,incoming
   _,ri,i,step=best;r=signal_roads[ri];pts=r['points'];visited.add(r['id'])
 def along(points,target,centre):
  """Point on the polyline at distance `target` from the junction centre, or None when it ends first."""
  for i in range(1,len(points)):
   a,b=points[i-1],points[i];da=math.hypot(a[0]-centre[0],a[1]-centre[1]);db=math.hypot(b[0]-centre[0],b[1]-centre[1])
   if db>=target:t=min(1,max(0,(target-da)/max(1e-6,db-da)));return (a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)
  return None
 for members in clusters.values():
  xs=[candidates[i][0] for i in members];zs=[candidates[i][1] for i in members]
  cx,cz=sum(xs)/len(xs),sum(zs)/len(zs);radius=max(math.hypot(x-cx,z-cz) for x,z in zip(xs,zs));centre=(cx,cz)
  reach=max(22,radius+14)
  raw=[];seen=set()
  for i in members:
   for ri,vi in candidates[i][2]:
    for step in (-1,1):
     if not 0<=vi+step<len(signal_roads[ri]['points']):continue
     pts,incoming=chain(ri,vi,step,centre)
     p=along(pts,reach,centre);q=along(pts,reach*.55,centre)
     if not p or not q:continue
     heading=math.atan2(p[0]-q[0],p[1]-q[1])  # tangent, so both lines of a dual carriageway merge
     sig=(signal_roads[ri]['id'],step)
     if sig in seen:continue
     seen.add(sig);raw.append({'heading':heading,'road':signal_roads[ri],'points':pts,'incoming':incoming,'point':p})
  if len(raw)<3:continue
  raw.sort(key=lambda a:a['heading'])
  arms=[]
  for a in raw:
   for arm in arms:
    if turn(a['heading'],arm['heading'])<math.radians(28):arm['members'].append(a);break
   else:arms.append({'heading':a['heading'],'members':[a]})
  if len(arms)<3:continue
  for arm in arms:
   hs=[m['heading'] for m in arm['members']];arm['heading']=math.atan2(sum(math.sin(h) for h in hs),sum(math.cos(h) for h in hs))
  h0=arms[0]['heading']
  for arm in arms:
   d=turn(arm['heading'],h0)%math.pi
   arm['group']=0 if (d<math.radians(45) or d>math.radians(135)) else 1
  if not any(a['group']==1 for a in arms):checks['colinear']+=1;continue
  # Crossing carriageways: every at-grade signal-grade way near the junction that is not roughly parallel
  # to the approach. OSM chops ways at junction nodes, so the short internal pieces count too.
  nearby=[(i,roads[i]) for i in road_index.query(Point(cx,cz).buffer(radius+16)) if roads[i]['kind'] in SIGNAL_KINDS]
  def crossing_for(heading):
   keep=[]
   for i,r in nearby:
    pts=r['points'];best=min(range(len(pts)),key=lambda k:math.hypot(pts[k][0]-cx,pts[k][1]-cz))
    a=pts[max(0,best-1)];b=pts[min(len(pts)-1,best+1)];h=math.atan2(b[0]-a[0],b[1]-a[1]);d=turn(h,heading)%math.pi
    if math.radians(30)<d<math.radians(150):keep.append(carriageways[i])
   return shapely.union_all(keep) if keep else None
  placed=[]
  for arm in arms:
   inc=[m for m in arm['members'] if m['incoming']]
   if not inc:checks['noApproach']+=1;continue
   u=(math.sin(arm['heading']),math.cos(arm['heading']));right_u=(u[1],-u[0])
   inc.sort(key=lambda m:-((m['point'][0]-cx)*right_u[0]+(m['point'][1]-cz)*right_u[1]))
   m=inc[0];r=m['road'];w=r['width'];pts=m['points']
   crossing=crossing_for(arm['heading'])
   far=0
   if crossing is not None and len(pts)>1:
    hit=LineString(pts).intersection(crossing)
    if not hit.is_empty:far=max(math.hypot(x-cx,z-cz) for geom in getattr(hit,'geoms',[hit]) for x,z in geom.coords)
   far=max(far,min(4,radius))
   lanes=w if r['oneway'] else w/2  # width of the lanes that approach the junction (right half of a two-way road)
   pole=None
   # Right-hand kerb first, moving the stop line back in 3 m steps; for a one-way carriageway the central
   # median (left) is the next fallback, as on Shenzhen dual carriageways where slip lanes occupy the corner.
   attempts=[(shift,1,extra) for shift in (0,3,6) for extra in (1.6,2.4,3.2,4.0,5.0)]
   if r['oneway']:attempts+=[(shift,-1,extra) for shift in (0,3,6) for extra in (1.0,1.6,2.4)]
   attempts+=[(shift,1,extra) for shift in (9,12,15) for extra in (1.6,2.4,3.2,4.0,5.0)]
   if r['oneway']:attempts+=[(shift,-1,extra) for shift in (9,12,15) for extra in (1.0,1.6,2.4)]
   for shift,side,extra in attempts:
    stop=far+4.5+shift
    sp=along(pts,stop,centre);q=along(pts,stop+3,centre)
    if not sp or not q:continue
    ax=(q[0]-sp[0],q[1]-sp[1]);L=math.hypot(*ax) or 1;ax=(ax[0]/L,ax[1]/L)  # outward axis of the carriageway
    rv=(-ax[1],ax[0])  # driver's right for traffic travelling along -ax
    px,pz=sp[0]+side*rv[0]*(w/2+extra),sp[1]+side*rv[1]*(w/2+extra)  # `extra` metres behind the kerb
    spot=Point(px,pz)
    if not land.covers(spot) or water.intersects(spot.buffer(.6)):continue
    if any(carriageways[i].distance(spot)<1.0 for i in road_index.query(spot.buffer(1.1))):continue
    if any(buildings[i].distance(spot)<.4 for i in building_index.query(spot.buffer(.5))):continue
    pole=(px,pz,extra,sp,ax,side);break
   if not pole:checks['poleBlocked']+=1;continue
   px,pz,extra,sp,ax,side=pole
   # Mast arm from the pole to just past the centre of the approaching lanes: kerb gap + half of the
   # carriageway for a one-way road, kerb gap + a quarter for the near half of a two-way road.
   arm_len=extra+lanes*.5+.4
   heads_yaw=math.atan2(ax[0],ax[1])  # heads face outward along the carriageway, toward approaching cars
   placed.append({'x':round(px,2),'z':round(pz,2),'yaw':round(heads_yaw,4),'arm':round(max(3.5,arm_len),2),'side':side,'group':arm['group'],'lanes':round(lanes,1),'road':r['name'] or r['id'],
    'stop':[round(sp[0],2),round(sp[1],2)]})
   checks['armsPlaced']+=1
  if len(placed)<2 or len({a['group'] for a in placed})<2:continue
  total=CYCLE['greenA']+CYCLE['amber']+CYCLE['allRed']+CYCLE['greenB']+CYCLE['amber']+CYCLE['allRed']
  junctions.append({'x':round(cx,2),'z':round(cz,2),'radius':round(radius,1),'offset':round(rng.random()*total,2),'arms':placed})
 data={'version':1,'cycle':CYCLE,'phases':'A green, amber, all red, B green, amber, all red; group 0 = A, 1 = B',
  'format':'arms: pole position, yaw the heads face (toward approaching traffic), mast arm length toward the road, side (1 = pole on the drivers\' right so the arm extends to their left, -1 = median pole), phase group, stop line point',
  'junctions':junctions}
 (OUT/'traffic-signals.json').write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False))
 report={'origin':'Junctions from shared vertices of trunk/primary/secondary/tertiary roads in the OSM study area; signal positions are a game adaptation, not surveyed','junctions':len(junctions),'arms':sum(len(j['arms']) for j in junctions),'checks':checks,
  'validation':'Every pole is on land, ≥0.6 m from water, ≥1.0 m from every at-grade carriageway and ≥0.4 m from every building/landmark footprint. Stop lines sit 4.5 m past the far edge of the crossing carriageways along the incoming carriageway (moved back in 3 m steps when the corner is occupied).'}
 (ART/'placement-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False),flush=True)

if '--prepare' in sys.argv:
 prepare();sys.exit()

sys.path.insert(0,str(ROOT/'scripts'))
from city_mesh import B,M,material,bpy,Vector
material('signal_pole',(.36,.38,.40),.55,.6)
material('signal_housing',(.05,.055,.06),.7)
material('signal_lens_dark',(.08,.07,.07),.35)
material('signal_red',(1,.02,.01),.3,0,5)
material('signal_amber',(1,.45,.02),.3,0,5)
material('signal_green',(.05,1,.35),.3,0,5)

HEAD_Z=5.05;ARM_Z=5.85;LENS=[(0,'signal_red',.42),(1,'signal_amber',0),(2,'signal_green',-.42)]
def pole():
 b=B();b.tube('signal_pole',(0,0,0),(0,0,6.4),.13,12,r2=.10);b.loft('signal_pole',[(0,0,0,.30,.30),(0,0,.12,.30,.30),(0,0,.14,.16,.16)],16);b.tube('signal_pole',(0,0,6.4),(0,0,6.55),.10,12,r2=.02)
 # pole-mounted secondary head at 3.1 m facing forward (+Y), for drivers already at the line
 b.box('signal_housing',(0,.22,3.1),(.34,.22,1.0))
 for k,m,dz in LENS:b.loft('signal_lens_dark',[(0,.33,3.1+dz*.75,.11,.11),(0,.35,3.1+dz*.75,.11,.11)],12)
 return b
def arm():
 # Unit length along +X (instance X scale = arm length); tapers, with a short brace.
 b=B();b.tube('signal_pole',(0,0,ARM_Z),(1,0,ARM_Z),.085,10,r2=.06);b.tube('signal_pole',(0,0,ARM_Z-.7),(.35,0,ARM_Z-.05),.03,6,r2=.02);return b
def head():
 # Hangs under the arm end; lenses face +Y (toward approaching traffic); hoods above each lens.
 b=B();b.box('signal_housing',(0,0,HEAD_Z),(.40,.26,1.30));b.tube('signal_housing',(0,0,HEAD_Z+.65),(0,0,ARM_Z),.04,6)
 for k,m,dz in LENS:
  b.loft('signal_lens_dark',[(0,.13,HEAD_Z+dz,.145,.145),(0,.16,HEAD_Z+dz,.145,.145)],14)
  b.box('signal_housing',(0,.20,HEAD_Z+dz+.17),(.36,.16,.03))
 return b
def lens_forward(m):
 # Lit disc the runtime places at each lens socket, slightly proud of the dark lens; faces +Y like the head.
 b=B();n=14;pts=[(math.cos(i*math.tau/n)*.125,0,math.sin(i*math.tau/n)*.125) for i in range(n)]
 b.face(m,[(x,.035,z) for x,_,z in pts]);b.face(m,list(reversed([(x,0,z) for x,_,z in pts])))
 for i in range(n):a=pts[i];c=pts[(i+1)%n];b.face(m,[(a[0],0,a[2]),(c[0],0,c[2]),(c[0],.035,c[2]),(a[0],.035,a[2])])
 return b
models=[('signal-pole',pole()),('signal-arm',arm()),('signal-head',head()),('signal-lens-red',lens_forward('signal_red')),('signal-lens-amber',lens_forward('signal_amber')),('signal-lens-green',lens_forward('signal_green'))]
allobs=[]
for name,b in models:allobs.extend(b.finish(name,smooth=True))
bpy.ops.object.select_all(action='DESELECT')
for ob in allobs:ob.select_set(True)
bpy.context.view_layer.objects.active=allobs[0]
path=OUT/'traffic-signal.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
tris={ob.name:sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in allobs}
manifest={'version':1,'file':'traffic-signal.glb','bytes':path.stat().st_size,'triangles':sum(tris.values()),'meshes':tris,
 'layout':{'poleHeight':6.55,'armZ':ARM_Z,'headZ':HEAD_Z,'lensOffsets':{'red':[0,.19,HEAD_Z+.42],'amber':[0,.19,HEAD_Z],'green':[0,.19,HEAD_Z-.42]},'poleHead':{'z':3.1,'lensOffsets':{'red':[0,.36,3.1+.315],'amber':[0,.36,3.1],'green':[0,.36,3.1-.315]}},
  'frame':'Blender east/north/up: pole at origin, arm along +X scaled by arm length, heads face +Y (toward approaching traffic)'},
 'source':'Original procedural model of a cantilever three-aspect signal; game adaptation'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=1));print(json.dumps(manifest),flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'traffic-signal.blend'))
