import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {ebikeCell,RIDER_KERB_OFFSET,type ParkedBike} from '../src/city-ebikes.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(readFileSync(root+'public/city/ebikes/manifest.json','utf8'));
const parked=JSON.parse(readFileSync(root+'public/city/ebikes/parked.json','utf8')) as {types:string[];palette:number[][];deliveryColours:number[];bikes:ParkedBike[]};
const city=JSON.parse(readFileSync(root+'public/city/city.json','utf8')) as {meta:{extent:number[]};roads:{kind:string;grade:string;width:number;points:[number,number][]}[];buildings:{rings:[number,number][][]}[]};

test('parking manifest contract: three bike types, tinted materials, palettes shared with the planting file',()=>{
 assert.deepEqual(manifest.types,['scooter','bicycle','delivery']);
 assert.deepEqual(parked.types,manifest.types);
 assert.deepEqual(parked.palette,manifest.palette);
 assert.ok(manifest.palette.length>=10&&manifest.riderPalette.length>=5&&manifest.helmetPalette.length>=4);
 for(const colours of [manifest.palette,manifest.riderPalette,manifest.helmetPalette])for(const c of colours){assert.equal(c.length,3);for(const v of c)assert.ok(v>=0&&v<=1);}
 for(const role of ['ebike-scooter','ebike-bicycle','ebike-delivery','ebike-rider'])assert.ok(manifest.triangles[role]>200&&manifest.triangles[role]<1600,role);
 for(const role of ['ebike-scooter','ebike-bicycle','ebike-delivery']){const b=manifest.bounds[role];assert.ok(b.length>1.5&&b.length<2.0&&b.width<.8&&b.height>.95&&b.height<1.4,role);}
});

test('parked bikes: valid records, varied colours, couriers in courier colours, all inside the map',()=>{
 const [minX,minZ,maxX,maxZ]=city.meta.extent;
 assert.ok(parked.bikes.length>=15000,`bikes ${parked.bikes.length}`);
 const byType=[0,0,0],byColour=new Map<number,number>();
 for(const b of parked.bikes){
  assert.equal(b.length,6);for(const v of b)assert.ok(Number.isFinite(v));
  const [x,z,yaw,type,colour,lean]=b;
  assert.ok(x>minX&&x<maxX&&z>minZ&&z<maxZ);
  assert.ok(Math.abs(yaw)<=Math.PI+.2);
  assert.ok(type>=0&&type<3&&Number.isInteger(type));
  assert.ok(colour>=0&&colour<parked.palette.length&&Number.isInteger(colour));
  assert.ok(Math.abs(lean)>=.07&&Math.abs(lean)<=.15,'kickstand lean');
  if(type===2)assert.ok(parked.deliveryColours.includes(colour),'courier colour');
  byType[type]++;byColour.set(colour,(byColour.get(colour)??0)+1);
 }
 assert.ok(byType.every(n=>n>parked.bikes.length*.08),`type mix ${byType}`);
 assert.ok(byColour.size>=parked.palette.length-1,'most palette colours are used');
});

test('parked bikes keep off every at-grade carriageway and out of building footprints (sampled)',()=>{
 const roads=city.roads;
 const cells=new Map<string,typeof roads>(),bcells=new Map<string,[number,number][][]>();
 for(const r of roads)for(const p of r.points){const k=Math.floor(p[0]/200)+','+Math.floor(p[1]/200);let c=cells.get(k);if(!c){c=[];cells.set(k,c);}if(!c.includes(r))c.push(r);}
 for(const b of city.buildings){const ring=b.rings[0];const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);for(let x=Math.floor(Math.min(...xs)/200);x<=Math.floor(Math.max(...xs)/200);x++)for(let z=Math.floor(Math.min(...zs)/200);z<=Math.floor(Math.max(...zs)/200);z++){const k=x+','+z;let c=bcells.get(k);if(!c){c=[];bcells.set(k,c);}c.push(ring);}}
 const segDist=(x:number,z:number,a:[number,number],b:[number,number])=>{const dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz||1e-9,t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l2));return Math.hypot(a[0]+dx*t-x,a[1]+dz*t-z);};
 const inRing=(x:number,z:number,ring:[number,number][])=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
 let checked=0;
 for(let i=0;i<parked.bikes.length;i+=37){
  const [x,z]=parked.bikes[i];const k=Math.floor(x/200)+','+Math.floor(z/200);
  for(const r of cells.get(k)??[])for(let s=1;s<r.points.length;s++)assert.ok(segDist(x,z,r.points[s-1],r.points[s])>=r.width/2+.29,`bike ${x},${z} on ${r.kind}`);
  for(const ring of bcells.get(k)??[])assert.ok(!inRing(x,z,ring),`bike ${x},${z} inside a building`);
  checked++;
 }
 assert.ok(checked>300);
});

test('rows are actual rows: most bikes have a neighbour within one parking pitch',()=>{
 const cells=new Map<string,ParkedBike[]>();
 for(const b of parked.bikes){const k=ebikeCell(b[0],b[1]);let c=cells.get(k);if(!c){c=[];cells.set(k,c);}c.push(b);}
 let paired=0;
 for(let i=0;i<parked.bikes.length;i+=11){const b=parked.bikes[i];if((cells.get(ebikeCell(b[0],b[1]))??[]).some(o=>o!==b&&Math.hypot(o[0]-b[0],o[1]-b[1])<.9))paired++;}
 assert.ok(paired>parked.bikes.length/11*.8,`paired ${paired}`);
 assert.ok(RIDER_KERB_OFFSET>1.5&&RIDER_KERB_OFFSET<2.8,'riders keep to the kerb side of a 6 m carriageway');
});

test('e-bike GLB matches its manifest and keeps the tinted materials white',async()=>{
 const path=root+'public/city/ebikes/'+manifest.file;assert.ok(existsSync(path));
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);const doc=await io.read(path);
 const triangles:Record<string,number>={};
 for(const node of doc.getRoot().listNodes()){const mesh=node.getMesh();if(!mesh)continue;const role=node.getName().split('_')[0];for(const p of mesh.listPrimitives())triangles[role]=(triangles[role]??0)+(p.getIndices()?.getCount()??0)/3;}
 assert.deepEqual(triangles,manifest.triangles);
 for(const m of doc.getRoot().listMaterials()){
  assert.equal(m.getAlphaMode(),'OPAQUE',m.getName());
  if(/^(ebike_paint|rider_cloth|rider_helmet)/.test(m.getName())){const [r,g,b]=m.getBaseColorFactor();assert.ok(r>.98&&g>.98&&b>.98,m.getName()+' must stay white for per-instance tinting');}
 }
});
