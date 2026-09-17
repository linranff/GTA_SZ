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
const city=JSON.parse(readFileSync(root+'public/city/city.json','utf8')) as {meta:{extent:number[]};roads:{points:[number,number][];width:number;kind:string;name?:string}[]};

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

/** Main-road verges (trunk/primary) are planted from the 8–20 m street tiers in uneven clusters; parks keep
 * the full 10–30 m mix in their interiors. Before 2026-09-17 a verge was one species at a fixed 14 m pitch
 * (rows of 24–31 identical trees), which read as a tunnel from the driver's seat. */
test('canopy planting: main-road verges are layered and uneven, never a single-species wall',()=>{
 type Segment={a:[number,number];b:[number,number];w:number;L:number;name:string};
 const segments:Segment[]=[];
 for(const r of city.roads){if(r.kind!=='trunk'&&r.kind!=='primary')continue;for(let j=1;j<r.points.length;j++){const a=r.points[j-1],b=r.points[j];segments.push({a,b,w:r.width,L:Math.hypot(b[0]-a[0],b[1]-a[1]),name:r.name??'?'});}}
 const cell=100,grid=new Map<string,Segment[]>();
 for(const s of segments){
  for(let x=Math.floor((Math.min(s.a[0],s.b[0])-30)/cell);x<=Math.floor((Math.max(s.a[0],s.b[0])+30)/cell);x++)for(let z=Math.floor((Math.min(s.a[1],s.b[1])-30)/cell);z<=Math.floor((Math.max(s.a[1],s.b[1])+30)/cell);z++){const k=x+','+z;let list=grid.get(k);if(!list){list=[];grid.set(k,list);}list.push(s);}
 }
 const kerbDistance=(x:number,z:number)=>{let best=Infinity;for(const s of grid.get(Math.floor(x/cell)+','+Math.floor(z/cell))??[]){const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],l2=dx*dx+dz*dz||1;const u=Math.max(0,Math.min(1,((x-s.a[0])*dx+(z-s.a[1])*dz)/l2));best=Math.min(best,Math.hypot(x-(s.a[0]+dx*u),z-(s.a[1]+dz*u))-s.w/2);}return best;};
 // 1. Height profile of every trunk within 14 m of a main-road kerb: what the driver sees.
 const heights:number[]=[];let banyansNearMainRoads=0;
 for(const t of planting.trees){const d=kerbDistance(t[0],t[1]);if(d<14)heights.push(planting.species[t[2]].height*t[3]);if(t[2]===0&&d<24)banyansNearMainRoads++;}
 heights.sort((a,b)=>a-b);const n=heights.length;
 assert(n>4000,'thousands of trees line the main roads: '+n);
 assert(heights[Math.floor(n*.5)]<=13,'median verge tree ≤ 13 m: '+heights[Math.floor(n*.5)].toFixed(1));
 assert(heights[Math.floor(n*.9)]<=17,'p90 verge tree ≤ 17 m: '+heights[Math.floor(n*.9)].toFixed(1));
 assert(heights[n-1]<=20.5,'tallest verge tree ≤ 20.5 m (kapok accent): '+heights[n-1].toFixed(1));
 assert(heights.filter(h=>h<=16).length/n>=.85,'≥85% of verge trees ≤ 16 m');
 assert.equal(banyansNearMainRoads,0,'no giant banyan trunk within 24 m of a trunk/primary carriageway');
 // 2. Row rhythm on the longest straight main-road segments: several species, short same-species runs,
 //    neighbours differing in height, and fewer stems per km than the old fixed pitch (43/km).
 const rows:{name:string;n:number;species:number;maxRun:number;neighbourDiff:number;perKm:number}[]=[];
 for(const s of [...segments].sort((a,b)=>b.L-a.L).slice(0,40)){
  const dx=(s.b[0]-s.a[0])/s.L,dz=(s.b[1]-s.a[1])/s.L;
  for(const side of [-1,1]){
   const verge:{u:number;k:number;h:number}[]=[];
   for(const t of planting.trees){const px=t[0]-s.a[0],pz=t[1]-s.a[1],u=px*dx+pz*dz,v=(px*dz-pz*dx)*side;if(u<0||u>s.L||v<s.w/2+3||v>s.w/2+11)continue;verge.push({u,k:t[2],h:planting.species[t[2]].height*t[3]});}
   if(verge.length<10)continue;
   verge.sort((a,b)=>a.u-b.u);let run=1,maxRun=1,diff=0;
   for(let i=1;i<verge.length;i++){run=verge[i].k===verge[i-1].k?run+1:1;maxRun=Math.max(maxRun,run);diff+=Math.abs(verge[i].h-verge[i-1].h);}
   rows.push({name:s.name,n:verge.length,species:new Set(verge.map(v=>v.k)).size,maxRun,neighbourDiff:diff/(verge.length-1),perKm:verge.length/s.L*1000});
  }
 }
 assert(rows.length>=15,'enough long verge rows to judge: '+rows.length);
 for(const row of rows)assert(row.species>=3,`${row.name}: ${row.species} species in ${row.n} trees`);
 assert(rows.filter(r=>r.maxRun<=5).length/rows.length>=.9,'≥90% of rows never repeat one species more than 5 times: '+rows.map(r=>r.maxRun).join(','));
 assert(rows.filter(r=>r.neighbourDiff>=2).length/rows.length>=.9,'≥90% of rows change height by ≥2 m between neighbours');
 const perKm=rows.map(r=>r.perKm).sort((a,b)=>a-b)[rows.length>>1];
 assert(perKm>=15&&perKm<=38,'median verge density between 15 and 38 stems/km: '+perKm.toFixed(0));
});
