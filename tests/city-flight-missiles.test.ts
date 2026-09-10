import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FlightMissileSimulation,FLIGHT_MISSILE_LIMITS as C} from '../src/city-flight-missile-simulation.ts';
import {FlightCityCollision} from '../src/city-flight-collision.ts';
import {FlightSimulation,flightBasis,type FlightPose} from '../src/city-flight-simulation.ts';
import type {CityData} from '../src/city-types.ts';

const pose:FlightPose={x:0,y:50,z:0,yaw:0,pitch:0,roll:0},clear=()=>null;
const city=(buildings:unknown[]=[])=>({buildings}) as CityData;
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('missiles alternate wings and preserve the launch attitude independently of later steering',()=>{
 const sim=new FlightMissileSimulation(),p={...pose,yaw:1,pitch:.4,roll:-.6},basis=flightBasis(p);
 const first=sim.fire(p,48)!;assert.ok(first);assert.deepEqual(first.direction,basis.forward);
 const origin={...first.position};p.yaw=-2;p.pitch=-.3;
 sim.step(.1,clear);assert.ok(first.position.y>origin.y);close((first.position.x-origin.x)/first.travel,basis.forward.x);
 for(let i=0;i<9;i++)sim.step(.1,clear);
 const second=sim.fire(pose,48)!;assert.ok(second.position.x<0);assert.equal(sim.shots,2);
});
test('cooldown and capacity bound held firing, and slots can be reused after expiry',()=>{
 const sim=new FlightMissileSimulation();assert.ok(sim.fire(pose,48));assert.equal(sim.fire(pose,48),null);
 for(let n=1;n<C.capacity;n++){for(let i=0;i<9;i++)sim.step(.1,clear);assert.ok(sim.fire(pose,48));}
 for(let i=0;i<9;i++)sim.step(.1,clear);
 assert.equal(sim.missiles.length,C.capacity);assert.equal(sim.fire(pose,48),null);
 for(let i=0;i<70;i++)sim.step(.1,clear);
 assert.equal(sim.missiles.length,0);assert.equal(sim.hits,0);assert.ok(sim.fire(pose,48));
});
test('fast missiles hit the nearest thin facade between frame positions, exactly once',()=>{
 const building=(z:number)=>({rings:[[[-10,z],[10,z],[10,z+.005],[-10,z+.005],[-10,z]]],height:80});
 const collision=new FlightCityCollision(city([building(20),building(8)]),()=>0),sim=new FlightMissileSimulation();
 sim.fire(pose,48);const hits=sim.step(.1,(a,b)=>collision.sweep(a,b));
 assert.equal(hits.length,1);assert.equal(hits[0].hit.kind,'building');close(hits[0].hit.point.z,8);
 assert.equal(sim.hits,1);assert.equal(sim.missiles.length,0);assert.deepEqual(sim.step(.1,(a,b)=>collision.sweep(a,b)),[]);
});
test('descending missiles detonate at terrain or water level while shots over roofs continue',()=>{
 const collision=new FlightCityCollision(city(),()=>0),sim=new FlightMissileSimulation();
 sim.fire({...pose,y:2,pitch:-.4},48);const hits=sim.step(.1,(a,b)=>collision.sweep(a,b));
 assert.equal(hits[0]?.hit.kind,'terrain');assert.ok(hits[0].hit.point.y<.26);
 const low=new FlightCityCollision(city([{rings:[[[-10,5],[10,5],[10,6],[-10,6],[-10,5]]],height:20}]),()=>0);
 sim.clear();assert.ok(sim.fire(pose,48));assert.deepEqual(sim.step(.1,(a,b)=>low.sweep(a,b)),[]);assert.equal(sim.missiles.length,1);
});
test('clearing on mode exit cancels shots and reload; suspended or invalid frames remain bounded',()=>{
 const sim=new FlightMissileSimulation();sim.fire(pose,48);sim.step(60,clear);
 assert.ok(sim.missiles[0].age<=.1);assert.ok(sim.missiles[0].travel<30);
 const before=JSON.stringify(sim);sim.step(NaN,clear);assert.equal(JSON.stringify(sim),before);
 sim.clear();let calls=0;sim.step(.1,()=>{calls++;return null;});assert.equal(calls,0);assert.equal(sim.cooldown,0);
 assert.equal(sim.fire({...pose,x:NaN},48),null);assert.ok(sim.fire(pose,48));
});
test('thrust and firing are separate: Space leaves throttle unchanged; X slows the plane',()=>{
 const extent=[-1e4,-1e4,1e4,1e4],idle=new FlightSimulation(),fire=new FlightSimulation(),brake=new FlightSimulation();
 for(const sim of [idle,fire,brake])sim.start(pose,0);
 for(let i=0;i<60;i++){idle.step(new Set(),1/60,i*1000/60,clear,extent);fire.step(new Set(['Space']),1/60,i*1000/60,clear,extent);brake.step(new Set(['KeyX']),1/60,i*1000/60,clear,extent);}
 assert.deepEqual(fire.status,idle.status);assert.ok(brake.throttle<idle.throttle-.3);assert.ok(brake.speed<idle.speed);
});
