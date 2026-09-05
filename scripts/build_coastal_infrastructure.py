"""Incremental Blender road/bridge/coast/luminaire assets; no car or landmark rebuild."""
import sys,math,json,random
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from city_mesh import *
meta=json.loads((O/'coastal/infrastructure.json').read_text());city=json.loads((O/'city.json').read_text());cells={}
def closest(x,z,a,b):
 dx=b[0]-a[0];dz=b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz or 1)));return math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)
for p in meta['crossings']:
 for a,b in zip(p['points'],p['points'][1:]):
  for ix in range(math.floor((min(a[0],b[0])-70)/100),math.floor((max(a[0],b[0])+70)/100)+1):
   for iz in range(math.floor((min(a[1],b[1])-70)/100),math.floor((max(a[1],b[1])+70)/100)+1):cells.setdefault((ix,iz),[]).append((a,b))
def height(x,z):
 h=0
 for a,b in cells.get((math.floor(x/100),math.floor(z/100)),[]):
  t=min(1,closest(x,z,a,b)/70);h=max(h,2.8*(1-t*t*(3-2*t)))
 return h
chunks={};added=0
surf=json.loads((O/'street-surfaces.json').read_text())
def emit(mat,tri,depth=0):
 global added
 xmin=min(p[0] for p in tri);xmax=max(p[0] for p in tri);zmin=min(p[1] for p in tri);zmax=max(p[1] for p in tri)
 hit=any((x,z) in cells for x in range(math.floor(xmin/100),math.floor(xmax/100)+1) for z in range(math.floor(zmin/100),math.floor(zmax/100)+1))
 edges=[math.dist(tri[i],tri[(i+1)%3]) for i in range(3)]
 if hit and max(edges)>18 and depth<12:
  i=edges.index(max(edges));a=tri[i];b=tri[(i+1)%3];c=tri[(i+2)%3];mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];emit(mat,[a,mid,c],depth+1);emit(mat,[mid,b,c],depth+1);return
 cx=sum(p[0] for p in tri)/3;cz=sum(p[1] for p in tri)/3;builder=chunks.setdefault((math.floor(cx/640),math.floor(cz/640)),B());base={'asphalt':.10,'pavement':.06,'roadline':.122}[mat]
 if (tri[1][0]-tri[0][0])*(tri[2][1]-tri[0][1])-(tri[1][1]-tri[0][1])*(tri[2][0]-tri[0][0])<0:tri=list(reversed(tri))
 builder.face(mat,[(x,z,height(x,z)+base) for x,z in tri],[(x/14,z/14) for x,z in tri]);added+=1
for mat,triangles in surf.items():
 for tri in triangles:emit(mat,tri)
for x,z,nx,nz in json.loads((O/'lamps.json').read_text()):
 b=chunks.setdefault((math.floor(x/640),math.floor(z/640)),B());h=height(x,z);b.tube('steel',(x,z,h+.1),(x,z,h+8),.075,8);b.tube('steel',(x,z,h+8),(x-nx*1.5,z-nz*1.5,h+8.3),.055,8);b.box('lamp',(x-nx*1.5,z-nz*1.5,h+8.27),(1,.38,.1))
