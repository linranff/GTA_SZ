"""Independent CPU audit of delivered grassland buffers and planting masks.
Does not import the generator, Blender, city_mesh, or mutate runtime assets.
"""
from pathlib import Path
import json, math, hashlib, time
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, Point, box
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/city/grassland-v2-candidate';start=time.time()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def p(r):return shapely.make_valid(Polygon(r[0],r[1:]))
manifest=json.loads((OUT/'manifest.json').read_text());meadow=json.loads((OUT/'meadow.json').read_text())
city=json.loads((ROOT/'public/city/city.json').read_text());terrain=json.loads((ROOT/'public/city/terrain-detail.json').read_text());detail=json.loads((ROOT/'public/city/landmark-detail.json').read_text())
errors=[];checks={};source_ok=all(sha(ROOT/name)==value for name,value in manifest['sourceSha256'].items())
checks['sourceHashesUnchanged']=source_ok
if not source_ok:errors.append('Source city/DSM JSON changed')
checks['meadowSourcesMatchRelief']=meadow['sourceSHA']==manifest['sourceSha256']
raw=(OUT/manifest['mesh']).read_bytes();all_tri=[];all_pos=[];norm_error=0;spans=[]
for tile in manifest['tiles']:
    arr={}
    for k in ['positions','normals','indices']:
        s=tile[k];spans.append((s['offset'],s['offset']+s['bytes']))
        arr[k]=np.frombuffer(raw,dtype='<u4' if k=='indices' else '<f4',count=s['bytes']//4,offset=s['offset']).reshape(-1,3)
    pos=arr['positions'];ind=arr['indices'];normal=arr['normals']
    assert len(pos)==tile['vertexCount'] and len(ind)==tile['triangleCount']
    assert np.all(ind<len(pos)) and np.all(np.isfinite(pos))
    used=np.unique(ind)
    norm_error=max(norm_error,float(np.max(np.abs(np.linalg.norm(normal[used],axis=1)-1))))
    if np.any(normal[used,1]<=0):errors.append('Downward normal')
    bounds=[float(pos[:,0].min()),float(pos[:,2].min()),float(pos[:,0].max()),float(pos[:,2].max())]
    assert bounds==tile['bounds']
    all_pos.append(pos);all_tri.append(pos[ind].astype('float64'))
spans.sort();assert spans[0][0]==0 and spans[-1][1]==len(raw) and all(a[1]==b[0] for a,b in zip(spans,spans[1:]))
tri=np.concatenate(all_tri);pos=np.concatenate(all_pos);cross=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);slope=np.hypot(cross[:,0],cross[:,2])/cross[:,1]
checks.update({'bufferByteRangesComplete':True,'triangles':len(tri),'tiles':len(manifest['tiles']),'finitePositiveHeights':bool(np.isfinite(pos).all() and pos[:,1].min()>=0),'minimumTriangleArea':float(cross[:,1].min()/2),'maxSlopeDegrees':float(np.degrees(np.arctan(slope.max()))),'maximumNormalLengthError':norm_error,'meshSHA256':sha(OUT/'relief-mesh.bin'),'macroSHA256':sha(OUT/'ground-cover.png')})
if np.any(cross[:,1]<=0):errors.append('Downward or degenerate winding')
if len(tri)>200000 or len(manifest['tiles'])>=100:errors.append('Geometry budget exceeded')
if norm_error>1e-4 or slope.max()>.28:errors.append('Normals/slope budget exceeded')
if checks['meshSHA256']!=manifest['meshSha256'] or checks['meshSHA256']!=meadow['meshSHA']:errors.append('Mesh hash mismatch')
# All repeated float32 horizontal coordinates must have one exact Y, including
# batch seams. This is stricter than checking only each tile independently.
order=np.lexsort((pos[:,2],pos[:,0]));v=pos[order];same=np.all(v[1:,[0,2]]==v[:-1,[0,2]],axis=1)
seam_bad=int(np.count_nonzero(same&(v[1:,1]!=v[:-1,1])));checks['seamHeightDisagreements']=seam_bad
if seam_bad:errors.append('Height cracks at shared coordinates')
print('buffers validated',len(tri),flush=True)

