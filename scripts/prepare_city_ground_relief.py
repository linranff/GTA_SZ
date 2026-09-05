"""CPU-only citywide grassland v2 candidate; no source city/DSM asset is changed.

Raised, sparsely subdivided lawn patches sit over the established base plane.
Game coordinates are real metres * 0.60; these slopes are authored landscape,
not survey data. Meadow masks certify complete 2.9-game-unit planting circles.
"""
from pathlib import Path
import json, math, hashlib, time
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import nearest_points
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/city/grassland-v2-candidate'
OUT.mkdir(parents=True, exist_ok=True)
started = time.time()
city = json.loads((ROOT/'public/city/city.json').read_text())
terrain = json.loads((ROOT/'public/city/terrain-detail.json').read_text())
detail = json.loads((ROOT/'public/city/landmark-detail.json').read_text())

def poly(rings): return shapely.make_valid(Polygon(rings[0], rings[1:]))
def polys(g):
    if g.geom_type == 'Polygon': yield g
    elif hasattr(g, 'geoms'):
        for c in g.geoms: yield from polys(c)
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def hash2(x, z):
    v = np.sin(np.asarray(x)*127.1+np.asarray(z)*311.7)*43758.5453123
    return v-np.floor(v)
def noise(x, z):
    i,j=np.floor(x),np.floor(z);u,v=x-i,z-j;u=u*u*(3-2*u);v=v*v*(3-2*v)
    return (hash2(i,j)*(1-u)+hash2(i+1,j)*u)*(1-v)+(hash2(i,j+1)*(1-u)+hash2(i+1,j+1)*u)*v

source_paths = ['public/city/city.json','public/city/terrain-detail.json','public/city/landmark-detail.json','public/city/ground-surfaces.json','public/city/street-surfaces.json']
source_sha = {p: digest(ROOT/p) for p in source_paths}
land=shapely.union_all([poly(r) for r in city['land']])
water=shapely.union_all([poly(p['rings']) for p in city['water']])
green=shapely.union_all([poly(p['rings']) for p in city['green']]).intersection(land)
road_exclusion=shapely.union_all([LineString(r['points']).buffer(r['width']/2+2.8,cap_style=2,join_style=2) for r in city['roads']])
building_exclusion=shapely.union_all([poly(p['rings']).buffer(3,join_style=2) for p in city['buildings']+detail.get('collisionFootprints',[])])
g=terrain['grid'];preserve=[g['x0'],g['z0'],g['x0']+(g['columns']-1)*g['dx'],g['z0']+(g['rows']-1)*g['dz']]
coast=shapely.union_all([LineString(r) for r in city['coast'] if len(r)>1])
landmarks={p['id']:p for p in city['landmarks']}
# Authored monument bases and the civic plaza are paved even where OSM land is
# generically classified as ground. Explicitly reserve them in both outputs.
landmark_bases=[Point(p['x'],p['z']).buffer(p['excludeRadius']+3) for p in city['landmarks'] if p.get('excludeRadius',0)>0]
civic=landmarks['civic'];landmark_bases.append(box(civic['x']-140.5,civic['z']-140.5,civic['x']+140.5,civic['z']-9.5))
protected=shapely.union_all([road_exclusion,building_exclusion,water.buffer(6),coast.buffer(9),box(*preserve).buffer(20,join_style=2),*landmark_bases])
safe=land.buffer(-2).difference(protected)
park=safe.intersection(green);urban=safe.difference(green)
print('safe km2',safe.area/1e6,'park km2',park.area/1e6,flush=True)

