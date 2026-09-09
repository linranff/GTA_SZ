"""Extract the usable complete front figure from two user-supplied Tripo GLBs.

The input is a three-figure turnaround, not a rigged single character. Its
middle side-view figure is malformed. The left figure has a valid front AND
back; keep that complete figure, never stitch the conflicting middle figure.
Run with Blender --background --factory-startup --python this_file.py.
Only cafe/characters assets and their local review artifacts are written.
"""
from pathlib import Path
import bpy, bmesh, hashlib, json, math
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/city/bamboo-cafe/characters'
ART = ROOT / 'artifacts/city/bamboo-cafe/characters'
REVIEW = ROOT / 'output/playwright/cafe-characters'
for directory in (OUT, ART, REVIEW): directory.mkdir(parents=True, exist_ok=True)

SOURCES = [
    ('maid', 'maid outfit 3d model.glb', -.16, 1.69),
    ('jk', 'anime schoolgirl 3d model.glb', -.10, 1.67),
]
reports = []

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

for kind, filename, cutoff, height in SOURCES:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    source = Path('/Users/fenglinran/Downloads') / filename
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH']
    if len(meshes) != 1: raise RuntimeError('Review changed input topology before extracting ' + kind)
    ob = meshes[0]
    source_triangles = sum(len(p.vertices)-2 for p in ob.data.polygons)
    # Cut only through the measured empty space between the three figures.
    bm = bmesh.new(); bm.from_mesh(ob.data)
    removed = [v for v in bm.verts if v.co.x >= cutoff]
    if any(abs(v.co.x-cutoff) < .004 for v in bm.verts):
        raise RuntimeError('Extraction boundary intersects geometry: ' + kind)
    bmesh.ops.delete(bm, geom=removed, context='VERTS')
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    retained_triangles = sum(len(p.vertices)-2 for p in ob.data.polygons)
    lower = Vector(tuple(min(v.co[a] for v in ob.data.vertices) for a in range(3)))
    upper = Vector(tuple(max(v.co[a] for v in ob.data.vertices) for a in range(3)))
    center = Vector(((lower.x+upper.x)/2, (lower.y+upper.y)/2, lower.z))
    scale = height/(upper.z-lower.z)
    for v in ob.data.vertices: v.co = (v.co-center)*scale
    ob.name = 'cafe_character_' + kind
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    decimate = ob.modifiers.new('Preserve silhouette and baked detail', 'DECIMATE')
    decimate.ratio = min(1, 110000/retained_triangles)
    decimate.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    for poly in ob.data.polygons: poly.use_smooth = True
    for material in ob.data.materials:
        material.name = 'cafe_user_' + kind
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image: node.image.pack()
    bpy.context.view_layer.update()
    path = OUT / (kind + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_yup=True, export_animations=False, export_cameras=False, export_lights=False,
        export_materials='EXPORT', export_extras=True)
    report = {
        'id': kind, 'file': kind+'.glb', 'sourceFile': filename,
        'sourceSha256': sha(source), 'sourceBytes': source.stat().st_size,
        'sourceTriangles': source_triangles, 'retainedBeforeSimplification': retained_triangles,
        'sourceSelection': {'axis': 'Blender X', 'keepLessThan': cutoff,
            'reason': 'Left complete front-facing figure, with its own usable back. Middle malformed side-view and right reversed duplicate removed.'},
        'height': height, 'dimensions': list(ob.dimensions),
        'triangles': sum(len(p.vertices)-2 for p in ob.data.polygons),
        'meshes': 1, 'materials': 1, 'rigged': False,
        'bytes': path.stat().st_size, 'sha256': sha(path),
        'preview': [f'output/playwright/cafe-characters/{kind}-{view}.png' for view in ('front','back','three-quarter')],
    }
    reports.append(report)
    # Store the cleaned editable mesh separately from the untouched source GLB.
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/(kind+'.blend')))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.use_denoising = True
    scene.render.resolution_x = 850; scene.render.resolution_y = 1100; scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.42,.46,.51,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
    for i,(pos,power,size) in enumerate([((-2,-3,4),450,3),((3,0,3),250,2),((0,3,4),350,3)]):
        data=bpy.data.lights.new('Character review light '+str(i),'AREA');data.energy=power;data.size=size
        light=bpy.data.objects.new(data.name,data);scene.collection.objects.link(light);light.location=pos
        light.rotation_euler=(Vector((0,0,.9))-light.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Character review camera');camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
    data.type='ORTHO';data.ortho_scale=2.0;scene.camera=camera
    for view,pos in [('front',(0,-4,.94)),('back',(0,4,.94)),('three-quarter',(2,-4,1.05))]:
        camera.location=pos;camera.rotation_euler=(Vector((0,0,.86))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(REVIEW/f'{kind}-{view}.png');bpy.ops.render.render(write_still=True)

manifest = {'schemaVersion':1, 'scope':'Only the three existing Maison Lune cafe staff; not pedestrians or the player.',
    'provenance': {'providedBy':'User', 'toolLabelInInput':'Tripo', 'license':'User-provided asset; no external commercial-license claim has been verified.',
        'derivation':'Extract complete front-facing figure, remove bad side-view and reversed duplicate, normalize height, reduce triangles, retain original UVs and PBR textures.',
        'limitations':'No skeleton supplied. Existing cafe root idle animation is retained; this is not a walking or facial animation rig.'},
    'staffAssignments':{'zhixia':'maid','wangshu':'maid','xiaolan':'jk'}, 'models':reports,
    'processor':{'file':'scripts/prepare_cafe_characters.py','sha256':sha(Path(__file__))}}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('CAFE_CHARACTERS '+json.dumps(reports))
