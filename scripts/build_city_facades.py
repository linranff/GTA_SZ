"""Exterior facade pass with per-building colors and actual relief.
Footprints/heights remain the OSM-derived artistic city data. No interiors.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from city_mesh import *
city=json.loads((O/'city.json').read_text());excluded=set(json.loads((O/'landmark-detail.json').read_text()).get('baseBuildingIds',[])) if (O/'landmark-detail.json').exists() else set()
class FacadeMesh(B):
 def __init__(self):super().__init__();self.tint=(1,1,1,1);self.colors=defaultdict(list)
 def face(self,m,pts,uv=None):super().face(m,pts,uv);self.colors[m].extend([self.tint]*len(pts))
 def finish(self,name,smooth=False):
  obs=super().finish(name,False)
  for ob in obs:
   mat=ob.data.materials[0].name;attr=ob.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
   for v,col in zip(attr.data,self.colors[mat]):v.color=col
  return obs
# Explicit material graph makes vertex colors part of the exported glTF.
for m in M.values():
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');old=p.inputs['Base Color'];links=list(old.links);source=links[0].from_socket if links else None
 mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
 if source:m.node_tree.links.new(source,mix.inputs[1])
 else:mix.inputs[1].default_value=old.default_value
 col=m.node_tree.nodes.new('ShaderNodeVertexColor');col.layer_name='Color';m.node_tree.links.new(col.outputs['Color'],mix.inputs[2]);m.node_tree.links.new(mix.outputs[0],old)
palettes={'office':[(.69,.84,1,1),(.55,.78,.79,1),(.91,.91,.86,1),(.83,.71,.63,1)],'residential':[(.97,.90,.74,1),(.77,.83,.83,1),(.94,.80,.72,1),(.88,.92,.92,1)],'stone':[(1,.9,.78,1),(.84,.88,.95,1),(.93,.76,.67,1)]}
chunks={};details={};detail_count=0
for row in city['buildings']:
 if row.get('id') in excluded:continue
 ring=row['rings'][0];cx=sum(p[0] for p in ring[:-1])/len(ring[:-1]);cy=sum(p[1] for p in ring[:-1])/len(ring[:-1]);key=(math.floor(cx/640),math.floor(cy/640));b=chunks.setdefault(key,FacadeMesh());h=row['height'];typ=row['style'];rnd=random.Random(row['seed']);b.tint=rnd.choice(palettes[typ]);baseTint=b.tint
 # Split the wall vertically: overlapping a scaled glass shell and the main
 # facade caused depth fighting, especially on concave and narrow footprints.
 shop_top=min(3.5,h*.25)
 b.footprint(typ,ring,shop_top,h);b.footprint('concrete' if typ=='residential' else 'steel',ring,h,h+.40,1.015);b.footprint(typ,ring,h+.4,h+max(1.2,h*.035),.76)
 b.footprint('darkglass',ring,0,shop_top)
 if h>25:b.box('roof',(cx,cy,h+max(2,h*.04)),(max(1.4,math.sqrt(h)*.7),2.5,1.1))
 if typ=='residential' and h<65:
  for z in range(6,int(h),4):b.footprint('concrete',ring,z,z+.16,1.018)
 b=details.setdefault(key,FacadeMesh());b.tint=baseTint
 area=sum(a[0]*c[1]-c[0]*a[1] for a,c in zip(ring,ring[1:]));orientation=1 if area>0 else -1
 for a,c in zip(ring,ring[1:]):
  dx,dy=c[0]-a[0],c[1]-a[1];length=math.hypot(dx,dy)
  if length<7:continue
  tx,ty=dx/length,dy/length;nx,ny=ty*orientation,-tx*orientation
  def pt(u,dep,z):return(a[0]+tx*u+nx*dep,a[1]+ty*u+ny*dep,z)
  # Street canopy with upper lip and shallow, naturally shaded shopfront.
  if length<50 and h>8:
   b.tint=(.8,.84,.86,1);u0,u1=.6,length-.6
   b.face('steel',[pt(u0,.05,3.2),pt(u1,.05,3.2),pt(u1,.85,3.2),pt(u0,.85,3.2)])
   b.face('silver',[pt(u0,.85,3.15),pt(u1,.85,3.15),pt(u1,.85,3.25),pt(u0,.85,3.25)])
   for u in range(2,int(length)-1,4):b.tube('silver',pt(u,.1,.15),pt(u,.1,3.1),.055,5)
  if typ=='office' and h>40 and length<80:
   b.tint=(.82,.9,.98,1)
   for u in range(2,int(length)-1,4):
    p0,p1,p2,p3=pt(u-.055,.1,3.3),pt(u+.055,.1,3.3),pt(u+.055,.1,h),pt(u-.055,.1,h)
    b.face('silver',[p0,p1,p2,p3]);b.face('steel',[pt(u,.1,3.3),pt(u,.40,3.3),pt(u,.40,h),pt(u,.1,h)])
  # Residential balcony slabs, recessed dark glazing and metal guard rails.
  if typ=='residential' and 10<h<55 and length<38 and rnd.random()<.22:
   detail_count+=1
   for z in range(5,min(17,int(h)-1),3):
    for u in range(2,int(length)-2,7):
     b.tint=baseTint;b.face('concrete',[pt(u-1.25,.05,z),pt(u+1.25,.05,z),pt(u+1.25,.72,z),pt(u-1.25,.72,z)])
     b.tint=(.65,.71,.76,1);b.face('steel',[pt(u-1.25,.72,z),pt(u+1.25,.72,z),pt(u+1.25,.72,z+.58),pt(u-1.25,.72,z+.58)])
     b.face('silver',[pt(u-1.25,.71,z+.58),pt(u+1.25,.71,z+.58),pt(u+1.25,.75,z+.64),pt(u-1.25,.75,z+.64)])
     for off in [-1.25,1.25]:b.face('silver',[pt(u+off-.015,.72,z),pt(u+off+.015,.72,z),pt(u+off+.015,.72,z+.61),pt(u+off-.015,.72,z+.61)])
  b.tint=baseTint
obs=[]
for key,b in chunks.items():obs+=b.finish(f'block_{key[0]}_{key[1]}')
result=export('buildings',obs);detailobs=[]
for key,b in details.items():detailobs+=b.finish(f'facade_{key[0]}_{key[1]}')
result['nearDetails']=export('facades',detailobs);result['balconyFacades']=detail_count
bpy.ops.wm.save_as_mainfile(filepath=str(A/'city-facade-art.blend'))
(O/'facade-manifest.json').write_text(json.dumps(result,indent=2));print('FACADE',json.dumps(result),flush=True)
