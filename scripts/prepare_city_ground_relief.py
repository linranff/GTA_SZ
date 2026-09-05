"""CPU-only art-directed microrelief and ground-cover colour field.

Writes candidates only. Roads, buildings, mapped water and the existing Lianhua
DSM patch are immutable exclusion zones. This is landscape art, not elevation
survey data. Each height query will use the exact same triangles as rendering.
"""
from pathlib import Path
import json,math,hashlib,struct,time
import numpy as np
import shapely
from shapely.geometry import Polygon,LineString,Point,box
from shapely.strtree import STRtree
from PIL import Image,ImageDraw,ImageFilter

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/city/ground-relief-candidate';OUT.mkdir(exist_ok=True)
city=json.loads((ROOT/'public/city/city.json').read_text())
terrain=json.loads((ROOT/'public/city/terrain-detail.json').read_text())
detail=json.loads((ROOT/'public/city/landmark-detail.json').read_text())
def poly(rings):return shapely.make_valid(Polygon(rings[0],rings[1:]))
def polys(g):
 if g.geom_type=='Polygon':yield g
 elif hasattr(g,'geoms'):
  for child in g.geoms:yield from polys(child)
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def hash2(x,z):
 v=math.sin(x*127.1+z*311.7)*43758.5453123;return v-math.floor(v)
def noise(x,z):
 i,j=math.floor(x),math.floor(z);u,v=x-i,z-j;u=u*u*(3-2*u);v=v*v*(3-2*v)
 return (hash2(i,j)*(1-u)+hash2(i+1,j)*u)*(1-v)+(hash2(i,j+1)*(1-u)+hash2(i+1,j+1)*u)*v

started=time.time()
land=shapely.union_all([poly(r) for r in city['land']]);water=shapely.union_all([poly(p['rings']) for p in city['water']]);green=shapely.union_all([poly(p['rings']) for p in city['green']]).intersection(land)
roads=[LineString(r['points']).buffer(r['width']/2+2.8,cap_style=2,join_style=2) for r in city['roads']]
buildings=[poly(p['rings']).buffer(3.0,join_style=2) for p in city['buildings']]
buildings.extend(poly(p['rings']).buffer(3.0,join_style=2) for p in detail.get('collisionFootprints',[]))
g=terrain['grid'];preserve=[g['x0'],g['z0'],g['x0']+(g['columns']-1)*g['dx'],g['z0']+(g['rows']-1)*g['dz']]
protectedDSM=box(*preserve).buffer(20,join_style=2)
coast=shapely.union_all([LineString(r) for r in city['coast'] if len(r)>1])
protected=shapely.union_all(roads+buildings+[water.buffer(6),coast.buffer(9),protectedDSM])
priority=shapely.union_all([box(-6500,-1820,-1780,-430),box(-530,520,780,1760)])
safe=land.buffer(-2).intersection(priority).difference(protected)
park=safe.intersection(green);urban=safe.difference(green)
print('safe square kilometres',round(safe.area/1e6,3),'park',round(park.area/1e6,3),flush=True)

# Tile batches carry local vertex/index arrays. Ring boundaries are exact
# clipped polygon vertices, and therefore remain at the established base level.
chunks={};tri_count=0;vertex_count=0;max_height=0.;patches=0
def getchunk(x,z):
 key=(math.floor(x/640),math.floor(z/640))
 if key not in chunks:chunks[key]={'positions':[],'indices':[],'cache':{}}
 return chunks[key]