# Independently reconstruct hard surfaces, including sidewalks (2.4 max versus
# the 2.8 authored clearance), monument bases and civic paved plaza.
land=shapely.union_all([p(r) for r in city['land']]);water=shapely.union_all([p(q['rings']) for q in city['water']])
roads=shapely.union_all([LineString(q['points']).buffer(q['width']/2+2.8,cap_style=2,join_style=2) for q in city['roads']])
buildings=shapely.union_all([p(q['rings']).buffer(3,join_style=2) for q in city['buildings']+detail.get('collisionFootprints',[])])
coast=shapely.union_all([LineString(q) for q in city['coast'] if len(q)>1])
g=terrain['grid'];dsm=box(g['x0'],g['z0'],g['x0']+(g['columns']-1)*g['dx'],g['z0']+(g['rows']-1)*g['dz'])
bases=[Point(q['x'],q['z']).buffer(q['excludeRadius']+3) for q in city['landmarks'] if q.get('excludeRadius',0)>0]
civic=next(q for q in city['landmarks'] if q['id']=='civic');bases.append(box(civic['x']-140.5,civic['z']-140.5,civic['x']+140.5,civic['z']-9.5))
protected=shapely.union_all([roads,buildings,water.buffer(6),coast.buffer(9),dsm.buffer(20,join_style=2),*bases])
triangle_polygons=shapely.polygons(tri[:,:,[0,2]])
# Full triangle-vs-protected geometry (not just vertices/centroids); 2 mm
# inward numerical tolerance is tiny relative to the actual 2.8–20m setbacks.
protected_inner=protected.buffer(-.002);shapely.prepare(protected_inner)
violations=shapely.intersects(protected_inner,triangle_polygons)
checks['fullTriangleProtectedIntersections']=int(violations.sum())
land_check=land.buffer(-1.998);shapely.prepare(land_check)
checks['fullTriangleOutsideLand']=int(np.count_nonzero(~shapely.covers(land_check,triangle_polygons)))
shapely.prepare(dsm);checks['trianglesOverDSM']=int(np.count_nonzero(shapely.intersects(dsm,triangle_polygons)))
mesh_union=shapely.union_all(triangle_polygons)
checks['meshOverlappingArea']=float(cross[:,1].sum()/2-mesh_union.area)
if checks['fullTriangleProtectedIntersections'] or checks['fullTriangleOutsideLand'] or checks['trianglesOverDSM']:errors.append('Protected/land geometry violation')
if abs(checks['meshOverlappingArea'])>.02:errors.append('Overlapping relief triangles')
checks['roadAndDSMHeightDeltaExactlyZero']=checks['fullTriangleProtectedIntersections']==0 and checks['trianglesOverDSM']==0
print('full triangle geometry validated',flush=True)

# A separately expanded obstacle union plus eroded outer land certifies each
# full circle. 2.905 is stricter than the requested 2.9; generation used 2.92.
# This catches wrong tile origins, channel order, unsafe points, and count/hash
# corruption in actual delivered binary files, independent of authoring cache.
radius=meadow['safeRadius'];forbidden_circle=protected.buffer(radius+.005);outer_circle=land.buffer(-(2+radius+.005));shapely.prepare(forbidden_circle);shapely.prepare(outer_circle)
assert (meadow['schemaVersion'],meadow['tileSize'],meadow['step'],meadow['gridSize'],meadow['stride'],radius)==(1,128,4,32,3,2.9)
assert meadow['channels']==['safe','soil','slopeDegreesX4']
unsafe=0;count=0;count_bad=0;hash_bad=0;all_xy=[];all_encoded_slope=[]
for t in meadow['tiles']:
    path=OUT/t['url'];data=path.read_bytes();a=np.frombuffer(data,dtype='uint8').reshape(32,32,3)
    assert len(data)==3072 and len(data)==t['bytes'];assert np.isin(a[:,:,0],[0,255]).all()
    selected=a[:,:,0]==255;r,c=np.where(selected);x=t['ix']*128+(c+.5)*4;z=t['iz']*128+(r+.5)*4
    eligible=shapely.contains_xy(outer_circle,x,z)&~shapely.intersects_xy(forbidden_circle,x,z)
    unsafe+=int(np.count_nonzero(~eligible));count+=len(r);count_bad+=int(len(r)!=t['count']);hash_bad+=int(sha(path)!=t['sha256'])
    all_xy.append(np.column_stack((x,z)));all_encoded_slope.append(a[r,c,2])
checks.update({'meadowSafeCells':count,'meadowFullCircleViolations':unsafe,'meadowTileCountMismatches':count_bad,'meadowTileHashMismatches':hash_bad,'circleProofRadius':radius,'independentObstacleExpansion':radius+.005,'meadowBinaryBytes':len(meadow['tiles'])*3072,'meadowSHA256':sha(OUT/'meadow.json')})
if unsafe or count_bad or hash_bad:errors.append('Meadow full-circle safety/count/hash violation')
print('meadow safety validated',count,flush=True)

