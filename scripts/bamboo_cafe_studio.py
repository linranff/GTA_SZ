"""Named review cameras and lights in the cafe's editable Blender source.

Imported by the incremental builder. Can also refresh the saved .blend with:
Blender --background artifacts/city/bamboo-cafe/maison-lune.blend --python scripts/bamboo_cafe_studio.py
No city geometry is touched; these studio nodes are not exported to the game.
"""
import bpy
from mathutils import Vector


def setup():
    scene=bpy.context.scene
    for ob in list(scene.objects):
        if ob.name.startswith('Cafe review '):bpy.data.objects.remove(ob,do_unlink=True)
    def camera(name,eye,target,lens):
        data=bpy.data.cameras.new('Cafe review '+name);data.lens=lens;data.clip_start=.04;data.clip_end=200
        ob=bpy.data.objects.new('Cafe review '+name,data);scene.collection.objects.link(ob);ob.location=eye
        ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
        return ob
    scene.camera=camera('01 Interior',(0,-6.3,1.92),(0,2.5,1.75),23)
    camera('02 Reception',(-1.4,-5.4,1.75),(-2.25,-3.45,1.55),62)
    camera('03 Exterior',(19,-26,11),(0,-2,1.9),38)
    for i,(x,y,z,size,power)in enumerate([(-4.2,-2.6,3.5,3.6,240),(4.2,-2.6,3.5,3.6,240),(0,2,3.65,4,280),(2.5,5.8,3.4,3,170),(0,-9,4.3,8,900)]):
        data=bpy.data.lights.new('Cafe review Area '+str(i),'AREA');data.energy=power;data.color=(1,.9,.77);data.shape='DISK';data.size=size
        ob=bpy.data.objects.new(data.name,data);scene.collection.objects.link(ob);ob.location=(x,y,z)
        ob.rotation_euler=(Vector((x,y+(4 if i==4 else 0),.4))-ob.location).to_track_quat('-Z','Y').to_euler()
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.77,.84,1,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.16
    scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True
    scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.25
    for mat in bpy.data.materials:
        if mat.name.startswith('cafe_') and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type=='TEX_IMAGE' and node.image and not node.image.packed_file:node.image.pack()


if __name__=='__main__':
    setup();bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
