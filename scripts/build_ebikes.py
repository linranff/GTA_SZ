"""Shenzhen e-mopeds and e-bicycles: three low-poly bikes, a helmeted rider, and kerbside parking rows.

  .venv/bin/python scripts/build_ebikes.py --prepare   # parking rows -> public/city/ebikes/parked.json
  blender -b --python scripts/build_ebikes.py           # models -> public/city/ebikes/*.glb + manifest

Parking follows the city's real pattern: dense rows outside every metro entrance and bus platform in the
study area (OSM POIs), plus shorter rows along residential/tertiary/secondary kerbs where buildings are
dense. Each bike is proven off every carriageway, outside every building/landmark footprint, on land,
clear of water, lamps, benches and canopy trunks. Body paint is white in the GLB and tinted per instance
at runtime from the palette in the manifest; delivery scooters keep to the two courier colours.
This is a game adaptation of Shenzhen street life, not a survey of parked vehicles.
"""
from pathlib import Path
import sys, math, json, random

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/city/ebikes'; OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'artifacts/city/ebikes'; ART.mkdir(parents=True,exist_ok=True)
TYPES=['scooter','bicycle','delivery']
# Body paint palette (linear RGB) with weights; delivery scooters use the last two (Meituan yellow, Ele.me blue).
PALETTE=[((.92,.92,.90),18),((.06,.06,.07),14),((.62,.04,.03),9),((.36,.37,.40),10),((.20,.45,.80),7),((.28,.62,.48),6),((.85,.55,.62),4),((.05,.25,.16),4),((.55,.60,.66),8),((.93,.72,.05),6),((.02,.35,.85),5)]
DELIVERY_COLOURS=[9,10]
SPACING=.74