for kind,geometry in [('park',park),('urban',urban)]:
 pieces=[p for p in polys(geometry) if p.area>=450]
 print(kind,'patches',len(pieces),flush=True)
 for number,p in enumerate(pieces):
  xmin,zmin,xmax,zmax=p.bounds
  # Small/linear parcels need more samples than distant open reserve land.
  coastal=xmin< -2200 and xmax> -6300 and zmin< -520 and zmax> -1450
  step=12 if coastal else (18 if kind=='park' else 24)
  if p.area<2500:step=10
  height_cache={};boundary=p.boundary
  amplitude=8.5 if kind=='park' else 2.6;falloff=28 if kind=='park' else 18
  def sample(x,z):
   key=(round(x,4),round(z,4))
   if key in height_cache:return height_cache[key]
   distance=boundary.distance(Point(x,z))
   broad=noise(x/175+19,z/175-31);middle=noise(x/57-8,z/57+14)
   variation=.16+.68*broad**1.25+.16*middle
   taper=(1-math.exp(-distance/falloff))**2
   value=min(amplitude*variation*taper,distance*.13)
   if distance<.025:value=0.
   height_cache[key]=round(value,5);return height_cache[key]
  shapely.prepare(p)
  for ix in range(math.floor(xmin/step),math.ceil(xmax/step)):
   for iz in range(math.floor(zmin/step),math.ceil(zmax/step)):
    cell=box(ix*step,iz*step,(ix+1)*step,(iz+1)*step)
    if not p.intersects(cell):continue
    clipped=cell if p.covers(cell) else p.intersection(cell)
    for fragment in polys(clipped):
     if fragment.area<.008:continue
     triangles=shapely.constrained_delaunay_triangles(fragment)
     for tri in polys(triangles):
      coords=list(tri.exterior.coords)[:3]
      if tri.area<.004:continue
      heights=[sample(x,z) for x,z in coords]
      # Completely flat fragments need no overlaid triangle; the existing land
      # plane supplies them with the same continuous world-space material.
      if max(heights)<.012:continue
      cx=sum(x for x,z in coords)/3;cz=sum(z for x,z in coords)/3;chunk=getchunk(cx,cz)
      ids=[]
      for (x,z),height in zip(coords,heights):
       key=(round(x,4),round(z,4),height)
       index=chunk['cache'].get(key)
       if index is None:
        index=len(chunk['positions'])//3;chunk['cache'][key]=index;chunk['positions'].extend((x,height,z));vertex_count+=1
       ids.append(index);max_height=max(max_height,height)
      # Babylon world x/up/z: this order gives upward geometric normals.
      a,b,c=coords
      if (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0:ids[1],ids[2]=ids[2],ids[1]
      chunk['indices'].extend(ids);tri_count+=1
  patches+=1
  if number%200==0:print(kind,number,'triangles',tri_count,flush=True)

# Limit only rare sharp clipped-corner triangles, preserving broad hills. This
# monotone relaxation never raises a protected edge, and shares heights across
# tile seams so correcting one sliver cannot open a neighbouring crack.
global_lookup={};global_positions=[];global_triangles=[]
for chunk in chunks.values():
 p=np.asarray(chunk['positions'],dtype='<f4').reshape(-1,3);mapping=[]
 for x,y,z in p:
  key=(float(x),float(z));index=global_lookup.get(key)
  if index is None:index=len(global_positions);global_lookup[key]=index;global_positions.append((x,y,z))
  else:global_positions[index]=(x,min(y,global_positions[index][1]),z)
  mapping.append(index)
 chunk['globalIndices']=np.asarray(mapping,dtype='int32');global_triangles.extend(chunk['globalIndices'][np.asarray(chunk['indices']).reshape(-1,3)].tolist())
global_positions=np.asarray(global_positions,dtype='float64');global_triangles=np.asarray(global_triangles,dtype='int32');relaxations=0
for iteration in range(120):
 tri=global_positions[global_triangles];norm=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);denom=np.abs(norm[:,1]);slope=np.sqrt(norm[:,0]**2+norm[:,2]**2)/np.maximum(denom,1e-12)
 bad=(denom>.00001)&(slope>.235)
 if not bad.any():break
 selected=global_triangles[bad];values=global_positions[selected,1];low=values.min(axis=1)[:,None];adjusted=low+(values-low)*(.22/slope[bad])[:,None]
 np.minimum.at(global_positions[:,1],selected.ravel(),adjusted.ravel());relaxations+=int(bad.sum())
for chunk in chunks.values():
 for i,index in enumerate(chunk['globalIndices']):chunk['positions'][i*3+1]=global_positions[index,1]
max_height=float(global_positions[:,1].max())
print('slope relaxation',iteration,'passes',relaxations,'local triangle corrections',flush=True)

# Serialize float32 first. Normal generation and all validation use the exact
# float32 geometry the browser receives, not higher precision authoring values.
blob=bytearray();tiles=[];slope_values=[];triangles_all=[]
for key,chunk in sorted(chunks.items()):
 positions=np.asarray(chunk['positions'],dtype='<f4').reshape(-1,3);indices=np.asarray(chunk['indices'],dtype='<u4').reshape(-1,3)
 tris=positions[indices].astype('float64');norm=np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0]);horizontal=np.abs(norm[:,1]);slope=np.sqrt(norm[:,0]**2+norm[:,2]**2)/np.maximum(horizontal,1e-12)
 # Discard a rare near-degenerate fragment with unusable interpolation. Its
 # area is sub-pixel and the original ground remains immediately underneath.
 keep=(horizontal>.00001)&np.isfinite(slope)
 if not np.all(keep):indices=indices[keep];tris=tris[keep];norm=norm[keep];slope=slope[keep]
 slope_values.extend(slope.tolist());triangles_all.append(tris)
 normals=np.zeros_like(positions)
 for corner in range(3):np.add.at(normals,indices[:,corner],norm)
 normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-8)
 meta={'id':f'{key[0]}_{key[1]}','x':(key[0]+.5)*640,'z':(key[1]+.5)*640,'vertexCount':len(positions),'triangleCount':len(indices),'bounds':[float(v) for v in [positions[:,0].min(),positions[:,2].min(),positions[:,0].max(),positions[:,2].max()]]}
 for name,data in [('positions',positions),('normals',normals),('indices',indices)]:
  packed=data.astype('<u4' if name=='indices' else '<f4').tobytes();meta[name]={'offset':len(blob),'bytes':len(packed)};blob.extend(packed)
 tiles.append(meta)
