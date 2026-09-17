"""Tall canopy trees: six subtropical species at real height (10–30 m), solid clumped crowns.

The original streetscape (build_landscape_assets.py) tops out around 8 m, so lawns and parks
read as bare from any aerial view. These trees are the layer that is visible from the air and
from a moving car: opaque, low-poly crown clumps (no alpha cards, no overdraw), three LODs each.

  .venv/bin/python scripts/build_canopy_trees.py --prepare     # placement -> public/city/landscape/canopy-trees.json
  blender -b --python scripts/build_canopy_trees.py -- --preview  # models -> public/city/landscape/canopy/*.glb (+ contact sheet)

Species are art-directed studies of common Shenzhen trees, not botanical scans. Placement is
derived from the OSM study area (parks, open lawns, trunk/primary verges) with shapely clearance
proofs against roads, buildings, water and landmark footprints; it is not a surveyed inventory.
Blender axes are east/north/up; the runtime loader flips Z like the rest of the landscape set.
"""
from pathlib import Path
import sys, math, json, random

ROOT=Path(__file__).resolve().parents[1]
LAND=ROOT/'public/city/landscape'; OUT=LAND/'canopy'; OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'artifacts/city/canopy-trees'; ART.mkdir(parents=True,exist_ok=True)

# id, 中文, height (m) at scale 1, crown radius (m), trunk clearance to carriageway (m), park weight, lawn weight, street weight
SPECIES=[
 {'id':'giant-banyan','name':'大叶榕（巨榕）','height':30,'crown':16.5,'park':.10,'lawn':.03,'street':0},
 {'id':'kapok','name':'木棉','height':24,'crown':8.0,'park':.14,'lawn':.10,'street':.12},
 {'id':'camphor','name':'樟树','height':18,'crown':10.0,'park':.22,'lawn':.20,'street':.18},
 {'id':'terminalia','name':'小叶榄仁','height':15,'crown':6.0,'park':.18,'lawn':.22,'street':.34},
 {'id':'flame-tree','name':'凤凰木','height':12,'crown':9.0,'park':.16,'lawn':.20,'street':.16},
 {'id':'mango','name':'芒果树','height':11,'crown':6.0,'park':.20,'lawn':.25,'street':.20},
]

