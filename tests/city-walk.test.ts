import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CityWalk} from '../src/city-walk.ts';
test('exit requires parked car, falls back to clear side, does not move car',()=>{
 const c={x:0,z:0,yaw:0,speed:2},w=new CityWalk(x=>x>0,()=>0);
 assert.equal(w.exitCar(c),false);c.speed=0;assert.equal(w.exitCar(c),true);assert.equal(w.x,-1.9);assert.equal(c.x,0);
});
test('walking cannot cross water/building or a large height step; diagonals normalize',()=>{
 const w=new CityWalk(x=>x>2,()=>0);w.active=true;
 for(let i=0;i<60;i++)w.step(new Set(['KeyD']),.05);assert.ok(w.x<=2);
 const cliff=new CityWalk(()=>false,(_x,z)=>z>1?3:0);cliff.active=true;
 for(let i=0;i<60;i++)cliff.step(new Set(['KeyW']),.05);assert.ok(cliff.z<=1);
 const a=new CityWalk(()=>false,()=>0),b=new CityWalk(()=>false,()=>0);a.active=b.active=true;a.step(new Set(['KeyW']),.05);b.step(new Set(['KeyW','KeyD']),.05);assert.ok(Math.abs(a.distance-b.distance)<1e-8);
});

test('walking reports speed and stops immediately when released for stationary work',()=>{
 const w=new CityWalk(()=>false,()=>0);w.active=true;w.step(new Set(['KeyW']),.05);assert.ok(w.speed>1);w.step(new Set(),.05);assert.equal(w.speed,0);
});
