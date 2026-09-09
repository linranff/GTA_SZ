"""Offline Blender gait authoring. Feet drive two-bone leg IK, then bake FK.

Blender figure faces -Y, +Z is up. Knee poles point FORWARD (-Y), while
heels recover backward. No IK solver or extra bones are needed at runtime.
"""
import math
import bpy
from mathutils import Vector, Quaternion

def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)

PROFILES={
    'walk':dict(frames=30,stance=.62,front=.32,back=.32,lift=.115,arm=.22,elbow=.28,lean=.035),
    'run':dict(frames=22,stance=.40,front=.36,back=.40,lift=.34,arm=.56,elbow=1.05,lean=.16),
    'cafe':dict(frames=36,stance=.66,front=.155,back=.17,lift=.10,arm=.10,elbow=.13,lean=.012),
}

def rotate_world(pb,axis,angle):
    rest=pb.bone.matrix_local.to_quaternion()
    pb.rotation_quaternion=rest.inverted() @ Quaternion(Vector(axis),angle) @ rest

def set_world_rotation(pb,rotation):
    rest=pb.bone.matrix_local.to_quaternion()
    parent_delta=Quaternion()
    if pb.parent:
        parent_delta=pb.parent.matrix.to_quaternion() @ pb.parent.bone.matrix_local.to_quaternion().inverted()
    pb.rotation_quaternion=(parent_delta @ rest).inverted() @ rotation

def aim_bone(pb,direction):
    bone=pb.bone
    delta=(bone.tail_local-bone.head_local).rotation_difference(direction)
    set_world_rotation(pb,delta @ bone.matrix_local.to_quaternion())

def reset(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode='QUATERNION';pb.rotation_quaternion=Quaternion();pb.location=(0,0,0);pb.scale=(1,1,1)

def relaxed_arms(rig,swings=None,elbows=None):
    """Replace the scan's wide A-pose with shoulders down and palms at sides.

    A small outfit-specific clearance keeps gloves outside the jacket and
    palms outside the flared skirt. Directions are anatomical/world-space;
    the authored bone roll and the label-to-X convention may differ by rig.
    """
    rider='calf_L' in rig.pose.bones
    if rider:slopes=(.14,.10,.04)
    elif rig.name.endswith('_jk'):slopes=(.18,.16,.04)
    else:slopes=(.28,.28,.08)
    swings=swings or {};elbows=elbows or {}
    bpy.context.view_layer.update()
    for side in ('L','R'):
        upper=rig.pose.bones['upper_arm_'+side]
        sign=1 if upper.bone.head_local.x>0 else -1
        body=upper.parent.matrix.to_quaternion() @ upper.parent.bone.matrix_local.to_quaternion().inverted()
        swing=swings.get(side,0);elbow=elbows.get(side,.09 if rider else .07)
        for i,prefix in enumerate(('upper_arm_','forearm_','hand_')):
            pb=rig.pose.bones[prefix+side]
            neutral=Vector((sign*slopes[i],-.025,-1)).normalized()
            rest_direction=pb.bone.tail_local-pb.bone.head_local
            neutral_rotation=rest_direction.rotation_difference(neutral) @ pb.bone.matrix_local.to_quaternion()
            desired=body @ Quaternion(Vector((1,0,0)),swing-(elbow if i>0 else 0)) @ neutral_rotation
            set_world_rotation(pb,desired)
            bpy.context.view_layer.update()

def leg_context(rig,mesh,scale=1):
    result={}
    lower='calf' if 'calf_L' in rig.pose.bones else 'shin'
    for side in ('L','R'):
        thigh=rig.pose.bones['thigh_'+side];shin=rig.pose.bones[lower+'_'+side];foot=rig.pose.bones['foot_'+side]
        ankle=foot.bone.head_local.copy()
        sole=[v.co-ankle for v in mesh.data.vertices if v.co.z<.08*scale and v.co.x*ankle.x>0]
        result[side]=dict(thigh=thigh,shin=shin,foot=foot,ankle=ankle,sole=sole,
                          upper=thigh.bone.length,lower=shin.bone.length)
    return result

def foot_path(p,profile,scale):
    stance=profile['stance'];front=profile['front']*scale;back=profile['back']*scale
    if p<stance:
        q=p/stance
        y=-front+(front+back)*q
        lift=0
        pitch=-.12*(1-smooth(0,.18,q))+.30*smooth(.72,1,q)
    else:
        q=(p-stance)/(1-stance)
        y=back-(front+back)*smooth(0,1,q)
        lift=profile['lift']*scale*math.sin(math.pi*q)**1.3
        pitch=.30*(1-smooth(0,.4,q))-.12*smooth(.72,1,q)
    return y,lift,pitch

def pose_gait(rig,context,phase,profile,scale=1):
    reset(rig)
    t=phase*math.tau
    def target_at(leg,p):
        y,lift,pitch=foot_path(p,profile,scale)
        rotation=Quaternion(Vector((1,0,0)),pitch)
        floor=-min((rotation @ v).z for v in leg['sole'])
        return Vector((leg['ankle'].x,y+leg['ankle'].y,floor+lift+.004*scale)),rotation
    targets={side:target_at(leg,(phase+shift)%1) for (side,leg),shift in zip(context.items(),(0,.5))}
    def support_height(leg,target):
        hip=leg['thigh'].bone.head_local
        reach=(leg['upper']+leg['lower'])*.989
        horizontal=(target.x-hip.x)**2+(target.y-hip.y)**2
        return target.z+math.sqrt(max(.01,reach*reach-horizontal))-hip.z
    supports=[support_height(context[side],targets[side][0]) for side,shift in [('L',0),('R',.5)] if (phase+shift)%1<profile['stance']]
    if supports:
        height=min(supports)
    else:
        # Brief running flight connects toe-off to the next heel strike. It
        # does not leave the support leg permanently crouched to clear a foot.
        u=((phase%.5)-profile['stance'])/(.5-profile['stance'])
        leg=context['L'];takeoff=target_at(leg,profile['stance']-.00001)[0];landing=target_at(leg,0)[0]
        height=support_height(leg,takeoff)*(1-u)+support_height(leg,landing)*u+.045*scale*math.sin(math.pi*u)
    root=rig.pose.bones.get('root') or rig.pose.bones['pelvis']
    offset=Vector((.006*scale*math.sin(t),0,height))
    root.location=root.bone.matrix_local.to_quaternion().inverted() @ offset
    rotate_world(rig.pose.bones['pelvis'],(0,0,1),.025*math.sin(t))
    upper=rig.pose.bones.get('chest') or rig.pose.bones['spine']
    rotate_world(upper,(1,0,0),profile['lean'])
    relaxed_arms(rig,
        {side:profile['arm']*math.cos((phase+shift)*math.tau) for side,shift in [('L',0),('R',.5)]},
        {side:profile['elbow']+.10*math.sin((phase+shift)*math.tau) for side,shift in [('L',0),('R',.5)]})
    bpy.context.view_layer.update()
    for side,shift in [('L',0),('R',.5)]:
        leg=context[side];p=(phase+shift)%1
        # Roll about the contact sole instead of letting a rotated toe pass
        # through the floor. Samples come from the actual retained footwear.
        target,foot_rotation=targets[side]
        hip=leg['thigh'].head.copy();to=target-hip;distance=to.length
        a,b=leg['upper'],leg['lower'];d=min(a+b-.0005,max(abs(a-b)+.0005,distance))
        direction=to.normalized();pole=Vector((0,-1,0));pole=(pole-direction*pole.dot(direction)).normalized()
        along=(a*a-b*b+d*d)/(2*d);height=math.sqrt(max(0,a*a-along*along))
        knee=hip+direction*along+pole*height
        aim_bone(leg['thigh'],knee-hip);bpy.context.view_layer.update()
        aim_bone(leg['shin'],target-leg['shin'].head);bpy.context.view_layer.update()
        set_world_rotation(leg['foot'],foot_rotation @ leg['foot'].bone.matrix_local.to_quaternion())
        bpy.context.view_layer.update()

def bake_gait(rig,mesh,name,profile_name,scale=1):
    profile=PROFILES[profile_name];context=leg_context(rig,mesh,scale)
    rig.animation_data_create();rig.animation_data.action=None
    for frame in range(profile['frames']+1):
        bpy.context.scene.frame_set(frame)
        pose_gait(rig,context,frame/profile['frames'],profile,scale)
        for pb in rig.pose.bones:
            pb.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=pb.name)
            pb.keyframe_insert(data_path='location',frame=frame,group=pb.name)
            pb.keyframe_insert(data_path='scale',frame=frame,group=pb.name)
    action=rig.animation_data.action;action.name=name;action.use_fake_user=True
    return action

