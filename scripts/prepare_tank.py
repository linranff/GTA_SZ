"""Prepare the user's Tripo tank turnaround as one articulated game vehicle.
Run: Blender --background --factory-startup --python scripts/prepare_tank.py
Then: node scripts/optimize_tank.mjs
Only the tank asset, manifest, editable mesh and local previews are written.
"""
from pathlib import Path
import bpy, bmesh, hashlib, json, math
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('/Users/fenglinran/Downloads/military tank 3d model.glb')
OUT=ROOT/'public/city/tank'; ART=ROOT/'artifacts/city/tank'; REVIEW=ROOT/'output/assets/tank'
for p in (OUT,ART,REVIEW):p.mkdir(parents=True,exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def empty(name,parent=None,location=(0,0,0)):
 ob=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(ob);ob.parent=parent;ob.location=location;return ob
def mat(name,color,metal=.35,rough=.45):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
def cylinder(name,radius,depth,location,material,parent,rotation=(0,0,0),vertices=40):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=location,rotation=rotation)
 ob=bpy.context.object;ob.name=name;ob.data.materials.append(material)
 for p in ob.data.polygons:p.use_smooth=True
 bevel=ob.modifiers.new('Machined edges','BEVEL');bevel.width=.015;bevel.segments=2;bpy.ops.object.modifier_apply(modifier=bevel.name)
 ob.parent=parent;ob.location=location;return ob

def trim(ob,plane,normal,inside=False,outside=False):
 bm=bmesh.new();bm.from_mesh(ob.data)
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.0000001,plane_co=plane,plane_no=normal,clear_inner=inside,clear_outer=outside)
 bm.to_mesh(ob.data);bm.free();ob.data.update()

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
source=next(o for o in bpy.context.scene.objects if o.type=='MESH')
source_triangles=sum(len(p.vertices)-2 for p in source.data.polygons)
# The middle side-on tank has a complete back, six detailed wheels per side and
# better length proportions. The two outside vehicles are duplicate turnarounds.
# Its long cannon crosses the left extraction boundary: replace the cannon with
# an articulated barrel, rather than retaining fragments of the adjacent tank.
trim(source,(-.235,0,0),(1,0,0),inside=True)
trim(source,(.249,0,0),(1,0,0),outside=True)
bm=bmesh.new();bm.from_mesh(source.data)
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.x<-.054 and v.co.z>.126],context='VERTS')
bm.to_mesh(source.data);bm.free();source.data.update()
# Separate at the turret bearing. A matching bearing masks the cut at yaw.
turret=source.copy();turret.data=source.data.copy();bpy.context.scene.collection.objects.link(turret)
trim(source,(0,0,.129),(0,0,1),outside=True)
trim(turret,(0,0,.129),(0,0,1),inside=True)
scale=6.8/(.2414550930261612+.2120666354894638)
center_x=(.2414550930261612-.2120666354894638)/2
root=empty('tank_root');hull=source;hull.name='tank_hull';hull.parent=root
pivot_z=.129*scale; pivot_y=(.075-center_x)*scale
pivot=empty('tank_turret',root,(0,pivot_y,pivot_z))
turret.name='tank_turret_armor';turret.parent=pivot
for ob,budget in [(hull,85000),(turret,35000)]:
 for v in ob.data.vertices:
  old=v.co.copy();v.co=Vector((-old.y*scale*.87,(old.x-center_x)*scale,old.z*scale))
  if ob==turret:v.co-=pivot.location
 bpy.context.view_layer.objects.active=ob;ob.select_set(True)
 tris=sum(len(p.vertices)-2 for p in ob.data.polygons)
 mod=ob.modifiers.new('Game mesh silhouette budget','DECIMATE');mod.ratio=min(1,budget/tris);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 for p in ob.data.polygons:p.use_smooth=True
 ob.select_set(False)
for m in hull.data.materials:
 m.name='tank_original_olive_pbr'
 for node in m.node_tree.nodes:
  if node.type=='TEX_IMAGE' and node.image:node.image.pack()