# Representative named sites receive deterministic, independently inspectable
# multi-peak compositions near a road edge. Other broad lawns use the same rules.
forced=[]
for ident,label in [('baypark','深圳湾公园'),('xiangmi','香蜜公园'),('talent','深圳人才公园')]:
    lm=landmarks[ident];target=Point(lm['x'],lm['z'])
    named=[poly(p['rings']) for p in city['green'] if p.get('name')==label]
    region=shapely.union_all(named).intersection(park) if named else park.intersection(target.buffer(650))
    inset=region.buffer(-19)
    if inset.is_empty: inset=region.buffer(-12)
    x0,z0,x1,z1=inset.bounds
    xx,zz=np.meshgrid(np.arange(math.floor(x0/8)*8,x1,8),np.arange(math.floor(z0/8)*8,z1,8))
    pts=shapely.points(xx.ravel(),zz.ravel());inside=shapely.contains(inset,pts);pts=pts[inside]
    road_d=shapely.distance(pts,road_exclusion)
    target_d=shapely.distance(pts,target)
    # Prefer 20–45 game units from pavement so a low view includes its edge.
    score=target_d+np.abs(road_d-27)*3
    q=pts[int(np.argmin(score))]
    forced.append({'id':ident,'name':label,'x':q.x,'z':q.y,'roadSetbackDistance':float(road_exclusion.distance(q))})
print('visual sites',forced,flush=True)

features=[]
for kind,geometry,minarea,density,cap in [('park',park,4500,70000,300),('urban',urban,18000,200000,190)]:
    pieces=sorted([p for p in polys(geometry) if p.area>=minarea],key=lambda p:(-p.area,p.bounds))
    made=0
    for p in pieces:
        if made>=cap: break
        interior=p.buffer(-9 if kind=='park' else -7)
        if interior.is_empty: continue
        x0,z0,x1,z1=interior.bounds
        step=24 if p.area<30000 else 40
        xx,zz=np.meshgrid(np.arange(math.floor(x0/step)*step,x1,step),np.arange(math.floor(z0/step)*step,z1,step))
        coords=np.column_stack((xx.ravel(),zz.ravel()));pts=shapely.points(coords)
        coords=coords[shapely.contains(interior,pts)]
        if not len(coords):
            q=interior.representative_point();coords=np.asarray([[q.x,q.y]])
        distance=shapely.distance(shapely.points(coords),p.boundary)
        rank=hash2(coords[:,0]+13,coords[:,1]-17)+np.minimum(distance,35)/50
        chosen=[]
        special=[f for f in forced if p.covers(Point(f['x'],f['z']))]
        wanted=max(1,min(14,math.ceil(p.area/density)))
        for f in special: chosen.append((f['x'],f['z'],f['id']))
        for idx in np.argsort(-rank):
            x,z=coords[idx]
            if any((x-a)**2+(z-b)**2<70**2 for a,b,_ in chosen): continue
            chosen.append((float(x),float(z),None))
            if len(chosen)>=wanted: break
        for x,z,hero in chosen:
            r=float(hash2(x+3,z-4));large=kind=='park' and (p.area>50000 or hero)
            # Each mound is broad and C2-smooth. Max of separate compositions
            # avoids a high-frequency sum of bumps and limits extra mesh area.
            ax=(31+4*r) if large else ((22+5*r) if kind=='park' else (16+5*r))
            az=ax*(.72+.14*float(hash2(x-8,z+2)))
            angle=float(hash2(x+12,z))*math.tau
            peak=(1.55+.70*r) if large else ((.38+.70*r) if kind=='park' else (.11+.23*r))
            if hero: peak=2.15;ax=34;az=27;angle=.22
            support=Point(0,0).buffer(1,quad_segs=12)
            support=shapely.affinity.scale(support,ax,az)
            support=shapely.affinity.rotate(support,angle,use_radians=True)
            support=shapely.affinity.translate(support,x,z).intersection(p)
            features.append({'x':x,'z':z,'ax':ax,'az':az,'angle':angle,'peak':peak,'large':large,'kind':kind,'hero':hero,'support':support,'parcel':p})
            made+=1
    print(kind,'compositions',made,flush=True)

# Each independent support is clipped and triangulated only once. Overlapping
# supports in the same parcel are unioned before tessellation to prevent Z-fight.
groups={}
for f in features:
    key=id(f['parcel']);groups.setdefault(key,{'parcel':f['parcel'],'features':[]})['features'].append(f)
CHUNK=1280;chunks={};tri_count=0

def getchunk(x,z):
    key=(math.floor(x/CHUNK),math.floor(z/CHUNK))
    if key not in chunks: chunks[key]={'positions':[],'indices':[],'cache':{}}
    return chunks[key]

