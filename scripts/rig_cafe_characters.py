"""Add a small authored service-animation rig to the cleaned user figures.

Inputs are the previously reviewed complete front/back .blend figures. Never
imports the malformed turnaround duplicates. Preserves UVs, topology, textures
and source height; runtime continues to fit each employee to 1.93–1.96 units.
Run Blender --background --factory-startup --python scripts/rig_cafe_characters.py.
"""
from pathlib import Path
import bpy, math, json, hashlib, sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from character_gait import bake_gait, gait_metadata
from mathutils import Vector, Quaternion

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'artifacts/city/bamboo-cafe/characters'
OUT=ROOT/'public/city/bamboo-cafe/characters'
REVIEW=ROOT/'output/blender/cafe-animation'
REVIEW.mkdir(parents=True,exist_ok=True)
manifest=json.loads((OUT/'manifest.json').read_text())

def smooth(a,b,t):
    x=max(0,min(1,(t-a)/(b-a)))
    return x*x*(3-2*x)

def rotate(pb,axis,angle):
    basis=pb.bone.matrix_local.to_quaternion()
    pb.rotation_quaternion=basis.inverted() @ Quaternion(Vector(axis),angle) @ basis

for kind in ['maid','jk']:
    bpy.ops.wm.open_mainfile(filepath=str(ART/(kind+'.blend')))
    ob=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    for o in list(bpy.context.scene.objects):
        if o!=ob:bpy.data.objects.remove(o,do_unlink=True)
    ob.animation_data_clear();ob.vertex_groups.clear()
    for mod in list(ob.modifiers):
        if mod.type=='ARMATURE':ob.modifiers.remove(mod)
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True)
    bpy.context.view_layer.objects.active=ob
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    height=max(v.co.z for v in ob.data.vertices)
    factor=height/1.69
    arm_data=bpy.data.armatures.new('CafeServiceRig_'+kind)
    rig=bpy.data.objects.new(arm_data.name,arm_data);bpy.context.collection.objects.link(rig)
    ob.parent=rig
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);ob.select_set(False)
    bpy.ops.object.mode_set(mode='EDIT')
    definitions={
        'root':((0,0,0),(0,0,.18),None),
        'pelvis':((0,0,.85),(0,0,1.02),'root'),
        'spine':((0,0,1.02),(0,0,1.34),'pelvis'),
        'head':((0,0,1.36),(0,0,1.62),'spine'),
    }
    for side,label in [(-1,'L'),(1,'R')]:
        definitions.update({
            'upper_arm_'+label:((side*.150,0,1.255),(side*.225,0,1.045),'spine'),
            'forearm_'+label:((side*.225,0,1.045),(side*.343,-.005,.812),'upper_arm_'+label),
            'hand_'+label:((side*.343,-.005,.812),(side*.379,-.01,.717),'forearm_'+label),
            'thigh_'+label:((side*.115,0,.85),(side*.135,.012,.405),'pelvis'),
            'shin_'+label:((side*.135,.012,.405),(side*.145,0,.105),'thigh_'+label),
            'foot_'+label:((side*.145,0,.105),(side*.145,-.10,.055),'shin_'+label),
        })
    for name,(head,tail,parent) in definitions.items():
        bone=arm_data.edit_bones.new(name);bone.head=Vector(head)*factor;bone.tail=Vector(tail)*factor
        if parent:bone.parent=arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    groups={name:ob.vertex_groups.new(name=name) for name in definitions}
    # The scan has disconnected texture seams AND false connections at the
    # sleeve/torso. Measured empty-space cuts are more reliable than automatic
    # bone heat or connected-component flooding. These boundaries run in the
    # air gap between the skirt/torso and each complete forearm/hand.
    cuts=[(.68,.33),(.725,.31),(.80,.27),(.90,.235),(1.0,.172),(1.05,.14),(1.125,.12)]
    if kind=='jk':cuts=[(.70,.34),(.775,.29),(.90,.24),(1.0,.18),(1.125,.133)]
    def arm_cut(z):
        for (za,xa),(zb,xb) in zip(cuts,cuts[1:]):
            if z<=zb:return xa+(xb-xa)*max(0,(z-za)/(zb-za))
        return cuts[-1][1]
    for v in ob.data.vertices:
        x,y,z=v.co/factor;ax=abs(x);label='R' if x>=0 else 'L';weights={}
        # The A-pose arms and skirt overlap in height, but not in X. This gate
        # prevents sleeves/skirts being pulled into an unrelated hand joint.
        if z<cuts[0][0]:arm=0
        else:
            edge=arm_cut(z) if z<1.125 else cuts[-1][1]+(z-1.125)*.36
            blend=.009+.036*smooth(1.025,1.20,z)
            arm=smooth(edge-blend,edge+blend,ax)*(1-smooth(1.24,1.335,z))
        upper=smooth(.99,1.10,z);hand=1-smooth(.77,.855,z)
        fore=max(0,1-upper-hand)
        for name,w in [('upper_arm_',upper),('forearm_',fore),('hand_',hand)]:weights[name+label]=arm*w
        remaining=1-arm
        hem=.59 if kind=='maid' else .69
        leg=(1-smooth(hem-.065,hem-.005,z))*remaining
        thigh=smooth(.36,.49,z);foot=1-smooth(.075,.16,z);shin=max(0,1-thigh-foot)
        for name,w in [('thigh_',thigh),('shin_',shin),('foot_',foot)]:weights[name+label]=leg*w
        torso=remaining-leg;head=smooth(1.33,1.44,z);spine=smooth(.95,1.105,z)*(1-head)
        weights['head']=torso*head;weights['spine']=torso*spine;weights['pelvis']=torso*max(0,1-head-spine)
        total=sum(weights.values())
        assert total>.99
        for name,w in weights.items():
            if w>.0001:groups[name].add([v.index],w/total,'REPLACE')
    mod=ob.modifiers.new('Cafe service skeletal skin','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=False
    for pb in rig.pose.bones:pb.rotation_mode='QUATERNION'
    scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=0
    actions={}
    for clip,end in [('CafeIdle',120),('CafeWalk',36),('CafeWave',90)]:
        if clip=='CafeWalk':
            actions[clip]=bake_gait(rig,ob,clip,'cafe',factor)
            continue
        rig.animation_data_create();rig.animation_data.action=None
        for frame in range(0,end+1,3):
            scene.frame_set(frame);phase=frame/end*math.tau
            for pb in rig.pose.bones:pb.rotation_quaternion=Quaternion();pb.location=(0,0,0)
            rotate(rig.pose.bones['spine'],(0,1,0),.006*math.sin(phase))
            rotate(rig.pose.bones['head'],(0,1,0),.012*math.sin(phase+.8))
            if clip=='CafeWave':
                rotate(rig.pose.bones['upper_arm_R'],(0,1,0),-1.01)
                rotate(rig.pose.bones['forearm_R'],(0,1,0),-1.38+.055*math.sin(phase*3))
                rotate(rig.pose.bones['hand_R'],(0,1,0),.26*math.sin(phase*3))
                rotate(rig.pose.bones['head'],(0,1,0),-.035+.012*math.sin(phase))
            for pb in rig.pose.bones:
                pb.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=pb.name)
                pb.keyframe_insert(data_path='location',frame=frame,group=pb.name)
        action=rig.animation_data.action;action.name=clip;action.use_fake_user=True;actions[clip]=action
    rig.animation_data.action=None
    for name,action in actions.items():
        track=rig.animation_data.nla_tracks.new();track.name=name
        strip=track.strips.new(name,0,action);track.mute=True
    # Always export the BIND pose, never the last sampled greeting pose.
    for pb in rig.pose.bones:pb.rotation_quaternion=Quaternion();pb.location=(0,0,0)
    scene.frame_set(0);bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    path=OUT/(kind+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
        export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=True,
        export_frame_range=False,export_force_sampling=True,export_cameras=False,export_lights=False,
        export_materials='EXPORT',export_extras=True,export_optimize_animation_size=True)
    model=next(m for m in manifest['models'] if m['id']==kind)
    model.update(rigged=True,bones=len(definitions),animations=list(actions),gait=gait_metadata('cafe',factor),bytes=path.stat().st_size,
        sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    model.pop('compression',None)
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/(kind+'-animated.blend')))
    # Authored close-range poses, with the same geometry/UV/materials as export.
    scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
    scene.render.resolution_x=650;scene.render.resolution_y=850;scene.render.resolution_percentage=100
    scene.render.threads_mode='FIXED';scene.render.threads=4;scene.view_settings.view_transform='AgX'
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.4,.45,.5,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
    for i,(pos,power,size) in enumerate([((-2,-3,4),400,3),((3,0,3),230,2),((0,3,4),250,3)]):
        data=bpy.data.lights.new('Review light '+str(i),'AREA');data.energy=power;data.size=size
        light=bpy.data.objects.new(data.name,data);scene.collection.objects.link(light);light.location=pos
        light.rotation_euler=(Vector((0,0,.9))-light.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Animation review');camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
    data.type='ORTHO';data.ortho_scale=2.1;camera.location=(.5,-4,.97)
    camera.rotation_euler=(Vector((0,0,.90))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
    for clip,frame,label in [('CafeIdle',0,'idle'),('CafeWalk',9,'walk'),('CafeWave',15,'wave')]:
        rig.animation_data.action=actions[clip];scene.frame_set(frame)
        scene.render.filepath=str(REVIEW/(kind+'-'+label+'.png'));bpy.ops.render.render(write_still=True)
    print('CAFE_RIG '+json.dumps({'id':kind,'bones':len(definitions),'animations':list(actions),'height':height}))

manifest['provenance']['limitations']='Lightweight authored service rig: idle, short-step walk and one-hand greeting. No finger, facial or cloth simulation; original static scan is retained underneath the skin.'
manifest['animationProcessor']={'file':'scripts/rig_cafe_characters.py','sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
