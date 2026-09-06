"""Pinned Copernicus DSM ridges and broad park slopes; no base asset rebuild.

DSM is a surface model. Opening/smoothing suppresses isolated roofs/trees but
is not a surveyed DTM. Motor roads, buildings and existing Lianhua terrain stay flat
or keep their authored elevation. North terrain is distant, non-playable context.
"""
from pathlib import Path
import json,hashlib,math,sys
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import reproject,Resampling
from scipy.ndimage import grey_opening,gaussian_filter,distance_transform_edt,minimum_filter
import shapely
from shapely.geometry import Polygon,LineString,box,Point,mapping
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/city/mountain-relief';OUT.mkdir(parents=True,exist_ok=True)
c=json.loads((ROOT/'public/city/city.json').read_text());detail=json.loads((ROOT/'public/city/landmark-detail.json').read_text());lt=json.loads((ROOT/'public/city/terrain-detail.json').read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def poly(r):return shapely.make_valid(Polygon(r[0],r[1:]))
near='--near' in sys.argv
step=12. if near else 36.;x0=-6804.;z0=-2628.;x1=6804.;z1=2628. if near else 9000.;cols=int((x1-x0)/step)+1;rows=int((z1-z0)/step)+1
xs=x0+np.arange(cols)*step;zs=z0+np.arange(rows)*step;xx,zz=np.meshgrid(xs,zs)
# Rasterize node-centered samples in a north-up grid; invert rows for game Z.
transform=from_origin(x0-step/2,z1+step/2,step,step)
def mask(geometry):return rasterize([(mapping(geometry),1)],out_shape=(rows,cols),transform=transform,dtype='uint8')[::-1].astype(bool)
land=shapely.union_all([poly(r) for r in c['land']]);green=shapely.union_all([poly(p['rings']) for p in c['green']]);water=shapely.union_all([poly(p['rings']) for p in c['water']])
roads=shapely.union_all([LineString(r['points']).buffer(r['width']/2+step*1.5,cap_style=2) for r in c['roads'] if len(r['points'])>1 and r['kind'] not in ['footway','cycleway','path','steps','pedestrian','track']])
buildings=shapely.union_all([poly(p['rings']).buffer(step*1.5,join_style=2) for p in c['buildings']+detail.get('collisionFootprints',[])])
g=lt['grid'];preserve=[g['x0'],g['z0'],g['x0']+(g['columns']-1)*g['dx'],g['z0']+(g['rows']-1)*g['dz']]
reserved=shapely.union_all([roads,buildings,water.buffer(50),box(*preserve).buffer(50),*[(Point(m['x'],m['z']).buffer(max(40,m.get('excludeRadius',0)+36))) for m in c['landmarks'] if m['id']!='lianhua']])
citygreen=green.intersection(land).difference(reserved);north=box(c['meta']['extent'][0]+step,c['meta']['extent'][3],c['meta']['extent'][2]-step,9000-step)
safe=mask((citygreen if near else north).difference(reserved));safe=minimum_filter(safe,size=3 if not near else 1)
print('Sample cached DSM',cols,rows,flush=True)
height=np.zeros((rows,cols),np.float32);sources=[]
# Destination CRS is WGS84, but grid aligns exactly to the game's local metres.
geotransform=from_origin((x0-step/2)/61710+114.025,(z1+step/2)/66792+22.536,step/61710,step/66792)
for lon in [113,114]:
 p=ROOT/f'data/raw/landmarks/Copernicus_DSM_COG_10_N22_00_E{lon}_00_DEM.tif';meta=json.loads(p.with_suffix('.manifest.json').read_text());assert digest(p)==meta['sha256']
 sample=np.zeros_like(height)
 with rasterio.open(p) as ds:reproject(rasterio.band(ds,1),sample,src_transform=ds.transform,src_crs=ds.crs,dst_transform=geotransform,dst_crs='EPSG:4326',resampling=Resampling.bilinear,dst_nodata=0)
 height=np.maximum(height,sample[::-1]);sources.append(meta)
# A 3-node opening removes compact surface spikes; 36m game nodes = 60m real.
height=gaussian_filter(grey_opening(height,size=(3,3)),.8)
distance=distance_transform_edt(safe)*step
# Subtract the flattened city datum; blend measured ridges to reserved flat corridors.
relief=np.maximum(0,height-20)*.60
blend=np.minimum(1,distance/(90 if near else 180));blend=blend*blend*(3-2*blend)
relief*=blend
# Broad, low authored lawns fill non-mountain interiors, distinct from survey data.
lawn=(.65+.55*np.sin(xx/145+np.sin(zz/260))+.35*np.cos(zz/110-xx/310))
lawn=np.maximum(0,lawn)*np.minimum(1,distance/85)**2
relief=np.maximum(relief,lawn)*safe
# Fold earlier art-directed lawn mounds into this grid, instead of rendering a
# second, differently triangulated surface over the mountain slopes.
if near:
 oldmeta=json.loads((ROOT/'public/city/ground-relief/manifest.json').read_text());packed=(ROOT/'public/city/ground-relief'/oldmeta['mesh']).read_bytes();old=np.zeros_like(relief)
 for tile in oldmeta['tiles']:
  a=tile['positions'];p=np.frombuffer(packed,dtype='<f4',count=a['bytes']//4,offset=a['offset']).reshape(-1,3);a=tile['indices'];indices=np.frombuffer(packed,dtype='<u4',count=a['bytes']//4,offset=a['offset']).reshape(-1,3)
  for tri in indices:
   (ax,ay,az),(bx,by,bz),(cx,cy,cz)=p[tri];denom=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz)
   if abs(denom)<1e-8:continue
   i0=max(0,math.ceil((min(ax,bx,cx)-x0)/step));i1=min(cols-1,math.floor((max(ax,bx,cx)-x0)/step));j0=max(0,math.ceil((min(az,bz,cz)-z0)/step));j1=min(rows-1,math.floor((max(az,bz,cz)-z0)/step))
   for j in range(j0,j1+1):
    for i in range(i0,i1+1):
     u=((bz-cz)*(xs[i]-cx)+(cx-bx)*(zs[j]-cz))/denom;v=((cz-az)*(xs[i]-cx)+(ax-cx)*(zs[j]-cz))/denom;w=1-u-v
     if min(u,v,w)>=-1e-5:old[j,i]=max(old[j,i],ay*u+by*v+cy*w)
 relief+=old*safe*blend
# Gentle skirt at map perimeter and safe edge; no vertical floating cutouts.
relief=np.minimum(relief,np.maximum(0,distance-step)*.48)
relief[relief<.08]=0
heights=relief.astype('<f4');(OUT/('near-heights.bin' if near else 'heights.bin')).write_bytes(heights.tobytes())
# Tile mesh counts use the same cell activation as the runtime and sampler.
active=np.maximum.reduce([relief[:-1,:-1],relief[:-1,1:],relief[1:,:-1],relief[1:,1:]])>.0
tiles=[];tilecells=96 if near else 48
for j in range(0,rows-1,tilecells):
 for i in range(0,cols-1,tilecells):
  nx=min(tilecells,cols-1-i);nz=min(tilecells,rows-1-j);count=int(active[j:j+nz,i:i+nx].sum())
  if count:tiles.append({'id':f'{i}-{j}','column':i,'row':j,'columns':nx+1,'rows':nz+1,'triangles':count*2})
triangles=sum(t['triangles'] for t in tiles);assert triangles<260000
# Record named park observations, including unraised sites; no guessed survey labels.
places=[]
for p in c['green']:
 if not p.get('name') or not any(w in p['name'] for w in ['山','梅林']):continue
 region=mask(poly(p['rings']));valid=relief*region;k=int(np.argmax(valid));j,i=np.unravel_index(k,valid.shape)
 if valid[j,i]>3:places.append({'name':p['name'],'peakGameHeight':round(float(valid[j,i]),2),'x':float(xs[i]),'z':float(zs[j]),'source':'filtered 30m DSM; flattened-edge adaptation'})
peaks=[]
for a,b,name in [(-3600,600,'北侧西部山脊'),(600,3800,'北侧中部山脊'),(3800,6700,'北侧东部山脊')]:
 area=(xx>=a)&(xx<=b)&(zz>c['meta']['extent'][3]);k=int(np.argmax(relief*area));j,i=np.unravel_index(k,relief.shape);peaks.append({'name':name,'x':float(xs[i]),'z':float(zs[j]),'peakGameHeight':round(float(relief[j,i]),2)})
manifest={'schemaVersion':1,'file':'near-heights.bin' if near else 'heights.bin','grid':{'x0':x0,'z0':z0,'step':step,'columns':cols,'rows':rows},'tiles':tiles,'surfaceOffset':.04,'preservedTerrainBounds':preserve,'sources':sources,'inputs':{p:digest(ROOT/p) for p in ['public/city/city.json','public/city/landmark-detail.json','public/city/terrain-detail.json']},'places':places,'ridgeSamples':[] if near else peaks,'budgets':{'triangles':triangles,'tiles':len(tiles),'bytes':heights.nbytes,'maxHeight':round(float(relief.max()),3)},'method':{'nativeResolutionMetres':30,'meshSpacingRealMetres':step/.6,'verticalScale':.6,'datumRemovalMetres':20,'surfaceSpikeOpeningNodes':3,'gaussianSigmaNodes':.8,'roadBuildingReserveGameMetres':step*1.5,'edgeBlendGameMetres':90 if near else 180,'lawnHeight':'authored broad slopes, not measured','north':'distant terrain only; original driving extent unchanged'},'limitations':['DSM surface heights and smoothing are not surveyed bare-earth ground.','Motor roads and building bases retain original flattened elevation; park paths follow slopes.','Existing Lianhua terrain is preserved.','Northern backdrop has terrain only; buildings and roads beyond the playable study area are not reconstructed.']}
if near:
 manifest['method']['legacyLawnMerge']='Previous authored lawn mounds are resampled and edge-blended into this same height grid; no stacked relief mesh.'
 for p in ['public/city/ground-relief/manifest.json','public/city/ground-relief/'+oldmeta['mesh']]:manifest['inputs'][p]=digest(ROOT/p)
(OUT/('near-manifest.json' if near else 'manifest.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'budgets':manifest['budgets'],'parks':places,'ridges':peaks},ensure_ascii=False),flush=True)