def feature_height(f,x,z):
    dx=x-f['x'];dz=z-f['z'];c=math.cos(f['angle']);s=math.sin(f['angle'])
    u=(dx*c+dz*s)/f['ax'];v=(-dx*s+dz*c)/f['az'];r2=u*u+v*v
    if r2>=1: return 0.
    outer=(1-r2)**3
    if not f['large']: return f['peak']*outer
    # Three staggered low peaks with connected shallow relative hollows. The
    # ground is always raised, never cut through the immutable original plane.
    a=max(0.,1-((u+.36)/.52)**2-((v+.13)/.68)**2)**3
    b=max(0.,1-((u-.33)/.50)**2-((v-.16)/.59)**2)**3
    c=max(0.,1-(u/.42)**2-((v-.53)/.45)**2)**3
    return f['peak']*(.19*outer+.82*max(a,b,.73*c))

for gi,group in enumerate(groups.values()):
    ff=group['features'];p=group['parcel'];support=shapely.union_all([f['support'] for f in ff])
    step=4 if any(f['hero'] for f in ff) else (6 if ff[0]['kind']=='park' else 8)
    boundary=p.boundary;height_cache={};shapely.prepare(support)
    def sample(x,z):
        key=(round(x,4),round(z,4))
        if key in height_cache:return height_cache[key]
        value=max(feature_height(f,x,z) for f in ff)
        if value>0:
            distance=boundary.distance(Point(x,z))
            value=min(value,distance*.11)
            if distance<.025:value=0.
        height_cache[key]=value;return value
    # Restrict loop to each support component, never its parcel's bounding box.
    for component in polys(support):
        x0,z0,x1,z1=component.bounds
        for ix in range(math.floor(x0/step),math.ceil(x1/step)):
            for iz in range(math.floor(z0/step),math.ceil(z1/step)):
                cell=box(ix*step,iz*step,(ix+1)*step,(iz+1)*step)
                if not component.intersects(cell):continue
                clipped=cell if component.covers(cell) else component.intersection(cell)
                for fragment in polys(clipped):
                    if fragment.area<.008:continue
                    for tri in polys(shapely.constrained_delaunay_triangles(fragment)):
                        if tri.area<.004:continue
                        coords=list(tri.exterior.coords)[:3];heights=[sample(x,z) for x,z in coords]
                        if max(heights)<.0003:continue
                        chunk=getchunk(sum(x for x,z in coords)/3,sum(z for x,z in coords)/3);ids=[]
                        for (x,z),h in zip(coords,heights):
                            key=(round(x,4),round(z,4));idx=chunk['cache'].get(key)
                            if idx is None:
                                idx=len(chunk['positions'])//3;chunk['cache'][key]=idx;chunk['positions'].extend((x,h,z))
                            ids.append(idx)
                        a,b,c=coords
                        if (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0:ids[1],ids[2]=ids[2],ids[1]
                        chunk['indices'].extend(ids);tri_count+=1
    if gi%75==0:print('tessellated',gi,'/',len(groups),'tris',tri_count,flush=True)
    if tri_count>195000:raise RuntimeError('Candidate exceeded geometry budget before publication')

# Rare clipped corners are flattened by monotone relaxation. Shared float32 XZ
# coordinates share heights across all tile seams. No exclusion is moved.
global_lookup={};global_positions=[];global_triangles=[]
for chunk in chunks.values():
    mapping=[]
    for x,y,z in np.asarray(chunk['positions'],dtype='<f4').reshape(-1,3):
        key=(float(x),float(z));idx=global_lookup.get(key)
        if idx is None:idx=len(global_positions);global_lookup[key]=idx;global_positions.append((x,y,z))
        else:global_positions[idx]=(x,min(y,global_positions[idx][1]),z)
        mapping.append(idx)
    chunk['globalIndices']=np.asarray(mapping,dtype='int32')
    global_triangles.extend(chunk['globalIndices'][np.asarray(chunk['indices']).reshape(-1,3)].tolist())
global_positions=np.asarray(global_positions,dtype='float64');global_triangles=np.asarray(global_triangles,dtype='int32');relaxations=0
for iteration in range(120):
    tri=global_positions[global_triangles];norm=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);denom=np.abs(norm[:,1]);slope=np.hypot(norm[:,0],norm[:,2])/np.maximum(denom,1e-12)
    bad=(denom>.00001)&(slope>.235)
    if not bad.any():break
    selected=global_triangles[bad];values=global_positions[selected,1];low=values.min(axis=1)[:,None]
    adjusted=low+(values-low)*(.22/slope[bad])[:,None]
    np.minimum.at(global_positions[:,1],selected.ravel(),adjusted.ravel());relaxations+=int(bad.sum())
