"""Blender-authored opaque silhouettes for the existing three distant trees.

Writes isolated candidates, never public or the near-tree source. Bounds come
from the currently shipped original LOD mesh, not arbitrary larger crowns.
"""
from pathlib import Path
import sys,json,math,random,struct
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/city/landscape-solid-lod-candidate';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts'))
from city_mesh import B,M,bpy,Vector,material

def original_points(name):
    data=(ROOT/'public/city/landscape'/f'{name}.glb').read_bytes();size=struct.unpack_from('<I',data,12)[0]
    meta=json.loads(data[20:20+size]);packed=data[28+size:];points=[];leaf=[]
    for mesh in meta['meshes']:
        for primitive in mesh['primitives']:
            access=meta['accessors'][primitive['attributes']['POSITION']];view=meta['bufferViews'][access['bufferView']]
            values=struct.unpack_from('<'+'f'*(access['count']*3),packed,view.get('byteOffset',0)+access.get('byteOffset',0))
            # glTF east/up/south -> Blender east/north/up.
            p=[(values[i],-values[i+2],values[i+1]) for i in range(0,len(values),3)]
            points.extend(p)
            if 'foliage' in meta['materials'][primitive['material']]['name'] or 'frond' in meta['materials'][primitive['material']]['name']:leaf.extend(p)
    return points,leaf

material('landscape_bark',(.30,.255,.185),.94)
material('landscape_canopy_banyan',(.075,.19,.076),.91)
material('landscape_canopy_orchid',(.14,.21,.125),.90)
material('landscape_palm_solid_frond',(.095,.235,.10),.88)
for name in ['landscape_canopy_banyan','landscape_canopy_orchid','landscape_palm_solid_frond']:
    M[name].use_backface_culling=False
    M[name]['purpose']='Opaque distant foliage: complete silhouette, zero alpha texture'

def crown_lobe(b,mat,center,radius,seed):
    rng=random.Random(seed);corners=8;angle=seed*.347
    # Four uneven rings form a closed, asymmetric canopy clump. Three
    # interlocking clumps create a layered tree, rather than a single sphere.
    angular=[rng.uniform(.86,1.07) for _ in range(corners)]
    levels=[(-1,.25),(-.35,1),(.36,.91),(1,.22)]
    rings=[]
    for j,(z,r) in enumerate(levels):
        rings.append([(center[0]+math.cos(angle+i*math.tau/corners)*radius[0]*r*angular[i],center[1]+math.sin(angle+i*math.tau/corners)*radius[1]*r*angular[i],center[2]+radius[2]*(z+(0 if j in [0,3] else .07*math.sin(i*2.7+seed)))) for i in range(corners)])
    for j in range(3):
        for i in range(corners):b.face(mat,[rings[j][i],rings[j][(i+1)%corners],rings[j+1][(i+1)%corners],rings[j+1][i]])
    b.face(mat,list(reversed(rings[0])));b.face(mat,rings[-1])

def broadleaf(name,leaf):
    b=B();flower=name.startswith('orchid');mat='landscape_canopy_orchid' if flower else 'landscape_canopy_banyan'
    lo=[min(p[i] for p in leaf) for i in range(3)];hi=[max(p[i] for p in leaf) for i in range(3)];w,d,h=[hi[i]-lo[i] for i in range(3)];cx,cy=(hi[0]+lo[0])/2,(hi[1]+lo[1])/2
    b.tube('landscape_bark',(0,0,0),(.15,-.07,3.05),.27 if flower else .33,6,r2=.17)
    for end in [(cx-w*.18,cy+d*.03,lo[2]+h*.43),(cx+w*.20,cy-d*.02,lo[2]+h*.51)]:b.tube('landscape_bark',(.15,-.07,2.35),end,.14,4,r2=.045)
    crown_lobe(b,mat,(cx-w*.15,cy+d*.04,lo[2]+h*.48),(w*.38,d*.39,h*.48),7 if flower else 3)
    crown_lobe(b,mat,(cx+w*.20,cy+d*.025,lo[2]+h*.48),(w*.33,d*.40,h*.43),15 if flower else 11)
    crown_lobe(b,mat,(cx+w*.015,cy-d*.20,lo[2]+h*.62),(w*.33,d*.33,h*.38),23 if flower else 19)
    return b

