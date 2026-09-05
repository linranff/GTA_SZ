import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CityAutopilot,type AutopilotTraffic} from '../src/city-autopilot.ts';
import {CityCollision,closest,stepCar,type CarState} from '../src/driving.ts';
import {RoadGraph} from '../src/navigation.ts';
import type {CityData,V2} from '../src/city-types.ts';

const DT=1/30;
function fixture(points:V2[],width=10) {
 const data:CityData={meta:{counts:{},extent:[-500,-500,500,500],horizontalScale:.6},
  land:[[[[-500,-500],[500,-500],[500,500],[-500,500],[-500,-500]]]],coast:[],
  roads:[{id:'road',name:'Test road',kind:'residential',width,oneway:false,points,grade:'0'}],
  buildings:[],green:[],water:[],landmarks:[],spawn:{x:points[0][0],z:points[0][1],yaw:0,road:'Test road'}};
 return {data,collision:new CityCollision(data),graph:new RoadGraph(data.roads)};
}
function car(x=0,z=0,yaw=0):CarState{return {x,z,yaw,speed:0,steer:0,distance:0};}
function tick(controller:CityAutopilot,state:CarState,collision:CityCollision,traffic:readonly AutopilotTraffic[]=[]) {
 const before={...state},start=performance.now(),result=controller.update(state,traffic,DT),updateMs=performance.now()-start;
 assert.deepEqual(state,before,'controller must not move the car itself');
 assert(Number.isFinite(result.input.throttle)&&Math.abs(result.input.throttle)<=1);
 assert(Number.isFinite(result.input.steer)&&Math.abs(result.input.steer)<=1);
 stepCar(state,result.input,DT);
 const nose=Math.sign(state.speed)*1.45;
 const collisionHit=collision.blocked(state.x+Math.sin(state.yaw)*nose,state.z+Math.cos(state.yaw)*nose)
  ||traffic.some(t=>Math.hypot(t.x-state.x,t.z-state.z)<2.7);
 if(collisionHit){state.x=before.x;state.z=before.z;state.distance=before.distance;state.speed=-before.speed*.15;}
 assert(Math.hypot(state.x-before.x,state.z-before.z)<=Math.abs(state.speed)*DT+.05,'no reset or teleport');
 return {result,collisionHit,updateMs};
}
function drive(controller:CityAutopilot,state:CarState,collision:CityCollision,seconds:number,traffic=(t:number):readonly AutopilotTraffic[]=>[]) {
 let hits=0,reverseFrames=0,waitingFrames=0,elapsed=seconds;const updates:number[]=[],slowUpdates:{ms:number;phase:string;reason:string|null;seconds:number}[]=[];
 for(let frame=0;frame<seconds/DT;frame++) {
  const sample=tick(controller,state,collision,traffic(frame*DT));
  hits+=Number(sample.collisionHit);reverseFrames+=Number(state.speed<-.2);
  updates.push(sample.updateMs);
  if(sample.updateMs>8)slowUpdates.push({ms:sample.updateMs,phase:sample.result.status.phase,reason:sample.result.status.reason,seconds:frame*DT});
  waitingFrames+=Number(sample.result.status.phase==='yielding');
  if(!sample.result.status.active){elapsed=frame*DT;break;}
 }
 updates.sort((a,b)=>a-b);
 const updateMs={mean:updates.reduce((a,b)=>a+b,0)/updates.length,p95:updates[Math.floor(updates.length*.95)],p99:updates[Math.floor(updates.length*.99)],max:updates.at(-1),over8:updates.filter(v=>v>8).length,over16:updates.filter(v=>v>16).length};
 return {seconds:elapsed,hits,reverseFrames,waitingFrames,updateMs,slowUpdates:slowUpdates.sort((a,b)=>b.ms-a.ms).slice(0,5)};
}
function assertArrived(controller:CityAutopilot,state:CarState,target:V2) {
 assert.equal(controller.status.phase,'arrived',JSON.stringify({phase:controller.status.phase,reason:controller.status.reason,remaining:controller.status.remainingDistance,state}));
 assert(Math.hypot(state.x-target[0],state.z-target[1])<=2.6,'park at the actual destination');
 assert(Math.abs(state.speed)<.2,'arrival means stopped');
 assert.equal(controller.status.remainingDistance,0);
 assert.equal(controller.status.etaSeconds,0);
}

test('real steering and wheelbase negotiate two turns and park without circling',()=>{
 const {collision,graph}=fixture([[0,0],[0,70],[65,70],[65,145]],12),controller=new CityAutopilot(graph,collision),state=car(),arrival:V2=[65,140];
 controller.start({id:'turns',name:'Two turns',arrival});
 const run=drive(controller,state,collision,100);assertArrived(controller,state,arrival);assert.equal(run.hits,0);
 const parked={...state};for(let i=0;i<300;i++)tick(controller,state,collision);
 assert(Math.hypot(state.x-parked.x,state.z-parked.z)<.03,'arrival remains parked');
});

