"""Run with Blender --background --factory-startup --python scripts/blender_guides.py.

This is an editable, non-rendering geographic guide file, not a modeled city.
It intentionally creates zero building meshes or placeholder buildings.
"""
import json
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
payload = json.loads((ROOT/'artifacts/blender_map_guides.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1.0
scene['georeference']=json.dumps({k:v for k,v in payload.items() if k!='features'},ensure_ascii=False)
scene['stage']='Geographic reference only; architectural assets have not been modeled.'
COLORS={'roads':(.65,.73,.77,1),'coastline':(.2,.8,.7,1),'buildings':(.9,.65,.35,1),'green':(.25,.6,.3,1),'pilot':(1,.85,.15,1)}
collections={}
for name in COLORS:
    c=bpy.data.collections.new('REFERENCE_'+name)
    scene.collection.children.link(c)
    c.hide_render=True
    collections[name]=c

def lines(geometry):
    t=geometry['type']; coords=geometry.get('coordinates')
    if t=='LineString':
        yield coords,False
    elif t=='MultiLineString':
        for line in coords: yield line,False
    elif t=='Polygon':
        for ring in coords: yield ring,True
    elif t=='MultiPolygon':
        for polygon in coords:
            for ring in polygon: yield ring,True
    elif t=='GeometryCollection':
        for g in geometry['geometries']: yield from lines(g)

for f in payload['features']:
    curve=bpy.data.curves.new(f['id'],'CURVE')
    curve.dimensions='3D'
    for points,closed in lines(f['geometry']):
        if closed and points[0]==points[-1]: points=points[:-1]
        if len(points)<2: continue
        spline=curve.splines.new('POLY')
        spline.points.add(len(points)-1)
        for p,xy in zip(spline.points,points): p.co=(xy[0],xy[1],0,1)
        spline.use_cyclic_u=closed
    if not len(curve.splines):
        bpy.data.curves.remove(curve)
        continue
    obj=bpy.data.objects.new(f"{f['id']} {f['name']}",curve)
    collections[f['layer']].objects.link(obj)
    obj.color=COLORS[f['layer']]
    obj.hide_render=True
    obj['osm_id']=f['id']
    obj['source_tags']=json.dumps(f['tags'],ensure_ascii=False)
    obj['accuracy']='OSM-derived XY; flat reference Z, not surveyed elevation'
    if f['layer']=='buildings': obj['model_status']='outline_only; facade reference required'

text=bpy.data.texts.new('READ_ME_FIRST')
text.write('深城纪 / 深圳湾地理定位参考\n\n这些是非渲染的地图参考线，不是建筑模型。\n'
           '没有生成方块建筑，没有猜测高度。后续精细模型依据此文件定位。\n'
           'Blender X=东，Y=北，Z=上；单位米；Z=0仅为参考平面。\n'
           'OSM：© OpenStreetMap contributors，ODbL 1.0\nhttps://www.openstreetmap.org/copyright\n\n'
           +json.dumps({k:v for k,v in payload.items() if k!='features'},ensure_ascii=False,indent=2))
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            space.clip_end=50000
            space.shading.color_type='OBJECT'
            space.region_3d.view_distance=8500
            space.region_3d.view_rotation=(1,0,0,0)
            space.region_3d.view_perspective='ORTHO'
output=ROOT/'artifacts/shenzhen_bay_georeference.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(output))
stats={'blender_version':bpy.app.version_string,'objects':len(scene.objects),
       'mesh_objects':sum(o.type=='MESH' for o in scene.objects),
       'collections':{k:len(v.objects) for k,v in collections.items()},'file':str(output)}
(ROOT/'artifacts/blender_guides_report.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2))
print(json.dumps(stats,ensure_ascii=False))