for chunk in chunks.values():
    for i,idx in enumerate(chunk['globalIndices']):chunk['positions'][i*3+1]=global_positions[idx,1]
blob=bytearray();tiles=[];triangles_all=[];slopes_all=[]
for key,chunk in sorted(chunks.items()):
    positions=np.asarray(chunk['positions'],dtype='<f4').reshape(-1,3);indices=np.asarray(chunk['indices'],dtype='<u4').reshape(-1,3)
    tris=positions[indices].astype('float64');norm=np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0]);denom=np.abs(norm[:,1]);slopes=np.hypot(norm[:,0],norm[:,2])/np.maximum(denom,1e-12)
    keep=(denom>.00001)&np.isfinite(slopes);indices=indices[keep];tris=tris[keep];norm=norm[keep];slopes=slopes[keep]
    if not len(indices):continue
    normals=np.zeros_like(positions)
    for corner in range(3):np.add.at(normals,indices[:,corner],norm)
    normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-8)
    meta={'id':f'{key[0]}_{key[1]}','x':(key[0]+.5)*CHUNK,'z':(key[1]+.5)*CHUNK,'vertexCount':len(positions),'triangleCount':len(indices),'bounds':[float(positions[:,0].min()),float(positions[:,2].min()),float(positions[:,0].max()),float(positions[:,2].max())]}
    for name,data in [('positions',positions),('normals',normals),('indices',indices)]:
        packed=data.astype('<u4' if name=='indices' else '<f4').tobytes();meta[name]={'offset':len(blob),'bytes':len(packed)};blob.extend(packed)
    tiles.append(meta);triangles_all.append(tris);slopes_all.append(slopes)
(OUT/'relief-mesh.bin').write_bytes(blob)
triangles=np.concatenate(triangles_all);slopes=np.concatenate(slopes_all)
print('geometry',len(triangles),'triangles',len(tiles),'tiles',len(blob),'bytes',flush=True)

# Larger-scale RGB tint and A bare-soil weights retain the runtime contract.
# This is non-directional colour modulation, no baked sunlight or added PBR pass.
extent=city['meta']['extent'];width,height=2048,1024
mask=Image.new('L',(width,height),0);draw=ImageDraw.Draw(mask)
def pixel(x,z):return ((x-extent[0])/(extent[2]-extent[0])*(width-1),(z-extent[1])/(extent[3]-extent[1])*(height-1))
for p in polys(green):
    draw.polygon([pixel(x,z) for x,z in p.exterior.coords],fill=255)
    for ring in p.interiors:draw.polygon([pixel(x,z) for x,z in ring.coords],fill=0)
lush=np.asarray(mask.filter(ImageFilter.GaussianBlur(.75)),dtype='float32')/255
xx,zz=np.meshgrid(np.linspace(extent[0],extent[2],width),np.linspace(extent[1],extent[3],height))
macro=noise(xx/270+23,zz/270-7);mid=noise(xx/65-14,zz/65+2);fine=noise(xx/18+7,zz/18+19)
dry=np.clip((macro*.51+mid*.37+fine*.12-.40)*2.25,0,1)
soil=np.clip((mid*.74+fine*.26-.64)*3.6,0,1)*(1-.35*lush)
rgba=np.stack((119+dry*43-lush*5,133+macro*20-dry*21+lush*4,109-dry*22+fine*16,soil*255),axis=-1)
rgba=np.clip(np.rint(rgba),0,255).astype('uint8');Image.fromarray(rgba).save(OUT/'ground-cover.png',optimize=True)