def palm(name,leaf):
    b=B();top=max(p[2] for p in leaf);rmax=max(math.hypot(p[0],p[1]) for p in leaf)
    b.loft('landscape_bark',[(0,0,0,.21,.21),(.10,0,3.5,.18,.18),(.06,0,6.65,.14,.14)],6)
    for i in range(12):
        a=i*2.399963;length=rmax*(.86+.085*math.sin(i*2.3));u=Vector((math.cos(a),math.sin(a),0));side=Vector((-u.y,u.x,0));rings=[]
        for j,(t,width) in enumerate([(0,.04),(.31,.61),(.67,.49),(1,.015)]):
            z=6.8+(top-6.8)*math.sin(t*math.pi)**.65-1.15*t*t
            c=u*length*t+Vector((.06,0,z));crease=.10*math.sin(t*math.pi)
            rings.append([tuple(c-side*width-Vector((0,0,crease))),tuple(c),tuple(c+side*width-Vector((0,0,crease)))])
        for j in range(3):
            for s in range(2):b.face('landscape_palm_solid_frond',[rings[j][s],rings[j+1][s],rings[j+1][s+1],rings[j][s+1]])
    return b

models=[];stats=[]
for name in ['banyan-lod','palm-lod','orchid-tree-lod']:
    original,leaf=original_points(name);b=palm(name,leaf) if name.startswith('palm') else broadleaf(name,leaf)
    obs=b.finish(name,smooth=True)
    # Fit candidate to original AABB and circular envelope. This can shrink a
    # local lobe, never expand the previous road-clearance contract.
    oldlo=[min(p[i] for p in original) for i in range(3)];oldhi=[max(p[i] for p in original) for i in range(3)];oldradius=max(math.hypot(p[0],p[1]) for p in original)
    current=[v.co for ob in obs for v in ob.data.vertices];newlo=[min(v[i] for v in current) for i in range(3)];newhi=[max(v[i] for v in current) for i in range(3)]
    sx=(oldhi[0]-oldlo[0])/(newhi[0]-newlo[0]);sy=(oldhi[1]-oldlo[1])/(newhi[1]-newlo[1]);sz=oldhi[2]/newhi[2]
    for ob in obs:
        for v in ob.data.vertices:
            # Preserve the planted trunk origin; only fit the new leaf volume
            # to the old canopy envelope. Global fitting would offset its base.
            if ob.data.materials[0].name!='landscape_bark':
                v.co.x=(v.co.x-newlo[0])*sx+oldlo[0];v.co.y=(v.co.y-newlo[1])*sy+oldlo[1]
            v.co.z*=sz
            radius=math.hypot(v.co.x,v.co.y)
            if radius>oldradius*.995:v.co.x*=oldradius*.995/radius;v.co.y*=oldradius*.995/radius
        ob.data.update()
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:ob.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]
    path=OUT/f'{name}.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True)
    triangles=sum(sum(len(poly.vertices)-2 for poly in ob.data.polygons) for ob in obs);assert triangles<=264,(name,triangles)
    points=[v.co for ob in obs for v in ob.data.vertices]
    info={'id':name,'file':path.name,'triangles':triangles,'meshes':len(obs),'bytes':path.stat().st_size,'originalHeight':oldhi[2],'height':max(v.z for v in points),'originalRadius':oldradius,'radius':max(math.hypot(v.x,v.y) for v in points),'opaque':True,'alphaTextures':0,'originalBounds':[oldlo,oldhi],'bounds':[[min(v[i] for v in points) for i in range(3)],[max(v[i] for v in points) for i in range(3)]],'materials':[ob.data.materials[0].name for ob in obs]}
    stats.append(info);models.append((name,obs))

(OUT/'manifest-patch.json').write_text(json.dumps({'models':[{key:item[key] for key in ['id','file','triangles','meshes','bytes']} for item in stats],'source':'Original Blender opaque distant tree silhouettes; near models unchanged'},indent=2)+'\n')
(OUT/'geometry-validation.json').write_text(json.dumps({'models':stats,'limits':{'sourceTriangles':264,'textureCount':0,'sourceMeshes':2,'unchangedPlanting':True,'unchangedNearModels':True}},indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'solid-tree-lods.blend'))
print(json.dumps(stats),flush=True)
