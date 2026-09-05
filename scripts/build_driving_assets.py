import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from city_mesh import *
city=json.loads((O/'city.json').read_text());manifest=[];chunks={};chunkSize=640
# Complete exterior massing using actual polygonal footprints, setback crown,
# cornice, roof plant and storefront base. Glazing uses authored PBR atlases.
for row in city['buildings']:
 ring=row['rings'][0];cx=sum(p[0] for p in ring[:-1])/len(ring[:-1]);cy=sum(p[1] for p in ring[:-1])/len(ring[:-1]);key=(math.floor(cx/chunkSize),math.floor(cy/chunkSize));b=chunks.setdefault(key,B());h=row['height'];typ=row['style'];rnd=random.Random(row['seed'])
 b.footprint(typ,ring,0,h)
 b.footprint('concrete' if typ=='residential' else 'steel',ring,h,h+.6,1.035)
 b.footprint(typ,ring,h+.6,h+max(2,h*.04),.70)
 b.footprint('darkglass',ring,0,min(4.0,h*.25),1.015)
 if h>25:
  b.box('roof',(cx,cy,h+max(2,h*.04)+.7),(max(1.4,math.sqrt(abs(h))*.7),2.5,1.4))
 # Recessed floor ledges give nearby residential facades actual depth.
 if typ=='residential' and h<60:
  for z in range(7,int(h),6):b.footprint('concrete',ring,z,z+.18,1.025)
allCity=[]
for key,b in chunks.items():allCity+=b.finish(f'block_{key[0]}_{key[1]}')
manifest.append(export('buildings',allCity));print('BUILDINGS',manifest[-1],flush=True)
# Roads are batched by 640m tile, with sidewalk, lane separators and edge lines.
roadChunks={};decor=B();trees=[];rng=random.Random(20)
for r in city['roads']:
 pts=r['points'];width=r['width'];main=r['kind'] in ['trunk','primary','secondary','tertiary'];walk=2.4 if main else 1.2
 for a,c in zip(pts,pts[1:]):
  dx,dy=c[0]-a[0],c[1]-a[1];l=math.hypot(dx,dy)
  if l<.01:continue
  nx,ny=-dy/l,dx/l;key=(math.floor((a[0]+c[0])/2/chunkSize),math.floor((a[1]+c[1])/2/chunkSize));b=roadChunks.setdefault(key,B())
  for mat,w,z in [('pavement',width/2+walk,.05),('asphalt',width/2,.10)]:
   b.face(mat,[(a[0]-nx*w,a[1]-ny*w,z),(c[0]-nx*w,c[1]-ny*w,z),(c[0]+nx*w,c[1]+ny*w,z),(a[0]+nx*w,a[1]+ny*w,z)],[(0,0),(l/14,0),(l/14,w/7),(0,w/7)])
  if not main or l<5:continue
  # Edge strips; dashed lane markings keep junctions comparatively legible.
  for off in [-width/2+.35,width/2-.35]:
   b.face('roadline',[(a[0]+nx*(off-.06),a[1]+ny*(off-.06),.13),(c[0]+nx*(off-.06),c[1]+ny*(off-.06),.13),(c[0]+nx*(off+.06),c[1]+ny*(off+.06),.13),(a[0]+nx*(off+.06),a[1]+ny*(off+.06),.13)])
  for j in range(1,max(2,round(width/3))):
   off=-width/2+j*width/max(2,round(width/3))
   for t in range(2,int(l)-2,9):
    t1=min(l-2,t+3.5);b.face('roadline',[(a[0]+dx*t/l+nx*(off-.06),a[1]+dy*t/l+ny*(off-.06),.14),(a[0]+dx*t1/l+nx*(off-.06),a[1]+dy*t1/l+ny*(off-.06),.14),(a[0]+dx*t1/l+nx*(off+.06),a[1]+dy*t1/l+ny*(off+.06),.14),(a[0]+dx*t/l+nx*(off+.06),a[1]+dy*t/l+ny*(off+.06),.14)])
  if l>24 and r['kind'] in ['trunk','primary','secondary']:
   for t in range(12,int(l)-5,42):
    sign=1 if t%2 else -1;x=a[0]+dx*t/l+nx*(width/2+1.5)*sign;y=a[1]+dy*t/l+ny*(width/2+1.5)*sign
    b.tube('steel',(x,y,0),(x,y,8),.09);b.tube('steel',(x,y,8),(x-nx*2*sign,y-ny*2*sign,8.4),.06);b.box('lamp',(x-nx*2*sign,y-ny*2*sign,8.36),(1.25,.44,.14))
    trees.append([x+nx*3*sign,y+ny*3*sign,1 if rng.random()<.55 else 0,round(rng.uniform(.8,1.25),2)])
