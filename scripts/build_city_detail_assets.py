"""Editable Blender art pass: sculpted indigo fastback, citizens, landmark detail.
Car proportions reference Xiaomi SU7 (4.997 x 1.963 x 1.455 m), independently
authored exterior study. No downloaded commercial mesh or manufacturer logo.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from city_mesh import *
city=json.loads((O/'city.json').read_text());manifest=[]
material('carpaint',(.025,.047,.24),.22,.65)
material('brake',(.78,.35,.035),.4,.35)
material('lampwarm',(1,.48,.16),.35,0,5)
material('lampcool',(.13,.65,.78),.25,0,3)
material('skin',(.55,.30,.17),.85)
material('hair',(.018,.022,.026),.9)
material('shirt',(.19,.34,.40),.86)
material('trousers',(.025,.045,.071),.86)
material('shoes',(.72,.72,.66),.85)
def curve(b,mat,pts,r=.01,n=8):
 if len(pts)<2:return
 pts=[Vector(p) for p in pts];rings=[]
 for i,p in enumerate(pts):
  tangent=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized();q=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((1,0,0));u=tangent.cross(q).normalized();v=tangent.cross(u)
  rings.append([tuple(p+r*(math.cos(k*math.tau/n)*u+math.sin(k*math.tau/n)*v)) for k in range(n)])
 for a,c in zip(rings,rings[1:]):
  for k in range(n):b.face(mat,[a[k],a[(k+1)%n],c[(k+1)%n],c[k]])
 b.face(mat,list(reversed(rings[0])));b.face(mat,rings[-1])
def ellipse(b,mat,c,rx,rz,y,r=.015,n=64):
 curve(b,mat,[(c+rx*math.cos(i*math.tau/n),y,rz*math.sin(i*math.tau/n)) for i in range(n+1)],r)
# Car body: longitudinal sculpted shell with real wheel openings.
car=B();sections=[]
for j in range(121):
 y=-2.48+j*4.96/120;ab=abs(y);width=.967-.22*max(0,(ab-1.65)/.83)**1.6
 hood=.925+.035*math.cos(y*1.3)-.21*max(0,(y-1.6)/.88)**1.7-.065*max(0,(-y-2.1)/.38)
 arch=max([.29]+[.375+math.sqrt(max(0,.423**2-(y-wy)**2)) for wy in [-1.50,1.50] if abs(y-wy)<.423])
 # Cross section: underside / sculpted flank / hood / opposite flank.
 profile=[(-.94,arch),(-1,arch+.025),(-1,.81),(-.96,.91),(-.8,hood+.025),(-.4,hood+.01),(0,hood),(.4,hood+.01),(.8,hood+.025),(.96,.91),(1,.81),(1,arch+.025),(.94,arch)]
 sections.append([(x*width,y,z if abs(x)>.9 else z) for x,z in profile])
for a,b in zip(sections,sections[1:]):
 for k in range(len(a)-1):car.face('carpaint',[a[k],a[k+1],b[k+1],b[k]])
car.face('carpaint',sections[0]);car.face('carpaint',list(reversed(sections[-1])))
car.box('rubber',(0,0,.28),(1.58,4.35,.09))
# Glasshouse: smoothly arched panorama roof, flowing into long sloped rear glass.
roof=[]
for j in range(41):
 y=-1.55+j*2.72/40;t=j/40;z=.96+.50*math.sin(math.pi*t)**.70;w=.80-.14*math.sin(math.pi*t)
 roof.append([(math.sin(a)*w,y,z-(1-math.cos(a))*.13) for a in [(-math.pi/2+i*math.pi/30) for i in range(31)]])
for a,b in zip(roof,roof[1:]):
 for k in range(len(a)-1):car.face('darkglass',[a[k],a[k+1],b[k+1],b[k]])
for side in [-1,1]:
 edge=[r[0 if side<0 else -1] for r in roof];curve(car,'carpaint',edge,.038,10)
 for a,b in zip(edge,edge[1:]):car.face('darkglass',[a,b,(side*.846,b[1],.92),(side*.846,a[1],.92)])
 curve(car,'rubber',[(side*.851,y,.925) for y in [-1.48,-1,-.5,0,.5,1.13]],.017)
 # Body-colored pillars, door seam grooves and flush door handles.
 for y in [-.40,.98]:
  j=min(range(len(roof)),key=lambda j:abs(roof[j][15][1]-y));top=roof[j][0 if side<0 else -1]
  curve(car,'carpaint',[(side*.852,y,.92),top],.028,8)
 for yy in [-1.14,.25,1.10]:
  curve(car,'rubber',[(side*.965,yy,.84),(side*.970,yy,.65),(side*.955,yy+.05,.34)],.0055,5)
 for y in [-.83,.51]:car.box('steel',(side*.972,y,.845),(.016,.20,.031))
 # Sculpted wheel arches and sill extensions.
 for wy in [-1.50,1.50]:
  pts=[]
  for j in range(51):
   a=math.pi*j/50;pts.append((side*.979,wy+math.cos(a)*.435,.375+math.sin(a)*.435))
  curve(car,'carpaint',pts,.025,8)
 curve(car,'carpaint',[(side*.94,-1.0,.29),(side*.975,0,.30),(side*.94,1,.29)],.035,8)
 # Mirror stalk + rounded casing, separate dark mirror lens.
 car.tube('rubber',(side*.79,.75,1.03),(side*1.03,.69,1.07),.026,8)
 car.loft('carpaint',[(side*1.04,.67,1.06,.12,.20),(side*1.06,.66,1.14,.15,.19),(side*1.05,.65,1.17,.11,.14)],32,.6)
 car.box('darkglass',(side*1.05,.48,1.125),(.22,.015,.065))
# Long bonnet creases follow the fenders, with swept teardrop headlight housings.
for side in [-1,1]:
 curve(car,'carpaint',[(side*.53,1.14,.972),(side*.59,1.58,.96),(side*.56,2.06,.888)],.011,8)
 pts=[(side*.51,2.29,.77),(side*.77,2.18,.79),(side*.83,1.92,.91),(side*.68,1.95,.943),(side*.51,2.29,.77)]
 car.face('darkglass',pts[:-1]);curve(car,'led',pts,.014,8)
 curve(car,'led',[(side*.60,2.23,.796),(side*.73,2.03,.91)],.019,8)
 car.box('darkglass',(side*.64,2.49,.48),(.22,.025,.18))
car.box('darkglass',(0,2.49,.44),(1.05,.025,.15))
for x in [-.48,-.32,-.16,0,.16,.32,.48]:car.box('rubber',(x,2.434,.43),(.024,.02,.135))
# Halo rear lamp, black diffuser, spoiler and recessed plates.
rear=[(-.88,-2.325,.81),(-.80,-2.407,.835),(-.44,-2.455,.84),(0,-2.47,.843),(.44,-2.455,.84),(.80,-2.407,.835),(.88,-2.325,.81)]
rear=[(x,y-.07,z) for x,y,z in rear];curve(car,'darkglass',rear,.038,10);curve(car,'redled',rear,.016,8)
curve(car,'redled',[(x,y,z-.043) for x,y,z in rear],.010,8)
car.loft('carpaint',[(0,-2.13,.947,.79,.12),(0,-2.16,.974,.85,.14)],48,.45)
car.box('darkglass',(0,-2.37,.35),(1.48,.16,.15))
for x in [-.61,-.32,0,.32,.61]:car.box('rubber',(x,-2.43,.31),(.024,.32,.13))
car.box('rubber',(0,-2.49,.60),(.51,.045,.155))
car.box('silver',(0,-2.515,.60),(.46,.012,.12))
car.box('darkglass',(0,-2.53,.60),(.42,.014,.08))
curve(car,'redled',[(-.20,-1.13,1.16),(.20,-1.13,1.16)],.009,6)
carobs=car.finish('car',True)
# Four independently named wheels: contoured tires, two-tone split spokes,
# ventilated brake rotors, gold calipers, rim lip and center caps.
for side in [-1,1]:
 for wy in [-1.50,1.50]:
  wheel=B();cy=.375;x=side*.951
  for j in range(6):
   xa=side*(.84+j*.037);xb=side*(.84+(j+1)*.037);ra=.36+.019*math.sin(j/6*math.pi);rb=.36+.019*math.sin((j+1)/6*math.pi)
   wheel.tube('rubber',(xa,wy,cy),(xb,wy,cy),ra,64,r2=rb)
  out=side*1.065
  wheel.tube('steel',(side*.97,wy,cy),(side*.985,wy,cy),.269,64)
  for j in range(48):
   a=j*math.tau/48
   for rad in [.19,.23]:wheel.tube('rubber',(side*.986,wy+math.cos(a)*rad,cy+math.sin(a)*rad),(side*.988,wy+math.cos(a)*rad,cy+math.sin(a)*rad),.007,6)
  wheel.box('brake',(side*.999,wy+.21,cy+.03),(.065,.08,.20))
  for j in range(5):
   for delta in [-.10,.10]:
    a=j*math.tau/5;wheel.tube('silver',(out,wy+math.cos(a)*.07,cy+math.sin(a)*.07),(out,wy+math.cos(a+delta)*.284,cy+math.sin(a+delta)*.284),.017,8)
  for rad in [.294,.306]:curve(wheel,'silver',[(out,wy+rad*math.cos(a*math.tau/64),cy+rad*math.sin(a*math.tau/64)) for a in range(65)],.008,6)
  wheel.tube('steel',(out,wy,cy),(out+side*.014,wy,cy),.061,24)
  for j in range(5):
   a=j*math.tau/5;wheel.tube('silver',(out,wy+.042*math.cos(a),cy+.042*math.sin(a)),(out+side*.017,wy+.042*math.cos(a),cy+.042*math.sin(a)),.008,8)
  carobs+=wheel.finish('wheel_'+('l' if side<0 else 'r')+('f' if wy>0 else 'r'),True)
manifest.append(export('car',carobs))
if '--car-only' in sys.argv:
 bpy.ops.wm.save_as_mainfile(filepath=str(A/'indigo-fastback.blend'));print('CAR',manifest,flush=True);sys.exit(0)
# Low-cost segmented citizens, each limb is independently animated in runtime.
people=[]
b=B();b.loft('shirt',[(0,0,.85,.13,.10),(0,0,1.18,.20,.12),(0,0,1.38,.23,.115),(0,0,1.42,.10,.085)],20,.6);b.loft('skin',[(0,0,1.41,.06,.06),(0,0,1.49,.06,.06)],16);b.loft('skin',[(0,0,1.46,.06,.07),(0,0,1.49,.09,.09),(0,0,1.66,.087,.085),(0,0,1.71,.045,.05)],20);b.loft('hair',[(0,-.01,1.61,.091,.082),(0,-.005,1.70,.084,.080),(0,0,1.74,.035,.035)],20);b.box('trousers',(0,-.145,1.18),(.27,.13,.32));people+=b.finish('person_body',True)
for side in [-1,1]:
 leg=B();leg.loft('trousers',[(side*.105,0,.12,.065,.07),(side*.11,.015,.50,.068,.071),(side*.105,0,.89,.089,.10)],16);leg.loft('shoes',[(side*.11,.055,.035,.072,.15),(side*.11,.065,.10,.078,.14),(side*.11,.02,.16,.067,.095)],16);people+=leg.finish('person_leg_'+str(side),True)
 arm=B();arm.tube('shirt',(side*.21,0,1.35),(side*.26,.02,1.14),.065,16,r2=.054);arm.tube('skin',(side*.26,.02,1.13),(side*.27,.04,.90),.045,12,r2=.031);arm.loft('skin',[(side*.27,.04,.86,.032,.035),(side*.27,.04,.94,.036,.04)],14);people+=arm.finish('person_arm_'+str(side),True)
manifest.append(export('pedestrian',people))
# Roads: non-overlapping triangulated ribbons. Fixtures have safe curb anchors.
surf=json.loads((O/'street-surfaces.json').read_text());chunks={}
for mat,ts in surf.items():
 z={'asphalt':.10,'pavement':.06,'roadline':.122}[mat]
 for tri in ts:
  cx=sum(p[0] for p in tri)/3;cy=sum(p[1] for p in tri)/3;key=(math.floor(cx/640),math.floor(cy/640));b=chunks.setdefault(key,B())
  # GEOS triangles may be clockwise; explicitly orient upward.
  if (tri[1][0]-tri[0][0])*(tri[2][1]-tri[0][1])-(tri[1][1]-tri[0][1])*(tri[2][0]-tri[0][0])<0:tri=list(reversed(tri))
  b.face(mat,[(x,y,z) for x,y in tri],[(x/14,y/14) for x,y in tri])
for x,y,nx,ny in json.loads((O/'lamps.json').read_text()):
 b=chunks.setdefault((math.floor(x/640),math.floor(y/640)),B());b.tube('steel',(x,y,.1),(x,y,8),.075,8);b.tube('steel',(x,y,8),(x-nx*1.5,y-ny*1.5,8.3),.055,8);b.box('lamp',(x-nx*1.5,y-ny*1.5,8.27),(1,.38,.1))
roads=[]
for k,b in chunks.items():roads+=b.finish(f'roads_{k[0]}_{k[1]}')
manifest.append(export('roads',roads))
# Existing landmark modelling is refined into smooth, many-level facades.
landmarks=[]
def tower(b,rings,n,mat='landmarkglass',power=1):
 p=b.loft(mat,rings,n,power)
 for i in range(n):curve(b,'silver',[row[i] for row in p],.12 if n>32 else .25,6)
 return p
def ring_band(b,z,r,ry=None,mat='steel',n=64,power=1):return b.loft(mat,[(0,0,z,r,ry or r),(0,0,z+.12,r,ry or r)],n,power)
for lm in city['landmarks']:
 id=lm['id'];h=lm['height'];b=B();b.frame=(lm['x'],lm['z'],0);rr=random.Random(id)
 if id=='bamboo':
  # Smooth interpolation removes coarse silhouette kinks and floating bands.
  profile=[(0,22),(.055,24),(.37,23.5),(.60,21),(.76,16),(.87,10),(.95,4.4),(1,.65)]
  def radius(t):
   for k,((a,ra),(c,rc)) in enumerate(zip(profile,profile[1:])):
    if t<=c:
     prev=profile[max(0,k-1)];nxt=profile[min(len(profile)-1,k+2)];m0=(rc-prev[1])/(c-prev[0]);m1=(nxt[1]-ra)/(nxt[0]-a);f=(t-a)/(c-a);return (2*f**3-3*f*f+1)*ra+(f**3-2*f*f+f)*(c-a)*m0+(-2*f**3+3*f*f)*rc+(f**3-f*f)*(c-a)*m1
   return .65
  rings=[(0,0,h*i/100,radius(i/100),radius(i/100)) for i in range(101)];p=tower(b,rings,80)
  for z in range(3,int(h*.93),3):ring_band(b,z,radius(z/h)+.10,n=80)
  for j in range(28,96,4):
   for i in range(0,80,4):
    for d in [-2,2]:b.tube('silver',p[j][i],p[j+4][(i+d)%80],.13,5)
  for j in range(4,90,2):
   for i in range(80):
    if rr.random()<.085:
     a=2*math.pi*(i+.25)/80;c=2*math.pi*(i+.75)/80;r=radius(j/100)+.12;z=h*j/100
     b.face('lampwarm',[(r*math.cos(a),r*math.sin(a),z),(r*math.cos(c),r*math.sin(c),z),(r*math.cos(c),r*math.sin(c),z+1),(r*math.cos(a),r*math.sin(a),z+1)])
  b.loft('stone',[(0,0,0,42,35),(0,0,2,42,35),(0,0,9,31,26)],64)
  for z in [2,5,8]:ring_band(b,z,36,30,'lampwarm')
 elif id=='pingan':
  def radius(t):return 28-3*min(t/.72,1)-max(0,t-.72)*72
  rings=[(0,0,h*i/100,max(.7,radius(i/100)),max(.7,radius(i/100))) for i in range(101)];p=tower(b,rings,8,power=.45)
  for i in range(8):
   for j in range(100):b.tube('silver',p[j][i],p[j+1][i],.85,6)
  for z in range(3,int(h*.98),2):ring_band(b,z,max(.8,radius(z/h))+.03,n=8,power=.45)
  for face in range(8):
   for j in range(5,90,2):
    a=p[j][face];c=p[j][(face+1)%8]
    for f in [.20,.40,.60,.80]:
     x,y=a[0]*(1-f)+c[0]*f,a[1]*(1-f)+c[1]*f
     b.tube('silver',(x,y,h*j/100),(x,y,h*j/100+2),.09,5)
     if rr.random()<.18:b.tube('lampwarm',(x,y,h*j/100+.4),(x,y,h*j/100+1.3),.16,5)
  for i in range(3):
   b.box('stone',(0,0,3+i*3),(86-i*13,73-i*10,6));b.box('darkglass',(0,-36+i*5,3+i*3),(82-i*13,.3,3.8));b.box('lampwarm',(0,-36.4+i*5,5+i*3),(82-i*13,.12,.11))
 elif id=='tencent':
  for x,ht in [(-25,h),(25,h*.79)]:
   b.footprint('office',[[x-15,-18],[x+15,-18],[x+15,18],[x-15,18],[x-15,-18]],0,ht)
   for z in range(3,int(ht),2):b.box('silver',(x,0,z),(30.2,36.2,.12))
   for xx in range(-15,16,3):
    for y in [-18.1,18.1]:b.tube('silver',(x+xx,y,0),(x+xx,y,ht),.12,5)
   for dx in [-15.2,15.2]:
    for y in [-18.2,18.2]:b.tube('silver',(x+dx,y,0),(x+dx,y,ht),.35,6)
   b.box('lampwarm',(x,-18.3,ht-1),(29,.1,.12))
  for z in [22,65,112]:
   b.box('gold',(0,0,z),(30,27,8))
   for y in [-13.6,13.6]:
    b.box('darkglass',(0,y,z),(29,.25,5));b.box('lampwarm',(0,y*1.005,z-3),(30,.1,.14))
    for x in range(-14,15,2):b.box('gold',(x,y,z),(.12,.35,5))
 elif id=='civic':
  for x in [-74,74]:
   b.box('darkglass',(x,0,11),(58,42,22));b.box('stone',(x,-24,1),(66,8,2))
   for xx in range(-28,29,3):b.box('silver',(x+xx,-21.3,11),(.25,.6,22))
   for z in range(3,22,3):b.box('silver',(x,-21.4,z),(58,.4,.16))
   b.box('lampwarm',(x,-22,1.5),(58,.1,.14))
  for x in [-40,40]:
   b.tube('civicred',(x,0,0),(x,0,24),9,64)
   for a in range(48):
    t=math.tau*a/48;b.tube('civicred',(x+9.05*math.cos(t),9.05*math.sin(t),0),(x+9.05*math.cos(t),9.05*math.sin(t),24),.095,6)
  def zh(x,y):return 24+9*(abs(x)/125)**2+.45*math.cos(y/32*math.pi)
  for x in range(-125,125,2):
   for y in range(-32,32,4):
    q=[(x,y,zh(x,y)),(x+2,y,zh(x+2,y)),(x+2,y+4,zh(x+2,y+4)),(x,y+4,zh(x,y+4))];b.face('silver',q);b.face('gold',[(a,c,z-.7) for a,c,z in reversed(q)])
   for y in [-32,32]:b.tube('steel',(x,y,zh(x,y)),(x+2,y,zh(x+2,y)),.45,6)
  for x in range(-124,125,4):curve(b,'steel',[(x,y,zh(x,y)+.04) for y in range(-32,33,4)],.045,5)
  curve(b,'lampwarm',[(x,-32.3,zh(x,-32)-.25) for x in range(-125,126,2)],.075,6)
  b.box('pavement',(0,-75,.03),(275,125,.06))
  for x in [-90,-45,0,45,90]:b.box('lampcool',(x,-80,.10),(16,.22,.035))
 elif id=='kk100':
  rings=[(0,0,0,20,14),(0,0,h*.78,20,14),(1,0,h*.92,17,12),(7,0,h*.98,10,8),(10,0,h,2,3)];p=tower(b,rings,64)
  for z in range(3,int(h*.78),2):ring_band(b,z,20.05,14.05,n=64)
  for i in [12,20,44,52]:curve(b,'lampcool',[row[i] for row in p],.15,6)
  b.box('stone',(0,0,6),(64,54,12))
 elif id=='diwang':
  b.footprint('office',[[-23,-16],[23,-16],[23,16],[-23,16],[-23,-16]],0,h*.86)
  for x in [-13,13]:
   rings=[(x,0,h*.84,9,12),(x,0,h*.94,9,12),(x,0,h*.96,7,9)];tower(b,rings,48);b.tube('silver',(x,0,h*.95),(x,0,h),.35,10);b.tube('redled',(x,0,h-.5),(x,0,h),.4,8)
  for z in range(3,int(h*.86),3):b.box('silver',(0,0,z),(46.1,32.1,.16))
  for x in range(-21,22,3):
   for y in [-16.1,16.1]:b.tube('silver',(x,y,0),(x,y,h*.86),.15,5)
 elif id=='lianhua':
  # Continuous terrain surface; artistic relief, no acquired DEM.
  def height(x,y):return max(0,43*(1-(x/135)**2-(y/95)**2))**1.03
  for x in range(-140,140,5):
   for y in range(-100,100,5):
    if height(x,y)<=0:continue
    b.face('park',[(xx,yy,height(xx,yy)) for xx,yy in [(x,y),(x+5,y),(x+5,y+5),(x,y+5)]])
  b.box('pavement',(0,0,height(0,0)),(26,19,.8))
 else:continue
 landmarks+=b.finish('landmark_'+id, id in ['bamboo','kk100'])
manifest.append(export('landmarks',landmarks))
bpy.ops.wm.save_as_mainfile(filepath=str(A/'shenzhen-detail-art.blend'))
(O/'detail-manifest.json').write_text(json.dumps({'assets':manifest,'source':'artifacts/city/shenzhen-detail-art.blend'},indent=2))
print('DETAIL ASSETS',json.dumps(manifest),flush=True)
