import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from city_mesh import *
surf=json.loads((O/'ground-surfaces.json').read_text());city=json.loads((O/'city.json').read_text());s=B()
for key,triangles in surf.items():
 for tri in triangles:
  if (tri[1][0]-tri[0][0])*(tri[2][1]-tri[0][1])-(tri[1][1]-tri[0][1])*(tri[2][0]-tri[0][0])<0:tri=list(reversed(tri))
  mat='water' if key=='sea' else key;z=-.25 if key=='sea' else .035 if key=='water' else 0
  s.face(mat,[(x,y,z) for x,y in tri])
for line in city['coast']:
 for a,c in zip(line,line[1:]):
  d=math.dist(a,c)
  if d<.1:continue
  dx=(c[0]-a[0])/d;dy=(c[1]-a[1])/d
  s.face('pavement',[(a[0],a[1],.08),(c[0],c[1],.08),(c[0]-dy*4,c[1]+dx*4,.08),(a[0]-dy*4,a[1]+dx*4,.08)])
  s.tube('concrete',(a[0],a[1],.27),(c[0],c[1],.27),.18,6)
report=export('terrain',s.finish('terrain'));(O/'terrain-manifest.json').write_text(json.dumps(report,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(A/'coast-and-ground.blend'));print(report,flush=True)
