"""Blender-authored exterior city, individual landmark silhouettes, electric car.
Geometry built from local OSM-derived footprints; material facade synthesis is
an artistic estimate, not surveyed facade reconstruction. Blender coordinates
are east, north, up; Babylon loader removes the extra glTF root Y half turn.
"""
import bpy,bmesh,math,json,random
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
from pathlib import Path
from collections import defaultdict
R=Path(__file__).resolve().parents[1];O=R/'public/city';T=O/'textures';A=R/'artifacts/city';A.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
M={}
def material(n,c,rough=.7,metal=0,emit=0,tex=None):
 m=bpy.data.materials.new(n);m.use_nodes=True;p=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) or m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emit
 if tex:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(T/(tex+'.jpg')),check_existing=True);m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  ep=T/(tex+'-emissive.jpg')
  if ep.exists():
   e=m.node_tree.nodes.new('ShaderNodeTexImage');e.image=bpy.data.images.load(str(ep),check_existing=True);m.node_tree.links.new(e.outputs['Color'],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=.65
 M[n]=m;return m
material('office',(1,1,1),.26,.48,tex='office');material('residential',(1,1,1),.68,.08,tex='residential');material('stone',(1,1,1),.64,.05,tex='stone')
material('land',(.8,.8,.8),.96,tex='grass');material('park',(1,1,1),.95,tex='grass');material('water',(.035,.21,.24),.12,.25)
material('asphalt',(1,1,1),.29,.18,tex='road');material('pavement',(1,1,1),.86,tex='paving');material('roadline',(.78,.79,.70),.54);material('yellowline',(.70,.48,.11),.7)
material('concrete',(.57,.61,.59),.7);material('roof',(.22,.27,.28),.68);material('steel',(.28,.35,.38),.27,.8);material('silver',(.63,.69,.70),.22,.78)
material('landmarkglass',(.14,.28,.35),.17,.68);material('darkglass',(.035,.075,.105),.12,.46)
material('gold',(.48,.30,.13),.3,.60);material('civicred',(.41,.055,.028),.58);material('lamp',(1,.67,.30),.25,0,4);material('led',(0.7,.86,1),.16,0,5)
material('redled',(1,.015,.006),.2,0,4);material('carpaint',(.025,.18,.22),.19,.72);material('rubber',(.018,.024,.026),.88);material('leather',(.11,.12,.115),.83)
material('bark',(.20,.17,.11),.98);material('leaf',(.07,.18,.083),.89);material('leaflight',(.14,.27,.105),.86)
for s in ['west','east','bay','center']:material('sign-'+s,(1,1,1),.7,0,.06,tex='sign-'+s)
class B:
 def __init__(self):self.groups=defaultdict(lambda:[[],[],[]]);self.frame=(0,0,0)
 def pt(self,p):
  x,y,z=p;bx,by,a=self.frame;return(x*math.cos(a)-y*math.sin(a)+bx,x*math.sin(a)+y*math.cos(a)+by,z)
 def face(self,m,pts,uv=None):
  v,f,u=self.groups[m];i=len(v);v.extend([self.pt(p) for p in pts]);f.append(tuple(range(i,i+len(pts))))
  if uv is None:uv=[(p[0]/8,p[1]/8) for p in pts]
  u.extend(uv)
 def box(self,m,p,s):
  x,y,z=p;a,b,c=[v/2 for v in s];q=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),(x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
  for ind in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:self.face(m,[q[i] for i in ind])
 def tube(self,m,a,b,r,n=8,r2=None):
  a,b=Vector(a),Vector(b);d=(b-a).normalized();q=Vector((0,0,1)) if abs(d.z)<.9 else Vector((1,0,0));u=d.cross(q).normalized();v=d.cross(u);r2=r if r2 is None else r2
  rings=[[tuple(p+rr*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v)) for i in range(n)] for p,rr in [(a,r),(b,r2)]]
  for i in range(n):self.face(m,[rings[0][i],rings[0][(i+1)%n],rings[1][(i+1)%n],rings[1][i]])
  self.face(m,list(reversed(rings[0])));self.face(m,rings[1])
 def loft(self,m,rings,n=32,power=1):
  pts=[]
  for x,y,z,rx,ry in rings:
   pts.append([(x+math.copysign(abs(math.cos(i*math.tau/n))**power,math.cos(i*math.tau/n))*rx,y+math.copysign(abs(math.sin(i*math.tau/n))**power,math.sin(i*math.tau/n))*ry,z) for i in range(n)])
  for j in range(len(pts)-1):
   for i in range(n):self.face(m,[pts[j][i],pts[j][(i+1)%n],pts[j+1][(i+1)%n],pts[j+1][i]],[(i/n*4,j/2),((i+1)/n*4,j/2),((i+1)/n*4,(j+1)/2),(i/n*4,(j+1)/2)])
  self.face(m,list(reversed(pts[0])));self.face(m,pts[-1]);return pts
 def finish(self,name,smooth=False):
  obs=[]
  for m,(v,f,uv) in self.groups.items():
   mesh=bpy.data.meshes.new(name+'_'+m);mesh.from_pydata(v,[],f);mesh.update();ob=bpy.data.objects.new(name+'_'+m,mesh);bpy.context.collection.objects.link(ob);mesh.materials.append(M[m]);layer=mesh.uv_layers.new()
   for l,u in zip(layer.data,uv):l.uv=u
   if smooth:
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.normal_update();bm.to_mesh(mesh);bm.free()
    for p in mesh.polygons:p.use_smooth=True
   obs.append(ob)
  return obs
 def footprint(self,mat,ring,z,h,scale=1):
  pts=ring[:-1];cx=sum(p[0] for p in pts)/len(pts);cy=sum(p[1] for p in pts)/len(pts);pts=[(cx+(x-cx)*scale,cy+(y-cy)*scale) for x,y in pts]
  for i,(x,y) in enumerate(pts):
   xx,yy=pts[(i+1)%len(pts)];w=math.hypot(xx-x,yy-y);self.face(mat,[(x,y,z),(xx,yy,z),(xx,yy,h),(x,y,h)],[(0,z/24),(w/24,z/24),(w/24,h/24),(0,h/24)])
  for tri in tessellate_polygon([[Vector((x,y,h)) for x,y in pts]]):self.face('roof',[(pts[v][0],pts[v][1],h) if isinstance(v,int) else tuple(v) for v in tri])
def export(name,obs):
 bpy.ops.object.select_all(action='DESELECT')
 for ob in obs:ob.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
 bpy.ops.export_scene.gltf(filepath=str(O/(name+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
 return {'file':name+'.glb','bytes':(O/(name+'.glb')).stat().st_size,'triangles':sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in obs),'meshes':len(obs)}
