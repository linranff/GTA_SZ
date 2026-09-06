import assert from 'node:assert/strict';
import {test,type TestContext} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {Mesh,NullEngine,Scene} from '@babylonjs/core';
import {CityFacadeStream} from '../src/city-facade-stream.ts';

type Tile=CityFacadeStream['tiles'][number];
type Load={id:string;focus:{x:number;z:number};release:()=>void};
async function until(predicate:()=>boolean){
 const deadline=performance.now()+2000;
 while(!predicate()){
  assert(performance.now()<deadline,'facade stream did not settle');
  await delay(5);
 }
}
function fixture(t:TestContext){
 const engine=new NullEngine(),scene=new Scene(engine),loads:Load[]=[];
 let active=0,peak=0;
 const stream=new CityFacadeStream(scene,()=>{});
 // Replace asset I/O only: the actual stream queue, wall-clock timer,
 // visibility updates and pending/finally transitions run unchanged.
 (stream as unknown as {load:(tile:Tile)=>Promise<void>}).load=async tile=>{
  active++;peak=Math.max(peak,active);
  let release!:()=>void;
  const completed=new Promise<void>(resolve=>{release=resolve;});
  loads.push({id:tile.id,focus:{...stream.focus},release});
  await completed;
  stream.resident.set(tile.id,{tile,meshes:[new Mesh('test-facade-'+tile.id,scene)]});
  active--;
 };
 t.after(async()=>{
  stream.update(stream.focus.x,stream.focus.z,false,0);
  for(const load of loads)load.release();
  await until(()=>!stream.pending);
  scene.dispose();engine.dispose();
 });
 return {stream,loads,get peak(){return peak;}};
}

test('aerial motion postpones loads between slower visibility updates, then loads the final focus once',{timeout:5000},async t=>{
 const f=fixture(t),{stream,loads}=f;
 stream.tiles=[
  {id:'old-district',x:0,z:0,bytes:1},
  {id:'final-district',x:3200,z:0,bytes:1},
  {id:'final-neighbour',x:3500,z:0,bytes:1},
 ];
 // Visibility updates are slower than the load delay. Before the per-frame
 // motion signal, the 80ms timer started a stale tile before the 96ms update.
 for(let frame=0;frame<20;frame++){
  stream.noteFocusMotion();
  if(frame%6===0)stream.update(frame*160,0,true,80);
  await delay(16);
  assert.equal(loads.length,0,'turning must not start a new facade decode');
 }
 stream.update(3200,0,true,80);
 await until(()=>loads.length>0);
 assert.equal(loads.length,1);assert.equal(stream.pending,true);
 assert.equal(loads[0].id,'final-district');assert.deepEqual(loads[0].focus,{x:3200,z:0});
 // Repeated culls while I/O is pending cannot start a duplicate or neighbour.
 for(let i=0;i<4;i++)stream.update(3200,0,true,80);
 assert.equal(loads.length,1);
 loads[0].release();
 await until(()=>loads.length===2);
 assert.equal(stream.pending,true);assert.equal(loads[1].id,'final-neighbour');
 assert.deepEqual(loads[1].focus,{x:3200,z:0});assert.equal(f.peak,1);
 loads[1].release();
 await until(()=>!stream.pending);
 assert.deepEqual([...stream.resident.keys()].sort(),['final-district','final-neighbour']);
 assert.equal(loads.length,2);assert.equal(stream.stats.visibleTiles,2);
});

test('ground loading bypasses the motion debounce',{timeout:5000},async t=>{
 const {stream,loads}=fixture(t);
 stream.tiles=[{id:'roadside',x:120,z:90,bytes:1}];
 stream.noteFocusMotion();
 stream.update(120,90,true,0);
 assert.equal(loads.length,1,'driving must start nearby loading synchronously');
 assert.equal(loads[0].id,'roadside');assert.equal(stream.pending,true);
 loads[0].release();
 await until(()=>!stream.pending);
 assert.equal(stream.resident.has('roadside'),true);
});
