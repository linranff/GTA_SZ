import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {terrainHeight,loadLandmarkDetails} from '../src/landmark-details.ts';
import {CityCollision,inRing} from '../src/driving.ts';

test('terrain north direction and world offset agree with exported SW-NE triangles',()=>{
 const grid={x0:100,z0:200,dx:10,dz:20,columns:2,rows:2,heights:[0,10,20,40]};
 assert.equal(terrainHeight(grid,100,200),0);
 assert.equal(terrainHeight(grid,110,200),10);
 assert.equal(terrainHeight(grid,100,220),20);
 assert.equal(terrainHeight(grid,110,220),40);
 // Plane interpolation gives 20 at diagonal midpoint, rather than bilinear 17.5.
 assert.equal(terrainHeight(grid,105,210),20);
 assert.equal(terrainHeight(grid,107.5,205),15);
 assert.equal(terrainHeight(grid,102.5,215),20);
 assert.equal(terrainHeight(grid,99.9,210),0);
 assert.equal(terrainHeight(grid,105,221),0);
});

test('live detail merge replaces old collisions, blocks real footprints and leaves arrivals drivable',async t=>{
 const json=async (path:string)=>JSON.parse(await readFile(new URL('../public'+path,import.meta.url),'utf8'));
 const data=await json('/city/city.json');
 t.mock.method(globalThis,'fetch',async (path:string)=>new Response(JSON.stringify(await json(path)),{headers:{'content-type':'application/json'}}));
 const loaded=await loadLandmarkDetails(data);
 assert.ok(loaded);
 const collision=new CityCollision(data);
 for(const oldId of loaded.manifest.baseBuildingIds)assert.ok(!data.buildings.some((b:{id:string})=>b.id===oldId),'Old footprint remains: '+oldId);
 for(const mark of loaded.manifest.landmarks){
  assert.equal(collision.blocked(...mark.arrival),false,'Arrival blocked: '+mark.id);
  const live=data.landmarks.find((m:{id:string})=>m.id===mark.id);
  assert.ok(live?.detailCollision||live?.height===0,'Old circular exclusion remains: '+mark.id);
 }
 for(const f of loaded.manifest.collisionFootprints){
  const ring=f.rings[0],xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);let checked=0;
  for(let x=Math.min(...xs)+2;x<Math.max(...xs);x+=2)for(let z=Math.min(...zs)+2;z<Math.max(...zs);z+=2){
   if(!inRing(x,z,ring))continue;
   const road=collision.nearest(x,z);if(road&&road.d<road.road.width/2-.65)continue;
   assert.equal(collision.blocked(x,z),true,'Unblocked building interior: '+f.id);checked++;
  }
  assert.ok(checked>0,'No interior collision samples: '+f.id);
 }
});