def prepare():
 import shapely
 from shapely.geometry import Polygon, Point, LineString
 from shapely.strtree import STRtree
 rng=random.Random(20260918)
 c=json.loads((ROOT/'public/city/city.json').read_text());meta=c['meta']
 ox,oz=meta['originWGS84'];scale=meta['horizontalScale']
 def project(lon,lat):return ((lon-ox)*102850*scale,(lat-oz)*111320*scale)
 ext=meta['extent']
 def poly(rings):return shapely.make_valid(Polygon(rings[0],rings[1:]))
 land=shapely.union_all([poly(r) for r in c['land']]);water=shapely.union_all([poly(p['rings']) for p in c['water']])
 for g in [land,water]:shapely.prepare(g)
 buildings=[poly(p['rings']) for p in c['buildings']]
 for extra in ['landmark-detail.json','landmark-candidates.json']:
  path=ROOT/'public/city'/extra
  if path.exists():buildings.extend(poly(p['rings']) for p in json.loads(path.read_text()).get('collisionFootprints',[]))
 building_index=STRtree(buildings)
 roads=[r for r in c['roads'] if r['grade']=='0']
 # Rows hang off at-grade streets, but clearance is checked against every road including ramps and
 # elevated decks (round caps, so a row never sits on the foot of a ramp).
 all_roads=c['roads'];carriageways=[LineString(r['points']).buffer(r['width']/2) for r in all_roads]
 road_index=STRtree(carriageways)
 landmarks=[(m['x'],m['z'],max(m['excludeRadius'],12)) for m in c['landmarks'] if m.get('height',0)>0]
 lamps=STRtree([Point(l[0],l[1]) for l in json.loads((ROOT/'public/city/lamps.json').read_text())])
 benches=STRtree([Point(p['x'],p['z']) for p in json.loads((ROOT/'public/city/street/manifest.json').read_text())['placements']])
 canopy_path=ROOT/'public/city/landscape/canopy-trees.json'
 trunks=STRtree([Point(t[0],t[1]) for t in json.loads(canopy_path.read_text())['trees']]) if canopy_path.exists() else None
 signals_path=ROOT/'public/city/signals/traffic-signals.json'
 poles=STRtree([Point(a['x'],a['z']) for j in json.loads(signals_path.read_text())['junctions'] for a in j['arms']]) if signals_path.exists() else None
 placed_index=[]  # points of bikes already placed, for spacing between clusters
 checks={'entrances':0,'platforms':0,'streetRows':0,'rejected':0}
 def clear(x,z):
  p=Point(x,z)
  if not land.covers(p) or water.intersects(p.buffer(.5)):return False
  if any(carriageways[i].distance(p)<.3 for i in road_index.query(p.buffer(.35))):return False
  if any(buildings[i].distance(p)<.45 for i in building_index.query(p.buffer(.5))):return False
  if any(math.hypot(x-lx,z-lz)<r for lx,lz,r in landmarks):return False
  if lamps.query(p.buffer(.7)).size or benches.query(p.buffer(1.2)).size:return False
  if trunks is not None and trunks.query(p.buffer(1.0)).size:return False
  if poles is not None and poles.query(p.buffer(1.0)).size:return False
  return True
 def pick_type(near_transit):
  r=rng.random()
  if near_transit:return 0 if r<.55 else 1 if r<.85 else 2
  return 0 if r<.5 else 1 if r<.9 else 2
 def pick_colour(t):
  if t==2:return rng.choice(DELIVERY_COLOURS)
  total=sum(w for _,w in PALETTE[:9]);r=rng.random()*total
  for i,(_,w) in enumerate(PALETTE[:9]):
   r-=w
   if r<=0:return i
  return 0
 bikes=[]
 def kerb_row(seg_a,seg_b,width,side,count,near_transit,centre_t=.5):
  """A row of `count` bikes on `side` (+1 right / -1 left of the a->b direction) of a road segment,
  centred at parameter centre_t, parked nose to the road with a little heading jitter."""
  ax,az=seg_a;bx,bz=seg_b;dx,dz=bx-ax,bz-az;L=math.hypot(dx,dz)
  if L<count*SPACING+2:return 0
  ux,uz=dx/L,dz/L;rx,rz=uz*side,-ux*side  # right-hand normal
  off=width/2+1.25+rng.random()*.5
  start=centre_t*L-count*SPACING/2
  yaw_to_road=math.atan2(-rx,-rz)  # nose toward the carriageway
  placed=0
  for i in range(count):
   s=start+i*SPACING;x=ax+ux*s+rx*off;z=az+uz*s+rz*off
   if not clear(x,z):checks['rejected']+=1;continue
   t=pick_type(near_transit)
   bikes.append([round(x,2),round(z,2),round(yaw_to_road+rng.uniform(-.14,.14),3),t,pick_colour(t),round(rng.uniform(.08,.14)*rng.choice((1,1,1,-1)),3)]);placed+=1
  return placed
 def nearest_segment(x,z,kinds=None,maxd=40):
  best=None
  for i in road_index.query(Point(x,z).buffer(maxd)):
   r=all_roads[i]
   if r['grade']!='0' or (kinds and r['kind'] not in kinds):continue
   pts=r['points']
   for k in range(1,len(pts)):
    a,b=pts[k-1],pts[k];dx,dz=b[0]-a[0],b[1]-a[1];L2=dx*dx+dz*dz or 1e-9
    t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/L2));px,pz=a[0]+dx*t,a[1]+dz*t;d=math.hypot(px-x,pz-z)
    if best is None or d<best[0]:best=(d,r,a,b,t)
  return best
 # 1. Metro entrances and bus platforms from the study POIs.
 pois=json.loads((ROOT/'data/processed/shenzhen_study/pois.geojson').read_text())['features']
 transit=[]
 for f in pois:
  tags=f['properties'].get('tags') or {}
  if isinstance(tags,str):
   try:tags=json.loads(tags)
   except Exception:tags={}
  kind='entrance' if tags.get('railway')=='subway_entrance' else 'platform' if tags.get('public_transport')=='platform' else None
  if not kind or f['geometry']['type']!='Point':continue
  x,z=project(*f['geometry']['coordinates'])
  if not (ext[0]<x<ext[2] and ext[1]<z<ext[3]):continue
  transit.append((kind,x,z))
 street_kinds={'residential','tertiary','secondary','unclassified','living_street','pedestrian','primary'}
 for kind,x,z in transit:
  near=nearest_segment(x,z,street_kinds|{'service'},45)
  if not near:continue
  d,r,a,b,t=near
  side=1 if ((x-a[0])*(b[1]-a[1])-(z-a[1])*(b[0]-a[0]))<0 else -1  # which side of the road the POI is on
  count=rng.randint(14,34) if kind=='entrance' else rng.randint(4,9)
  n=kerb_row(a,b,r['width'],side,count,True,t)
  if n and kind=='entrance' and rng.random()<.6:  # a second row a little further along, as the crowds do
   n+=kerb_row(a,b,r['width'],side,rng.randint(8,18),True,min(.95,max(.05,t+rng.choice((-1,1))*(count*SPACING+4)/max(1,math.hypot(b[0]-a[0],b[1]-a[1])))))
  checks['entrances' if kind=='entrance' else 'platforms']+=1 if n else 0
 # 2. Street rows where buildings are dense.
 centroids=STRtree([b.centroid for b in buildings])
 for r in roads:
  if r['kind'] not in street_kinds:continue
  pts=r['points']
  for k in range(1,len(pts)):
   a,b=pts[k-1],pts[k];L=math.hypot(b[0]-a[0],b[1]-a[1])
   if L<12:continue
   mx,mz=(a[0]+b[0])/2,(a[1]+b[1])/2
   density=centroids.query(Point(mx,mz).buffer(70)).size
   if density<10:continue
   # Expected rows scale with segment length and density; one row per ~55 m at high density.
   rows=L/ (55 if density>=22 else 90)
   n=int(rows)+(1 if rng.random()<rows-int(rows) else 0)
   for _ in range(n):
    side=rng.choice((1,-1));count=rng.randint(3,9)
    if kerb_row(a,b,r['width'],side,count,False,rng.uniform(.12,.88)):checks['streetRows']+=1
 data={'version':1,'format':'[x, z, yaw, type index, palette index, kickstand lean (rad, signed)]','types':TYPES,'palette':[list(c) for c,_ in PALETTE],'deliveryColours':DELIVERY_COLOURS,'bikes':bikes}
 (OUT/'parked.json').write_text(json.dumps(data,separators=(',',':')))
 from collections import Counter
 report={'origin':'Rows outside OSM subway entrances / bus platforms inside the game extent, plus kerbside rows on dense residential, tertiary, secondary and primary streets; a game adaptation, not surveyed parking',
  'bikes':len(bikes),'byType':dict(Counter(TYPES[b[3]] for b in bikes)),'transitPois':len(transit),'checks':checks,
  'validation':'Every bike is on land, ≥0.5 m from water, ≥0.3 m from every carriageway of any grade (round-capped), ≥0.45 m from every building/landmark footprint, outside landmark exclusion radii, ≥0.7 m from lamp posts, ≥1.0 m from canopy trunks and signal poles, ≥1.2 m from benches.'}
 (ART/'placement-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False),flush=True)

if '--prepare' in sys.argv:
 prepare();sys.exit()

sys.path.insert(0,str(ROOT/'scripts'))
from city_mesh import B,M,material,bpy
material('ebike_paint',(1,1,1),.32,0)          # tinted per instance
material('ebike_dark',(.05,.05,.055),.62)
material('ebike_rubber',(.025,.025,.027),.92)
material('ebike_silver',(.72,.73,.75),.35,1)
material('ebike_seat',(.035,.035,.04),.75)
material('ebike_lamp',(1,.97,.85),.3,0,3)
material('ebike_redlamp',(1,.05,.02),.3,0,2.5)
material('rider_cloth',(1,1,1),.8)             # tinted per instance
material('rider_dark',(.07,.07,.09),.8)
material('rider_skin',(.72,.52,.40),.7)
material('rider_helmet',(1,1,1),.35)           # tinted per instance

def torus(b,mat,centre,R,r,n=16,m=6):
 """Tyre ring about the x axis (the wheel axle): major radius R, tube radius r; open in the middle so
 spokes and hubs read through."""
 cx,cy,cz=centre;pts=[]
 for i in range(n):
  a=i*math.tau/n;ring=[]
  for j in range(m):
   t=j*math.tau/m;rr=R+r*math.cos(t);ring.append((cx+r*math.sin(t),cy+rr*math.cos(a),cz+rr*math.sin(a)))
  pts.append(ring)
 for i in range(n):
  for j in range(m):b.face(mat,[pts[i][j],pts[(i+1)%n][j],pts[(i+1)%n][(j+1)%m],pts[i][(j+1)%m]])
def wheel(b,y,r,w,spokes=0,disc=0.0,hub=.07):
 torus(b,'ebike_rubber',(0,y,r),r-w*.5,w*.5)
 if disc:b.tube('ebike_dark',(-w*.25,y,r),(w*.25,y,r),disc,12)                      # alloy cover (scooters)
 for k in range(spokes):
  a=k*math.tau/spokes;b.tube('ebike_silver',(0,y,r),(0,y+math.cos(a)*(r-w*.6),r+math.sin(a)*(r-w*.6)),.006,4)
 if spokes:torus(b,'ebike_silver',(0,y,r),r-w*.85,.012,16,4)                        # rim
 b.tube('ebike_dark',(-w/2-.02,y,r),(w/2+.02,y,r),hub,10)
def scooter(delivery=False):
 b=B()
 wheel(b,.60,.23,.10,disc=.16,hub=.05);wheel(b,-.58,.23,.10,disc=.16,hub=.07)
 b.box('ebike_paint',(0,.02,.28),(.36,.66,.05))                      # floorboard
 b.loft('ebike_paint',[(0,.40,.24,.17,.10),(0,.44,.55,.19,.09),(0,.50,.80,.17,.07),(0,.54,.95,.10,.05)],14)  # front shield
 b.loft('ebike_paint',[(0,-.30,.36,.16,.30),(0,-.32,.55,.17,.32),(0,-.34,.70,.16,.30)],14)                   # rear body / battery bay
 b.box('ebike_seat',(0,-.27,.78),(.30,.60,.10))
 b.tube('ebike_dark',(0,.46,.62),(0,.52,.98),.03,8)                  # steering column
 b.tube('ebike_dark',(-.31,.55,1.02),(.31,.55,1.02),.018,8)          # handlebar
 for s in (-1,1):
  b.tube('ebike_dark',(s*.24,.55,1.02),(s*.30,.50,1.16),.008,6);b.loft('ebike_silver',[(s*.30,.50,1.16,.045,.02),(s*.30,.51,1.16,.045,.02)],10)  # mirrors
 b.box('ebike_lamp',(0,.60,.86),(.14,.03,.07))                        # headlight
 b.box('ebike_redlamp',(0,-.66,.72),(.16,.02,.05))                    # tail light
 b.box('ebike_silver',(0,-.68,.80),(.28,.20,.025))                    # rear rack
 b.box('ebike_dark',(0,-.70,.44),(.12,.02,.09))                       # plate
 for s in (-1,1):b.tube('ebike_dark',(s*.20,-.55,.23),(s*.20,-.55,.42),.03,6) # rear shock/frame
 if delivery:b.box('ebike_paint',(0,-.64,1.05),(.46,.46,.44));b.box('ebike_dark',(0,-.64,1.28),(.48,.48,.02))
 return b
def bicycle():
 b=B()
 wheel(b,.64,.31,.04,spokes=8,hub=.035);wheel(b,-.64,.31,.04,spokes=8,hub=.09)
 f=lambda a,c,r=.017:b.tube('ebike_paint',a,c,r,8)
 f((0,-.64,.31),(0,-.24,.86));f((0,-.24,.86),(0,.52,.62));f((0,-.62,.31),(0,-.10,.34),.014);f((0,-.10,.34),(0,-.24,.86));f((0,.52,.62),(0,.58,.36))
 f((0,.52,.62),(0,.60,.95),.02)                                       # head tube / stem
 b.tube('ebike_dark',(-.30,.58,.99),(.30,.58,.99),.016,8)             # handlebar
 b.box('ebike_paint',(0,.10,.52),(.09,.34,.15))                       # battery pack on the down tube
 b.box('ebike_seat',(0,-.24,.92),(.20,.28,.06))
 b.box('ebike_dark',(0,.62,.90),(.32,.30,.22))                        # front basket
 b.tube('ebike_dark',(-.09,-.10,.34),(.09,-.10,.34),.03,8)            # crank
 for s in (-1,1):b.tube('ebike_dark',(s*.09,-.10,.34),(s*.11,-.10+.14*s,.34-.10*s),.012,6);b.box('ebike_dark',(s*.13,-.10+.14*s,.34-.10*s),(.06,.09,.02))
 b.box('ebike_dark',(0,-.66,.70),(.26,.28,.03))                       # rear carrier
 b.box('ebike_redlamp',(0,-.80,.70),(.05,.02,.03));b.loft('ebike_lamp',[(0,.78,.88,.04,.04),(0,.80,.88,.04,.04)],10)
 return b
def rider():
 b=B()
 b.box('rider_dark',(0,-.20,.80),(.34,.26,.10))                       # seated hips
 b.loft('rider_cloth',[(0,-.22,.84,.17,.11),(0,-.19,1.02,.19,.12),(0,-.16,1.28,.20,.12),(0,-.15,1.36,.12,.09)],12)  # torso
 b.loft('rider_skin',[(0,-.14,1.36,.05,.05),(0,-.14,1.42,.05,.05)],8)  # neck
 b.loft('rider_skin',[(0,-.13,1.42,.06,.07),(0,-.13,1.50,.11,.12),(0,-.13,1.60,.10,.11),(0,-.13,1.66,.05,.06)],12)  # head
 b.loft('rider_helmet',[(0,-.13,1.54,.125,.135),(0,-.12,1.62,.12,.13),(0,-.11,1.69,.08,.09),(0,-.10,1.72,.02,.03)],12)  # helmet
 b.box('rider_helmet',(0,.02,1.55),(.20,.07,.03))                     # visor peak
 for s in (-1,1):
  b.tube('rider_dark',(s*.11,-.18,.80),(s*.13,.18,.74),.075,8)        # thigh
  b.tube('rider_dark',(s*.13,.18,.74),(s*.15,.16,.36),.06,8)          # shin
  b.box('rider_dark',(s*.15,.22,.32),(.10,.26,.07))                   # shoe
  b.tube('rider_cloth',(s*.19,-.16,1.28),(s*.27,.16,1.10),.05,8)      # upper arm
  b.tube('rider_skin',(s*.27,.16,1.10),(s*.28,.52,1.02),.04,8)        # forearm to the grips
 return b
models=[('ebike-scooter',scooter()),('ebike-bicycle',bicycle()),('ebike-delivery',scooter(True)),('ebike-rider',rider())]
allobs=[];per={}
for name,b in models:
 obs=b.finish(name,smooth=True);allobs.extend(obs);per[name]=obs
bpy.ops.object.select_all(action='DESELECT')
for ob in allobs:ob.select_set(True)
bpy.context.view_layer.objects.active=allobs[0]
path=OUT/'ebikes.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
tris={name:sum(len(p.vertices)-2 for ob in obs for p in ob.data.polygons) for name,obs in per.items()}
def bounds(obs):
 xs=[v.co.x for ob in obs for v in ob.data.vertices];ys=[v.co.y for ob in obs for v in ob.data.vertices];zs=[v.co.z for ob in obs for v in ob.data.vertices]
 return {'length':round(max(ys)-min(ys),2),'width':round(max(xs)-min(xs),2),'height':round(max(zs),2)}
manifest={'version':1,'file':'ebikes.glb','bytes':path.stat().st_size,'triangles':tris,'bounds':{n:bounds(o) for n,o in per.items()},
 'types':TYPES,'meshPrefix':{'scooter':'ebike-scooter','bicycle':'ebike-bicycle','delivery':'ebike-delivery','rider':'ebike-rider'},
 'tinted':{'ebike_paint':'body palette','rider_cloth':'rider palette','rider_helmet':'helmet palette'},
 'palette':[list(c) for c,_ in PALETTE],'deliveryColours':DELIVERY_COLOURS,
 'riderPalette':[[.92,.92,.95],[.12,.13,.18],[.55,.10,.10],[.16,.25,.50],[.30,.32,.30],[.93,.72,.05],[.02,.35,.85]],
 'helmetPalette':[[.92,.92,.92],[.08,.08,.09],[.93,.72,.05],[.02,.35,.85],[.62,.04,.03],[.85,.55,.62]],
 'frame':'Blender east/north/up: bike nose along +Y, ground at z=0; the rider sits in the same frame',
 'source':'Original procedural models; game adaptation of Shenzhen e-mopeds, e-bicycles and courier scooters'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=1));print(json.dumps(manifest),flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'ebikes.blend'))
