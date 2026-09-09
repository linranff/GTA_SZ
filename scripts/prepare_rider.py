"""Prepare the user-provided Tripo turnaround as one delivery rider.
Run: Blender --background --factory-startup --python scripts/prepare_rider.py
The original is never modified. Blender -Y front becomes glTF +Z front.
"""
from pathlib import Path
import bpy, bmesh, hashlib, json, math, sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from character_gait import bake_gait, bake_rider_idle, reset, gait_metadata
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/city/rider';ART=ROOT/'artifacts/city/rider';REVIEW=ROOT/'output/rider'
for p in (OUT,ART,REVIEW):p.mkdir(parents=True,exist_ok=True)
SOURCE=Path('/Users/fenglinran/Downloads/high-visibility jacket 3d model.glb')
HEIGHT=1.78
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if len(meshes)!=1:raise RuntimeError('Source topology changed; review turnaround selection')
ob=meshes[0];source_triangles=sum(len(p.vertices)-2 for p in ob.data.polygons)
bm=bmesh.new();bm.from_mesh(ob.data)
if any(-.167<v.co.x<-.157 for v in bm.verts):raise RuntimeError('Selection seam intersects geometry')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.x>=-.16],context='VERTS')
bm.to_mesh(ob.data);bm.free();ob.data.update()
lo=Vector(tuple(min(v.co[i] for v in ob.data.vertices) for i in range(3)));hi=Vector(tuple(max(v.co[i] for v in ob.data.vertices) for i in range(3)))
center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));scale=HEIGHT/(hi.z-lo.z)
for v in ob.data.vertices:v.co=(v.co-center)*scale
ob.name='delivery_rider_body'
bpy.context.view_layer.objects.active=ob
bpy.ops.object.select_all(action='DESELECT');ob.select_set(True)
mod=ob.modifiers.new('Game silhouette 60k','DECIMATE');mod.ratio=min(1,60000/len(ob.data.polygons));mod.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=mod.name)
for p in ob.data.polygons:p.use_smooth=True
for mat in ob.data.materials:
 mat.name='rider_yellow_weatherproof_jacket'
 for node in mat.node_tree.nodes:
  if node.type=='TEX_IMAGE' and node.image:node.image.pack()
# A compact anatomical rig. Spatial blends are deterministic, preserve the
# supplied UV/texture surface and avoid fragile automatic heat weights on a
# dense scan with closed cuffs and touching cloth.
arm_data=bpy.data.armatures.new('delivery_rider_skeleton');rig=bpy.data.objects.new('delivery_rider_rig',arm_data);bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);ob.select_set(False);bpy.ops.object.mode_set(mode='EDIT')
bones={
 'pelvis':((0,0,.83),(0,0,.97),None),
 'spine':((0,0,.97),(0,0,1.12),'pelvis'),
 'chest':((0,0,1.12),(0,0,1.34),'spine'),
 'neck':((0,0,1.34),(0,0,1.45),'chest'),
 'head':((0,0,1.45),(0,0,1.67),'neck'),
}
for side,sgn in [('L',1),('R',-1)]:
 bones.update({
  f'upper_arm_{side}':((sgn*.195,0,1.315),(sgn*.285,0,1.115),'chest'),
  f'forearm_{side}':((sgn*.285,0,1.115),(sgn*.365,0,.925),f'upper_arm_{side}'),
  f'hand_{side}':((sgn*.365,0,.925),(sgn*.39,0,.735),f'forearm_{side}'),
  f'thigh_{side}':((sgn*.115,0,.85),(sgn*.13,0,.46),'pelvis'),
  f'calf_{side}':((sgn*.13,0,.46),(sgn*.145,0,.11),f'thigh_{side}'),
  f'foot_{side}':((sgn*.145,0,.11),(sgn*.145,-.14,.035),f'calf_{side}'),
 })
for name,(head,tail,parent) in bones.items():
 b=arm_data.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for name in bones:ob.vertex_groups.new(name=name)
def smooth(a,b,v):
 t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
def blend(a,b,t):
 out={k:v*(1-t) for k,v in a.items()}
 for k,v in b.items():out[k]=out.get(k,0)+v*t
 return out
