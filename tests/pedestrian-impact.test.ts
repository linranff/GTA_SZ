import test from 'node:test';
import assert from 'node:assert/strict';
import {createPedestrianBody,detectPedestrianImpact,pedestrianSupportHeight,stepPedestrianBody,PEDESTRIAN_IMPACT,
 type ImpactCarPose,type PedestrianBody,type PedestrianImpact} from '../src/pedestrian-impact.ts';

const pose=(x=0,z=0,speed=10,yaw=0,groundY=0):ImpactCarPose=>({x,z,speed,yaw,groundY});
const person={x:0,y:0,z:0};
const impact=(speed:number)=>detectPedestrianImpact(pose(0,-4,speed),pose(0,4,speed),person)!;
function finiteBody(body:PedestrianBody){for(const [key,value] of Object.entries(body))if(typeof value==='number')assert(Number.isFinite(value),`${key} must remain finite`);}
function simulate(body:PedestrianBody,seconds=12,dt=1/60,heightAt=(_x:number,_z:number)=>0,blocked=(_x:number,_z:number)=>false){
 let peak=body.y,bounces=0,previousVy=body.vy;
 for(let i=0;i<seconds/dt&&body.phase!=='recovering';i++){
  stepPedestrianBody(body,dt,heightAt,blocked);finiteBody(body);peak=Math.max(peak,body.y);
  assert(body.y+1e-8>=heightAt(body.x,body.z)+pedestrianSupportHeight(body),'rotating body stays above its support plane');
  if(previousVy<0&&body.vy>0)bounces++;previousVy=body.vy;
 }
 return {peak,distance:Math.hypot(body.x,body.z),bounces};
}

test('front and reverse sweeps produce correctly directed impulses without changing vehicle or pedestrian inputs',()=>{
 const before=Object.freeze(pose(0,-4,10)),after=Object.freeze(pose(0,4,10)),p=Object.freeze({...person,vx:.5,vz:0});
 const hit=detectPedestrianImpact(before,after,p)!;assert(hit);assert(hit.velocity.z>0);assert(Math.abs(hit.velocity.x)<1);
 assert(hit.fraction>0&&hit.fraction<1);assert(hit.spin.x>0);assert.deepEqual(before,pose(0,-4,10));assert.deepEqual(after,pose(0,4,10));
 const reverse=detectPedestrianImpact(pose(0,4,-10),pose(0,-4,-10),person)!;
 assert(reverse);assert(reverse.velocity.z<0);assert(reverse.spin.x<0);assert(reverse.velocity.y>0);
 assert.equal(detectPedestrianImpact(pose(),pose(),person),null,'a stationary overlapping car cannot repeatedly launch a person');
});

test('side scrape pushes away from the body; passing just outside the rounded footprint misses',()=>{
 const side=detectPedestrianImpact(pose(0,-4,12),pose(0,4,12),{x:1.2,y:0,z:0})!;
 assert(side);assert(side.velocity.x>0);assert(side.velocity.z>0);assert(side.spin.z<0);
 assert.equal(detectPedestrianImpact(pose(0,-4,12),pose(0,4,12),{x:1.32,y:0,z:0}),null);
 assert.equal(detectPedestrianImpact(pose(0,0,1),pose(0,.01,1),{x:1.25,y:0,z:2.75}),null,'rounded corners must not use an expanded square hit box');
});

test('high-speed sweep catches a person between both endpoints, including a turning car and yaw wrap',()=>{
 const fast=detectPedestrianImpact(pose(0,-80,53),pose(0,80,53),person)!;
 assert(fast);assert(fast.fraction>.45&&fast.fraction<.5);
 assert(Math.hypot(fast.velocity.x,fast.velocity.z)<=PEDESTRIAN_IMPACT.maxHorizontalSpeed);
 assert(detectPedestrianImpact(pose(0,0,8,0),pose(.1,0,8,Math.PI/2),{x:2,y:0,z:.1}),'a rotating front corner sweeps outside both the centre path and old width');
 assert(detectPedestrianImpact(pose(0,4,-10,Math.PI-.01),pose(0,-4,-10,-Math.PI+.01),person));
});

test('near-parallel rotating side scrapes do not exhaust a distance-advancement loop before contact',()=>{
 for(const [yaw,x,z,nextYaw,px,pz] of [
  [2.383859627880156,-3.5153265949338675,-3.111888512969017,2.508471680106595,.2978832880035043,-3.4593562385998666],
  [-1.275822725147009,3.459776682779193,-1.328553181141615,-1.282969922432676,4.217980979010463,-2.850232881028205],
  [-.6134108304977417,2.338364778086543,-3.479211714118719,-.6876533063594252,1.4084519166499376,-4.212758534122258],
 ]) {
  const hit=detectPedestrianImpact(pose(0,0,20,yaw),pose(x,z,20,nextYaw),{x:px,y:0,z:pz});assert(hit);
  const angle=mixAngle(yaw,nextYaw,hit.fraction),rx=px-x*hit.fraction,rz=pz-z*hit.fraction;
  const right=rx*Math.cos(angle)-rz*Math.sin(angle),forward=rx*Math.sin(angle)+rz*Math.cos(angle);
  assert(Math.hypot(Math.max(0,Math.abs(right)-1.03),Math.max(0,Math.abs(forward)-2.5))<=.28011,'the reported contact lies on the actual rotated footprint');
 }
});
function mixAngle(a:number,b:number,t:number){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;}