def bake_rider_idle(rig):
    rig.animation_data_create();rig.animation_data.action=None
    for frame in range(61):
        bpy.context.scene.frame_set(frame);reset(rig);t=frame/60*math.tau
        rotate_world(rig.pose.bones['chest'],(1,0,0),.006*math.sin(t))
        rotate_world(rig.pose.bones['head'],(0,0,1),.015*math.sin(t))
        relaxed_arms(rig)
        for pb in rig.pose.bones:
            pb.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=pb.name)
            pb.keyframe_insert(data_path='location',frame=frame,group=pb.name)
            pb.keyframe_insert(data_path='scale',frame=frame,group=pb.name)
    action=rig.animation_data.action;action.name='Rider_Idle';action.use_fake_user=True
    return action

def bake_cafe_rest(rig,name):
    """Idle or greeting; the inactive hand stays at the skirt side."""
    wave=name=='CafeWave';end=90 if wave else 120
    rig.animation_data_create();rig.animation_data.action=None
    for frame in range(0,end+1,3):
        bpy.context.scene.frame_set(frame);reset(rig);phase=frame/end*math.tau
        rotate_world(rig.pose.bones['spine'],(0,1,0),.006*math.sin(phase))
        rotate_world(rig.pose.bones['head'],(0,1,0),.012*math.sin(phase+.8))
        relaxed_arms(rig)
        if wave:
            rotate_world(rig.pose.bones['upper_arm_R'],(0,1,0),-1.01)
            rotate_world(rig.pose.bones['forearm_R'],(0,1,0),-1.38+.055*math.sin(phase*3))
            rotate_world(rig.pose.bones['hand_R'],(0,1,0),.26*math.sin(phase*3))
            rotate_world(rig.pose.bones['head'],(0,1,0),-.035+.012*math.sin(phase))
        for pb in rig.pose.bones:
            pb.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=pb.name)
            pb.keyframe_insert(data_path='location',frame=frame,group=pb.name)
            pb.keyframe_insert(data_path='scale',frame=frame,group=pb.name)
    action=rig.animation_data.action;action.name=name;action.use_fake_user=True
    return action

def gait_metadata(profile_name,scale=1):
    p=PROFILES[profile_name];seconds=p['frames']/30
    return dict(cycleSeconds=seconds,stanceFraction=p['stance'],
                authoredSpeed=(p['front']+p['back'])*scale/(p['stance']*seconds),
                swingLift=p['lift']*scale,method='baked two-bone IK with forward knee poles and sole contacts')