def prepare():
 import shapely
 from shapely.geometry import Polygon, Point, LineString
 from shapely.strtree import STRtree
 rng=random.Random(20260917)
 c=json.loads((ROOT/'public/city/city.json').read_text())
 def poly(rings):return shapely.make_valid(Polygon(rings[0],rings[1:]))
 land=shapely.union_all([poly(r) for r in c['land']]); water=shapely.union_all([poly(p['rings']) for p in c['water']])
 greens=[poly(p['rings']) for p in c['green']]; green=shapely.union_all(greens)
 buildings=[poly(p['rings']) for p in c['buildings']]
 for extra in ['landmark-detail.json','landmark-candidates.json']:
  path=ROOT/'public/city'/extra
  if path.exists():buildings.extend(poly(p['rings']) for p in json.loads(path.read_text()).get('collisionFootprints',[]))
 # Community sites (驿站) and the bamboo cafe are reserved plots; keep crowns off them.
 sites=ROOT/'public/city/life-sites.json'
 if sites.exists():
  for s in json.loads(sites.read_text())['sites']:
   if s.get('footprint'):buildings.append(Polygon(s['footprint']).buffer(6))
 # Landmark forecourts: keep trunks outside each landmark's runtime exclusion radius (city.json legacy
 # set, landmark-detail.json and landmark-candidates.json), the same circle the game uses for props.
 exclusions=[]
 for src in [c['landmarks']]+[json.loads((ROOT/'public/city'/n).read_text()).get('landmarks',[]) for n in ('landmark-detail.json','landmark-candidates.json') if (ROOT/'public/city'/n).exists()]:
  for l in src:
   if l.get('excludeRadius',0)>0:exclusions.append(Point(l['x'],l['z']).buffer(l['excludeRadius']))
 buildings.extend(exclusions)
 carriageways=[LineString(r['points']).buffer(r['width']/2,cap_style=2,join_style=2) for r in c['roads']]
 road_index=STRtree(carriageways); building_index=STRtree(buildings)
 for g in [land,green,water]:shapely.prepare(g)
 existing=json.loads((LAND/'planting.json').read_text())['trees']
 grid={}
 def near(x,z,r):
  cx,cz=math.floor(x/25),math.floor(z/25)
  for dx in (-1,0,1):
   for dz in (-1,0,1):
    for a,b,rr in grid.get((cx+dx,cz+dz),[]):
     if math.hypot(x-a,z-b)<r+rr:return True
  return False
 def occupy(x,z,r):grid.setdefault((math.floor(x/25),math.floor(z/25)),[]).append((x,z,r))
 for t in existing:occupy(t[0],t[1],2.6)  # trunks of the existing 8 m trees
 spawn=c['spawn'];occupy(spawn['x'],spawn['z'],18)
 checks={'land':0,'water':0,'road':0,'building':0,'spacing':0}
 planted=[]
 def clear(x,z,sp,scale,crown_margin=1.0):
  crown=sp['crown']*scale; trunk=Point(x,z)
  if not land.covers(trunk):checks['land']+=1;return False
  if water.intersects(trunk.buffer(crown*.35)):checks['water']+=1;return False
  # Trunk stays clear of every carriageway; a crown may overhang the road, as real street trees do.
  if any(carriageways[i].distance(trunk)<3.2 for i in road_index.query(trunk.buffer(3.4))):checks['road']+=1;return False
  disc=trunk.buffer(crown+crown_margin,quad_segs=6)
  if any(buildings[i].intersects(disc) for i in building_index.query(disc)):checks['building']+=1;return False
  # Tall crowns interleave a little (0.62 of summed radii) like a real canopy; trunks never coincide.
  if near(x,z,crown*.62):checks['spacing']+=1;return False
  return True
 def pick(weights):
  total=sum(weights);u=rng.random()*total
  for i,w in enumerate(weights):
   u-=w
   if u<=0:return i
  return len(weights)-1
 def add(x,z,kind,scale):
  sp=SPECIES[kind]
  if not clear(x,z,sp,scale):return False
  occupy(x,z,sp['crown']*scale*.62);planted.append([round(x,2),round(z,2),kind,round(scale,3),round(rng.random()*math.tau,3),'park' if green.covers(Point(x,z)) else 'lawn'])
  return True
 # 1. Parks: dart-throwing per polygon, density by area. Giants only where a park is large enough.
 park_weights=[s['park'] for s in SPECIES]
 for g in greens:
  area=g.area
  if area<400:continue
  minx,minz,maxx,maxz=g.bounds
  target=int(area/520)  # one tall tree per ~520 m² of park before clearance rejects
  weights=list(park_weights)
  if area<12000:weights[0]=0  # no giant banyan in pocket parks
  tries=0;placed=0
  while placed<target and tries<target*9:
   tries+=1;x=rng.uniform(minx,maxx);z=rng.uniform(minz,maxz)
   if not g.covers(Point(x,z)):continue
   kind=pick(weights);scale=rng.uniform(.72,1.28)
   if add(x,z,kind,scale):placed+=1
 park_count=len(planted)
 # 2. Open lawns between blocks: everything on land that is not park, road, water or building.
 lawn_weights=[s['lawn'] for s in SPECIES]
 minx,minz,maxx,maxz=land.bounds
 lawn_target=int(land.area/2600)
 tries=0;placed=0
 while placed<lawn_target and tries<lawn_target*4:
  tries+=1;x=rng.uniform(minx,maxx);z=rng.uniform(minz,maxz);p=Point(x,z)
  if green.covers(p) or not land.covers(p):continue
  # keep lawn trees off plazas that are really building forecourts: require 9 m from any building
  if any(buildings[i].distance(p)<9 for i in building_index.query(p.buffer(9))):continue
  if add(x,z,pick(lawn_weights),rng.uniform(.72,1.12)):placed+=1
 lawn_count=len(planted)-park_count
 # 3. Boulevard rows along trunk/primary roads: one species per road, both verges, regular spacing.
 street_weights=[s['street'] for s in SPECIES]
 for road in c['roads']:
  if road['kind'] not in ('trunk','primary'):continue
  line=LineString(road['points'])
  if line.length<60:continue
  kind=pick(street_weights);sp=SPECIES[kind];spacing=max(14,sp['crown']*1.9)
  phase=rng.uniform(0,spacing)
  for side in (-1,1):
   d=phase
   while d<line.length-6:
    p=line.interpolate(d);q=line.interpolate(min(line.length,d+1));dx,dz=q.x-p.x,q.y-p.y;L=math.hypot(dx,dz)
    if L>.01:
     setback=road['width']/2+4.2
     x,z=p.x-dz/L*setback*side,p.y+dx/L*setback*side
     add(x,z,kind,rng.uniform(.85,1.05))
    d+=spacing
 street_count=len(planted)-park_count-lawn_count
 # Exhaustive second pass on serialized values (rounding can nudge a trunk into a buffer).
 grid.clear()
 for t in existing:occupy(t[0],t[1],2.6)
 occupy(spawn['x'],spawn['z'],18)
 final=[]
 for x,z,kind,scale,yaw,zone in planted:
  sp=SPECIES[kind]
  if clear(x,z,sp,scale):occupy(x,z,sp['crown']*scale*.62);final.append([x,z,kind,scale,yaw])
 by_species=[sum(1 for t in final if t[2]==i) for i in range(len(SPECIES))]
 data={'version':1,'species':[{k:s[k] for k in ('id','name','height','crown')} for s in SPECIES],'format':'[east,north,species,scale,yaw]; height/crown scale with instance scale','trees':final}
 (LAND/'canopy-trees.json').write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False))
 report={'origin':'Original procedural art; positions from the project OSM study area (parks, open lawns, trunk/primary verges), not a vegetation survey',
  'treeCount':len(final),'landmarkExclusions':len(exclusions),'bySpecies':dict(zip([s['id'] for s in SPECIES],by_species)),'zones':{'park':park_count,'lawn':lawn_count,'street':street_count},
  'rejections':checks,'validation':'Every serialized trunk is on land, ≥3.2 m from every carriageway, ≥2.6 m from existing planting trunks; every crown disc (+1 m) is outside building footprints, landmark collision footprints, landmark excludeRadius circles and community-site plots, and the crown core is outside water. Crowns may overhang roads and interleave (0.62 of summed radii).'}
 (ART/'placement-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False),flush=True)

if '--prepare' in sys.argv:
 prepare();sys.exit()

sys.path.insert(0,str(ROOT/'scripts'))
from city_mesh import B,M,material,bpy,Vector
rng=random.Random(31337)
material('canopy_bark',(.27,.22,.165),.95)
material('canopy_bark_pale',(.46,.43,.38),.93)
material('canopy_bark_banyan',(.36,.33,.28),.94)
# Six distinct greens plus a shaded underside for each; the runtime adds per-instance tint on top.
# (lit crown, shaded underside). Seen from the air a canopy is darker than mown lawn, so the lit
# tones stay below the terrain grass albedo; undersides are lifted so a crown over the road never
# reads as a black slab from the driver's seat. The far tier gets the mean of the two.
GREENS={'giant-banyan':((.105,.225,.090),(.085,.175,.075)),'kapok':((.25,.35,.16),(.19,.27,.13)),'camphor':((.26,.39,.14),(.20,.30,.11)),
 'terminalia':((.29,.45,.17),(.22,.35,.13)),'flame-tree':((.34,.43,.14),(.26,.33,.11)),'mango':((.095,.20,.08),(.08,.16,.065))}
for sid,(lit,shade) in GREENS.items():
 material('canopy_'+sid,lit,.90);material('canopy_'+sid+'_shade',shade,.92);material('canopy_'+sid+'_far',tuple((a+b)/2 for a,b in zip(lit,shade)),.92)
material('canopy_flame_bloom',(.82,.24,.07),.75)

def blob(b,mat,centre,rx,ry,rz,lat,lon,amp,seed,flat=.78):
 """UV-sphere clump with deterministic multi-frequency radius noise; flatter underside."""
 r=random.Random(seed);ph=[r.uniform(0,math.tau) for _ in range(6)];cx,cy,cz=centre
 pts=[]
 for i in range(lat+1):
  t=i/lat;theta=t*math.pi;row=[]
  for j in range(lon):
   phi=j/lon*math.tau
   n=1+amp*(.55*math.sin(3*phi+ph[0])*math.sin(2*theta+ph[1])+.30*math.cos(5*phi+ph[2])*math.sin(3*theta+ph[3])+.15*math.sin(7*phi+ph[4])*math.cos(4*theta+ph[5]))
   sx,sy,sz=math.sin(theta)*math.cos(phi),math.sin(theta)*math.sin(phi),math.cos(theta)
   if i==0 or i==lat:sx=sy=0
   z=sz*rz*(1 if sz>=0 else flat)
   row.append((cx+sx*rx*n,cy+sy*ry*n,cz+z*n))
  pts.append(row)
 for i in range(lat):
  for j in range(lon):
   a,bb,cc,d=pts[i][j],pts[i][(j+1)%lon],pts[i+1][(j+1)%lon],pts[i+1][j]
   if i==0:b.face(mat,[a,cc,d])
   elif i==lat-1:b.face(mat,[a,bb,cc])
   else:b.face(mat,[a,bb,cc,d])

def limb(b,mat,a,bpt,r1,r2,n):b.tube(mat,a,bpt,r1,n,r2=r2)

def tree(sid,lod):
 """lod 0 full (~2.5–4k tris), 1 mid (~400–700), 2 far (~70–120)."""
 b=B();r=random.Random(sum(ord(ch) for ch in sid)*7+lod)  # stable across processes (str hash is salted)
 lat,lon=[(9,14),(6,10),(5,8)][lod];amp=[.16,.13,.09][lod];seg=[10,6,5][lod]
 lit,shade='canopy_'+sid,'canopy_'+sid+'_shade'
 limit=next(sp['crown'] for sp in SPECIES if sp['id']==sid)*1.10
 def crown(centres,rad,squash=1.0,mat=lit,mat_low=shade,zsplit=None):
  # Every tier stays inside the species' placement radius (+10% for surface noise), so the
  # offline building/road clearance proof holds whichever LOD is on screen.
  envelope=max(math.hypot(x,y)+rr for (x,y,z),rr in zip(centres,rad))
  if envelope>limit:
   k=limit/envelope;centres=[(x*k,y*k,z) for x,y,z in centres];rad=[rr*k for rr in rad]
  # Far LOD merges every clump into a few big ones so the silhouette survives at 3000 m.
  if lod==2:
   xs=[c[0] for c in centres];ys=[c[1] for c in centres];zs=[c[2] for c in centres]
   cx,cy=sum(xs)/len(xs),sum(ys)/len(ys);top=max(z+rr*squash for (x,y,z),rr in zip(centres,rad));bottom=min(z-rr*squash*.78 for (x,y,z),rr in zip(centres,rad))
   spread=max(math.hypot(x-cx,y-cy)+rr for (x,y,z),rr in zip(centres,rad))
   blob(b,mat+'_far',(cx,cy,(top+bottom)/2+(top-bottom)*.06),spread*.87,spread*.84,(top-bottom)/2*.96,lat,lon,amp,r.randrange(9999),.70)
   return
  for (x,y,z),rr in zip(centres,rad):
   m=mat_low if (zsplit is not None and z<zsplit) else mat
   # Small clumps need fewer segments; the silhouette noise carries the leafy read, not the tessellation.
   la,lo=(lat,lon) if rr>=3.0 or lod>0 else (7,10) if rr>=1.9 else (5,8)
   blob(b,m,(x,y,z),rr*r.uniform(.92,1.04),rr*r.uniform(.92,1.04),rr*squash*r.uniform(.9,1.05),la,lo,amp,r.randrange(99999))
 if sid=='giant-banyan':
  bark='canopy_bark_banyan'
  limb(b,bark,(0,0,-.3),(0.4,0.2,10.5),1.55,1.05,seg+2)
  if lod<2:
   for i in range(6):  # buttress flare
    a=i*math.tau/6+.3;limb(b,bark,(math.cos(a)*.9,math.sin(a)*.9,1.6),(math.cos(a)*3.1,math.sin(a)*3.1,-.3),.55,.22,seg-4)
   for i in range(5 if lod==0 else 3):  # aerial-root pillar trunks
    a=i*2.4+.7;d=r.uniform(5.5,9.5);x,y=math.cos(a)*d,math.sin(a)*d
    limb(b,bark,(x*.92,y*.92,-.3),(x*.75,y*.75,15+r.uniform(0,3)),.38,.22,seg-4)
   for i in range(8):  # major limbs to the outer clumps
    a=i*math.tau/8+.2;limb(b,bark,(0.4,0.2,9.5),(math.cos(a)*9.5,math.sin(a)*9.5,17.5+r.uniform(-1,2)),.62,.28,seg-4)
  outer=[(math.cos(i*math.tau/8+.2)*10.2,math.sin(i*math.tau/8+.2)*10.2,18.8+r.uniform(-1.2,1.6)) for i in range(8)]
  inner=[(math.cos(i*math.tau/5+1.1)*4.6,math.sin(i*math.tau/5+1.1)*4.6,23.2+r.uniform(-.8,1.2)) for i in range(5)]
  top=[(0.6,-.4,26.4)]
  if lod==0:crown(outer+inner+top,[6.6]*8+[6.0]*5+[5.2],.72,zsplit=20.5)
  elif lod==1:crown(outer[::2]+inner[::2]+top,[8.4]*4+[7.2]*3+[6.0],.72,zsplit=20.5)
  else:crown(outer+inner+top,[6.6]*8+[6.0]*5+[5.2],.72)
 elif sid=='kapok':
  bark='canopy_bark_pale'
  limb(b,bark,(0,0,-.3),(0,0,21.5),.62,.22,seg)
  tiers=[(10.5,6.6),(14.0,5.8),(17.5,4.6),(20.5,3.0)]
  centres=[];rad=[]
  for k,(z,reach) in enumerate(tiers):
   n=4 if lod==0 else 3
   for i in range(n):
    a=i*math.tau/n+k*.55;e=(math.cos(a)*reach,math.sin(a)*reach,z+.6)
    if lod<2:limb(b,bark,(0,0,z-.4),e,.20,.06,seg-4)
    centres.append((e[0]*.88,e[1]*.88,z+1.3));rad.append(3.1 if lod==0 else 3.6)
  centres.append((0,0,23.0));rad.append(1.9)
  crown(centres,rad,.60,zsplit=13)
 elif sid=='camphor':
  bark='canopy_bark'
  limb(b,bark,(0,0,-.3),(0.2,0.1,6.2),.85,.55,seg)
  spokes=[(math.cos(i*math.tau/4+.4)*6.0,math.sin(i*math.tau/4+.4)*6.0,12.2+r.uniform(-.8,.8)) for i in range(4)]
  if lod<2:
   for e in spokes:limb(b,bark,(0.2,0.1,5.8),e,.42,.16,seg-4)
  ring=[(math.cos(i*math.tau/7)*6.4,math.sin(i*math.tau/7)*6.4,11.0+r.uniform(-.6,.9)) for i in range(7)]
  crownc=[(math.cos(i*math.tau/3+.9)*2.6,math.sin(i*math.tau/3+.9)*2.6,14.2) for i in range(3)]+[(0,0,15.6)]
  if lod==0:crown(ring+crownc,[4.9]*7+[4.4]*3+[3.9],.80,zsplit=12)
  elif lod==1:crown(ring[::2]+crownc[::2],[6.2]*4+[5.2]*2,.80,zsplit=12)
  else:crown(ring+crownc,[4.9]*7+[4.4]*3+[3.9],.80)
 elif sid=='terminalia':
  bark='canopy_bark_pale'
  limb(b,bark,(0,0,-.3),(0,0,14.4),.34,.10,seg)
  # Pagoda habit: near-equal horizontal plates with visible gaps, not a cone. Unlit at night a
  # cone of stacked clumps read as a solid green pyramid over the road (README reel r5).
  tiers=[(5.0,4.4),(7.2,4.6),(9.4,4.2),(11.5,3.5),(13.3,2.5)]
  centres=[];rad=[]
  for k,(z,reach) in enumerate(tiers):
   n=6 if lod==0 else 3
   for i in range(n):
    a=i*math.tau/n+k*.5;e=(math.cos(a)*reach,math.sin(a)*reach,z)
    if lod<2:limb(b,bark,(0,0,z-.3),e,.12,.04,seg-4)
    centres.append((e[0]*.78,e[1]*.78,z+.30));rad.append(reach*.46 if lod==0 else reach*.60)
  centres.append((0,0,14.6));rad.append(1.4)
  if lod<2:crown(centres,rad,.30,zsplit=8.5)
  else:crown(centres,rad,.30)
 elif sid=='flame-tree':
  bark='canopy_bark'
  limb(b,bark,(0,0,-.3),(0.15,0,4.2),.55,.40,seg)
  spokes=[(math.cos(i*math.tau/5+.2)*6.8,math.sin(i*math.tau/5+.2)*6.8,8.4+r.uniform(-.5,.7)) for i in range(5)]
  if lod<2:
   for e in spokes:limb(b,bark,(0.15,0,3.9),e,.30,.10,seg-4)
  ring=[(math.cos(i*math.tau/8)*6.2,math.sin(i*math.tau/8)*6.2,9.0+r.uniform(-.4,.6)) for i in range(8)]
  mid=[(math.cos(i*math.tau/3+.5)*2.4,math.sin(i*math.tau/3+.5)*2.4,10.4) for i in range(3)]
  if lod==0:crown(ring+mid,[3.6]*8+[3.4]*3,.48,zsplit=9.6)
  elif lod==1:crown(ring[::2]+mid[:2],[5.2]*4+[4.4]*2,.48,zsplit=9.6)
  else:crown(ring+mid,[3.6]*8+[3.4]*3,.48)
  if lod<2:  # a few bloom clusters on the sunlit top
   for i in range(4 if lod==0 else 2):
    a=i*math.tau/4+1.3;blob(b,'canopy_flame_bloom',(math.cos(a)*4.4,math.sin(a)*4.4,10.9),1.7,1.7,.7,lat-2,lon-3,.10,r.randrange(999))
 elif sid=='mango':
  bark='canopy_bark'
  limb(b,bark,(0,0,-.3),(0.1,0.05,3.8),.50,.36,seg)
  spokes=[(math.cos(i*math.tau/4+.9)*3.2,math.sin(i*math.tau/4+.9)*3.2,7.0) for i in range(4)]
  if lod<2:
   for e in spokes:limb(b,bark,(0.1,0.05,3.6),e,.26,.10,seg-4)
  ring=[(math.cos(i*math.tau/6)*3.4,math.sin(i*math.tau/6)*3.4,6.7+r.uniform(-.3,.5)) for i in range(6)]
  upper=[(math.cos(i*math.tau/3+.7)*1.6,math.sin(i*math.tau/3+.7)*1.6,8.6) for i in range(3)]+[(0,0,9.6)]
  if lod==0:crown(ring+upper,[3.3]*6+[3.0]*3+[2.4],.85,zsplit=6.8)
  elif lod==1:crown(ring[::2]+upper[::2],[4.4]*3+[3.6]*2,.85,zsplit=6.8)
  else:crown(ring+upper,[3.3]*6+[3.0]*3+[2.4],.85)
 return b

models=[];allobjects=[]
for sp in SPECIES:
 for lod,suffix in enumerate(['','-mid','-far']):
  name=sp['id']+suffix;obs=tree(sp['id'],lod).finish(name,smooth=True);models.append((sp,lod,name,obs));allobjects.extend(obs)
stats=[]
for sp,lod,name,obs in models:
 bpy.ops.object.select_all(action='DESELECT')
 for ob in obs:ob.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
 path=OUT/(name+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
 triangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in obs)
 zs=[(ob.matrix_world@Vector(v.co)).z for ob in obs for v in ob.data.vertices];xs=[(ob.matrix_world@Vector(v.co)).x for ob in obs for v in ob.data.vertices];ys=[(ob.matrix_world@Vector(v.co)).y for ob in obs for v in ob.data.vertices]
 stats.append({'id':name,'species':sp['id'],'lod':lod,'file':'canopy/'+name+'.glb','triangles':triangles,'meshes':len(obs),'bytes':path.stat().st_size,'height':round(max(zs),2),'crownRadius':round(max(max(xs),-min(xs),max(ys),-min(ys)),2)})
 assert (lod==0 and triangles<=4800) or (lod==1 and triangles<=1700) or (lod==2 and triangles<=220),(name,triangles)
manifest={'version':1,'source':'Original Blender procedural studies of common Shenzhen trees; solid clumped crowns, no alpha cards','species':[{k:s[k] for k in ('id','name','height','crown')} for s in SPECIES],'models':stats,
 'lods':{'full':'<~180 m street view','mid':'street to ~700 m, aerial within ~600 m','far':'everything else to the aerial horizon'}}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=1));(ART/'model-budget.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=1));print(json.dumps(stats,ensure_ascii=False),flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'canopy-trees.blend'))
if '--preview' in sys.argv:
 # Contact sheet: full LODs in a row (ordered by height) with a 30 m scale post; mid/far rows behind.
 x=-62
 for sp in SPECIES:
  for lod_wanted,y in ((0,0),(1,48),(2,96)):
   for sp2,lod,name,obs in models:
    if sp2 is sp and lod==lod_wanted:
     for ob in obs:ob.location=(x,y,0)
  x+=25
 bpy.ops.mesh.primitive_plane_add(size=400,location=(0,40,-.05));plane=bpy.context.object;plane.data.materials.append(material('preview-ground',(.20,.25,.17),.95))
 post=B();post.box('canopy_bark_pale',(-80,0,15),(.4,.4,30))
 for h in range(0,31,10):post.box('canopy_flame_bloom',(-80,0,h),(2.4,.4,.3))
 post.finish('scale-post')
 bpy.ops.object.light_add(type='SUN',location=(-40,-60,80));sun=bpy.context.object;sun.data.energy=3.0;sun.rotation_euler=(.72,-.25,-.55)
 bpy.ops.object.camera_add(location=(0,-230,95));camera=bpy.context.object;camera.rotation_euler=(Vector((0,30,12))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=175
 scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.world.color=(.55,.66,.80);scene.render.resolution_x=1800;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.filepath=str(ART/'canopy-contact-sheet.png');scene.view_settings.view_transform='AgX';bpy.ops.render.render(write_still=True)
