"""Rooftop prop prototypes for ordinary buildings → public/city/rooftops/props.glb (+ manifest).

  blender -b --factory-startup --python scripts/build_rooftop_props.py

Thirteen small original models instanced tens of thousands of times by src/city-rooftops.ts:
helipads (flat and raised, white circle + H), plant rooms (render / dark glass / louvred metal),
stair bulkheads, cooling towers, split AC units, stainless water tanks, antenna masts, solar
arrays, skylights and vent pipes. Box kinds are unit cubes (x,y ∈ [-.5,.5], z ∈ [0,1]) scaled per
axis at runtime; the rest are authored at game scale (0.6 × real) and scaled uniformly.
Blender axes are east/north/up; the runtime flips Z like the canopy and landscape sets.
Object names are prop_<kind>_<material>; the kind ids match src/city-rooftop-plan.ts.
"""
import sys,math,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from city_mesh import *  # noqa: F401,F403  (Blender scene reset + shared materials + B mesh builder)

OUT=O/'rooftops';OUT.mkdir(parents=True,exist_ok=True)
material('render',(.66,.66,.62),.82);material('louvre',(.30,.33,.35),.55,.35);material('padgrey',(.30,.32,.31),.88)
material('padwhite',(.86,.87,.85),.62);material('padyellow',(.82,.62,.12),.6);material('panel',(.06,.09,.16),.22,.15);material('tankwhite',(.72,.74,.73),.42,.55)

def disc(b,m,c,r,z,n=40):
 b.face(m,[(c[0]+math.cos(i*math.tau/n)*r,c[1]+math.sin(i*math.tau/n)*r,z) for i in range(n)])
def ring(b,m,c,r0,r1,z,n=48,a0=0,a1=math.tau):
 for i in range(n):
  t0,t1=a0+(a1-a0)*i/n,a0+(a1-a0)*(i+1)/n
  # Counter-clockwise from +Z so the annulus faces up like disc() and the box tops (the props are back-face culled).
  b.face(m,[(c[0]+math.cos(t0)*r0,c[1]+math.sin(t0)*r0,z),(c[0]+math.cos(t0)*r1,c[1]+math.sin(t0)*r1,z),(c[0]+math.cos(t1)*r1,c[1]+math.sin(t1)*r1,z),(c[0]+math.cos(t1)*r0,c[1]+math.sin(t1)*r0,z)])
def cylinder(b,m,c,r,z0,z1,n=16,cap=True):
 b.tube(m,(c[0],c[1],z0),(c[0],c[1],z1),r,n) if cap else None
def unit_box(b,m,inset=0):
 h=.5-inset;b.box(m,(0,0,.5),(2*h,2*h,1))

def helipad(raised):
 b=B();z=0
 if raised:
  # Steel platform on eight columns; the open frame reads from the street and from the air.
  for i in range(8):
   a=i*math.tau/8;x,y=math.cos(a)*.78,math.sin(a)*.78
   b.tube('steel',(x,y,0),(x,y,2.3),.045,6)
  for i in range(8):
   a0,a1=i*math.tau/8,(i+1)*math.tau/8;b.tube('steel',(math.cos(a0)*.78,math.sin(a0)*.78,1.2),(math.cos(a1)*.78,math.sin(a1)*.78,1.2),.03,5)
  b.tube('steel',(0,0,2.3),(0,0,2.42),.98,40);ring(b,'steel',(0,0),.98,1.06,2.42);z=2.42
 # Deck (unit radius): concrete grey, white perimeter circle, TLOF yellow dashes, big white H.
 b.tube('padgrey',(0,0,z),(0,0,z+.06),1.0,40)
 ring(b,'padwhite',(0,0),.86,.93,z+.065)
 for i in range(12):
  a0=i*math.tau/12;ring(b,'padyellow',(0,0),.96,1.0,z+.065,4,a0,a0+math.tau/24)
 w,hh,t=.46,.50,.13;e=z+.07
 b.face('padwhite',[(-w,-hh,e),(-w+t,-hh,e),(-w+t,hh,e),(-w,hh,e)])
 b.face('padwhite',[(w-t,-hh,e),(w,-hh,e),(w,hh,e),(w-t,hh,e)])
 b.face('padwhite',[(-w+t,-t/2,e),(w-t,-t/2,e),(w-t,t/2,e),(-w+t,t/2,e)])
 # Perimeter lights.
 for i in range(16):
  a=i*math.tau/16;b.box('lamp',(math.cos(a)*1.0,math.sin(a)*1.0,z+.1),(.05,.05,.08))
 return b