test('bridge height prevents impacts between roads above and below, with height interpolated along the sweep',()=>{
 assert.equal(detectPedestrianImpact(pose(0,-4,20,0,8),pose(0,4,20,0,8),person),null);
 assert.equal(detectPedestrianImpact(pose(0,-4,20),pose(0,4,20),{...person,y:8}),null);
 assert(detectPedestrianImpact(pose(0,-4,20,0,4),pose(0,4,20,0,0),person),'a descending vehicle can meet the pedestrian during the sweep');
 assert.equal(detectPedestrianImpact(pose(0,-4,20,0,20),pose(0,4,20,0,8),person),null);
});

test('walking velocity affects relative impact strength and invalid poses never create a hit',()=>{
 const normal=impact(10),following=detectPedestrianImpact(pose(0,-4,10),pose(0,4,10),{...person,vz:3})!;
 const opposing=detectPedestrianImpact(pose(0,-4,10),pose(0,4,10),{...person,vz:-3})!;
 assert(following.speed<normal.speed&&opposing.speed>normal.speed);
 assert.equal(detectPedestrianImpact({...pose(),x:NaN},pose(0,2),person),null);
 assert.equal(detectPedestrianImpact(pose(),pose(0,2),{...person,y:Infinity}),null);
});

test('low speed nudges, high speed travels farther and higher, with at most one small ground bounce',()=>{
 const low=createPedestrianBody(person,impact(.8)),high=createPedestrianBody(person,impact(38));
 assert.equal(low.y,.9,'body origin is the hip/centre, not the foot');
 const lowRun=simulate(low),highRun=simulate(high);
 assert(lowRun.distance<2);assert(highRun.distance>lowRun.distance+8);assert(highRun.peak>lowRun.peak+1.2);
 assert(highRun.bounces<=1);assert(high.bounces<=1);assert.equal(low.phase,'recovering');assert.equal(high.phase,'recovering');
 assert(low.grounded&&high.grounded);assert.equal(high.vx,0);assert.equal(high.vy,0);assert.equal(high.vz,0);
});

test('rolling body recalculates its ground support and settles flat without hovering or sinking',()=>{
 const body=createPedestrianBody(person,impact(24));simulate(body);
 assert.equal(body.phase,'recovering');assert(Math.abs(Math.abs(body.rx)-Math.PI/2)<.08);assert(Math.abs(body.rz)<.08);
 assert(Math.abs(body.y-pedestrianSupportHeight(body))<1e-9);assert(body.y<.36,'lying centre must settle close to the ground');
 const uphill=createPedestrianBody({...person,y:2},impact(20));simulate(uphill,12,1/60,(_x,z)=>2+z*.04);
 assert.equal(uphill.phase,'recovering');assert(Math.abs(uphill.y-(2+uphill.z*.04+pedestrianSupportHeight(uphill)))<1e-8);
});

test('a static wall stops horizontal travel and permits bounded damping along the wall',()=>{
 const hit=impact(50),body=createPedestrianBody(person,{...hit,velocity:{x:12,y:hit.velocity.y,z:20}});
 simulate(body,14,1/60,()=>0,(_x,z)=>z>=3);
 assert(body.z<3-PEDESTRIAN_IMPACT.personRadius+1e-8);assert(body.x>0);assert.equal(body.phase,'recovering');
 assert(Math.hypot(body.vx,body.vz)<.01);
});

test('60 Hz substeps agree across frame rates and suspended or malformed frames have finite bounded cost',()=>{
 const a=createPedestrianBody(person,impact(20)),b=createPedestrianBody(person,impact(20));
 for(let i=0;i<30;i++)stepPedestrianBody(a,1/30,()=>0,()=>false);
 for(let i=0;i<60;i++)stepPedestrianBody(b,1/60,()=>0,()=>false);
 for(const key of ['x','y','z','vx','vy','vz','rx','ry','rz'] as const)assert(Math.abs(a[key]-b[key])<1e-9,key);
 let terrainQueries=0,wallQueries=0;const h=createPedestrianBody(person,impact(50));
 stepPedestrianBody(h,100,()=>{terrainQueries++;return 0;},()=>{wallQueries++;return false;});
 assert(terrainQueries<=6);assert(wallQueries<=90);assert(h.age<=.100001);assert(Math.hypot(h.x,h.z)<=2.61);
 const snapshot={...h};stepPedestrianBody(h,NaN,()=>0,()=>false);assert.deepEqual(h,snapshot);
 h.vx=Infinity;h.wx=NaN;stepPedestrianBody(h,.016,()=>NaN,()=>false);finiteBody(h);
 const invalid=createPedestrianBody({x:NaN,y:Infinity,z:NaN},{velocity:{x:NaN,y:Infinity,z:NaN},spin:{x:NaN,y:0,z:0}} as PedestrianImpact);finiteBody(invalid);
});
