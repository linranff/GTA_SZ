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

test('exit checks full body width and rejects a bridge-side drop',()=>{
 const car={x:0,z:0,yaw:0,speed:0};
 const w=new CityWalk((x,z)=>x>0&&Math.abs(z)>.1,()=>0);
 assert(w.exitCar(car));assert(w.x<0,'positive door fits a point but not the body');
 const bridge=new CityWalk(()=>false,x=>Math.abs(x)>1.5?0:6);
 assert.equal(bridge.exitCar(car),false);
});
test('entry requires same height and a clear route to a vehicle door',()=>{
 const car={x:0,z:0,yaw:0,speed:0};
 const w=new CityWalk(x=>Math.abs(x-2.5)<.12,()=>0);Object.assign(w,{active:true,x:3.3,z:0});
 assert.equal(w.canEnter(car),false,'cannot enter across a wall');
 const bridge=new CityWalk(()=>false,x=>x>2.5?0:6);Object.assign(bridge,{active:true,x:3,z:0});assert.equal(bridge.canEnter(car),false);
 const clear=new CityWalk(()=>false,()=>0);Object.assign(clear,{active:true,x:2,z:0});assert(clear.canEnter(car));
});
test('walking queries live collision state and follows ramps and steps',()=>{
 let wall=true;const w=new CityWalk((_x,z)=>wall&&z>.8,(_x,z)=>z*.08+(z>2?.15:0));w.active=true;
 for(let i=0;i<25;i++)w.step(new Set(['KeyW']),.05);assert(w.z<.8);
 wall=false;for(let i=0;i<35;i++)w.step(new Set(['KeyW']),.05);assert(w.z>2);assert(w.eye.y>1.8);
});
test('camera zoom stays finite and bounded; diagonal running is normalized',()=>{
 const a=new CityWalk(()=>false,()=>0),b=new CityWalk(()=>false,()=>0);a.active=b.active=true;
 a.step(new Set(['KeyW','ShiftLeft']),.05);b.step(new Set(['KeyW','KeyD','ShiftLeft']),.05);assert(Math.abs(a.distance-b.distance)<1e-7);
 for(let i=0;i<200;i++)a.zoom(1000);assert.equal(a.cameraDistance,7);for(let i=0;i<200;i++)a.zoom(-1000);assert.equal(a.cameraDistance,1.5);
});