roads=[]
for k,b in chunks.items():roads+=b.finish(f'roads_{k[0]}_{k[1]}')
road_report=export('roads',roads);print('roads',road_report,'surface triangles',added,flush=True)
# Parapets and spaced supports on the actual crossing portions.
b=B()
for bridge in meta['crossings']:
 for a,c in zip(bridge['points'],bridge['points'][1:]):
  length=math.dist(a,c)
  if length<.1:continue
  nx=-(c[1]-a[1])/length;nz=(c[0]-a[0])/length;h=2.8
  for side in [-1,1]:
   w=bridge['width']/2+.2;aa=(a[0]+nx*w*side,a[1]+nz*w*side);cc=(c[0]+nx*w*side,c[1]+nz*w*side)
   b.face('concrete',[(aa[0],aa[1],h-.45),(cc[0],cc[1],h-.45),(cc[0],cc[1],h+.32),(aa[0],aa[1],h+.32)])
   b.tube('steel',(*aa,h+1.0),(*cc,h+1.0),.065,6)
   for n in range(max(1,math.ceil(length/6))):
    t=n/max(1,math.ceil(length/6));x=aa[0]+(cc[0]-aa[0])*t;z=aa[1]+(cc[1]-aa[1])*t;b.tube('steel',(x,z,h+.1),(x,z,h+1.0),.045,5)
  for n in range(math.floor(length/35)+1):
   t=(n+.5)/(math.floor(length/35)+1);x=a[0]+(c[0]-a[0])*t;z=a[1]+(c[1]-a[1])*t;b.tube('concrete',(x,z,-2.5),(x,z,2.65),.45,8)
bridge_report=export('coastal-bridges',b.finish('coastal_bridge'))
# One reusable Blender pole; runtime instances conform to current park heights.
b=B();b.tube('steel',(0,0,0),(0,0,11.7),.13,12,r2=.065);b.box('concrete',(0,0,.18),(.7,.7,.36));b.tube('steel',(-1.5,0,11.5),(1.5,0,11.5),.075,8)
for x in [-1.25,1.25]:
 b.box('steel',(x,.1,11.7),(.90,.46,.22));b.box('lamp',(x,.13,11.56),(.79,.40,.055));b.tube('steel',(x,0,11.45),(x,.15,11.7),.045,8)
lamp_report=export('park-floodlight',b.finish('park_floodlight'))
# Mapped concrete seawall and wave-weathered stones give the coast a vertical edge.
b=B();rng=random.Random(741)
material('coastal-rock',(.19,.21,.18),.93);material('seawall',(.29,.33,.32),.88)
for line in city['coast']:
 for a,c in zip(line,line[1:]):
  if not (-6300< (a[0]+c[0])/2<1300 and -2700<(a[1]+c[1])/2< -390):continue
  length=math.dist(a,c)
  if length<.2:continue
  nx=-(c[1]-a[1])/length;nz=(c[0]-a[0])/length
  b.face('seawall',[(a[0],a[1],-1.5),(c[0],c[1],-1.5),(c[0],c[1],.16),(a[0],a[1],.16)])
  b.tube('concrete',(a[0],a[1],.22),(c[0],c[1],.22),.24,6)
  for n in range(int(length/9)):
   t=(n+.5)*9/length;x=a[0]+(c[0]-a[0])*t+nx*rng.uniform(-1.3,1.3);z=a[1]+(c[1]-a[1])*t+nz*rng.uniform(-1.3,1.3);w=rng.uniform(.4,1.1)
   b.loft('coastal-rock',[(x,z,-.8,w,w*.7),(x+.08,z-.03,-.18,w*.84,w*.63),(x-.10,z+.13,rng.uniform(-.12,.09),w*.38,w*.33)],6)
coast_report=export('coastal-shoreline',b.finish('coastal_shore'))
far=json.loads((O/'coastal/far-shore.json').read_text());mesh=bpy.data.meshes.new('opposite-shore-dsm');p=far['positions'];ind=far['indices'];mesh.from_pydata([(p[i],p[i+2],p[i+1]) for i in range(0,len(p),3)],[],[tuple(reversed(ind[i:i+3])) for i in range(0,len(ind),3)]);mesh.update();ob=bpy.data.objects.new('opposite_shore_terrain',mesh);bpy.context.collection.objects.link(ob);material('distant-shore',(.115,.18,.15),.98);mesh.materials.append(M['distant-shore'])
for polygon in mesh.polygons:polygon.use_smooth=True
far_report=export('opposite-shore',[ob])
(A/'coastal-infrastructure-build.json').write_text(json.dumps({'roads':road_report,'bridges':bridge_report,'lights':lamp_report,'shore':coast_report,'oppositeShore':far_report},indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(A/'coastal-infrastructure.blend'))