test('opposite initial heading uses bounded real forward/reverse steering and then reaches the destination',()=>{
 const {collision,graph}=fixture([[0,-40],[0,160]],18),controller=new CityAutopilot(graph,collision),state=car(0,0,Math.PI),arrival:V2=[0,145];
 controller.start({id:'reverse-start',name:'Behind the car',arrival});
 const run=drive(controller,state,collision,120);assertArrived(controller,state,arrival);assert.equal(run.hits,0);assert(run.reverseFrames>0);
 assert(controller.status.maneuvers>0&&controller.status.maneuvers<=3);
});

test('moving traffic is followed and temporary full-width blockage resumes after the vehicle leaves',()=>{
 const {collision,graph}=fixture([[0,-20],[0,230]],6),arrival:V2=[0,160];
 const following=new CityAutopilot(graph,collision),s=car();following.start({id:'follow',name:'Follow',arrival});
 const run=drive(following,s,collision,90,t=>[{x:1.15,z:18+t*4,speed:15,yaw:0}]);
 assertArrived(following,s,arrival);assert.equal(run.hits,0);assert(run.seconds>30,'must account for slower leading traffic');
 const waiting=new CityAutopilot(graph,collision),w=car();waiting.start({id:'wait',name:'Wait',arrival});
 const waited=drive(waiting,w,collision,90,t=>t<12?[{x:0,z:24,speed:15,yaw:0}]:[]);
 assertArrived(waiting,w,arrival);assert.equal(waited.hits,0);assert(waited.waitingFrames>10,'stationary traffic is detected from actual positions, not its nominal speed');
});

test('persistent obstruction stops safely, and manual takeover immediately cancels future commands',()=>{
 const {collision,graph}=fixture([[0,-20],[0,150]],6),controller=new CityAutopilot(graph,collision,{maxWaitSeconds:4}),state=car();
 controller.start({id:'blocked',name:'Blocked',arrival:[0,130]});
 const blocker=[{x:0,z:24,speed:12,yaw:0}],run=drive(controller,state,collision,30,()=>blocker);
 assert.equal(controller.status.phase,'blocked');assert.equal(run.hits,0);assert(Math.abs(state.speed)<.2);assert(state.z<21);
 assert.equal(controller.status.reroutes,0,'a single blocked road has no invented detour');
 controller.start({id:'manual',name:'Manual',arrival:[0,130]});
 for(let i=0;i<30;i++)tick(controller,state,collision);
 controller.cancel('manual-takeover');
 for(let i=0;i<60;i++) {
  const result=controller.update(state,[],DT);assert.equal(result.status.phase,'cancelled');
  assert.deepEqual(result.input,{throttle:0,steer:0,handbrake:false});
 }
 assert.equal(controller.status.reason,'manual-takeover');
});

test('wide-road passing stays on the road and avoids the stopped traffic car',()=>{
 const {collision,graph}=fixture([[0,-20],[0,170]],18),controller=new CityAutopilot(graph,collision),state=car(),arrival:V2=[0,150];
 controller.start({id:'pass',name:'Pass stopped car',arrival});
 const run=drive(controller,state,collision,90,()=>[{x:1.15,z:35,speed:12,yaw:0}]);
 assertArrived(controller,state,arrival);assert.equal(run.hits,0);
});

test('selecting the current stopped destination immediately arrives without starting a loop',()=>{
 const {collision,graph}=fixture([[0,0],[0,100]],8),controller=new CityAutopilot(graph,collision),state=car(0,70);
 controller.start({id:'here',name:'Already here',arrival:[0,70]});
 tick(controller,state,collision);assertArrived(controller,state,[0,70]);assert.equal(state.distance,0);
});

test('disconnected road graph stops without moving; invalid destinations are rejected',()=>{
 const {collision,data}=fixture([[0,0],[0,20]],6);
 const graph=new RoadGraph(data.roads,{nodes:[[0,0],[0,20],[100,0],[100,20]],edges:[[0,1],[2,3]]});
 const controller=new CityAutopilot(graph,collision),state=car();
 assert.throws(()=>controller.start({id:'bad',name:'Bad',arrival:[NaN,0]}));
 controller.start({id:'unreachable',name:'Unreachable',arrival:[100,20]});
 const {result}=tick(controller,state,collision);assert.equal(result.status.phase,'blocked');assert.equal(result.status.reason,'no-road-route');assert.equal(state.distance,0);
});

