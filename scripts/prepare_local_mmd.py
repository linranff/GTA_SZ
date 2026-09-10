"""Local-only PMX preparation. Run with Blender --background --python this_file.

Source assets and derivatives stay in ignored directories; NEVER copy to public/.
Requires the author's ZIPs in data/raw/local-mmd and MMD Tools 4.5.14 locally.
Uses original skeleton/weights/morphs; authors in-place locomotion, no Mixamo.
"""
import sys,json,math,pathlib,hashlib,zipfile
import bpy
from mathutils import Matrix,Vector,Quaternion
BASE=pathlib.Path(__file__).resolve().parents[1]
RAW=BASE/'data/raw/local-mmd'
OUT=BASE/'local-only/characters';OUT.mkdir(parents=True,exist_ok=True)
sys.path[:0]=[str(RAW/'mmd-tools/blender_mmd_tools-main'),str(RAW/'deps'),str(BASE/'scripts')]
import mmd_tools
from character_gait import bake_gait,bake_rider_idle,gait_metadata,reset,relaxed_arms,aim_bone,rotate_world
mmd_tools.register()
def bake_native_wave(rig):
    rig.animation_data_create();rig.animation_data.action=None
    for frame in range(91):
        bpy.context.scene.frame_set(frame);reset(rig);relaxed_arms(rig)
        phase=frame/90*math.tau
        # Target anatomical directions, not raw local Euler rotations from a
        # different rig. Elbow at shoulder level, forearm/hand up beside head.
        for name,direction in [('upper_arm_R',(-.7,-.08,.22)),('forearm_R',(-.08,-.10,1)),('hand_R',(-.12+.20*math.sin(phase*3),-.03,1))]:
            aim_bone(rig.pose.bones[name],Vector(direction));bpy.context.view_layer.update()
        rotate_world(rig.pose.bones['head'],(0,0,1),.025*math.sin(phase))
        for pb in rig.pose.bones:
            for prop in ['rotation_quaternion','location','scale']:pb.keyframe_insert(data_path=prop,frame=frame,group=pb.name)
    action=rig.animation_data.action;action.name='CafeWave';action.use_fake_user=True
    return action

