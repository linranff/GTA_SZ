"""Rebake locomotion in existing reviewed rigs without rebuilding source scans."""
from pathlib import Path
import sys, json, hashlib, math, shutil
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from character_gait import bake_gait, bake_rider_idle, bake_cafe_rest, reset, gait_metadata
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/character-gaits';OUT.mkdir(parents=True,exist_ok=True)
REPORT=ROOT/'artifacts/city/gaits';REPORT.mkdir(parents=True,exist_ok=True)
reports=[]
for kind in ['rider','maid','jk']:
    rider=kind=='rider'
    folder=ROOT/('public/city/rider' if rider else 'public/city/bamboo-cafe/characters')
    blend=ROOT/('artifacts/city/rider/rider.blend' if rider else 'artifacts/city/bamboo-cafe/characters/'+kind+'-animated.blend')
    backup=REPORT/(kind+'-before.blend')
    if not backup.exists():shutil.copy2(blend,backup)
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    scene=bpy.context.scene;scene.render.fps=30
    scale=1 if rider else max(v.co.z for v in mesh.data.vertices)/1.69
    names=['Rider_Idle','Rider_Walk','Rider_Run'] if rider else ['CafeIdle','CafeWalk','CafeWave']
    rig.animation_data.action=None
    for track in list(rig.animation_data.nla_tracks):
        if any(strip.action.name in names for strip in track.strips):rig.animation_data.nla_tracks.remove(track)
    for action in list(bpy.data.actions):
        if action.name in names:bpy.data.actions.remove(action)
    actions={}
    if rider:actions['Rider_Idle']=bake_rider_idle(rig)
    else:
        for name in ['CafeIdle','CafeWave']:actions[name]=bake_cafe_rest(rig,name)
    for name,profile in ([('Rider_Walk','walk'),('Rider_Run','run')] if rider else [('CafeWalk','cafe')]):
        actions[name]=bake_gait(rig,mesh,name,profile,scale)
    rig.animation_data.action=None;reset(rig);scene.frame_set(0);bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=rig
    path=folder/(kind+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
        export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=True,
        export_frame_range=False,export_force_sampling=True,export_skins=True,export_all_influences=False,
        export_cameras=False,export_lights=False,export_materials='EXPORT',export_extras=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    manifest=json.loads((folder/'manifest.json').read_text())
    target=manifest if rider else next(m for m in manifest['models'] if m['id']==kind)
    target.update(bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    target.pop('compression',None)
    manifest['gaitProcessor']={'file':'scripts/character_gait.py','sha256':hashlib.sha256((ROOT/'scripts/character_gait.py').read_bytes()).hexdigest(),'rebake':'scripts/rebake_character_gaits.py'}
    target['gait']={key:gait_metadata(key) for key in ('walk','run')} if rider else gait_metadata('cafe',scale)
    if rider:target['animations']=[{'name':a.name,'frames':int(a.frame_range.y),'seconds':a.frame_range.y/30} for a in actions.values()]
    (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    # Sample the skinned footwear, not just joint rotations. A flexed knee must
    # point forwards, lift the heel and avoid punching the shoe through ground.
    kind_reports=[]
    for name,action in actions.items():
        if not any(word in name for word in ('Walk','Run')):continue
        rig.animation_data.action=action;frames=int(action.frame_range.y)
        flex=[];forward=[];ground=[]
        lower='calf' if rider else 'shin'
        for frame in range(frames):
            scene.frame_set(frame);bpy.context.view_layer.update()
            for side in ('L','R'):
                thigh=rig.pose.bones['thigh_'+side];shin=rig.pose.bones[lower+'_'+side]
                a=thigh.tail-thigh.head;b=shin.tail-shin.head
                flex.append(math.degrees(a.angle(b)))
                hip=thigh.head;knee=shin.head;ankle=shin.tail;line=ankle-hip
                projected=hip+line*((knee-hip).dot(line)/line.length_squared)
                forward.append(projected.y-knee.y)
            evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            ground.append(min(v.co.z for v in evaluated.data.vertices))
        report=dict(asset=kind,clip=name,kneeMin=min(flex),kneeMax=max(flex),forwardKneeMin=min(forward),soleMin=min(ground),soleMax=max(ground),frames=frames)
        kind_reports.append(report)
    reports+=kind_reports
    print('GAIT_REPORT '+json.dumps(kind_reports),flush=True)
    # Side-view phase sheet makes heel recovery / knee articulation reviewable.
    scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=420;scene.render.resolution_y=560;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.28,.32,.38,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
    for pos,power in [((3,-3,4),420),((-2,2,3),320)]:
        d=bpy.data.lights.new('Gait review','AREA');d.energy=power;d.size=3
        o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=pos
        o.rotation_euler=(Vector((0,0,.9))-o.location).to_track_quat('-Z','Y').to_euler()
    d=bpy.data.cameras.new('Gait camera');cam=bpy.data.objects.new(d.name,d);scene.collection.objects.link(cam);scene.camera=cam
    d.type='ORTHO';d.ortho_scale=2.02;cam.location=(4,-.6,.85);cam.rotation_euler=(Vector((0,0,.85))-cam.location).to_track_quat('-Z','Y').to_euler()
    for name,action in actions.items():
        if not any(word in name for word in ('Walk','Run')):continue
        rig.animation_data.action=action
        for i,fraction in enumerate([.03,.22,.47,.80]):
            scene.frame_set(round(action.frame_range.y*fraction))
            scene.render.filepath=str(OUT/(kind+'-'+name+'-'+str(i)+'.png'))
            bpy.ops.render.render(write_still=True)
    idle=actions['Rider_Idle' if rider else 'CafeIdle']
    rig.animation_data.action=idle;scene.frame_set(15)
    for label,position in [('front',(0,-4,.87)),('rear',(0,4,.87))]:
        cam.location=position;cam.rotation_euler=(Vector((0,0,.87))-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(OUT/(kind+'-relaxed-'+label+'.png'));bpy.ops.render.render(write_still=True)
    if not rider:
        rig.animation_data.action=actions['CafeWave'];scene.frame_set(15)
        cam.location=(.5,-4,.97);cam.rotation_euler=(Vector((0,0,.9))-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(OUT/(kind+'-relaxed-wave.png'));bpy.ops.render.render(write_still=True)
(REPORT/'bake-validation.json').write_text(json.dumps(reports,indent=2)+'\n')
