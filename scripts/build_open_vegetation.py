"""Offline CC0 vegetation derivatives; writes only the dedicated candidate folder.

.venv/bin/python scripts/build_open_vegetation.py --prepare
blender -b --python scripts/build_open_vegetation.py
No city_mesh import, render, GPU, public asset or shared runtime edit.
"""
from pathlib import Path
import json,math,sys,hashlib,random,struct
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'artifacts/driving-experience-candidate/sources'
OUT=ROOT/'artifacts/driving-experience-candidate/vegetation'
TEX=OUT/'textures';TEX.mkdir(parents=True,exist_ok=True)

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def prepare():
 from PIL import Image,ImageFilter
 import numpy as np
 catalog=json.loads((SOURCE/'island-tree-files.json').read_text())
 entry=catalog['gltf']['1k']['gltf'];checks=[]
 for relative,meta in [('island_tree_03.gltf',entry),*entry['include'].items()]:
  path=SOURCE/'island-tree'/relative;data=path.read_bytes();actual=hashlib.md5(data).hexdigest()
  assert actual==meta['md5'],relative
  checks.append({'path':str(path.relative_to(ROOT)),'bytes':len(data),'md5':actual,'sha256':digest(path),'url':meta['url']})
 alpha=OUT/'island-leaves-alpha-source.png';meta=catalog['leaves_alpha']['1k']['png'];assert hashlib.md5(alpha.read_bytes()).hexdigest()==meta['md5']
 checks.append({'path':str(alpha.relative_to(ROOT)),'bytes':alpha.stat().st_size,'md5':meta['md5'],'sha256':digest(alpha),'url':meta['url']})
 (OUT/'source-checks.json').write_text(json.dumps(checks,indent=2)+'\n')
 src=SOURCE/'island-tree/textures'
 diffuse=Image.open(src/'island_tree_03_leaves_diff_1k.jpg').convert('RGBA');diffuse.putalpha(Image.open(alpha).convert('L'))
 normal=Image.open(src/'island_tree_03_leaves_nor_gl_1k.jpg').convert('RGB');arm=Image.open(src/'island_tree_03_leaves_arm_1k.jpg').convert('RGB')
 # Pack photographs of 8 actual leaves into 4 small branching sprays. All
 # albedo, normal and ARM samples undergo the same geometric transforms.
 boxes=[(0,0,163,532),(165,0,348,421),(352,0,508,402),(511,0,672,394),(677,0,836,475),(0,540,184,1024),(186,532,414,1024),(415,536,619,1024)]
 atlas=Image.new('RGBA',(1024,1024),(47,72,24,0));natlas=Image.new('RGB',(1024,1024),(128,128,255));oatlas=Image.new('RGB',(1024,1024),(230,196,0))
 rng=random.Random(20417)
 for tile in range(4):
  d=Image.new('RGBA',(512,512),(47,72,24,0));n=Image.new('RGB',(512,512),(128,128,255));o=Image.new('RGB',(512,512),(230,196,0))
  for branch in range(3):
   axis=(branch-1)*.62+rng.uniform(-.13,.13)
   for step in range(6):
    t=step/6;cy=429-t*311;cx=256+math.sin(axis)*t*242
    for side in [-1,1]:
     box=boxes[rng.randrange(len(boxes))];photo=diffuse.crop(box);photon=normal.crop(box);photoo=arm.crop(box)
     height=round(rng.uniform(77,116)*(1-.22*t));width=round(height*photo.width/photo.height);size=(width,height)
     photo=photo.resize(size,Image.Resampling.LANCZOS);photon=photon.resize(size,Image.Resampling.BILINEAR);photoo=photoo.resize(size,Image.Resampling.BILINEAR)
     angle=side*rng.uniform(34,66)-math.degrees(axis);theta=math.radians(angle)
     a=np.asarray(photon).astype(np.float32)/127.5-1;nx=a[:,:,0].copy();ny=a[:,:,1].copy();a[:,:,0]=nx*math.cos(theta)-ny*math.sin(theta);a[:,:,1]=nx*math.sin(theta)+ny*math.cos(theta)
     photon=Image.fromarray(np.clip((a+1)*127.5,0,255).astype('uint8'))
     photo=photo.rotate(angle,Image.Resampling.BICUBIC,expand=True);photon=photon.rotate(angle,Image.Resampling.BICUBIC,expand=True,fillcolor=(128,128,255));photoo=photoo.rotate(angle,Image.Resampling.BICUBIC,expand=True,fillcolor=(230,196,0))
     xy=(round(cx+side*31-photo.width/2),round(cy-photo.height*.7));mask=photo.getchannel('A')
     d.alpha_composite(photo,xy);n.paste(photon,xy,mask);o.paste(photoo,xy,mask)
  # Raise edge coverage smoothly before mip filtering, without binary squares.
  da=np.array(d);a=da[:,:,3].astype(np.float32)/255;da[:,:,3]=np.clip(a**.72*255,0,255).astype('uint8');d=Image.fromarray(da)
  xy=(tile%2*512,tile//2*512);atlas.alpha_composite(d,xy);natlas.paste(n,xy);oatlas.paste(o,xy)
 atlas.save(TEX/'island-leaf-clusters-color.png',optimize=True);natlas.save(TEX/'island-leaf-clusters-normal.png',optimize=True);oatlas.save(TEX/'island-leaf-clusters-orm.png',optimize=True)
 # Distant cards retain the same photographic silhouettes, with small edge
 # expansion and alpha coverage lift so minification does not erase the crown.
 far=atlas.copy();far.putalpha(atlas.getchannel('A').filter(ImageFilter.MaxFilter(3)).point(lambda v:round((v/255)**.62*255)))
 far.save(TEX/'island-leaf-clusters-color-distance.png',optimize=True)
 palm=OUT/'palm-source';im=Image.open(palm/'diffus.tga').convert('RGBA');im.save(TEX/'palm-color.png',optimize=True)
 far=im.copy();far.putalpha(im.getchannel('A').filter(ImageFilter.MaxFilter(3)).point(lambda v:round((v/255)**.7*255)));far.save(TEX/'palm-color-distance.png',optimize=True)
 Image.open(palm/'normal.tga').convert('RGB').save(TEX/'palm-normal.png',optimize=True)
 spec=np.asarray(Image.open(palm/'specular.tga').convert('RGB')).astype(float).mean(axis=2)/255
 orm=np.zeros((1024,1024,3),dtype='uint8');orm[:,:,0]=255;orm[:,:,1]=np.clip((.82-spec*.28)*255,0,255).astype('uint8');Image.fromarray(orm).save(TEX/'palm-orm.png',optimize=True)
 coverage={}
 for file in ['island-leaf-clusters-color.png','island-leaf-clusters-color-distance.png','palm-color.png','palm-color-distance.png']:
  im=Image.open(TEX/file);coverage[file]={str(size):float((np.array(im.resize((size,size),Image.Resampling.BOX).getchannel('A'))/255>.24).mean()) for size in [1024,256,64,16]}
 (OUT/'texture-coverage.json').write_text(json.dumps(coverage,indent=2)+'\n');print('Prepared photo-derived leaf clusters, original palm maps and checksums',flush=True)

def build():
 import bpy,numpy as np
 from mathutils import Vector
 bpy.ops.wm.read_factory_settings(use_empty=True)
 models=[]
 def tris(o):return sum(len(p.vertices)-2 for p in o.data.polygons)
 def bounds(objects):
  points=[v.co for obj in objects for v in obj.data.vertices];return {'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
 def photo_material(name,diffuse,normal,orm,leaf=False,far=False):
  m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=not leaf;m.surface_render_method='DITHERED';m['runtimeAlphaCutoff']=.24 if far else .30
  nodes=m.node_tree.nodes;links=m.node_tree.links;p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Roughness'].default_value=.76;p.inputs['Metallic'].default_value=0
  def image(path,space):
   n=nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(str(path),check_existing=True);n.image.colorspace_settings.name=space;return n
  d=image(diffuse,'sRGB');links.new(d.outputs['Color'],p.inputs['Base Color'])
  if leaf:links.new(d.outputs['Alpha'],p.inputs['Alpha'])
  n=image(normal,'Non-Color');nn=nodes.new('ShaderNodeNormalMap');nn.inputs['Strength'].default_value=.6;links.new(n.outputs['Color'],nn.inputs['Color']);links.new(nn.outputs['Normal'],p.inputs['Normal'])
  o=image(orm,'Non-Color');split=nodes.new('ShaderNodeSeparateColor');links.new(o.outputs['Color'],split.inputs['Color']);links.new(split.outputs['Green'],p.inputs['Roughness'])
  # glTF's recognized Occlusion socket keeps the source AO red channel.
  group=bpy.data.node_groups.get('glTF Material Output')
  if not group:group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
  g=nodes.new('ShaderNodeGroup');g.node_tree=group;links.new(split.outputs['Red'],g.inputs['Occlusion'])
  return m
 def reduce(obj,budget):
  count=tris(obj)
  if count>budget:
   bpy.context.view_layer.objects.active=obj;mod=obj.modifiers.new('Preserve silhouette within runtime budget','DECIMATE');mod.ratio=(budget-.5)/count;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
  # Thousands of disconnected source twig segments cannot collapse below one
  # primitive each. Retain complete components by surface area; fine twigs are
  # represented by the photographic leaf sprays instead of random face holes.
  if tris(obj)>budget:
   import bmesh
   parents=list(range(len(obj.data.vertices)))
   def find(x):
    while parents[x]!=x:parents[x]=parents[parents[x]];x=parents[x]
    return x
   for edge in obj.data.edges:a,b=edge.vertices;parents[find(b)]=find(a)
   groups={}
   for face in obj.data.polygons:groups.setdefault(find(face.vertices[0]),[]).append(face)
   ordered=sorted(groups.values(),key=lambda faces:sum(face.area for face in faces),reverse=True);kept=set();remaining=budget
   for group in ordered:
    size=sum(len(face.vertices)-2 for face in group)
    if size<=remaining:kept.update(face.index for face in group);remaining-=size
   bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[face for face in bm.faces if face.index not in kept],context='FACES');bm.to_mesh(obj.data);bm.free();obj.data.update()
 def export(name,objects,source,note):
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  p=OUT/(name+'.glb');bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_yup=True,export_materials='EXPORT',export_extras=True)
  # Blender 5 exports linked alpha as BLEND; these are foliage cutouts.
  raw=p.read_bytes();json_length=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+json_length]);material_report=[]
  for m in gltf.get('materials',[]):
   if 'foliage' in m['name']:m['alphaMode']='MASK';m['alphaCutoff']=.24 if name.endswith('-lod') else .30;m['doubleSided']=True
   elif m['name'].startswith('island_tree_03'):
    arm_info=m.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')
    if arm_info:m['occlusionTexture']=dict(arm_info)
   material_report.append({'name':m['name'],'alphaMode':m.get('alphaMode','OPAQUE'),'alphaCutoff':m.get('alphaCutoff'),'doubleSided':m.get('doubleSided',False),'baseColorTexture':m.get('pbrMetallicRoughness',{}).get('baseColorTexture'),'normalTexture':m.get('normalTexture'),'metallicRoughnessTexture':m.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture'),'occlusionTexture':m.get('occlusionTexture')})
  encoded=json.dumps(gltf,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);tail=raw[20+json_length:];p.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+tail)
  models.append({'id':name,'file':p.name,'triangles':sum(tris(o) for o in objects),'meshes':len(objects),'materials':material_report,'images':gltf.get('images',[]),'boundsBlender':bounds(objects),'bytes':p.stat().st_size,'sha256':digest(p),'source':source,'notes':note})
 bpy.ops.import_scene.gltf(filepath=str(SOURCE/'island-tree/island_tree_03.gltf'))
 obj=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 source_count=tris(obj);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
 source_objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];parts={}
 for o in source_objects:
  material=o.data.materials[o.data.polygons[0].material_index];key='leaves' if 'leaves' in material.name else 'branches' if 'branches' in material.name else 'trunk';parts[key]=o
 b=bounds(source_objects);scale=8/(b['max'][2]-b['min'][2]);low=[v.co.copy() for v in parts['trunk'].data.vertices if v.co.z<b['min'][2]+.035];pivot=Vector((sum(p.x for p in low)/len(low),sum(p.y for p in low)/len(low),b['min'][2]))
 for o in source_objects:
  for v in o.data.vertices:v.co=(v.co-pivot)*scale
 leaf=parts['leaves'];array=np.empty(len(leaf.data.vertices)*3,dtype=np.float32);leaf.data.vertices.foreach_get('co',array);all_leaf_points=array.reshape((-1,3));leaf_min=all_leaf_points.min(axis=0)-.06;leaf_max=all_leaf_points.max(axis=0)+.06;points=all_leaf_points[::8].copy();bpy.data.objects.remove(leaf,do_unlink=True)
 def clustered(target):
  lo=.01;hi=1.5;unique=inverse=None
  for _ in range(15):
   cell=(lo+hi)/2;keys=np.floor(points/cell).astype(np.int32);unique,inverse=np.unique(keys,axis=0,return_inverse=True)
   if len(unique)>target:lo=cell
   else:hi=cell
  keys=np.floor(points/hi).astype(np.int32);unique,inverse=np.unique(keys,axis=0,return_inverse=True);counts=np.bincount(inverse);centres=np.column_stack([np.bincount(inverse,weights=points[:,axis])/counts for axis in range(3)])
  return centres,hi
 def cards(name,target,far):
  centres,cell=clustered(target);rng=random.Random(8219);verts=[];faces=[];uvs=[]
  for i,centre in enumerate(centres):
   # Independent small sprays follow the occupied crown volume. No paired
   # giant X cards and no removal of a whole crown region at lower LOD.
   yaw=rng.random()*math.tau;pitch=rng.uniform(-.62,.62);right=Vector((math.cos(yaw),math.sin(yaw),0));up=Vector((-math.sin(yaw)*math.sin(pitch),math.cos(yaw)*math.sin(pitch),math.cos(pitch)));c=Vector(centre)
   size=cell*(2.45 if far else 2.05)*rng.uniform(.91,1.12);w=size*.91;h=size;start=len(verts)
   corners=[c-right*w/2-up*h/2,c+right*w/2-up*h/2,c+right*w/2+up*h/2,c-right*w/2+up*h/2]
   verts.extend([Vector(tuple(max(float(leaf_min[a]),min(float(leaf_max[a]),p[a])) for a in range(3))) for p in corners]);faces.append((start,start+1,start+2,start+3));q=i%4;u=q%2*.5;v=q//2*.5;uvs.extend([(u+.002,v+.002),(u+.498,v+.002),(u+.498,v+.498),(u+.002,v+.498)])
  mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob);uv=mesh.uv_layers.new(name='UVMap')
  for polygon in mesh.polygons:
   for loop in polygon.loop_indices:uv.data[loop].uv=uvs[mesh.loops[loop].vertex_index]
  mat=photo_material('open_island_foliage'+('_distance' if far else ''),TEX/('island-leaf-clusters-color-distance.png' if far else 'island-leaf-clusters-color.png'),TEX/'island-leaf-clusters-normal.png',TEX/'island-leaf-clusters-orm.png',True,far);mesh.materials.append(mat)
  return ob,{'clusterCards':len(centres),'voxelCellMetres':cell,'sourceCanopySamplePoints':len(points),'alphaCutoff':.24 if far else .30}
 masters=[parts['trunk'],parts['branches']]
 for far in [False,True]:
  objects=[]
  for master,key,budget in [(parts['trunk'],'trunk',180 if far else 1000),(parts['branches'],'branches',250 if far else 1600)]:
   ob=master.copy();ob.data=master.data.copy();bpy.context.collection.objects.link(ob);ob.name='open_island_'+key+('_distance' if far else '');reduce(ob,budget);objects.append(ob)
  leaves,notes=cards('open_island_leaves'+('_distance' if far else ''),700 if far else 4000,far);objects.append(leaves)
  export('island-tree-lod' if far else 'island-tree',objects,'Poly Haven island_tree_03',notes)
  assert models[-1]['triangles']<=(2000 if far else 12000)
  for ob in objects:bpy.data.objects.remove(ob,do_unlink=True)
 for ob in masters:bpy.data.objects.remove(ob,do_unlink=True)
 bpy.ops.wm.obj_import(filepath=str(OUT/'palm-source/palm_tree.obj'),forward_axis='NEGATIVE_Z',up_axis='Y')
 palm=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=palm;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 b=bounds([palm]);scale=8/(b['max'][2]-b['min'][2]);ground=b['min'][2]
 for v in palm.data.vertices:v.co=Vector((v.co.x*scale,v.co.y*scale,(v.co.z-ground)*scale))
 palm_source_triangles=tris(palm)
 for far in [False,True]:
  ob=palm.copy();ob.data=palm.data.copy();bpy.context.collection.objects.link(ob);ob.name='open_palm'+('_distance' if far else '');ob.data.materials.clear();ob.data.materials.append(photo_material('open_palm_foliage'+('_distance' if far else ''),TEX/('palm-color-distance.png' if far else 'palm-color.png'),TEX/'palm-normal.png',TEX/'palm-orm.png',True,far))
  for polygon in ob.data.polygons:polygon.material_index=0
  # Keep the source's already-small fronds intact at both distances.
  export('palm-lod' if far else 'palm',[ob],'Yughues / Nobiax palm tree v2',{'sourceGeometryRetained':True,'alphaCutoff':.24 if far else .30,'roughness':'derived from source specular; AO=1, metal=0'})
  assert models[-1]['triangles']<=2200
  bpy.data.objects.remove(ob,do_unlink=True)
 report={'models':models,'sources':{'islandTree':{'license':'CC0','url':'https://polyhaven.com/a/island_tree_03','authors':['Rico Cilliers','Rob Tuytel'],'sourceTrianglesMeasured':source_count,'sourceChecks':'source-checks.json','leafMethod':'Original photographed leaves grouped into small sprays; crown cards located in occupied source canopy voxels. Original wood UV and PBR maps retained. Tiny disconnected twig components ranked by surface area after decimation.','treeType':'Windswept coastal tree with asymmetric crown; needs approximately 7m root-to-crown clearance at this height, not a narrow-street drop-in.'},'palm':{'license':'CC0','url':'https://opengameart.org/content/palm-tree-v2','author':'Yughues / Nobiax','readme':'palm-source/readme.txt','sourceTrianglesMeasured':palm_source_triangles,'sourceArchiveSha256':digest(SOURCE/'palm-tree-v2.7z'),'normalConvention':'Original normal channels retained; source does not explicitly label DX/GL.'}},'heightMetres':8,'coordinates':'Blender Z-up, GLB Y-up; ground at 0; preserve existing landscape import root handling','runtime':{'preserveSourceMaterials':True,'alphaMode':'MASK required for foliage','alphaCutoffNear':.30,'alphaCutoffFar':.24,'twoSided':True,'nearTreeRecommendedCap':24,'sharedTextures':True,'normalAndORMColorSpace':'linear','albedoColorSpace':'sRGB','distanceCoverage':'dedicated softly dilated photo alpha; see texture-coverage.json; browser minification review pending'},'validation':{'blenderBuild':'completed, no render','browserVisual':'pending','performance':'not measured'}}
 (OUT/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':
 if '--prepare' in sys.argv:prepare()
 else:build()