roads=[]
for k,b in roadChunks.items():roads+=b.finish(f'roads_{k[0]}_{k[1]}')
manifest.append(export('roads',roads));print('ROADS',manifest[-1],flush=True)
surf=json.loads((O/'surfaces.json').read_text());s=B()
for layer,height,mat in [('land',-.05,'land'),('green',.025,'park'),('water',.035,'water')]:
 for tri in surf[layer]:s.face(mat,[(x,y,height) for x,y in tri])
# Shoreline promenade has a dedicated curb, walking strip and planted edge.
for line in city['coast']:
 for a,c in zip(line,line[1:]):
  l=math.dist(a,c)
  if l<.1:continue
  dx=(c[0]-a[0])/l;dy=(c[1]-a[1])/l
  s.face('pavement',[(a[0],a[1],.08),(c[0],c[1],.08),(c[0]-dy*4,c[1]+dx*4,.08),(a[0]-dy*4,a[1]+dx*4,.08)])
  s.tube('concrete',(a[0],a[1],.27),(c[0],c[1],.27),.18,6)
manifest.append(export('terrain',s.finish('terrain')))
# Add grove placements in actual named park polygons (simple rejection sampling).
def inside(x,y,ring):
 odd=False
 for a,b in zip(ring,ring[1:]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:odd=not odd
 return odd
for p in city['green']:
 ring=p['rings'][0];xs=[v[0] for v in ring];ys=[v[1] for v in ring];area=(max(xs)-min(xs))*(max(ys)-min(ys));count=min(240,int(area/650))
 for _ in range(count):
  x=rng.uniform(min(xs),max(xs));y=rng.uniform(min(ys),max(ys))
  if inside(x,y,ring):trees.append([round(x,2),round(y,2),0,round(rng.uniform(.7,1.5),2)])
(O/'trees.json').write_text(json.dumps(trees,separators=(',',':')))
# Individual landmark source meshes, not generic tall boxes.
landmarkObs=[]
for lm in city['landmarks']:
 id=lm['id'];h=lm['height'];b=B();b.frame=(lm['x'],lm['z'],0)
 if id=='bamboo':
  rings=[(0,0,h*t,r,r) for t,r in [(0,22),(.05,24),(.38,23),(.65,19),(.82,13),(.93,7.5),(1,1.4)]];p=b.loft('landmarkglass',rings,64)
  for i in range(64):
   for j in range(len(p)-1):b.tube('silver',p[j][i],p[j+1][i],.24,6)
  for z in range(4,int(h*.85),4):
   radius=24 if z<h*.38 else 24-(z/h-.38)*27;b.loft('steel',[(0,0,z,radius,radius),(0,0,z+.23,radius,radius)],64)
  for j in range(2,len(p)-1):
   for i in range(0,64,2):b.tube('silver',p[j][i],p[j+1][(i+4)%64],.19,5)
  b.loft('concrete',[(0,0,0,42,35),(0,0,6,38,32),(0,0,11,28,25)],48)
 elif id=='pingan':
  # Octagonal body, tapering chevron mega-columns and pyramidal crown.
  rings=[(0,0,0,28,28),(0,0,h*.72,25,25),(0,0,h*.90,18,18),(0,0,h*.97,7,7),(0,0,h,1,1)];p=b.loft('landmarkglass',rings,8,power=.45)
  for j in range(len(p)-1):
   for i in range(8):b.tube('silver',p[j][i],p[j+1][i],1.1 if i%2 else 1.5,6,r2=.55)
  for z in range(5,int(h*.88),4):
   rad=28 if z<h*.72 else 25-(z/h-.72)*39;b.loft('steel',[(0,0,z,rad,rad),(0,0,z+.20,rad,rad)],8,power=.45)
  for x in [-15,-7,0,7,15]:
   for sign in [-1,1]:b.tube('silver',(x,sign*27,4),(x*.75,sign*22,h*.79),.20,5)
  for i in range(3):b.box('stone',(0,0,4+i*4),(86-i*13,73-i*10,7))
 elif id=='tencent':
  # Two different height towers linked by three broad sky bridges.
  for x,ht in [(-25,h),(25,h*.79)]:
   ring=[[x-15,-18],[x+15,-18],[x+15,18],[x-15,18],[x-15,-18]];b.footprint('office',ring,0,ht)
   for z in range(5,int(ht),3):b.box('silver',(x,0,z),(30.5,36.5,.18))
   for dx in [-15,15]:
    for yy in [-18,18]:b.tube('silver',(x+dx,yy,0),(x+dx,yy,ht),.42,6)
  for z in [22,65,112]:
   b.box('gold',(0,0,z),(30,27,8));b.box('darkglass',(0,-13.6,z),(28,.3,5));b.box('darkglass',(0,13.6,z),(28,.3,5))
 elif id=='civic':
  # Broad rising wing roof with a recessed middle and distinct red supports.
  for x in [-74,74]:
   b.box('darkglass',(x,0,11),(58,42,22));b.box('concrete',(x,-23,2),(67,7,4))
   for xx in range(-26,27,7):b.box('silver',(x+xx,-21.2,12),(.6,.7,21))
  for x in [-40,40]:b.tube('civicred',(x,0,0),(x,0,28),9,32)
  for x in range(-125,125,4):
   def zh(q):return 24+9*(abs(q)/125)**2
   for y in range(-31,31,6):b.face('silver',[(x,y,zh(x)),(x+4,y,zh(x+4)),(x+4,y+6,zh(x+4)+.5),(x,y+6,zh(x)+.5)])
   b.box('steel',(x,-31,zh(x)-.5),(4.2,.65,1.3))
  b.box('pavement',(0,-75,.06),(275,125,.12))
 elif id=='kk100':
  p=b.loft('landmarkglass',[(0,0,0,20,14),(0,0,h*.78,20,14),(1,0,h*.92,17,12),(7,0,h*.98,10,8),(10,0,h,2,3)],40)
  for i in range(0,40,2):
   for j in range(len(p)-1):b.tube('silver',p[j][i],p[j+1][i],.24,5)
  for z in range(3,int(h*.84),3):b.loft('steel',[(0,0,z,20,14),(0,0,z+.15,20,14)],40)
  b.box('stone',(0,0,6),(64,54,12))
 elif id=='diwang':
  ring=[[-23,-16],[23,-16],[23,16],[-23,16],[-23,-16]];b.footprint('office',ring,0,h*.86)
  for x in [-13,13]:
   b.loft('landmarkglass',[(x,0,h*.84,9,12),(x,0,h*.94,9,12),(x,0,h*.96,7,9)],32);b.tube('silver',(x,0,h*.95),(x,0,h),.35,8)
  for z in range(3,int(h*.86),4):b.box('silver',(0,0,z),(46.5,32.5,.27))
 elif id=='lianhua':
  # Artistic park relief; no DEM acquired, documented estimate.
  for k in range(18):
   r=130-k*6;z=k*2.4;b.loft('park',[(0,0,z,r,r*.68),(0,0,z+2.4,r-6,(r-6)*.68)],56)
  b.box('pavement',(0,0,44),(26,19,1))
 else:continue
 obs=b.finish('landmark_'+id);landmarkObs+=obs
manifest.append(export('landmarks',landmarkObs));print('LANDMARKS',manifest[-1],flush=True)
# Curved original electric grand tourer, front is local +Y.
car=B()
# Superellipse sections: low sill, broad sculpted shoulder, swept bonnet.
car.loft('carpaint',[(0,0,.25,.74,2.12),(0,0,.36,.94,2.27),(0,-.03,.61,1.00,2.31),(0,0,.82,.98,2.27),(0,.03,.94,.87,2.10)],48,.42)
# Sloping glasshouse taper and painted roof.
car.loft('darkglass',[(0,-.18,.94,.86,1.44),(0,-.28,1.28,.73,1.03),(0,-.32,1.43,.65,.74)],48,.38)
car.loft('carpaint',[(0,-.32,1.42,.66,.75),(0,-.33,1.47,.58,.69)],48,.38)
for side in [-1,1]:
 car.tube('steel',(side*.85,-1.54,.94),(side*.66,-1.04,1.40),.032,8)
 car.tube('steel',(side*.85,1.22,.96),(side*.65,.42,1.43),.035,8)
 car.tube('steel',(side*.78,-.40,.94),(side*.69,-.40,1.43),.025,8)
 car.loft('carpaint',[(side*1.0,.72,.97,.15,.25),(side*1.0,.70,1.08,.12,.21)],20,.5)
 # Door sill, creases, split door handles.
 car.tube('steel',(side*.984,-1.3,.37),(side*.984,1.3,.37),.035,6)
 for y in [-.85,.45]:car.box('steel',(side*.94,y,.91),(.025,.20,.025))
 for y in [-1.48,1.48]:
  # Wheels are cylinders across axle; brushed multi-spoke alloy wheels.
  car.tube('rubber',(side*.88,y,.43),(side*1.07,y,.43),.39,32)
  car.tube('steel',(side*1.076,y,.43),(side*1.089,y,.43),.29,32)
  car.tube('rubber',(side*1.092,y,.43),(side*1.095,y,.43),.24,28)
  for i in range(10):
   a=i*math.tau/10;car.tube('silver',(side*1.101,y,.43),(side*1.101,y+.255*math.cos(a),.43+.255*math.sin(a)),.022,6)
  car.tube('silver',(side*1.102,y,.43),(side*1.115,y,.43),.07,16)
# Full width LEDs, grille, brake strip and plates.
car.box('darkglass',(0,2.25,.45),(1.42,.055,.22));car.box('rubber',(0,-2.25,.38),(1.4,.1,.2))
for x in [-.61,.61]:car.box('led',(x,2.235,.83),(.45,.055,.047))
car.box('redled',(0,-2.255,.81),(1.71,.055,.041));car.box('steel',(0,-2.29,.51),(.48,.025,.12))
car.box('darkglass',(0,-2.30,.52),(.43,.015,.09));car.box('redled',(0,-.99,1.375),(.28,.05,.02))
manifest.append(export('car',car.finish('car',True)))
# Shared vegetation prototypes for GPU instancing.
for kind in ['tree','palm']:
 b=B();rr=random.Random(109)
 if kind=='palm':
  for i in range(8):b.tube('bark',(.03*i,0,i),(.03*(i+1),0,i+1),.17-i*.009,10)
  for i in range(10):
   a=i*math.tau/10;last=(.24,0,8)
   for j in range(1,12):
    r=j*.37;z=8+math.sin(j/12*math.pi)*1.05-j*.13;now=(.24+math.cos(a)*r,math.sin(a)*r,z);b.tube('leaf',last,now,.033,5)
    for sign in [-1,1]:
     width=math.sin(j/12*math.pi)*.94;tip=(now[0]-math.sin(a)*width*sign+math.cos(a)*.45,now[1]+math.cos(a)*width*sign+math.sin(a)*.45,z-.35)
     b.face('leaflight' if i%3==0 else 'leaf',[last,now,tip]);b.face('leaf',[tip,now,last])
    last=now
 else:
  b.tube('bark',(0,0,0),(0,0,5),.25,10,r2=.13)
  # Hundreds of individually oriented leaf blades replace solid foliage blobs.
  for k in range(16):
   a=rr.uniform(0,math.tau);r=rr.uniform(.5,2.6);x,y=math.cos(a)*r,math.sin(a)*r;z=rr.uniform(4.4,7.1);b.tube('bark',(0,0,3.4),(x,y,z),.085,7,r2=.025)
   for j in range(55):
    az=rr.uniform(0,math.tau);el=rr.uniform(-1,1);rad=rr.random()**.5*1.30
    center=Vector((x+math.cos(az)*rad,y+math.sin(az)*rad,z+el*.8));heading=rr.uniform(0,math.tau);tilt=rr.uniform(-.6,.9);u=Vector((math.cos(heading),math.sin(heading),tilt)).normalized();v=Vector((-math.sin(heading),math.cos(heading),rr.uniform(-.4,.4))).normalized();length=rr.uniform(.20,.36);width=length*.5
    pts=[center-u*length,center-u*length*.35+v*width,center+u*length*.5+v*width*.7,center+u*length,center+u*length*.5-v*width*.7,center-u*length*.35-v*width]
    b.face('leaflight' if j%3==0 else 'leaf',[tuple(q) for q in pts]);b.face('leaf',[tuple(q) for q in reversed(pts)])
 manifest.append(export(kind,b.finish(kind,True)))
# Full editable project keeps all original meshes. Collection names track source.
bpy.ops.wm.save_as_mainfile(filepath=str(A/'shenzhen-driving-city.blend'))
(O/'asset-manifest.json').write_text(json.dumps({'assets':manifest,'treeInstances':len(trees),'chunkSize':chunkSize,'totalBytes':sum(a['bytes'] for a in manifest)},ensure_ascii=False,indent=2))
print('DONE',json.dumps(manifest),flush=True)