# Exact final mesh slopes at the global 4-unit meadow grid. Work scales with
# mesh area, not vector distances over every city pixel. Outside relief is flat.
STEP=4;GRID=32;TILE=128;RADIUS=2.9
ix0=math.floor(extent[0]/TILE);ix1=math.ceil(extent[2]/TILE);iz0=math.floor(extent[1]/TILE);iz1=math.ceil(extent[3]/TILE)
cols=(ix1-ix0)*GRID;rows=(iz1-iz0)*GRID;origin_x=ix0*TILE;origin_z=iz0*TILE
slope_grid=np.zeros((rows,cols),dtype='uint8')
for tri,slope in zip(triangles,slopes):
    a,b,c=tri[:,[0,2]]
    col0=max(0,math.ceil((min(a[0],b[0],c[0])-origin_x)/STEP-.5));col1=min(cols-1,math.floor((max(a[0],b[0],c[0])-origin_x)/STEP-.5))
    row0=max(0,math.ceil((min(a[1],b[1],c[1])-origin_z)/STEP-.5));row1=min(rows-1,math.floor((max(a[1],b[1],c[1])-origin_z)/STEP-.5))
    if col1<col0 or row1<row0:continue
    cx,rz=np.meshgrid(np.arange(col0,col1+1),np.arange(row0,row1+1));x=origin_x+(cx+.5)*STEP;z=origin_z+(rz+.5)*STEP
    det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(z-c[1]))/det;v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(z-c[1]))/det
    valid=(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)
    # Shared-edge samples inherit the steeper adjacent face, so runtime grass
    # filtering cannot accidentally choose the easier side of a ridge.
    slope_grid[rz[valid],cx[valid]]=np.maximum(slope_grid[rz[valid],cx[valid]],min(255,round(math.degrees(math.atan(slope))*4)))
# Extra 0.02 guard exceeds polygonal circle approximation and float32 rounding.
safe_core=safe.buffer(-(RADIUS+.02));shapely.prepare(safe_core)
meadow_dir=OUT/'meadow';meadow_dir.mkdir(exist_ok=True);meadow_tiles=[];eligible_count=0
for iz in range(iz0,iz1):
    for ix in range(ix0,ix1):
        x,z=np.meshgrid(ix*TILE+(np.arange(GRID)+.5)*STEP,iz*TILE+(np.arange(GRID)+.5)*STEP)
        valid=shapely.contains_xy(safe_core,x,z)
        count=int(valid.sum())
        if not count:continue
        pi=np.clip(np.rint((x-extent[0])/(extent[2]-extent[0])*(width-1)).astype('int32'),0,width-1)
        pj=np.clip(np.rint((z-extent[1])/(extent[3]-extent[1])*(height-1)).astype('int32'),0,height-1)
        payload=np.zeros((GRID,GRID,3),dtype='uint8');payload[:,:,0]=valid*255;payload[:,:,1]=rgba[pj,pi,3]
        payload[:,:,2]=slope_grid[(iz-iz0)*GRID:(iz-iz0+1)*GRID,(ix-ix0)*GRID:(ix-ix0+1)*GRID]
        name=f'tile_{ix}_{iz}.bin';packed=payload.tobytes();(meadow_dir/name).write_bytes(packed)
        meadow_tiles.append({'id':f'{ix}_{iz}','ix':ix,'iz':iz,'url':f'meadow/{name}','bytes':len(packed),'count':count,'sha256':hashlib.sha256(packed).hexdigest()});eligible_count+=count
