"""Read-only source checks; write a conservative vegetation replacement allowlist.

Run with .venv/bin/python scripts/qualify_open_vegetation.py.
No city_mesh import, placement change, public write, browser or render.
"""
from pathlib import Path
import hashlib,json,math,struct,collections
import numpy as np
import shapely
from shapely.geometry import Polygon,Point,LineString,box
from shapely.strtree import STRtree

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/driving-experience-candidate/vegetation'
FILES={'planting':ROOT/'public/city/landscape/planting.json','city':ROOT/'public/city/city.json','landmarkDetail':ROOT/'public/city/landmark-detail.json','candidateManifest':OUT/'manifest.json'}
inputs={key:{'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size} for key,path in FILES.items()}
planting=json.loads(FILES['planting'].read_text());city=json.loads(FILES['city'].read_text());detail=json.loads(FILES['landmarkDetail'].read_text())

def model_radius(name):
 path=OUT/(name+'.glb');raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+length]);binary=raw[28+length:];radius=0.;extreme=None;vertices=0
 def node_matrix(node):
  if 'matrix' in node:return np.array(node['matrix']).reshape((4,4),order='F')
  x,y,z,w=node.get('rotation',[0,0,0,1]);rot=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w,0],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w,0],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y,0],[0,0,0,1]],dtype=float);rot[:3,:3]*=np.array(node.get('scale',[1,1,1]))[None,:];rot[:3,3]=node.get('translation',[0,0,0]);return rot
 def visit(index,parent):
  nonlocal radius,extreme,vertices
  node=j['nodes'][index];world=parent@node_matrix(node)
  if 'mesh' in node:
   for primitive in j['meshes'][node['mesh']]['primitives']:
    a=j['accessors'][primitive['attributes']['POSITION']];v=j['bufferViews'][a['bufferView']];assert a['componentType']==5126 and a['type']=='VEC3' and 'byteStride' not in v
    p=np.frombuffer(binary,dtype='<f4',count=a['count']*3,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape((-1,3)).astype(float);p=p@world[:3,:3].T+world[:3,3];assert np.isfinite(p).all();vertices+=len(p);dist=np.hypot(p[:,0],p[:,2]);k=int(dist.argmax())
    if dist[k]>radius:radius=float(dist[k]);extreme=p[k].tolist()
  for child in node.get('children',[]):visit(child,world)
 for index in j['scenes'][j.get('scene',0)]['nodes']:visit(index,np.eye(4))
 return {'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'worldSpaceVerticesChecked':vertices,'maxHorizontalRadius':radius,'extremeVertexGltf':extreme}

models={name:model_radius(name) for name in ['island-tree','island-tree-lod','palm','palm-lod']}
# Round outward, never down. The radius includes every near/far triangle under
# any planting yaw: a triangle's norm cannot exceed its farthest vertex norm.
radii={'island':math.ceil(max(7,models['island-tree']['maxHorizontalRadius'],models['island-tree-lod']['maxHorizontalRadius'])*1000)/1000,'palm':math.ceil(max(1.8,models['palm']['maxHorizontalRadius'],models['palm-lod']['maxHorizontalRadius'])*1000)/1000}
assert radii['island']>=max(models[k]['maxHorizontalRadius'] for k in ['island-tree','island-tree-lod'])
assert radii['palm']>=max(models[k]['maxHorizontalRadius'] for k in ['palm','palm-lod'])

def polygon(rings):return shapely.make_valid(Polygon(rings[0],rings[1:]))
land=shapely.union_all([polygon(rings) for rings in city['land']]);water=shapely.union_all([polygon(p['rings']) for p in city['water']]);green=shapely.union_all([polygon(p['rings']) for p in city['green']]);land_edge=land.boundary;green_edge=green.boundary
building_data=city['buildings']+detail.get('collisionFootprints',[]);buildings=[polygon(b['rings']) for b in building_data];building_index=STRtree(buildings)
roads=[LineString(r['points']) for r in city['roads']];road_index=STRtree(roads);half_widths=[r['width']/2 for r in city['roads']];max_half=max(half_widths)
for g in [land,water,green]:shapely.prepare(g)
spawn=city['spawn'];epsilon=1e-7;records=[];rejected=[];by_type={str(i):{'sourceCount':0,'eligibleCount':0,'rejectedCount':0,'rejectionReasons':collections.Counter()} for i in range(3)}

def road_clearance(point,radius):
 # First nearest centreline establishes an upper bound. Any road that can
 # beat it must have its centreline within upperBound + largest half-width.
 nearest=int(road_index.nearest(point));best=point.distance(roads[nearest])-half_widths[nearest];reach=max(radius,best)+max_half+epsilon
 for index in road_index.query(box(point.x-reach,point.y-reach,point.x+reach,point.y+reach)):
  index=int(index);clearance=point.distance(roads[index])-half_widths[index]
  if clearance<best:best=clearance;nearest=index
 return float(best),nearest

for index,p in enumerate(planting['trees']):
 x,z,kind,scale,yaw=p;kind=int(kind);stat=by_type[str(kind)];stat['sourceCount']+=1;model='palm' if kind==1 else 'island';required=radii[model]*scale+.8;point=Point(x,z);reasons=[]
 assert scale>0 and math.isfinite(required)
 road_gap,road_id=road_clearance(point,required);building_id=int(building_index.nearest(point));building_gap=float(point.distance(buildings[building_id]));water_gap=float(point.distance(water));inside_land=land.covers(point);land_gap=float(point.distance(land_edge)) if inside_land else 0.;inside_green=green.covers(point);green_gap=float(point.distance(green_edge)) if inside_green else 0.
 if road_gap<required+epsilon:reasons.append('road-clearance')
 if building_gap<required+epsilon:reasons.append('building-clearance')
 if water_gap<required+epsilon:reasons.append('water-clearance')
 if not inside_land or land_gap<required+epsilon:reasons.append('land-boundary-clearance')
 if kind in [0,2]:
  if not inside_green:reasons.append('outside-green')
  elif green_gap<required+epsilon:reasons.append('green-boundary-clearance')
 clearances={'roadEdge':road_gap,'building':building_gap,'water':water_gap,'landBoundary':land_gap}
 if kind in [0,2]:clearances['greenBoundary']=green_gap
 if reasons:
  stat['rejectedCount']+=1;stat['rejectionReasons'].update(reasons);rejected.append({'index':index,'type':kind,'reasons':reasons})
 else:
  stat['eligibleCount']+=1;line=roads[road_id];road_point=line.interpolate(line.project(point));records.append({'index':index,'type':kind,'model':model,'position':[x,z],'scale':scale,'yaw':yaw,'requiredRadius':required,'minimumSlack':min(clearances.values())-required,'clearanceMetres':clearances,'distanceFromSpawn':math.hypot(x-spawn['x'],z-spawn['z']),'nearestRoad':{'id':city['roads'][road_id]['id'],'name':city['roads'][road_id]['name'],'position':[road_point.x,road_point.y],'edgeDistance':road_gap},'nearestBuildingId':building_data[building_id]['id']})

island=[r['index'] for r in records if r['model']=='island'];palms=[r['index'] for r in records if r['model']=='palm'];nearest={}
for key,predicate in [('all',lambda r:True),('island',lambda r:r['model']=='island'),('palm',lambda r:r['model']=='palm'),('type0',lambda r:r['type']==0),('type2',lambda r:r['type']==2)]:
 nearest[key]=[]
 for r in sorted(filter(predicate,records),key=lambda r:r['distanceFromSpawn'])[:8]:
  nearest[key].append({key:r[key] for key in ['index','type','model','position','scale','distanceFromSpawn','requiredRadius','minimumSlack','nearestRoad'] }|{'suggestedObservation':{'roadPosition':r['nearestRoad']['position'],'cameraHeightAboveTerrain':1.65,'targetPosition':r['position'],'targetHeightAboveTerrain':4*r['scale'],'treeHeightApprox':8*r['scale'],'note':'Road-centre observation location; root should add current terrain height and choose camera angle in browser.'}})

sources_unchanged=all(hashlib.sha256(FILES[key].read_bytes()).hexdigest()==value['sha256'] for key,value in inputs.items());assert sources_unchanged,'Source changed during audit; rerun on final files'
report={'schemaVersion':1,'eligibleIndices':{'islandTree':island,'palm':palms},'counts':{'source':len(planting['trees']),'eligible':len(records),'rejected':len(rejected),'rejectionReasonCountsAreNonExclusive':True,'byType':by_type},'sourceFiles':inputs,'candidateModels':models,'criteria':{'baseRadiusMetres':radii,'formula':'requiredRadius = max near/far actual horizontal vertex radius, rounded outward to 1mm, times existing planting scale + 0.8m','rotationProof':'A circle around the unchanged planting root encloses every mesh vertex and triangle for every yaw; the GLB import Z reflection preserves radius.','obstacleProof':'Use exact point-to-geometry distance comparisons, not an inscribed polygon approximation of the crown circle.','roads':'All 12,202 city roads; exact distance to centreline minus road width/2, including a conservative round cap at segment ends. All grades included.','buildings':'All base-city building polygons plus current landmark-detail collision footprints. Keeping excluded base footprints is conservative.','waterAndLand':'Every eligible crown and 0.8m margin lies within land and outside water polygons.','broadleafGreen':'Types 0/2: require the entire crown and margin to fit inside the union of green polygons, a conservative interpretation of within green space.','palmGreen':'Type1: green containment is not required; road/building/water/land checks still apply.','treeSpacing':'No tree-tree overlap requirement; existing planting positions, types, scales and yaw remain unchanged.','eligibilityVersionGuard':'Apply indices only while planting.json SHA256 matches this report. Re-run on model or source map changes.'},'spawn':spawn,'recommendedObservationPoints':nearest,'eligibleDetails':records,'rejected':rejected,'validation':{'allEligibleHaveNonnegativeClearanceSlack':all(r['minimumSlack']>=epsilon for r in records),'sourceFilesUnchangedThroughoutAudit':sources_unchanged,'noPublicFilesWritten':True,'browserVisual':'not run','performance':'not measured'}}
out=OUT/'eligible-planting.json';temporary=out.with_suffix('.json.tmp');temporary.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');temporary.replace(out)
print(json.dumps({'output':str(out.relative_to(ROOT)),'baseRadii':radii,'counts':report['counts'],'minimumEligibleSlack':min((r['minimumSlack'] for r in records),default=None),'nearest':{key:values[:2] for key,values in nearest.items()}},ensure_ascii=False,indent=2))
assert report['validation']['allEligibleHaveNonnegativeClearanceSlack']
