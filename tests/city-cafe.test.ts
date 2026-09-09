import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cafeLayout,type CafeSpec} from '../src/city-cafe-layout.ts';
import {CityCollision} from '../src/driving.ts';
import {CityWalk} from '../src/city-walk.ts';

const read=(p:string)=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const spec=read('data/locations/bamboo-cafe.json') as CafeSpec;
const manifest=read('public/city/bamboo-cafe/manifest.json');
const layout=cafeLayout(spec,manifest.colliders,0);

test('cafe coordinate transform round trips; ground adaptation stays in the original plot',()=>{
 for(const [x,z]of [[0,0],[8,-6],[-8,6],[0,-22],[24,20]]){
  const p=layout.world(x,z),q=layout.local(p.x,p.z);assert(Math.abs(q.x-x)<1e-8);assert(Math.abs(q.z-z)<1e-8);
 }
 const floor=layout.world(0,0),path=layout.world(0,-18),outside=layout.world(12,0);
 assert.equal(layout.floorAt(floor.x,floor.z,-3),.24);assert.equal(layout.floorAt(path.x,path.z,0),.18);assert.equal(layout.floorAt(outside.x,outside.z,4),4);
 assert(layout.reserved(floor.x,floor.z));assert(!layout.reserved(outside.x,outside.z));assert(layout.reserved(outside.x,outside.z,4));
});

test('real city footprint and road frontage are clear; walkable door and furniture collisions use the same rotation',()=>{
 const city=read('public/city/city.json'),collision=new CityCollision(city);
 for(let x=-10;x<=10;x++)for(let z=-12;z<=8;z++){
  const p=layout.world(x,z);assert(!collision.blocked(p.x,p.z),`occupied site at ${x},${z}`);
  const road=collision.nearest(p.x,p.z);assert(!road||road.d>road.road.width/2,'cafe plot must not cover road surface');
 }
 const walk=new CityWalk((x,z)=>collision.blocked(x,z)||layout.blocked(x,z),(x,z)=>layout.floorAt(x,z,0));
 const start=layout.world(0,-21);Object.assign(walk,{active:true,x:start.x,z:start.z,yaw:spec.site.heading});
 const forward=new Set(['KeyW']);for(let i=0;i<130;i++)walk.step(forward,.05);
 assert(layout.inside(walk.x,walk.z),'walk through the open front door without teleporting');
 for(let i=0;i<120;i++)walk.step(forward,.05);
 assert(layout.local(walk.x,walk.z).z<2.63,'solid counter stops the walker');
 for(const [x,z]of [[8.9,0],[-8.9,0],[0,6.95],[2.3,3.65],[-2.25,-3.45]]){const p=layout.world(x,z);assert(layout.blocked(p.x,p.z),`missing collision at ${x},${z}`);}
});

test('published Blender assets match the manifest and keep adult animated characters in the streamed interior',()=>{
 assert.equal(manifest.spec.id,spec.id);assert.deepEqual(manifest.spec.staff,spec.staff);
 for(const model of manifest.models){
  const bytes=readFileSync(new URL('../public/city/bamboo-cafe/'+model.file,import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.length,model.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),model.sha256);
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.equal(gltf.meshes.length,model.meshes);assert(model.bytes<12*1024*1024);
  const staff=gltf.nodes.filter((n:{extras?:{adultAge?:number}})=>n.extras?.adultAge);
  if(model.id==='interior'){assert.equal(staff.length,3);assert(staff.every((s:{extras:{adultAge:number}})=>s.extras.adultAge>=20));assert(gltf.animations.length>0);assert(model.triangles<300000);}
  else {assert.equal(staff.length,0);assert(model.triangles<45000);}
 }
});