meadow={'schemaVersion':1,'tileSize':TILE,'step':STEP,'gridSize':GRID,'stride':3,'safeRadius':RADIUS,'channels':['safe','soil','slopeDegreesX4'],'tiles':meadow_tiles,'sourceSHA':source_sha,'meshSHA':digest(OUT/'relief-mesh.bin'),'coordinateRule':'x=ix*128+(col+0.5)*4; z=iz*128+(row+0.5)*4; offset=(row*32+col)*3; safe==255 only','heightRule':'Use exact runtime heightAt for every individual blade cluster; stored B is degrees*4 rounded.','proof':{'safeCircleRadius':RADIUS,'additionalNumericalGuard':.02,'wholeCircleInsideMappedGrassLand':True,'excluded':['asphalt and paved sidewalks','buildings and detail collision footprints','mapped water','coastal promenade and shoreline','Lianhua DSM including 20 unit margin','authored monument bases and civic paved plaza','artificial northern backdrop']},'budgets':{'tiles':len(meadow_tiles),'safeCells':eligible_count,'binaryBytes':len(meadow_tiles)*3072,'maxFourActiveTileBytes':4*3072,'maxTwelveCachedTileBytes':12*3072}}
active_tile_names={Path(t['url']).name for t in meadow_tiles}
for old_tile in meadow_dir.glob('tile_*.bin'):
    if old_tile.name not in active_tile_names:old_tile.unlink()
(OUT/'meadow.json').write_text(json.dumps(meadow,separators=(',',':')))
print('MEADOW READY',meadow['budgets'],flush=True)

# Exact point queries for reproducible camera cases; base is zero outside the
# preserved DSM. The renderer alone adds the 0.012 anti-overlap surface offset.
def height_at(x,z):
    a=triangles[:,0];b=triangles[:,1];c=triangles[:,2]
    det=(b[:,2]-c[:,2])*(a[:,0]-c[:,0])+(c[:,0]-b[:,0])*(a[:,2]-c[:,2])
    u=((b[:,2]-c[:,2])*(x-c[:,0])+(c[:,0]-b[:,0])*(z-c[:,2]))/det
    v=((c[:,2]-a[:,2])*(x-c[:,0])+(a[:,0]-c[:,0])*(z-c[:,2]))/det
    inside=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1.000001)
    return float(np.max((u*a[:,1]+v*b[:,1]+(1-u-v)*c[:,1])[inside],initial=0))
visual=[]
for site in forced:
    f=next(f for f in features if f['hero']==site['id'])
    bounds=list(f['support'].bounds);candidates=triangles.reshape(-1,3)
    inside=(candidates[:,0]>bounds[0])&(candidates[:,0]<bounds[2])&(candidates[:,2]>bounds[1])&(candidates[:,2]<bounds[3])
    q=candidates[inside][np.argmax(candidates[inside,1])];x,z=float(q[0]),float(q[2]);h=height_at(x,z)
    sx=math.floor(x/4)*4+2;sz=math.floor(z/4)*4+2
    if not safe_core.covers(Point(sx,sz)):
        near=nearest_points(safe_core,Point(x,z))[0];sx,sz=near.x,near.y
    south_z=z-12;camera_h=height_at(x,south_z)+2.5
    road_point=nearest_points(Point(x,z),road_exclusion)[1]
    nearest_lm=min(city['landmarks'],key=lambda lm:(lm['x']-x)**2+(lm['z']-z)**2)
    visual.append({'id':site['id'],'name':site['name'],'center':{'x':x,'z':z,'baseHeight':0,'deltaHeight':h},'compositionCenter':[f['x'],f['z']],'bounds':bounds,'safeGrass':{'x':sx,'z':sz,'baseHeight':0,'deltaHeight':height_at(sx,sz),'safeRadius':RADIUS},'nearestMapLandmarkId':nearest_lm['id'],'requestedLandmarkId':site['id'],'roadEdge':[road_point.x,0,road_point.y],'lowCamera':{'position':[x,camera_h,south_z],'target':[x,h+.25,z],'units':'game','distanceSouth':12,'heightAboveGround':2.5},'overheadCamera':{'position':[x,80,z-12],'target':[x,h,z]},'physicalDeltaMetres':h/.6,'expected':'Multiple soft peaks with relative shallow hollows; no negative excavation. Include adjacent road edge in framing.'})
    visual[-1]['roadsideCamera']={'position':[road_point.x,2.5,road_point.y],'target':[f['x'],.85,f['z']],'purpose':'Alternative view from protected pavement edge toward the slope, so the flat-to-raised transition is visible.'}
    visual[-1]['crossSection']=[[float(f['x']+u*f['ax']*math.cos(f['angle'])),height_at(f['x']+u*f['ax']*math.cos(f['angle']),f['z']+u*f['ax']*math.sin(f['angle'])),float(f['z']+u*f['ax']*math.sin(f['angle']))] for u in np.linspace(-1,1,49)]
