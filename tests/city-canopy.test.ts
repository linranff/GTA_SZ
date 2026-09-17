import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {CANOPY_LOD,canopyCell,canopyTier,type CanopyManifest,type CanopyPlanting} from '../src/city-canopy.ts';
import {CITY_GRAPHICS_PROFILES} from '../src/city-graphics-quality.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(readFileSync(root+'public/city/landscape/canopy/manifest.json','utf8')) as CanopyManifest;
const planting=JSON.parse(readFileSync(root+'public/city/landscape/canopy-trees.json','utf8')) as CanopyPlanting;
const city=JSON.parse(readFileSync(root+'public/city/city.json','utf8')) as {meta:{extent:number[]};roads:{points:[number,number][];width:number}[]};

test('canopy LOD tiers: full only at street level, aerial starts at the mid tier',()=>{
 assert.equal(canopyTier(0,false),0);assert.equal(canopyTier(CANOPY_LOD.full-1,false),0);
 assert.equal(canopyTier(CANOPY_LOD.full,false),1);assert.equal(canopyTier(CANOPY_LOD.mid-1,false),1);assert.equal(canopyTier(CANOPY_LOD.mid,false),2);
 assert.equal(canopyTier(0,true),1);assert.equal(canopyTier(CANOPY_LOD.aerialMid,true),2);
 assert.equal(canopyCell(-0.5,99.9),'-1,0');assert.equal(canopyCell(250,-250),'2,-3');
});

test('every graphics profile budgets the canopy and the halved meadow',()=>{
 for(const [name,profile] of Object.entries(CITY_GRAPHICS_PROFILES)){
  assert(profile.canopyFull>0&&profile.canopyMid>profile.canopyFull&&profile.canopyFar>profile.canopyMid,name+' street tiers ascend');
  assert(profile.canopyAerialFar>=profile.canopyFar,name+' aerial sees at least as many far crowns');
  assert(profile.meadowClumps>=256&&profile.meadowClumps<=1024,name+' ground blades stay at half the 2026-09 budget');
 }
});

test('canopy manifest: six species, three LODs each, within triangle ceilings, files present',async()=>{
 assert.equal(manifest.species.length,6);
 const heights=manifest.species.map(s=>s.height);
 assert(Math.max(...heights)>=30&&Math.min(...heights)<=11,'species range from a ten-storey banyan down to an 11 m tree');
 assert.equal(new Set(heights).size,6,'six distinct heights');
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
 for(const species of manifest.species){
  for(const [lod,suffix,ceiling] of [[0,'',4800],[1,'-mid',1700],[2,'-far',220]] as const){
   const model=manifest.models.find(m=>m.id===species.id+suffix);
   assert(model,species.id+suffix+' listed');assert.equal(model.lod,lod);assert.equal(model.species,species.id);
   assert(model.triangles<=ceiling,`${model.id} ${model.triangles} tris ≤ ${ceiling}`);
   const file=root+'public/city/landscape/'+model.file;assert(existsSync(file),model.file+' exists');
   const doc=await io.read(file);let tris=0,maxY=-Infinity,maxR=0;const materials=new Set<string>();
   for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
    tris+=(prim.getIndices()?.getCount()??prim.getAttribute('POSITION')!.getCount())/3;
    const pos=prim.getAttribute('POSITION')!,arr=pos.getArray()!;for(let i=0;i<pos.getCount();i++){maxY=Math.max(maxY,arr[i*3+1]);maxR=Math.max(maxR,Math.hypot(arr[i*3],arr[i*3+2]));}
    const material=prim.getMaterial();assert(material,'material present');materials.add(material.getName());
    assert.equal(material.getAlphaMode(),'OPAQUE',model.id+' crowns are solid, no alpha cards');
   }
   assert.equal(tris,model.triangles,model.id+' manifest triangle count matches the GLB');
   assert(Math.abs(maxY-species.height)<species.height*.12,`${model.id} height ${maxY.toFixed(1)} ≈ ${species.height}`);
   assert(maxR<=species.crown*1.25,`${model.id} crown ${maxR.toFixed(1)} within placement radius ${species.crown}`);
   assert([...materials].every(m=>m.startsWith('canopy_')),'materials share the canopy_ prefix for runtime sharing');
  }
 }
});

test('canopy planting: valid records, on the map, trunks clear of trunk/primary carriageways',()=>{
 assert.equal(planting.species.length,6);assert(planting.trees.length>20000,'tens of thousands of tall trees');
 const [minX,minZ,maxX,maxZ]=city.meta.extent;const counts=[0,0,0,0,0,0];
 for(const t of planting.trees){
  assert.equal(t.length,5);assert(Number.isFinite(t[0])&&Number.isFinite(t[1]));
  assert(t[0]>=minX&&t[0]<=maxX&&t[1]>=minZ&&t[1]<=maxZ,'inside map extent');
  assert(Number.isInteger(t[2])&&t[2]>=0&&t[2]<6,'species index');assert(t[3]>=.7&&t[3]<=1.3,'scale band');assert(t[4]>=0&&t[4]<=Math.PI*2+1e-6,'yaw');
  counts[t[2]]++;
 }
 assert(counts.every(c=>c>500),'every species is used: '+counts.join(','));
 assert(counts[0]<counts[5],'giant banyans are the rarest');
 // Spot check the offline clearance proof on a deterministic sample against the widest roads.
 const wide=city.roads.filter(r=>r.width>=12);
 const step=Math.max(1,Math.floor(planting.trees.length/400));
 for(let i=0;i<planting.trees.length;i+=step){
  const [x,z]=planting.trees[i];
  for(const road of wide){
   for(let j=1;j<road.points.length;j++){
    const [ax,az]=road.points[j-1],[bx,bz]=road.points[j];const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1;
    const u=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2));const d=Math.hypot(x-(ax+dx*u),z-(az+dz*u));
    assert(d>=road.width/2+3.1,`tree ${i} at ${x},${z} sits ${d.toFixed(1)} m from a ${road.width} m road axis`);
   }
  }
 }
});
