"""Prepare a runtime coupe from Khronos CarConcept (CC BY 4.0).
No files outside artifacts/city/vehicle-candidate are modified.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector, Matrix
R=Path(__file__).resolve().parents[1]; A=R/'artifacts/city/vehicle-candidate'; A.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(A/'source/CarConcept.glb'))
source_meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
# Remove imported default-material/variant bookkeeping before assigning our
# own paint; otherwise Blender silently restores Carmine at export time.
for obj in source_meshes:
 for key in ('gltf2_variant_mesh_data','gltf2_variant_default_materials'):
  if hasattr(obj.data,key):getattr(obj.data,key).clear()
source_triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in source_meshes)
wheel_roots={}; wheel_members={}; source_wheel_centres={}
for key,name in [('lf','WheelFrontL'),('rf','WheelFrontR'),('lr','WheelRearL'),('rr','WheelRearR')]:
 root=bpy.data.objects[name]; centre=root.matrix_world.translation.copy();source_wheel_centres[key]=list(centre)
 # Original source applies showroom steering and different wheel spins. Undo
 # those poses while retaining the source's Z-up mesh conversion.
 root.matrix_world=Matrix.Translation(centre)@Matrix.Rotation(-math.pi/2,4,'X')
 wheel_roots[key]=root
 for child in root.children_recursive:
  if child.type=='MESH':wheel_members[child.name]=key
bpy.context.view_layer.update()
# Flatten original hierarchy and fix front (+Y Blender, +Z after game root).
for o in source_meshes:
 world=o.matrix_world.copy();o.parent=None;o.matrix_world=world
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.select_set(False)
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
raw_points=[v.co for o in source_meshes for v in o.data.vertices]
bmin=Vector([min(p[a] for p in raw_points) for a in range(3)]);bmax=Vector([max(p[a] for p in raw_points) for a in range(3)])
# Preserve round wheels in longitudinal/elevation plane; moderate width change
# turns the very wide source concept into a 1.96m-body city GT.
length=5.0; sy=length/(bmax.y-bmin.y); sx=1.963/(2*1.118); sz=sy
centre_y=(bmax.y+bmin.y)/2; ground=bmin.z
xf=Matrix.Diagonal(Vector((-sx,-sy,sz,1)));xf.translation=Vector((0,centre_y*sy,-ground*sz))
# Coordinate reversal swaps the source L/R labels; derive from actual X.
centres={}
for old,c in source_wheel_centres.items():
 p=xf@Vector(c); k=('l' if p.x<0 else 'r')+('f' if p.y>0 else 'r');centres[k]=list(p)
for o in source_meshes:o.data.transform(xf)
# The source rear-left rotor sits 9 cm outside its own caliper plane. Align
# only axle offsets over 1.5 cm, without moving tyres or their pivots.
brake_corrections=[]
for oldwheel in wheel_roots:
 parts=[o for o in source_meshes if wheel_members.get(o.name)==oldwheel]
 disc=next((o for o in parts if 'BrakeDisc' in o.name),None);pad=next((o for o in parts if 'BrakePad' in o.name),None)
 if disc and pad:
  cx=lambda o:(min(v.co.x for v in o.data.vertices)+max(v.co.x for v in o.data.vertices))/2
  dx=cx(pad)-cx(disc)
  if abs(dx)>.015:
   for v in disc.data.vertices:v.co.x+=dx
   brake_corrections.append({'sourceWheel':oldwheel,'mesh':disc.name,'translationX':dx})

# All materials shared. Opaque tinted glass is deliberate: no transmission
# pass or transparent order problems in the browser city.
def mat(name,color,rough=.4,metal=.0,emit=0,coat=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal;n.inputs['Coat Weight'].default_value=coat;n.inputs['Coat Roughness'].default_value=.10;n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=emit;m.use_backface_culling=True;return m
M={
 'paint':mat('carpaint',(.035,.095,.32),.27,.45,coat=1),
 'trim':mat('car_trim',(.032,.039,.052),.37,.25),
 'glass':mat('car_glass',(.075,.14,.20),.10,.50,coat=.5),
 'leather':mat('car_leather',(.29,.20,.12),.68,.02),
 'chrome':mat('car_chrome',(.58,.64,.70),.23,.85),
 'led':mat('led',(.70,.85,1),.24,0,4),
 'redled':mat('redled',(1,.009,.008),.24,0,3),
 'amberled':mat('amberled',(1,.25,.025),.32,0,.35),
 'caliper':mat('car_caliper',(.66,.24,.035),.34,.4),
 'rubber':mat('wheel_rubber',(.022,.027,.033),.79,.02),
 'alloy':mat('wheel_alloy',(.61,.65,.70),.23,.87),
 'darkalloy':mat('wheel_darkalloy',(.075,.092,.115),.30,.70),
}
# Transfer source tire normal only: CC-BY texture created from CC0 tread art.
neutral_uv=(.5,.5)
normal_source=next((m for m in bpy.data.materials if m.name=='Tiretread'),None)
if normal_source:
 normal_node=next((n for n in normal_source.node_tree.nodes if n.type=='NORMAL_MAP'),None)
 tex=normal_node.inputs['Color'].links[0].from_node.image if normal_node and normal_node.inputs['Color'].is_linked else None
 if tex:
  if max(tex.size)>1024:tex.scale(max(1,int(tex.size[0]*1024/max(tex.size))),max(1,int(tex.size[1]*1024/max(tex.size))))
  tex.colorspace_settings.name='Non-Color'
  pixels=list(tex.pixels);pixel=min(range(tex.size[0]*tex.size[1]),key=lambda i:(pixels[i*4]-.5)**2+(pixels[i*4+1]-.5)**2+(pixels[i*4+2]-1)**2);neutral_uv=((pixel%tex.size[0]+.5)/tex.size[0],(pixel//tex.size[0]+.5)/tex.size[1])
  nodes=M['rubber'].node_tree.nodes;links=M['rubber'].node_tree.links;p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');t=nodes.new('ShaderNodeTexImage');t.image=tex;n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.40;links.new(t.outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],p.inputs['Normal'])

omit=('BodyWindshieldWipers','Engine','InteriorPedal','InteriorFloormats','BodyHoodInterior','InteriorRearHatch','InteriorSeatsFrame','InteriorDoor','InteriorSteeringHandle','InteriorSteeringEmblem','InteriorSteeringBase','InteriorSteeringCylinder','Axles')
groups={};removed=[]
for o in source_meshes:
 name=o.name
 if any(name.startswith(p) for p in omit):removed.append(name);bpy.data.objects.remove(o,do_unlink=True);continue
 oldwheel=wheel_members.get(name)
 if oldwheel:
  wc=xf@Vector(source_wheel_centres[oldwheel]);wheelkey=('l' if wc.x<0 else 'r')+('f' if wc.y>0 else 'r')
 else:wheelkey=None
 original_materials=[m.name for m in o.data.materials]
 # Reuse one normal map without projecting tread bumps onto sidewalls.
 if wheelkey and o.data.uv_layers:
  uv=o.data.uv_layers.active.data
  for p in o.data.polygons:
   old=original_materials[p.material_index]
   if old=='Tireside':
    for li in p.loop_indices:uv[li].uv=neutral_uv
   elif old=='Tiretread':
    for li in p.loop_indices:uv[li].uv.y=uv[li].uv.y*4+.5
 mapped=[]
 for old in original_materials:
  if old.startswith('Paint 1'):key='paint'
  elif old.startswith('Paint 2'):key='paint' if name in ('BodyRoofPanel','BodyHoodTopgrill') else 'trim'
  elif old=='Glass':key='glass'
  elif old=='Headlight':key='led'
  elif old=='Brakelight':key='redled'
  elif old=='Signallight':key='amberled'
  elif old=='Brake':key='caliper'
  elif old in ('Tireside','Tiretread'):key='rubber'
  elif old=='Rim1':key='alloy'
  elif old in ('Rim2','Disc'):key='darkalloy'
  elif old in ('Mirror','Hardware'):key='chrome'
  elif old.startswith('Interior'):key='leather'
  else:key='trim'
  mapped.append(key)
 # Bake source object splits into material groups, preserving UVs and normals.
 for i,key in enumerate(mapped):o.data.materials[i]=M[key]
 triangles=sum(len(p.vertices)-2 for p in o.data.polygons)
 ratio=.35 if 'Rim' in name else .22 if 'BrakePad' in name else .38 if name.startswith('Interior') else .48 if triangles>4500 else .72 if triangles>1000 else 1
 if ratio<1:
  bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Runtime silhouette budget','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
 parts=[p for p in bpy.context.selected_objects if p.type=='MESH']
 for part in parts:
  # After separate, material slots can retain unused entries; active polygons
  # tell us the actual group.
  m=part.data.materials[part.data.polygons[0].material_index];key=next(k for k,v in M.items() if v==m)
  # Disc + caliper remain stationary while tires and rims animate.
  prefix='wheel_'+wheelkey if wheelkey and key in ('rubber','alloy','darkalloy') and 'BrakeDisc' not in name else 'brake_'+wheelkey if wheelkey and wheelkey.endswith('f') and ('BrakeDisc' in name or 'BrakePad' in name) else 'car'
  groups.setdefault((prefix,key),[]).append(part)
 bpy.ops.object.select_all(action='DESELECT')

output=[]
for (prefix,key),parts in groups.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0]
 if len(parts)>1:bpy.ops.object.join()
 o=bpy.context.object;o.name=prefix+'_'+key;o.data.name=o.name;group_mat=M[key];o.data.materials.clear();o.data.materials.append(group_mat)
 for p in o.data.polygons:p.material_index=0
 # Runtime currently rotates meshes about supplied metadata centres; keep
 # geometry in car-local space, all mesh transforms identity.
 o.location=(0,0,0);o.rotation_euler=(0,0,0);o.rotation_quaternion=(1,0,0,0);o.scale=(1,1,1);output.append(o)

# Remove unused original textures/materials; remove Khronos/Commerce logos by
# not carrying the original decal/dash/licence maps into the derivative.
for image in list(bpy.data.images):
 if image.users==0:bpy.data.images.remove(image)
for image in bpy.data.images:
 if image.source!='GENERATED':image.pack()
allpts=[v.co for o in output for v in o.data.vertices]
mins=[min(p[a] for p in allpts) for a in range(3)];maxs=[max(p[a] for p in allpts) for a in range(3)]
for o in output:o.select_set(True)
bpy.context.view_layer.objects.active=output[0]
glb=A/'indigo-gt.glb';bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_materials='EXPORT')
report={'source':'Khronos glTF-Sample-Assets CarConcept','sourceTriangles':source_triangles,'sourceStraightenedBounds':{'min':list(bmin),'max':list(bmax)},'sourceWheelCentresBlender':source_wheel_centres,'modifiedBoundsBlender':{'min':mins,'max':maxs,'size':[maxs[i]-mins[i] for i in range(3)]},'scale':{'x':sx,'y':sy,'z':sz},'wheelCentresBlender':centres,'wheelCentresGltf':{k:[v[0],v[2],-v[1]] for k,v in centres.items()},'wheelRadius':.3838*sz,'brakeCorrections':brake_corrections,'steeringBrakeMeshes':{k:['brake_'+k+'_caliper','brake_'+k+'_darkalloy'] for k in ['lf','rf']},'front':'Blender +Y / GLTF -Z / game after existing root reflection +Z','triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in output),'meshes':len(output),'materials':sorted({m.name for o in output for m in o.data.materials}),'lights':{'head':'led','tail':'redled','indicator':'amberled'},'textures':[{'name':n.image.name,'size':list(n.image.size)} for m in M.values() for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image],'removedObjects':removed,'glbBytes':glb.stat().st_size,'sha256':hashlib.sha256(glb.read_bytes()).hexdigest()}
(A/'vehicle-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,indent=2),flush=True)
assert report['triangles']<=85000,report['triangles'];assert report['meshes']<28,report['meshes'];assert report['glbBytes']<=8*1024*1024
# Editable production asset saved before studio scene; no rendering rig exports.
bpy.ops.wm.save_as_mainfile(filepath=str(A/'indigo-gt.blend'))
# Low-cost CPU studio review to verify actual authored mesh, not concept art.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.world=bpy.data.worlds.new('review_world');scene.world.color=(.18,.18,.18)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015));floor=bpy.context.object;floor.data.materials.append(mat('review_floor',(.065,.075,.085),.44,.05))
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,pos,power,color,size in [('key',(3,2,6),1500,(1,.68,.43),5),('rim',(-3,-1,4),1800,(.48,.65,1),4),('top',(0,-3,6),1100,(1,.90,.78),3)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.name='review_'+name;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,.5))
bpy.ops.object.camera_add(location=(6.5,7.5,3.8));camera=bpy.context.object;camera.data.lens=54;aim(camera,(0,0,.63));scene.camera=camera
scene.render.filepath=str(A/'indigo-gt-front.png');bpy.ops.render.render(write_still=True)
camera.location=(-6.0,-7.5,3.5);aim(camera,(0,0,.60));scene.render.filepath=str(A/'indigo-gt-rear.png');bpy.ops.render.render(write_still=True)