def penthouse(kind):
 b=B()
 if kind=='render':unit_box(b,'render');b.box('roof',(0,0,1.0),(1.02,1.02,.04))
 elif kind=='glass':unit_box(b,'darkglass');b.box('silver',(0,0,1.0),(1.03,1.03,.05));b.box('silver',(0,0,.0),(1.03,1.03,.04))
 else:
  unit_box(b,'louvre');b.box('steel',(0,0,1.0),(1.03,1.03,.04))
  # Louvre bands as thin darker strips on all four faces (a unit box stretches evenly).
  for k in range(4):
   zc=.15+k*.22
   b.box('steel',(0,-.505,zc),(1.0,.01,.05));b.box('steel',(0,.505,zc),(1.0,.01,.05))
   b.box('steel',(-.505,0,zc),(.01,1.0,.05));b.box('steel',(.505,0,zc),(.01,1.0,.05))
 return b

def stair_bulkhead():
 b=B();unit_box(b,'render');b.box('roof',(0,0,1.0),(1.04,1.04,.05))
 b.box('darkglass',(0,-.505,.42),(.34,.01,.72))  # door
 b.box('steel',(0,.0,1.06),(.28,.28,.08))          # small vent
 return b

def cooling_tower():
 b=B();b.box('louvre',(0,0,1.0),(2.4,2.4,2.0));b.box('steel',(0,0,2.03),(2.44,2.44,.06))
 for dx in(-.6,.6):
  b.tube('steel',(dx,0,2.05),(dx,0,2.45),.5,12);disc(b,'roof',(dx,0),.46,2.46,16)
  for k in range(3):
   a=k*math.pi/3;b.box('silver',(dx,0,2.44),(.9*abs(math.cos(a))+.06,.9*abs(math.sin(a))+.06,.03))
 for x,y in((-1.05,-1.05),(1.05,-1.05),(1.05,1.05),(-1.05,1.05)):b.box('steel',(x,y,.1),(.18,.18,.2))
 return b

def ac_unit():
 b=B();b.box('render',(0,0,.45),(1.1,.5,.85));b.tube('steel',(0,-.26,.5),(0,-.30,.5),.32,16)
 b.box('steel',(0,0,.03),(1.0,.55,.06));b.box('steel',(0,.28,.15),(.9,.03,.06))
 return b

def water_tank():
 b=B()
 for x,y in((-.6,-.6),(.6,-.6),(.6,.6),(-.6,.6)):b.box('steel',(x,y,.3),(.08,.08,.6))
 b.box('steel',(0,0,.6),(1.4,1.4,.05))
 b.tube('tankwhite',(0,0,.62),(0,0,2.0),.85,12)
 b.tube('tankwhite',(0,0,2.0),(0,0,2.18),.85,12,.30);b.tube('silver',(0,0,2.18),(0,0,2.30),.12,10)
 b.tube('silver',(.85,0,1.2),(1.1,0,.3),.04,6);b.tube('silver',(1.1,0,.3),(1.1,0,0),.04,6)
 return b