for v in ob.data.vertices:
 x,y,z=v.co;side='L' if x>=0 else 'R';ax=abs(x)
 if z<.91:
  w=blend({f'foot_{side}':1},{f'calf_{side}':1},smooth(.09,.19,z))
  w=blend(w,{f'thigh_{side}':1},smooth(.39,.54,z))
  w=blend(w,{'pelvis':1},smooth(.80,.92,z))
 else:
  w=blend({'pelvis':1},{'spine':1},smooth(.93,1.08,z))
  w=blend(w,{'chest':1},smooth(1.08,1.24,z))
  w=blend(w,{'neck':1},smooth(1.32,1.43,z))
  w=blend(w,{'head':1},smooth(1.40,1.49,z))
 # Hands reach below waist; assign them before leg selection finalization.
 if .62<z<1.37:
  arm=blend({f'hand_{side}':1},{f'forearm_{side}':1},smooth(.89,.97,z))
  arm=blend(arm,{f'upper_arm_{side}':1},smooth(1.06,1.17,z))
  threshold=.18+min(.05,max(0,1.27-z)*.20)
  amount=smooth(threshold,threshold+.03,ax)*(1-smooth(1.32,1.39,z))
  w=blend(w,arm,amount)
 # Keep at most four influences, matching efficient glTF skinning.
 items=sorted(((k,v)for k,v in w.items()if v>.0001),key=lambda item:-item[1])[:4];total=sum(v for k,v in items)
 for name,weight in items:ob.vertex_groups[name].add([v.index],weight/total,'REPLACE')
modifier=ob.modifiers.new('Delivery rider skeletal deformation','ARMATURE');modifier.object=rig
ob.parent=rig
scene=bpy.context.scene;scene.render.fps=30
rig.animation_data_create()
actions=[bake_rider_idle(rig),bake_gait(rig,ob,'Rider_Walk','walk'),bake_gait(rig,ob,'Rider_Run','run')]
clips=[{'name':a.name,'frames':int(a.frame_range.y),'seconds':a.frame_range.y/30} for a in actions]
rig.animation_data.action=None
reset(rig)
scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
# Blender 5 action mode exports the three independent armature actions.
path=OUT/'rider.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,
 export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_skins=True,export_all_influences=False,
 export_cameras=False,export_lights=False,export_materials='EXPORT',export_extras=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'rider.blend'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
manifest={'schemaVersion':1,'file':'rider.glb','sourceFile':SOURCE.name,'sourceSha256':sha(SOURCE),'sourceBytes':SOURCE.stat().st_size,
 'derivation':'Complete left front-facing figure with its own back retained. Side-view and reversed duplicate removed. Silhouette reduction, deterministic 17-bone soft weights, in-place Idle/Walk/Run skeletal animation.',
 'license':'User-supplied Tripo asset; no independent external licence assertion.','height':HEIGHT,'units':'metres',
 'forward':'glTF +Z; Blender -Y','floor':0,'triangles':sum(len(p.vertices)-2 for p in ob.data.polygons),'bones':len(bones),
 'sourceTriangles':source_triangles,'animations':clips,'gait':{key:gait_metadata(key) for key in ['walk','run']},'bytes':path.stat().st_size,'sha256':sha(path),
 'limitations':'Simple scan-derived rig: no fingers, facial blend shapes, runtime terrain foot IK or cloth simulation. Helmet ears included in total 1.78m display height.',
 'selection':{'BlenderXLessThan':-.16},'preview':'output/rider/rider-contact-sheet.png'}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
# Named front/back and moving limb poses give reviewable geometry evidence.
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=600;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.24,.29,.36,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
for pos,energy in [((-2,-3,4),450),((3,-1,2),250),((0,3,3),380)]:
 d=bpy.data.lights.new('Rider review light','AREA');d.energy=energy;d.size=3;o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.9))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Rider review camera');cam=bpy.data.objects.new(d.name,d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.ortho_scale=2.0
for name,action,frame,pos in [('front','Idle',0,(0,-4,.9)),('back','Idle',0,(0,4,.9)),('walk','Walk',24,(4,-1,1)),('run','Run',15,(4,-1,1))]:
 rig.animation_data.action=bpy.data.actions['Rider_'+action];scene.frame_set(frame)
 cam.location=pos;cam.rotation_euler=(Vector((0,0,.87))-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(REVIEW/('rider-'+name+'.png'));bpy.ops.render.render(write_still=True)
print('RIDER_RESULT '+json.dumps(manifest))