olive=mat('tank_gun_olive',(.21,.235,.155),.48,.38)
dark=mat('tank_dark_steel',(.045,.055,.04),.72,.34)
cylinder('tank_turret_bearing',1.30,.15,(0,pivot_y,pivot_z-.045),dark,root)
# Export maps Blender -Y to glTF +Z. Barrel local +Z in glTF is the bore axis.
barrel_base_world=Vector((0,-.98,2.23))
barrel=empty('tank_barrel',pivot,barrel_base_world-pivot.location)
cylinder('tank_mantlet',.255,.58,(0,-.05,0),olive,barrel,(math.pi/2,0,0),48)
cylinder('tank_barrel_sleeve',.17,1.18,(0,-.78,0),olive,barrel,(math.pi/2,0,0),48)
cylinder('tank_barrel_tube',.105,2.68,(0,-2.56,0),olive,barrel,(math.pi/2,0,0),48)
# Open muzzle lip, darker recessed bore instead of a solid capped cylinder.
bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=10,location=(0,-3.90,0),rotation=(math.pi/2,0,0),major_radius=.112,minor_radius=.026)
lip=bpy.context.object;lip.name='tank_muzzle_lip';lip.data.materials.append(olive);lip.parent=barrel;lip.location=(0,-3.90,0)
cylinder('tank_muzzle_bore',.092,.014,(0,-3.86,0),dark,barrel,(math.pi/2,0,0),48)
muzzle=empty('tank_muzzle',barrel,(0,-3.96,0))
root['forward_glb']='+Z';root['up_glb']='+Y';root['ground_glb_y']=0
pivot['axis_glb']='Y';barrel['axis_glb']='X';muzzle['forward_glb']='+Z'
bpy.context.view_layer.update()
asset_meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
verts=[o.matrix_world@Vector(corner) for o in asset_meshes for corner in o.bound_box]
lo=[min(v[a] for v in verts) for a in range(3)];hi=[max(v[a] for v in verts) for a in range(3)]
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in asset_meshes)
bpy.ops.object.select_all(action='DESELECT')
for o in [root,pivot,barrel,muzzle,*asset_meshes]:o.select_set(True)
path=OUT/'tank.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_materials='EXPORT',export_extras=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'tank.blend'))
manifest={'schemaVersion':1,'file':'tank.glb','provenance':{'providedBy':'User','sourceFile':SOURCE.name,'sourceSha256':sha(SOURCE),'sourceBytes':SOURCE.stat().st_size,'generator':'Tripo','selection':'Complete middle tank; outside front/back turnaround duplicates removed. Original short/intersecting barrel replaced by an articulated game barrel.','license':'User-provided asset; no external license claim verified.'},'coordinates':{'space':'glTF Y-up','forward':'+Z','up':'+Y','ground':0,'bodyLength':6.8,'dimensions':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]],'babylonImport':'Keep default glTF conversion root: rotation Y pi and scaling Z -1. Model forward then remains game +Z; X is mirrored.'},'nodes':{'root':'tank_root','hull':'tank_hull','turret':'tank_turret','barrel':'tank_barrel','muzzle':'tank_muzzle'},'pivots':{'turretLocal':[0,pivot_z,-pivot_y],'barrelLocal':[0,2.23-pivot_z,.98+pivot_y],'muzzleLocal':[0,0,3.96],'muzzleRestRoot':[0,2.23,4.94],'turretRotationAxis':'Y','barrelRotationAxis':'X'},'limits':{'barrelPitchDegrees':[-8,24]},'assetStats':{'triangles':tris,'meshes':len(asset_meshes),'sourceTriangles':source_triangles,'bytes':path.stat().st_size,'sha256':sha(path)},'limitations':['No tracked suspension simulation or moving track links are authored; runtime may animate whole-vehicle suspension.','The source is a stylized tank generated from a turnaround; this is a game adaptation, not a surveyed real tank replica.'],'previews':['output/assets/tank/three-quarter.png','output/assets/tank/rear.png','output/assets/tank/turret-turned.png'],'processor':{'file':'scripts/prepare_tank.py','sha256':sha(Path(__file__))}}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
# Studio preview uses the actual processed geometry and source PBR maps.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True
scene.render.resolution_x=1200;scene.render.resolution_y=850;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.34,.4,.5,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
for name,pos,power,size in [('key',(-6,-6,10),1500,7),('fill',(6,-1,5),1100,6),('rim',(1,8,8),1700,5)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
ground=mat('preview_ground',(.055,.073,.09),0,.72)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.035));bpy.context.object.data.materials.append(ground)
d=bpy.data.cameras.new('Tank review');cam=bpy.data.objects.new('Tank review',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.ortho_scale=11.3
for name,pos,yaw,pitch in [('three-quarter',(9,-12,8),0,0),('rear',(-8,12,6),0,0),('turret-turned',(9,-12,8),-.72,.15)]:
 pivot.rotation_euler.z=yaw;barrel.rotation_euler.x=pitch;cam.location=pos;cam.rotation_euler=(Vector((0,-.35,1.25))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(REVIEW/(name+'.png'));bpy.ops.render.render(write_still=True)
print('TANK_ASSET '+json.dumps(manifest,ensure_ascii=False))