# Exact slopes at a deterministic spatial sample of certified cells. Test all
# non-flat encoded cells plus a distributed flat sample; query a triangle tree.
xy=np.concatenate(all_xy);encoded=np.concatenate(all_encoded_slope);selection=np.where((encoded>0)|(np.arange(len(xy))%127==0))[0]
pts=shapely.points(xy[selection]);tree=shapely.STRtree(triangle_polygons);pairs=tree.query(pts,predicate='intersects');expected_min=np.full(len(selection),255,dtype='int16');expected_max=np.zeros(len(selection),dtype='int16')
for point_index,triangle_index in pairs.T:
    value=round(float(np.degrees(np.arctan(slope[triangle_index])))*4)
    expected_min[point_index]=min(expected_min[point_index],value);expected_max[point_index]=max(expected_max[point_index],value)
expected_min[expected_min==255]=0
# On an exact shared edge either adjacent face is a valid slope encoding.
slopediff=np.maximum(expected_min-encoded[selection].astype('int16'),encoded[selection].astype('int16')-expected_max)
checks['meadowSlopeSamples']=len(selection);checks['meadowSlopeEncodingMismatchesOverOneQuarterDegree']=int(np.count_nonzero(slopediff>1))
if checks['meadowSlopeEncodingMismatchesOverOneQuarterDegree']:errors.append('Meadow slope encoding disagreement')
rgba=np.asarray(Image.open(OUT/'ground-cover.png'));checks['macroRGBA8Shape']=list(rgba.shape)
assert rgba.shape==(1024,2048,4) and rgba.dtype==np.uint8
checks['macroSoilNonConstant']=bool(rgba[:,:,3].min()<rgba[:,:,3].max())
checks['originalDSMSHA256']=sha(ROOT/'public/city/terrain-detail.json')
report={'schemaVersion':1,'elapsedSeconds':round(time.time()-start,2),'checks':checks,'errors':errors,'scope':'CPU geometry, source invariance and mask contract; visual appearance and runtime performance require current GPU build.'}
(OUT/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
assert not errors,errors

# CPU-only scientific preview, deliberately labelled as geometry rather than a
# game screenshot. Profiles expose multiple peaks and non-negative hollows.
import os
os.environ.setdefault('MPLCONFIGDIR',str(OUT/'matplotlib-cache'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
cases=json.loads((OUT/'visual-cases.json').read_text())['cases']
fig,axes=plt.subplots(3,2,figsize=(13,12),layout='constrained')
for row,case in enumerate(cases):
    x0,z0,x1,z1=case['bounds'];margin=18;xx0,zz0,xx1,zz1=x0-margin,z0-margin,x1+margin,z1+margin
    subset=tri[(tri[:,:,0].max(axis=1)>xx0)&(tri[:,:,0].min(axis=1)<xx1)&(tri[:,:,2].max(axis=1)>zz0)&(tri[:,:,2].min(axis=1)<zz1)]
    q=subset.reshape(-1,3);idx=np.arange(len(q)).reshape(-1,3);ax=axes[row,0];ax.set_facecolor('#e5ead7')
    im=ax.tripcolor(q[:,0],q[:,2],idx,q[:,1],shading='gouraud',cmap='YlGn',vmin=0,vmax=2.4)
    lines=[r['points'] for r in city['roads'] if LineString(r['points']).intersects(box(xx0,zz0,xx1,zz1))]
    if lines:ax.add_collection(LineCollection(lines,colors='#8c929b',linewidths=2))
    ax.scatter(*case['compositionCenter'],marker='+',c='black');ax.set(xlim=(xx0,xx1),ylim=(zz0,zz1),title=case['id']+' / CPU height field',xlabel='game X',ylabel='game Z');ax.set_aspect('equal')
    profile=np.asarray(case['crossSection']);distance=np.sqrt(np.sum((profile[:,[0,2]]-profile[0,[0,2]])**2,axis=1))/.6
    axes[row,1].plot(distance,profile[:,1]/.6,color='#3c722c',lw=2);axes[row,1].fill_between(distance,profile[:,1]/.6,color='#8cba64',alpha=.4)
    axes[row,1].set(title='Exact rendered-triangle cross section',xlabel='distance / real metres',ylabel='added height / real metres',ylim=(0,4.1));axes[row,1].grid(alpha=.25)
fig.colorbar(im,ax=axes[:,0],label='added game height',shrink=.7);fig.suptitle('Grassland v2 — CPU geometry audit; visual/GPU validation pending')
fig.savefig(OUT/'height-study.png',dpi=145);plt.close(fig)