def antenna():
 b=B();b.box('steel',(0,0,.15),(1.2,1.2,.3))
 b.tube('steel',(0,0,.3),(0,0,8.0),.09,8,.05)
 for zc,w in((3.0,1.2),(5.2,.9),(7.2,.6)):
  b.box('steel',(0,0,zc),(w,.05,.05));b.box('steel',(0,0,zc),(.05,w,.05))
  for sx in(-1,1):b.tube('silver',(sx*w/2,0,zc-.4),(sx*w/2,0,zc+.4),.03,5)
 # Small dish on a side arm and a red beacon.
 b.tube('steel',(0,0,4.2),(.7,0,4.2),.03,5);b.tube('silver',(.7,0,4.2),(.75,0,4.2),.05,12,.55);disc(b,'silver',(.75,0),.55,4.2)
 b.box('redled',(0,0,8.1),(.14,.14,.2))
 return b

def solar_array():
 b=B();tilt=math.radians(18)
 for row in range(3):
  y=-1.0+row*1.0;d=.9;dz=math.sin(tilt)*d;dy=math.cos(tilt)*d
  for col in range(4):
   x=-1.5+col*1.0
   b.face('panel',[(x-.47,y-dy/2,.25),(x+.47,y-dy/2,.25),(x+.47,y+dy/2,.25+dz),(x-.47,y+dy/2,.25+dz)])
   b.box('silver',(x,y,.25+dz/2),(.98,.03,dz+.05))
  for x in(-1.6,1.6):b.tube('steel',(x,y-dy/2,0),(x,y-dy/2,.25),.03,5);b.tube('steel',(x,y+dy/2,0),(x,y+dy/2,.25+dz),.03,5)
 return b

def skylight():
 b=B();b.box('silver',(0,0,.06),(1.0,1.0,.12));unit_box(b,'landmarkglass',.03)
 b.box('silver',(0,0,.5),(.02,1.02,.98));b.box('silver',(0,0,.5),(1.02,.02,.98))
 return b

def crown_screen():
 # Hollow unit ring of louvred metal; per-axis scaling keeps the 2 % wall as a ~0.5 m deep screen.
 b=B();t=.02
 for sx in(-1,1):b.box('louvre',(sx*(.5-t/2),0,.5),(t,1,1))
 for sy in(-1,1):b.box('louvre',(0,sy*(.5-t/2),.5),(1-2*t,t,1))
 for k in range(5):
  zc=.1+k*.2
  for sx in(-1,1):b.box('steel',(sx*.5,0,zc),(.006,1.0,.03))
  for sy in(-1,1):b.box('steel',(0,sy*.5,zc),(1.0,.006,.03))
 return b

def vent_pipe():
 b=B();b.tube('steel',(0,0,0),(0,0,1.2),.12,8);b.tube('steel',(0,0,1.2),(0,0,1.32),.12,8,.30)
 b.tube('steel',(0,0,1.32),(0,0,1.5),.30,8,.0)
 return b

KINDS=[('helipad',lambda:helipad(False)),('helipad-raised',lambda:helipad(True)),('penthouse-render',lambda:penthouse('render')),('penthouse-glass',lambda:penthouse('glass')),
 ('penthouse-metal',lambda:penthouse('metal')),('stair-bulkhead',stair_bulkhead),('cooling-tower',cooling_tower),('ac-unit',ac_unit),('water-tank',water_tank),('antenna',antenna),
 ('solar-array',solar_array),('skylight',skylight),('vent-pipe',vent_pipe),('crown-screen',crown_screen)]
obs=[];stats=[]
for kind,build in KINDS:
 parts=build().finish('prop_'+kind)
 tris=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in parts)
 stats.append({'id':kind,'meshes':len(parts),'triangles':tris,'materials':[ob.data.materials[0].name for ob in parts]})
 obs+=parts
result=export('rooftops/props',obs)
manifest={'version':1,'source':'Original Blender rooftop prop prototypes; artistic typology, not surveyed equipment','file':'props.glb','bytes':result['bytes'],'triangles':result['triangles'],'kinds':stats}
(OUT/'props-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=1)+'\n')
print('ROOFTOP_PROPS',json.dumps(manifest,ensure_ascii=False),flush=True)
