"""Original, budgeted subtropical streetscape; no source-photo or paid assets.

Run .venv/bin/python scripts/build_landscape_assets.py --prepare first, then
Blender -b --python scripts/build_landscape_assets.py. Full road geometry, land,
water and building footprints validate every planting centre AND its crown.
This is art-directed planting, not a surveyed Shenzhen vegetation inventory.
"""
from pathlib import Path
import sys, math, json, random

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/city/landscape'; OUT.mkdir(exist_ok=True)
ART=ROOT/'artifacts/city/landscape-candidate'; ART.mkdir(exist_ok=True)

def prepare():
 from PIL import Image, ImageDraw, ImageFilter
 import shapely
 from shapely.geometry import Polygon, Point, LineString
 from shapely.strtree import STRtree
 rng=random.Random(52091)
 # A shared 1024 atlas: four independently drawn compound-leaf sprays. The
 # alpha-tested silhouettes contain individual tapered leaves and fine twigs.
 atlas=Image.new('RGBA',(1024,1024),(0,0,0,0))
 palettes=[[(59,101,40),(89,131,53),(111,141,56)],[(82,112,40),(129,149,62),(50,102,54)],[(70,111,46),(100,128,53),(120,141,67)],[(81,113,53),(144,162,88),(179,163,101)]]
 for quadrant in range(4):
  tile=Image.new('RGBA',(512,512),(0,0,0,0)); d=ImageDraw.Draw(tile)
  for branch in range(7):
   end=(rng.randrange(42,474),rng.randrange(28,250)); root=(256+rng.randrange(-16,17),470)
   d.line([root,end],fill=(85,103,48,255),width=4)
   for j in range(2,12):
    u=j/13; cx=root[0]+(end[0]-root[0])*u; cy=root[1]+(end[1]-root[1])*u
    for side in [-1,1]:
     a=math.atan2(end[1]-root[1],end[0]-root[0])+side*rng.uniform(.65,1.15)
     length=rng.uniform(28,55); width=length*rng.uniform(.26,.38)
     ux,uy=math.cos(a),math.sin(a); nx,ny=-uy,ux
     sides=[]
     for sign in [-1,1]:
      edge=[]
      for step in range(11):
       t=step/10;w=math.sin(math.pi*t)**.85*width*(.96+.06*math.sin(t*22))
       edge.append((cx+ux*length*t+nx*w*sign,cy+uy*length*t+ny*w*sign))
      sides.append(edge)
     color=palettes[quadrant][rng.randrange(3)]; d.polygon(sides[0]+list(reversed(sides[1])),fill=(*color,255))
     d.polygon(sides[0]+[(cx+ux*length,cy+uy*length),(cx,cy)],fill=tuple(min(255,k+12) for k in color)+(255,))
     d.line([(cx+ux*3,cy+uy*3),(cx+ux*length*.92,cy+uy*length*.92)],fill=tuple(min(255,k+24) for k in color)+(240,),width=1)
     for t in [.24,.4,.57,.72]:
      for sign in [-1,1]:
       w=math.sin(math.pi*t)*width*.8;d.line([(cx+ux*length*t,cy+uy*length*t),(cx+ux*length*(t+.12)+nx*w*sign,cy+uy*length*(t+.12)+ny*w*sign)],fill=tuple(min(255,k+8) for k in color)+(220,),width=1)
  if quadrant==2:
   for j in range(150):
    x,y=rng.randint(50,462),rng.randint(25,420); color=(rng.randint(174,231),rng.randint(93,150),rng.randint(135,185),255)
    if tile.getpixel((x,y))[3]:
     for a in range(5):
      dx,dy=math.cos(a*math.tau/5)*6,math.sin(a*math.tau/5)*6
      d.ellipse((x+dx-5,y+dy-7,x+dx+5,y+dy+7),fill=color)
     d.ellipse((x-2,y-2,x+2,y+2),fill=(250,191,129,255))
  atlas.alpha_composite(tile,(quadrant%2*512,quadrant//2*512))
 atlas.save(OUT/'foliage-atlas.png',optimize=True)
 # Seamless world-space ground textures. Fine fibres/aggregate sit below large
 # colour variation so large grass areas no longer show a single flat tint.
 for kind in ['lawn','asphalt']:
  n=512; im=Image.new('RGB',(n,n)); pix=im.load()
  for y in range(n):
   for x in range(n):
    broad=math.sin(x*math.tau/n*2+.8*math.cos(y*math.tau/n))*math.cos(y*math.tau/n*3)
    grain=rng.gauss(0,6 if kind=='lawn' else 5)
    base=(85,100,55) if kind=='lawn' else (76,79,80)
    pix[x,y]=tuple(max(0,min(255,int(c+broad*(10 if kind=='lawn' else 3)+grain))) for c in base)
  d=ImageDraw.Draw(im)
  if kind=='lawn':
   for i in range(20000):
    x,y=rng.randrange(n),rng.randrange(n); length=rng.randrange(2,8); col=rng.choice([(97,113,64),(111,125,69),(57,80,44),(144,141,82)])
    d.line([(x,y),(x+rng.randrange(-2,3),y-length)],fill=col,width=1)
  else:
   for i in range(6500):
    x,y=rng.randrange(n),rng.randrange(n); c=rng.randrange(65,108);d.point((x,y),fill=(c,c+1,c+1))
  im.save(OUT/(kind+'.jpg'),quality=91,optimize=True)
 if '--textures-only' in sys.argv:return
 # Use all roads, including crossing service roads, rather than the nearest
 # segment only. A conservative circular footprint contains every mesh leaf.
 c=json.loads((ROOT/'public/city/city.json').read_text())
 def poly(rings):return shapely.make_valid(Polygon(rings[0],rings[1:]))
 land=shapely.union_all([poly(r) for r in c['land']]); green=shapely.union_all([poly(p['rings']) for p in c['green']]); water=shapely.union_all([poly(p['rings']) for p in c['water']]); buildings=[poly(p['rings']) for p in c['buildings']]
 increment=ROOT/'public/city/landmark-detail.json'
 if increment.exists():buildings.extend(poly(p['rings']) for p in json.loads(increment.read_text()).get('collisionFootprints',[]))
 carriageways=[LineString(r['points']).buffer(r['width']/2,cap_style=2,join_style=2) for r in c['roads']]
 road_index=STRtree(carriageways); building_index=STRtree(buildings)
 for g in [land,green,water]:shapely.prepare(g)
 checks={'road':0,'waterLand':0,'building':0,'overlap':0}
 planted=[]; grid={}
 def clear(x,z,r,spacing=True):
  footprint=Point(x,z).buffer(r,quad_segs=6)
  if not land.covers(footprint) or water.intersects(footprint):checks['waterLand']+=1;return False
  if any(carriageways[i].distance(Point(x,z))<r+.65 for i in road_index.query(footprint.buffer(.65))):checks['road']+=1;return False
  if any(buildings[i].intersects(footprint) for i in building_index.query(footprint)):checks['building']+=1;return False
  if spacing:
   cell=(math.floor(x/12),math.floor(z/12))
   for dx in [-1,0,1]:
    for dz in [-1,0,1]:
     if any(math.hypot(x-a,z-b)<(r+rr)*.72 for a,b,rr in grid.get((cell[0]+dx,cell[1]+dz),[])):checks['overlap']+=1;return False
   grid.setdefault(cell,[]).append((x,z,r))
  return True
 # Position format: [east,north,species,scale,yaw]. Trees carry stable species
 # groups, while streets vary by neighbourhood; no frame-dependent randomness.
 radii=[6.0,4.2,5.2]
 def addtree(x,z,species,scale):
  if clear(x,z,radii[species]*scale):planted.append([round(x,2),round(z,2),species,round(scale,3),round(rng.random()*math.tau,3)])
 for t in json.loads((ROOT/'public/city/trees.json').read_text()):
  species=1 if t[2]==1 or (int(t[0]//85)+int(t[1]//65))%9==2 else (2 if (int(t[0]//70)+int(t[1]//100))%7 in [0,1] else 0)
  addtree(t[0],t[1],species,t[3]*rng.uniform(.80,1.0))
 # Finer detail plants use verified grass/park parcels or a narrow road verge;
 # grass/shrubs do not appear in the road paving or on a random empty roof.
 details=[]; detailgrid=set()
 def adddetail(x,z,kind,scale):
  radius=[.85,1.1,.65][kind]*scale
  key=(round(x/2),round(z/2),kind)
  if key in detailgrid:return
  p=Point(x,z); in_green=green.covers(p)
  near=road_index.query(p.buffer(10)); distance=min((carriageways[i].distance(p) for i in near),default=1e9)
  if not in_green and not (3.2<distance<9):return
  if clear(x,z,radius,False):
   detailgrid.add(key);details.append([round(x,2),round(z,2),kind,round(scale,3),round(rng.random()*math.tau,3)])
 for road in c['roads']:
  if road['kind'] not in ['trunk','primary','secondary','tertiary']:continue
  line=LineString(road['points'])
  if line.length<12:continue
  for dist in range(8,int(line.length),12):
   p=line.interpolate(dist); q=line.interpolate(min(line.length,dist+1)); dx,dz=q.x-p.x,q.y-p.y; length=math.hypot(dx,dz)
   if length<.01:continue
   for side in [-1,1]:
    setback=road['width']/2+rng.uniform(4,6);x,z=p.x-dz/length*setback*side,p.y+dx/length*setback*side
    kind=0 if dist%36 else (1 if rng.random()<.55 else 2)
    adddetail(x,z,kind,rng.uniform(.7,1.15))
 # Low grasses underneath trees and small ornamental beds nearby.
 for i,t in enumerate(planted):
  for j in range(3):
   a=j*math.tau/3+t[4]; r=rng.uniform(1.6,3.3);adddetail(t[0]+math.sin(a)*r,t[1]+math.cos(a)*r,j%3,rng.uniform(.65,1.0))
 # Exhaustive second validation uses serialized values; rounding can otherwise
 # move a seed into a buffer by a few millimetres.
 planted=[p for p in planted if clear(p[0],p[1],radii[p[2]]*p[3],False)]
 details=[p for p in details if clear(p[0],p[1],[.85,1.1,.65][p[2]]*p[3],False)]
 road_details=[]
 for road in c['roads']:
  if road['kind'] not in ['primary','secondary','tertiary'] or road.get('grade','0')!='0':continue
  line=LineString(road['points'])
  for distance in range(16,int(line.length)-3,52):
   p=line.interpolate(distance);q=line.interpolate(distance+1);dx,dz=q.x-p.x,q.y-p.y;length=math.hypot(dx,dz)
   if length<.01:continue
   side=1 if distance%3 else -1;off=(road['width']/2-.52)*side;x,z=p.x-dz/length*off,p.y+dx/length*off
   spot=Point(x,z)
   if land.covers(spot) and not water.covers(spot):road_details.append([round(x,2),round(z,2),0,1,round(math.atan2(dx,dz),4)])
   if distance%104==16 and road['width']>5:
    x,z=p.x+dz/length*.7,p.y-dx/length*.7
    if land.covers(Point(x,z)) and not water.covers(Point(x,z)):road_details.append([round(x,2),round(z,2),1,1,0])
 (OUT/'planting.json').write_text(json.dumps({'trees':planted,'details':details,'roadDetails':road_details},separators=(',',':')))
 report={'origin':'Original procedural art; planting positions derived from project OSM study area, not botanical survey','treeCount':len(planted),'detailCount':len(details),'roadDetailCount':len(road_details),'species':['banyan','palm','orchid-tree'],'rejections':checks,'validation':'Every serialized vegetation crown/detail footprint is inside land, outside inland water, outside every carriageway + 0.65m, and outside building footprints. Vegetation detail sites additionally require green parcel or 3.2–9m road verge. Drain grates/manholes intentionally lie on at-grade primary/secondary/tertiary roads and are separate from vegetation.','radii':radii}
 (ART/'planting-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(report,flush=True)

if '--prepare' in sys.argv:
 prepare();sys.exit()

sys.path.insert(0,str(ROOT/'scripts'))
from city_mesh import B,M,material,bpy,Vector
rng=random.Random(49271)
material('landscape_bark',(.30,.255,.185),.94)
material('landscape_frond',(.27,.40,.13),.82)
material('landscape_grass',(.35,.43,.19),.9)
material('landscape_grass_tip',(.54,.52,.29),.95)
material('landscape_iron',(.14,.155,.15),.71,.30)
material('landscape_slots',(.045,.05,.046),.92)
foliage=material('landscape_foliage',(1,1,1),.88)
bsdf=next(n for n in foliage.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
tex=foliage.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(OUT/'foliage-atlas.png'))
foliage.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);foliage.node_tree.links.new(tex.outputs['Alpha'],bsdf.inputs['Alpha'])
foliage.surface_render_method='DITHERED';foliage.alpha_threshold=.48;foliage.use_backface_culling=False

def card(b,centre,width,height,angle,tilt,quadrant):
 c=Vector(centre);u=Vector((math.cos(angle),math.sin(angle),0));v=Vector((-math.sin(angle)*math.sin(tilt),math.cos(angle)*math.sin(tilt),math.cos(tilt)))
 # Slightly cupped geometry catches different sky/sun directions within each
 # branch spray, avoiding solid sphere crowns and flat cross-card stars.
 qx,qy=(quadrant%2)*.5,(1-quadrant//2)*.5
 for side in [-1,1]:
  pts=[tuple(c+u*width*side*.5-v*height*.5),tuple(c-v*height*.5+Vector((0,0,.10))),tuple(c+v*height*.5+Vector((0,0,.10))),tuple(c+u*width*side*.5+v*height*.5)]
  uv=[(qx+(.012 if side<0 else .488),qy+.012),(qx+.25,qy+.012),(qx+.25,qy+.488),(qx+(.012 if side<0 else .488),qy+.488)]
  b.face('landscape_foliage',pts,uv)

def leafy(kind,low=False):
 b=B();palm=kind==1; flower=kind==2
 if palm:
  rings=[(math.sin(i*.25)*.14,0,i*.7,.22-i*.006,.22-i*.006) for i in range(11)]
  b.loft('landscape_bark',rings,8 if low else 12)
  for i in range(10 if low else 21):
   a=i*2.39996; length=3.5*(.83+.17*math.sin(i*4));peak=7+rng.uniform(.0,.65);prev=Vector((.1,0,6.8))
   steps=10 if low else 22
   for j in range(1,steps+1):
    t=j/steps;cur=Vector((math.cos(a)*length*t,math.sin(a)*length*t,peak+math.sin(t*math.pi)*.7-t*t*1.4))
    if j%3==0 or j==steps:
     b.tube('landscape_bark',prev,cur,.035*(1-t*.75),4);prev=cur
    for side in [-1,1]:
     width=(.22+.85*math.sin(t*math.pi))*(1-t*.40); leafdir=Vector((math.cos(a+side*1.03),math.sin(a+side*1.03),-.35));tip=cur+leafdir*width;normal=Vector((-leafdir.y,leafdir.x,.12))*.064
     middle=cur+leafdir*width*.48
     b.face('landscape_frond',[tuple(cur),tuple(middle-normal),tuple(tip),tuple(middle+normal)])
  return b
 # Forked trunk with horizontally reaching branch architecture.
 top=5.9 if flower else 6.5
 b.tube('landscape_bark',(0,0,0),(.18,-.1,2.4),.33 if not flower else .24,8,r2=.22)
 for i in range(5 if low else 8):
  a=i*2.4;reach=(3.2 if flower else 3.9)*rng.uniform(.67,1);mid=(math.cos(a)*reach*.4,math.sin(a)*reach*.4,3.4+rng.random()*.6);end=(math.cos(a)*reach,math.sin(a)*reach,top+rng.uniform(-1.4,.0))
  b.tube('landscape_bark',(.18,-.1,2.2),mid,.16,6,r2=.10);b.tube('landscape_bark',mid,end,.10,5,r2=.026)
  for j in range(5 if low else 18):
   u=.30+j/(5 if low else 18)*.70;cx=mid[0]+(end[0]-mid[0])*u+rng.uniform(-.65,.65);cy=mid[1]+(end[1]-mid[1])*u+rng.uniform(-.65,.65);cz=mid[2]+(end[2]-mid[2])*u+rng.uniform(-.35,.5)
   if not low and j%4==0:b.tube('landscape_bark',(cx,cy,cz-.3),(cx+.3,cy,cz+.25),.027,4,r2=.01)
   for k in range(2 if low else 3):card(b,(cx,cy,cz),1.5 if low else 1.35,1.8 if low else 1.45,a+k*1.5,rng.uniform(-.7,.7) if k==0 else (1.28 if k==1 else -1.18),2 if flower else i%2)
 if not low:
  for j in range(30):
   a=j*2.4;r=math.sqrt(j/30)*1.7;card(b,(math.cos(a)*r,math.sin(a)*r,top+rng.uniform(-.1,.65)),1.45,1.45,a,1.22 if j%2 else rng.uniform(-.8,.8),2 if flower else j%2)
 return b

def groundplant(kind):
 b=B()
 if kind==0: # small lawn tufts, deliberately no alpha overdraw
  for i in range(28):
   a=rng.random()*math.tau;r=rng.random()*.55;x,y=math.cos(a)*r,math.sin(a)*r;h=rng.uniform(.08,.24);w=.014;dx,dy=math.cos(a),math.sin(a)
   b.face('landscape_grass',[(x-w*dy,y+w*dx,0),(x+w*dy,y-w*dx,0),(x+dx*h*.55,y+dy*h*.55,h)])
 elif kind==1: # loosely clipped shrub, visible woody branching
  for i in range(18):
   a=i*2.4;r=math.sqrt(i/18)*.64;h=rng.uniform(.35,.73);x,y=math.sin(a)*r,math.cos(a)*r
   if i%3==0:b.tube('landscape_bark',(0,0,0),(x,y,h),.021,4,r2=.008)
   card(b,(x,y,h),.8,.8,a,rng.uniform(-.6,.6),2 if i%5==0 else 0)
 elif kind==2: # fountain grass, curved blades and buff seed heads
  for i in range(23):
   a=i*2.4;h=rng.uniform(.35,.9);dx,dy=math.sin(a),math.cos(a);x,y=dx*.13,dy*.13
   base=(x-dy*.025,y+dx*.025,0);base2=(x+dy*.025,y-dx*.025,0);bend=(x+dx*.23,y+dy*.23,h*.76);tip=(x+dx*.47,y+dy*.47,h*.62)
   b.face('landscape_grass',[base,base2,bend]);b.face('landscape_grass',[base2,tip,bend])
   if i%4==0:b.tube('landscape_grass_tip',bend,(bend[0]+dx*.09,bend[1]+dy*.09,h),.019,4,r2=.007)
 return b

models=[];allobjects=[]
for kind,name in enumerate(['banyan','palm','orchid-tree']):
 for low in [False,True]:
  model=name+('-lod' if low else '');obs=leafy(kind,low).finish(model,smooth=True);models.append((model,obs));allobjects.extend(obs)
for kind,name in enumerate(['lawn-tuft','flower-shrub','fountain-grass']):
 obs=groundplant(kind).finish(name,smooth=True);models.append((name,obs));allobjects.extend(obs)
for name in ['drain-grate','manhole']:
 b=B()
 if name=='drain-grate':
  b.box('landscape_iron',(0,0,.008),(.43,.68,.016))
  for i in range(7):b.face('landscape_slots',[(-.17,-.27+i*.08,.018),(.17,-.27+i*.08,.018),(.17,-.235+i*.08,.018),(-.17,-.235+i*.08,.018)])
 else:
  b.loft('landscape_iron',[(0,0,0,.33,.33),(0,0,.015,.33,.33)],24)
  for j in range(-2,3):
   y=j*.09;span=math.sqrt(.25**2-y*y);b.face('landscape_slots',[(-span,y-.012,.018),(span,y-.012,.018),(span,y+.012,.018),(-span,y+.012,.018)])
  for a in [0,math.pi]:
   x,y=math.cos(a)*.26,math.sin(a)*.26;b.box('landscape_slots',(x,y,.018),(.035,.05,.006))
 obs=b.finish(name);models.append((name,obs));allobjects.extend(obs)
stats=[]
for name,obs in models:
 bpy.ops.object.select_all(action='DESELECT')
 for ob in obs:ob.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
 path=OUT/(name+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
 triangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in obs)
 stats.append({'id':name,'file':name+'.glb','triangles':triangles,'meshes':len(obs),'bytes':path.stat().st_size})
 # Each tree remains below the contractual 6000-triangle maximum.
 if name in ['banyan','palm','orchid-tree']:assert triangles<=6000
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'subtropical-landscape.blend'))
manifest={'version':1,'models':stats,'source':'Original Blender procedural botanical studies, not a species survey','textureAtlas':[1024,1024],'groundTextures':[512,512],'budgets':{'nearTrees':48,'farTrees':220,'lawnTufts':520,'shrubs':110,'ornamentalGrass':120,'roadDetails':28,'detailTriangleCeiling':150000}}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));(ART/'model-budget.json').write_text(json.dumps(manifest,indent=2));print(json.dumps(manifest),flush=True)
if '--preview' in sys.argv:
 for name,obs in models:
  visible=name in ['banyan','palm','orchid-tree','flower-shrub','fountain-grass']
  offset={'banyan':(-9,0,0),'palm':(0,0,0),'orchid-tree':(9,0,0),'flower-shrub':(-4,-3,0),'fountain-grass':(4,-3,0)}.get(name,(0,0,0))
  for ob in obs:ob.hide_render=not visible;ob.location=offset
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.03));plane=bpy.context.object;plane.data.materials.append(material('preview-ground',(.19,.23,.17),.95))
 bpy.ops.object.light_add(type='AREA',location=(-5,-8,16));key=bpy.context.object;key.data.energy=2600;key.data.shape='DISK';key.data.size=9
 bpy.ops.object.light_add(type='SUN',location=(-12,4,10));sun=bpy.context.object;sun.data.energy=2.1;sun.rotation_euler=(.5,-.6,-.5)
 bpy.ops.object.camera_add(location=(19,-33,15));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,3.7))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=30
 scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.world.color=(.23,.27,.30);scene.render.resolution_x=1200;scene.render.resolution_y=650;scene.render.resolution_percentage=100;scene.render.filepath=str(ART/'botanical-contact-sheet.png');scene.view_settings.view_transform='AgX';bpy.ops.render.render(write_still=True)