const actual=JSON.parse(fs.readFileSync('public/city/city.json','utf8'));
const detail=JSON.parse(fs.readFileSync('public/city/landmark-detail.json','utf8'));
actual.buildings=actual.buildings.filter((b:{id:string})=>!detail.baseBuildingIds.includes(b.id));
for(const b of detail.collisionFootprints)actual.buildings.push({...b,height:1,style:'detail'});
for(const m of detail.landmarks) {const index=actual.landmarks.findIndex((p:{id:string})=>p.id===m.id);if(index<0)actual.landmarks.push(m);else actual.landmarks[index]={...actual.landmarks[index],...m};}
const city=actual as CityData,cityCollision=new CityCollision(city),cityGraph=new RoadGraph(city.roads,JSON.parse(fs.readFileSync('public/city/navigation.json','utf8')));
for(const [name,start] of [
 ['actual Tencent parking pose',[-5465.953431,-684.687511,-.72075067]],
 ['reported stopped pose',[-5433.89895,-742.56657,-4.69739]],
] as const)test(`stationary traffic near Tencent: ${name} safely detours to baypark`,t=>{
 const destination=city.landmarks.find(m=>m.id==='baypark')!,controller=new CityAutopilot(cityGraph,cityCollision),state=car(...start);
 // The original GPU capture has no traffic snapshot. This fixed stopped car
 // recreates a blocked lane at that exact road, without claiming it was the
 // lost traffic actor. Neither collision exemptions nor teleporting are used.
 const stoppedTraffic=[{x:-5429.1,z:-742.6,speed:12,yaw:Math.PI/2}];
 controller.start(destination);const run=drive(controller,state,cityCollision,600,()=>stoppedTraffic);
 assertArrived(controller,state,destination.arrival);assert.equal(run.hits,0);
 assert.equal(controller.status.reroutes,1);assert(run.waitingFrames>60,'wait for observed stationary traffic before rerouting');
 const planned=controller.status.route,obstacle=stoppedTraffic[0];
 assert(planned.slice(1).every((p,i)=>closest(obstacle.x,obstacle.z,planned[i],p).d>3.05),'the detour must not seed the far side of an obstructed start edge');
 t.diagnostic(JSON.stringify({name,state,reroutes:controller.status.reroutes,...run}));
});
const destinations=process.env.AUTOPILOT_ALL_DESTINATIONS==='1'?city.landmarks.map(m=>m.id):['bamboo','tencent','civic','talent','baypark','qijie-gongguan'];
for(const id of destinations)test(`actual merged city: opening → ${id} completes entirely through stepCar`,t=>{
 const destination=city.landmarks.find(m=>m.id===id)!,controller=new CityAutopilot(cityGraph,cityCollision),state:CarState={...city.spawn,speed:0,steer:0,distance:0};
 controller.start(destination);const run=drive(controller,state,cityCollision,1200);
 assertArrived(controller,state,destination.arrival);assert.equal(run.hits,0);assert(state.distance>(id==='baypark'?600:2500));
 t.diagnostic(JSON.stringify({id,distance:state.distance,maneuvers:controller.status.maneuvers,...run}));
});

test('faster main-road cruise remains road-aware and brakes before the destination',t=>{
 const runFor=(kind:string,cruiseSpeed?:number)=>{const {collision,graph,data}=fixture([[0,0],[0,450]],12);data.roads[0].kind=kind;const controller=new CityAutopilot(graph,collision,{cruiseSpeed}),state=car(),arrival:V2=[0,430];controller.start({id:kind,name:kind,arrival});let peak=0,hits=0,seconds=0;for(let i=0;i<3000&&controller.status.active;i++){const sample=tick(controller,state,collision);peak=Math.max(peak,state.speed);hits+=Number(sample.collisionHit);seconds=i*DT;}assertArrived(controller,state,arrival);assert.equal(hits,0);return{peak,seconds};};
 const main=runFor('primary'),local=runFor('residential'),service=runFor('service'),previousCeiling=runFor('primary',13);t.diagnostic(JSON.stringify({main,local,service,previousCeiling}));
 assert(main.peak>22&&main.peak<24.5,JSON.stringify(main));assert(local.peak<=15.1);assert(service.peak<=10.1);assert(main.seconds<local.seconds*.8,'main-road cruise should produce a materially faster journey');assert(main.seconds<previousCeiling.seconds*.75,'straight-route journey should be at least 25% shorter than the previous 13-unit ceiling');
});

test('higher main-road cruise anticipates a right angle and stopped traffic without collisions',()=>{
 const {collision,graph,data}=fixture([[0,0],[0,260],[150,260]],12);data.roads[0].kind='primary';const controller=new CityAutopilot(graph,collision),state=car(),arrival:V2=[145,260];controller.start({id:'fast-turn',name:'Fast turn',arrival});let peak=0,nearTurnPeak=0,hits=0;
 for(let i=0;i<6000&&controller.status.active;i++){const sample=tick(controller,state,collision);peak=Math.max(peak,state.speed);if(Math.hypot(state.x,state.z-260)<8)nearTurnPeak=Math.max(nearTurnPeak,state.speed);hits+=Number(sample.collisionHit);}
 assertArrived(controller,state,arrival);assert.equal(hits,0);assert(peak>22);assert(nearTurnPeak<8,'braking must occur before a high-speed right angle');
 const straight=fixture([[0,-20],[0,450]],6);straight.data.roads[0].kind='primary';const waiting=new CityAutopilot(straight.graph,straight.collision,{maxWaitSeconds:4}),w=car();waiting.start({id:'fast-blocked',name:'Fast blocked',arrival:[0,430]});const run=drive(waiting,w,straight.collision,60,()=>[{x:0,z:180,speed:0,yaw:0}]);assert.equal(run.hits,0);assert.equal(waiting.status.phase,'blocked');assert(w.z<177.4);assert(Math.abs(w.speed)<.2);
});