(OUT/'relief-mesh.bin').write_bytes(blob)
slopes=np.asarray(slope_values);triangles=np.concatenate(triangles_all)

# World-space macro colour field: 13m-scale texels add broad wet/dry grass and
# soil variation above the existing 8m-repeat blade texture. No new frame-time
# noise evaluation, normal map, lighting pass or extra draw call is required.
extent=city['meta']['extent'];width,height=1024,512
mask=Image.new('L',(width,height),0);md=ImageDraw.Draw(mask)
def pixel(x,z):return ((x-extent[0])/(extent[2]-extent[0])*(width-1),(z-extent[1])/(extent[3]-extent[1])*(height-1))
for p in polys(green):
 md.polygon([pixel(x,z) for x,z in p.exterior.coords],fill=255)
 for ring in p.interiors:md.polygon([pixel(x,z) for x,z in ring.coords],fill=0)
mask=mask.filter(ImageFilter.GaussianBlur(1.4));cover=Image.new('RGBA',(width,height));px=cover.load()
for j in range(height):
 z=extent[1]+j/(height-1)*(extent[3]-extent[1])
 for i in range(width):
  x=extent[0]+i/(width-1)*(extent[2]-extent[0]);lush=mask.getpixel((i,j))/255
  macro=noise(x/310+23,z/310-7);mid=noise(x/72-14,z/72+2);fine=noise(x/24+7,z/24+19)
  dry=max(0,min(1,(macro*.6+mid*.3+fine*.1-.43)*2.0));soil=max(0,min(1,(mid-.64)*2.8))*(1-.50*lush)
  r=123+dry*42-lush*6;gg=132+macro*24-dry*12+lush*3;b=116-dry*20+fine*13
  px[i,j]=(round(r),round(gg),round(b),round(soil*255))
cover.save(OUT/'ground-cover.png',optimize=True)

# Independent geometric checks: triangle centroids and vertices must not enter
# protected road/building/water/DSM zones, and preserved DSM reads unchanged.
points=shapely.points(triangles.reshape(-1,3)[:,[0,2]])
protected_test=protected.buffer(-.002);shapely.prepare(protected_test)
interior_violations=int(np.count_nonzero(shapely.contains(protected_test,points)))
centroids=triangles.mean(axis=1);centroid_violations=int(np.count_nonzero(shapely.contains(protected_test,shapely.points(centroids[:,[0,2]]))))
manifest={'schemaVersion':1,'coordinateSystem':'game east/up/north; additive to established base height','origin':'Art-directed landscape microrelief; not surveyed elevation','mesh':'relief-mesh.bin','macroTexture':'ground-cover.png','extent':extent,'textureSize':[width,height],
 'preservedTerrainBounds':preserve,'preservedTerrainMargin':20,'priorityAreas':['Shenzhen Bay opening / bay park / talent park','Xiangmi Lake vicinity'],'tileSize':640,'lookupCellSize':32,'surfaceOffset':.012,'tiles':tiles,
 'sourceSha256':{str(p.relative_to(ROOT)):digest(p) for p in [ROOT/'public/city/city.json',ROOT/'public/city/terrain-detail.json',ROOT/'public/city/landmark-detail.json']},
 'meshSha256':digest(OUT/'relief-mesh.bin'),'budgets':{'triangles':sum(t['triangleCount'] for t in tiles),'vertices':vertex_count,'meshBytes':len(blob),'tiles':len(tiles),'maxAddedHeight':max_height,'p95Slope':float(np.quantile(slopes,.95)),'maxSlope':float(slopes.max()),'textureBytesWithMipmaps':int(width*height*4*4/3)},
 'exclusions':{'roadSetback':2.8,'buildingSetback':3.0,'waterSetback':6.0,'coastSetback':9.0},
 'limitations':['Original land remains below the raised overlay; it is not globally subdivided.','Mapped roads/buildings and existing Lianhua DSM are preserved.','Other parks receive game-art slopes, not measured Shenzhen elevation.','Macro colour is art direction, not satellite land-cover classification.']}
(OUT/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
report={'createdAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'elapsedSeconds':round(time.time()-started,2),'budgets':manifest['budgets'],'protectedVertexViolations':interior_violations,'protectedCentroidViolations':centroid_violations,'preservedDSMSourceSha256':manifest['sourceSha256']['public/city/terrain-detail.json'],'slopeDegreesMax':math.degrees(math.atan(float(slopes.max()))),'errors':[],'preview':'CPU-only generated height/colour study, not game screenshot'}
if interior_violations or centroid_violations:report['errors'].append('Protected geometry overlap')
if slopes.max()>.28:report['errors'].append('Slope exceeds gentle-grade budget')
if manifest['budgets']['triangles']>200000:report['errors'].append('Geometry exceeds 200k triangle ceiling')
(OUT/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
assert not report['errors'],report['errors']