models=[]
for asset,label in [('kuki','久岐忍'),('yelan','夜兰')]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path=next((RAW/asset).rglob('*.pmx'))
    # This exact alias was verified against BOTH archives and PMX references.
    # All other texture names/directories are preserved, never guessed.
    hair=path.parent/'tex/髪.png'
    if not hair.exists():hair.write_bytes((path.parent/'tex/уЉ.png').read_bytes())
    bpy.ops.mmd_tools.import_model(filepath=str(path),scale=.1,types={'MESH','ARMATURE','MORPHS'},rename_bones=False)
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    mesh=next(o for o in bpy.data.objects if o.type=='MESH')
    rig.parent=None;rig.name='Local_'+asset+'_Rig'
    mesh.parent=rig
    # Preserve original meshes, UV seams and blendshapes. MMD's shader graph
    # is replaced with exportable sRGB base-color materials, not baked lighting.
    textures=[]
    for mat in mesh.data.materials:
        src=next((n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE'),None)
        alpha=mat.mmd_material.alpha
        if src:
            if not pathlib.Path(bpy.path.abspath(src.filepath)).is_file():raise RuntimeError('Missing texture: '+src.filepath)
            src.reload();src.colorspace_settings.name='sRGB';textures.append(src.name)
        mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear()
        bs=nodes.new('ShaderNodeBsdfPrincipled');out=nodes.new('ShaderNodeOutputMaterial');mat.node_tree.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
        bs.inputs['Roughness'].default_value=.85;bs.inputs['Metallic'].default_value=0;bs.inputs['Specular IOR Level'].default_value=.16
        bs.inputs['Alpha'].default_value=alpha
        if src:
            tex=nodes.new('ShaderNodeTexImage');tex.image=src;mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        # MMD supplementary eye/star and sphere-highlight layers are hidden
        # when their source alpha is zero. Alpha decals use their own texture.
        if alpha<.01:mat.surface_render_method='DITHERED'
        mat.use_backface_culling=False
        mat.name='local_'+asset+'_'+mat.name
    # Remap D-chain deform weights onto anatomically matching FK bones.
    # Do not copy rotations between incompatible local axes. Inverse-bind
    # matrices and the new FK pose then preserve the original surface weights.
    remap={s+n+'D':s+n for s in ['左','右'] for n in ['足','ひざ','足首']}
    for source,target in remap.items():
        vg=mesh.vertex_groups.get(source)
        if not vg:continue
        dst=mesh.vertex_groups.get(target) or mesh.vertex_groups.new(name=target)
        for v in mesh.data.vertices:
            w=next((g.weight for g in v.groups if g.group==vg.index),0)
            if w:dst.add([v.index],w,'ADD')
        mesh.vertex_groups.remove(vg)
    for pb in rig.pose.bones:
        for c in list(pb.constraints):pb.constraints.remove(c)
    if rig.animation_data:rig.animation_data_clear()
    # EX toes originally inherit a D-chain ankle. Redirect the parent while
    # preserving bind coordinates so footwear follows the driven FK ankle.
    bpy.context.view_layer.objects.active=rig;rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for side in ['左','右']:
        for eb in rig.data.edit_bones:
            if eb.parent and eb.parent.name in remap:eb.parent=rig.data.edit_bones[remap[eb.parent.name]]
    bpy.ops.object.mode_set(mode='OBJECT')
    aliases={'全ての親':'root','腰':'pelvis','上半身':'spine','上半身2':'chest','頭':'head'}
    for side,lr in [('左','L'),('右','R')]:
        aliases.update({side+n:k+'_'+lr for n,k in [('足','thigh'),('ひざ','calf'),('足首','foot'),('腕','upper_arm'),('ひじ','forearm'),('手首','hand')]})
    for old,new in aliases.items():
        if old not in rig.data.bones:raise RuntimeError('Required native joint missing: '+old)
        rig.data.bones[old]['mmd_source_name']=old;rig.data.bones[old].name=new
        vg=mesh.vertex_groups.get(old)
        if vg:vg.name=new
    # Armature + mesh + morph deltas receive the same transform.
    low=min(v.co.z for v in mesh.data.vertices);high=max(v.co.z for v in mesh.data.vertices)
    factor=1.72/(high-low);transform=Matrix.Scale(factor,4) @ Matrix.Translation((0,0,-low))
    mesh.data.transform(transform,shape_keys=True);rig.data.transform(transform)
    bpy.context.view_layer.update()
    # Core anatomy rest dimensions are measured, not assumed from bone names.
    anatomy={n:{'head':list(rig.data.bones[n].head_local),'tail':list(rig.data.bones[n].tail_local)} for n in aliases.values()}
    bpy.context.scene.render.fps=30
    actions=[]
    actions.append(bake_rider_idle(rig));actions[-1].name='Rider_Idle' if asset=='kuki' else 'CafeIdle'
    actions.append(bake_gait(rig,mesh,'Rider_Walk' if asset=='kuki' else 'CafeWalk','walk' if asset=='kuki' else 'cafe'))
    if asset=='kuki':actions.append(bake_gait(rig,mesh,'Rider_Run','run'))
    else:actions.append(bake_native_wave(rig))
    rig.animation_data.action=None
    for action in actions:
        track=rig.animation_data.nla_tracks.new();track.name=action.name
        strip=track.strips.new(action.name,0,action);strip.action_frame_start=action.frame_range[0];strip.action_frame_end=action.frame_range[1]
    reset(rig);bpy.context.scene.frame_set(0)
    # Select only the original render mesh and rig, not MMD helpers/physics.
    bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    mesh.name='local_'+asset+'_body'
    output=OUT/(asset+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_anim_slide_to_zero=True,export_rest_position_armature=True,export_morph=True,export_skins=True,export_all_influences=False,export_image_format='AUTO')
    # Save editable file outside all distribution directories.
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(asset+'.blend')))
    record=dict(id=asset,name=label,file=output.name,displayHeight=1.72,bytes=output.stat().st_size,triangles=sum(len(p.vertices)-2 for p in mesh.data.polygons),bones=len(rig.data.bones),morphs=len(mesh.data.shape_keys.key_blocks)-1,textures=sorted(set(textures)),sha256=hashlib.sha256(output.read_bytes()).hexdigest(),sourceZipSha256=hashlib.sha256((RAW/(asset+'.zip')).read_bytes()).hexdigest(),gait={'walk':gait_metadata('walk' if asset=='kuki' else 'cafe'),'run':gait_metadata('run')},anatomy=anatomy)
    models.append(record)
    print('LOCAL_MODEL_READY',asset,record['bytes'],flush=True)
(OUT/'manifest.json').write_text(json.dumps(dict(schemaVersion=1,localOnly=True,credit='模型提供 miHoYo · MMD 模型改造 观海',physics=False,models=models),ensure_ascii=False,indent=2))
