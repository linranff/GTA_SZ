import bpy, json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1]; A=R/'artifacts/city/vehicle-candidate'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(A/'source/CarConcept.glb'))
rep=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 pts=[o.matrix_world@Vector(v) for v in o.bound_box]
 rep.append(dict(name=o.name,verts=len(o.data.vertices),tris=sum(len(p.vertices)-2 for p in o.data.polygons),materials=[m.name for m in o.data.materials],position=list(o.location),bmin=[min(p[a] for p in pts) for a in range(3)],bmax=[max(p[a] for p in pts) for a in range(3)]))
(A/'source/blender-inspection.json').write_text(json.dumps(rep,indent=2));print(json.dumps(rep,indent=1),flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(A/'source/source-import.blend'))
