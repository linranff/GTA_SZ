/** Cut OSM base blocks listed in landmark-candidates.json#baseBuildingIds out of the
 * delivered buildings.glb / facades.glb without rerunning the whole city rebuild.
 *
 * buildings.glb and facades.glb are merged per 640 m tile (block_X_Z_material,
 * facade_X_Z_material), so a single building cannot be disposed at runtime. This script
 * drops every triangle whose three vertices fall inside the building footprint (with a
 * small margin), re-encodes with meshopt, and leaves all other geometry byte-identical in
 * content. Afterwards run split_city_facades.mjs and finalize_city_assets.mjs so the tile
 * hashes and building-exclusions.json follow.
 *
 *   node scripts/exclude_base_buildings.mjs            # apply
 *   node scripts/exclude_base_buildings.mjs --dry-run  # report only
 */
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dry=process.argv.includes('--dry-run');
const TILE=640,MARGIN=1.2;
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const readJson=async p=>JSON.parse(await fs.readFile(path.join(ROOT,p),'utf8'));

const city=await readJson('public/city/city.json');
const candidates=await readJson('public/city/landmark-candidates.json');
const exclusions=await readJson('public/city/building-exclusions.json');
const already=new Set(exclusions.excludedIds);
const wanted=(candidates.baseBuildingIds??[]).filter(id=>!already.has(id));
if(!wanted.length){console.log('nothing to cut: all candidate baseBuildingIds already excluded');process.exit(0);}

const byId=new Map(city.buildings.map(b=>[b.id,b]));
// Game frame (x east, z north) → GLB frame (x, y up, -z).
const targets=wanted.map(id=>{
 const b=byId.get(id);if(!b)throw Error('unknown building id '+id);
 const ring=b.rings[0].map(([x,z])=>[x,-z]);
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const [x,z] of ring){if(x<minX)minX=x;if(x>maxX)maxX=x;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;}
 const tiles=new Set();
 for(const x of [minX,maxX])for(const z of [minZ,maxZ])tiles.add(Math.floor(x/TILE)+'_'+Math.floor(-z/TILE));
 return {id,name:b.name,height:b.height,ring,box:{minX:minX-MARGIN,maxX:maxX+MARGIN,minZ:minZ-MARGIN,maxZ:maxZ+MARGIN},tiles};
});

function inside(x,z,ring){
 let c=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [xi,zi]=ring[i],[xj,zj]=ring[j];
  if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)c=!c;
 }
 return c;
}
function nearRing(x,z,ring,m){
 if(inside(x,z,ring))return true;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [ax,az]=ring[i],[bx,bz]=ring[j];const dx=bx-ax,dz=bz-az,l=dx*dx+dz*dz||1;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l));const px=ax+dx*t-x,pz=az+dz*t-z;
  if(px*px+pz*pz<m*m)return true;
 }
 return false;
}
const hit=(x,z)=>targets.some(t=>x>t.box.minX&&x<t.box.maxX&&z>t.box.minZ&&z<t.box.maxZ&&nearRing(x,z,t.ring,MARGIN));

const report={ids:targets.map(t=>({id:t.id,name:t.name,height:t.height,tiles:[...t.tiles]})),files:{}};
for(const file of ['buildings','facades']){
 const glbPath=path.join(ROOT,'public/city',file+'.glb');
 const doc=await io.read(glbPath);
 const prefix=file==='buildings'?'block_':'facade_';
 let removed=0,touched=0;
 for(const node of doc.getRoot().listNodes()){
  const m=node.getName().match(new RegExp('^'+prefix+'(-?\\d+)_(-?\\d+)_'));
  if(!m||!targets.some(t=>t.tiles.has(m[1]+'_'+m[2])))continue;
  const mesh=node.getMesh();if(!mesh)continue;
  const [tx,ty,tz]=node.getTranslation(),[sx,sy,sz]=node.getScale();
  for(const prim of mesh.listPrimitives()){
   const pos=prim.getAttribute('POSITION'),idx=prim.getIndices();
   if(!pos||!idx||prim.getMode()!==4)continue;
   const count=idx.getCount(),keep=[];const a=[],b=[],c=[];
   for(let i=0;i<count;i+=3){
    pos.getElement(idx.getScalar(i),a);pos.getElement(idx.getScalar(i+1),b);pos.getElement(idx.getScalar(i+2),c);
    const inA=hit(tx+a[0]*sx,tz+a[2]*sz),inB=hit(tx+b[0]*sx,tz+b[2]*sz),inC=hit(tx+c[0]*sx,tz+c[2]*sz);
    if(inA&&inB&&inC){removed++;continue;}
    keep.push(idx.getScalar(i),idx.getScalar(i+1),idx.getScalar(i+2));
   }
   if(keep.length===count)continue;
   touched++;
   const Ctor=idx.getArray().constructor;
   // optimize_city.mjs dedup() shares index accessors between primitives (and across
   // materials with the same triangle pattern); give this primitive its own copy.
   const own=idx.listParents().filter(p=>p.propertyType==='Primitive').length>1?idx.clone():idx;
   own.setArray(new Ctor(keep));prim.setIndices(own);
  }
 }
 report.files[file]={trianglesRemoved:removed,primitivesTouched:touched};
 if(!dry&&removed){
  const before=(await fs.stat(glbPath)).size;
  await io.write(glbPath,doc);
  report.files[file].bytesBefore=before;report.files[file].bytesAfter=(await fs.stat(glbPath)).size;
 }
}
console.log(JSON.stringify({mode:dry?'dry-run':'applied',...report},null,2));