(OUT/'visual-cases.json').write_text(json.dumps({'schemaVersion':1,'gameUnitsPerRealMetre':.6,'cases':visual},indent=2,ensure_ascii=False))

manifest={'schemaVersion':1,'coordinateSystem':'game east/up/north; real metres * 0.60; additive to established base height','origin':'Art-directed grassland slopes, not surveyed elevation','mesh':'relief-mesh.bin','macroTexture':'ground-cover.png','extent':extent,'textureSize':[width,height],'preservedTerrainBounds':preserve,'preservedTerrainMargin':20,'priorityAreas':['All suitable mapped grass parcels across city extent','Representative Shenzhen Bay, Xiangmi Park and Talent Park multi-peak regions'],'tileSize':CHUNK,'lookupCellSize':32,'surfaceOffset':.012,'tiles':tiles,'sourceSha256':source_sha,'meshSha256':digest(OUT/'relief-mesh.bin'),'macroSha256':digest(OUT/'ground-cover.png'),'meadow':'meadow.json','visualCases':'visual-cases.json','budgets':{'triangles':len(triangles),'vertices':sum(t['vertexCount'] for t in tiles),'meshBytes':len(blob),'tiles':len(tiles),'maxAddedHeight':float(triangles[:,:,1].max()),'p95Slope':float(np.quantile(slopes,.95)),'maxSlope':float(slopes.max()),'textureBytesWithMipmaps':int(width*height*4*4/3),'macroDiskBytes':(OUT/'ground-cover.png').stat().st_size,'compositions':len(features),'parkCompositions':sum(f['kind']=='park' for f in features),'ordinaryLawnCompositions':sum(f['kind']=='urban' for f in features),'safeGrassAreaKm2':safe.area/1e6,'meshedFootprintKm2':float(np.sum(np.abs(np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0])[:,1]))/2/1e6)},'exclusions':{'roadSetback':2.8,'buildingSetback':3.,'waterSetback':6.,'coastSetback':9.,'landEdgeSetback':2.,'authoredLandmarkBases':True,'civicPlaza':True},'designScale':{'realMetresToGameUnits':.6,'ordinaryLawnPeakRealMetres':[.15,.6],'parkBaseRealMetres':[.5,2],'selectedLargeParkPeakRealMetres':[2,4],'individualHillMainWidthRealMetres':[20,80],'relativeHollowsOnly':True,'fineSemanticAtlas':'omitted: a 1 game unit full-city atlas would exceed 70 million texels; macro plus shared 2m PBR and compact meadow masks are used'},'limitations':['Original land remains below sparse raised relief patches; flat areas between them keep existing base geometry.','Only wide safe parcels receive geometry; narrow lawns remain flat with macro material and eligible meadow cover.','Whole mapped city grass receives macro/meadow eligibility, excluding roads, sidewalks, hard bases, water, coast and existing DSM.','These are landscape art slopes, not measured park elevation.','No GPU visual or performance claim is made by this offline generator.']}
(OUT/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
report={'createdAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'elapsedSeconds':round(time.time()-started,2),'budgets':manifest['budgets'],'meadow':meadow['budgets'],'slopeRelaxationCorrections':relaxations,'slopeDegreesMax':math.degrees(math.atan(float(slopes.max()))),'errors':[],'preview':'CPU candidate only; independent audit follows'}
if len(triangles)>200000:report['errors'].append('Geometry over hard ceiling')
if len(tiles)>=100:report['errors'].append('Tile count over budget')
if slopes.max()>.28:report['errors'].append('Slope exceeds gentle grade')
(OUT/'generation-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
assert not report['errors'],report['errors']
