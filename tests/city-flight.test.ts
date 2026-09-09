import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightSimulation,FLIGHT_RECOVERY_MS,flightBasis,flightPoint,type FlightHit,type FlightPoint} from '../src/city-flight-simulation.ts';
import {FlightCityCollision,intersectFlightPrism} from '../src/city-flight-collision.ts';
import type {CityData,V2} from '../src/city-types.ts';

const extent=[-2000,-2000,2000,2000];
const noKeys=new Set<string>();
const clear=()=>null;
const point=(x:number,y:number,z:number):FlightPoint=>({x,y,z});
const rectangle=(x0:number,z0:number,x1:number,z1:number):V2[]=>[
 [x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0],
];
const close=(actual:number,expected:number,message?:string)=>assert.ok(Math.abs(actual-expected)<1e-8,message??`${actual} differs from ${expected}`);
function city(buildings:CityData['buildings']):CityData{
 return {meta:{counts:{},extent,horizontalScale:.6},buildings,
  land:[],coast:[],roads:[],green:[],water:[],landmarks:[],spawn:{x:0,z:0,yaw:0,road:''}};
}
function fly(keys:string[],seconds=2){
 const sim=new FlightSimulation();sim.start(point(0,150,0),0);
 for(let frame=0;frame<seconds*60;frame++)sim.step(new Set(keys),1/60,frame*1000/60,clear,extent);
 return sim;
}

test('a swept segment hits a 5 mm facade even when both endpoints are outside',()=>{
 const rings=[rectangle(0,-10,.005,10)];
 close(intersectFlightPrism(point(-50,40,0),point(50,40,0),rings,80)!, .5);
 close(intersectFlightPrism(point(50,40,0),point(-50,40,0),rings,80)!, (50-.005)/100);
});

test('roof altitude clips a diagonal/vertical sweep without blocking flight above the roof',()=>{
 const rings=[rectangle(-10,-10,10,10)];
 assert.equal(intersectFlightPrism(point(-30,80.01,0),point(30,80.01,0),rings,80),null);
 close(intersectFlightPrism(point(0,120,0),point(0,40,0),rings,80)!, .5);
 // The horizontal footprint is already entered when the descending path meets the roof.
 close(intersectFlightPrism(point(-20,100,0),point(20,60,0),rings,80)!, .5);
 assert.equal(intersectFlightPrism(point(-20,-1,0),point(20,-1,0),rings,80),null);
});

test('courtyard holes remain flyable and report the first wall when leaving the courtyard',()=>{
 const rings=[rectangle(-10,-10,10,10),rectangle(-5,-5,5,5)];
 assert.equal(intersectFlightPrism(point(0,40,0),point(0,40,4),rings,80),null);
 assert.equal(intersectFlightPrism(point(0,120,0),point(0,10,0),rings,80),null);
 close(intersectFlightPrism(point(0,40,0),point(9,40,0),rings,80)!, 5/9);
 close(intersectFlightPrism(point(-20,40,0),point(20,40,0),rings,80)!, .25);
});

test('spatial broad phase spans negative grid cells and selects the nearest facade',()=>{
 const buildings=[
  {id:'far',rings:[rectangle(170,-4,180,4)],height:100,style:'office'},
  {id:'near',rings:[rectangle(-170,-4,-169.995,4)],height:100,style:'office'},
 ];
 const collision=new FlightCityCollision(city(buildings),()=>0);
 const hit=collision.sweep(point(-330,50,0),point(330,50,0));
 assert.equal(hit?.kind,'building');assert.equal(hit?.id,'near');close(hit!.point.x,-170);
 assert.equal(collision.sweep(point(-330,101,0),point(330,101,0)),null);
});

test('replacement landmark footprints do not introduce an invisible full-height collision box',()=>{
 const collision=new FlightCityCollision(city([
  {rings:[rectangle(-10,-10,10,10)],height:400,style:'landmark-detail'},
 ]),()=>0);
 assert.equal(collision.sweep(point(-20,50,0),point(20,50,0)),null);
});

test('terrain collision wins over a farther building and does not report the farther wall first',()=>{
 const collision=new FlightCityCollision(city([
  {rings:[rectangle(60,-10,70,10)],height:80,style:'office'},
 ]),(x)=>x>=20?10:0);
 const hit=collision.sweep(point(0,5,0),point(100,5,0));
 assert.equal(hit?.kind,'terrain');assert.ok(hit!.point.x>=20&&hit!.point.x<21.5);
});

test('the actual simulation detects a nose crossing a thin wall before the aircraft centre reaches it',()=>{
 const collision=new FlightCityCollision(city([
  {rings:[rectangle(-10,4.90,10,4.905)],height:100,style:'office'},
 ]),()=>0);
 const sim=new FlightSimulation();sim.start(point(0,60,0),0);
 assert.equal(sim.step(noKeys,1/60,500,(a,b)=>collision.sweep(a,b),extent),'crashed');
 assert.equal(sim.phase,'exploding');assert.equal(sim.speed,0);assert.equal(sim.crashes,1);
 assert.ok(sim.pose.z<1,'The nose should hit while the fuselage centre remains behind the wall');
 close(sim.hit!.point.z,4.90);
});

test('the full wing edge catches an obstacle between the discrete wing sample points',()=>{
 const collision=new FlightCityCollision(city([
  {rings:[rectangle(4.4,.10,4.6,.70)],height:100,style:'office'},
 ]),()=>0);
 const sim=new FlightSimulation();sim.start(point(0,60,0),0);
 assert.equal(sim.step(noKeys,1/60,500,(a,b)=>collision.sweep(a,b),extent),'crashed');
 assert.ok(sim.hit!.point.x>=4.4&&sim.hit!.point.x<=4.6);
 assert.ok(sim.hit!.point.y>60,'Collision is on the elevated wing rather than the fuselage');
});

test('an explosion lasts exactly three seconds of wall-clock time and emits one recovery event',()=>{
 assert.equal(FLIGHT_RECOVERY_MS,3000);
 const sim=new FlightSimulation();sim.start(point(0,60,0),0);
 const crashAt=12500,hit:FlightHit={point:point(0,60,5),kind:'building',id:'test-wall'};
 assert.equal(sim.step(noKeys,1/60,crashAt,()=>hit,extent),'crashed');
 const crashPose={...sim.pose};
 assert.equal(sim.step(new Set(['KeyW','KeyD']),.1,crashAt+2999,clear,extent),null);
 assert.equal(sim.phase,'exploding');assert.equal(sim.active,true);assert.deepEqual(sim.pose,crashPose);
 assert.equal(sim.step(noKeys,0,crashAt+3000,clear,extent),'recovered');
 assert.equal(sim.phase,'idle');assert.equal(sim.active,false);
 assert.equal(sim.step(noKeys,.1,crashAt+9000,clear,extent),null);
 assert.equal(sim.crashes,1);
});

test('manual exit during an explosion cancels delayed recovery, including after a new flight starts',()=>{
 const sim=new FlightSimulation();sim.start(point(0,60,0),0);
 assert.equal(sim.step(noKeys,.01,1000,()=>({point:point(0,60,4.9),kind:'building'}),extent),'crashed');
 sim.stop();assert.equal(sim.phase,'idle');assert.equal(sim.hit,null);
 assert.equal(sim.step(noKeys,.02,4000,clear,extent),null);
 sim.start(point(100,150,100),.5);
 assert.equal(sim.step(noKeys,.02,5000,clear,extent),null);
 assert.equal(sim.phase,'flying');assert.equal(sim.hit,null);assert.equal(sim.speed>0,true);
});

test('W raises the nose and gains altitude; S lowers the nose and loses altitude',()=>{
 const up=fly(['KeyW']),down=fly(['KeyS']);
 assert.ok(up.pose.pitch>.3);assert.ok(up.pose.y>170);
 assert.ok(down.pose.pitch<-.3);assert.ok(down.pose.y<130);
 close(up.pose.roll,0);close(down.pose.roll,0);
});

test('A and D bank and turn in opposite directions while self-levelling after release',()=>{
 const left=fly(['KeyA']),right=fly(['KeyD']);
 assert.ok(left.pose.roll<-.5&&left.pose.yaw<-.3&&left.pose.x<0);
 assert.ok(right.pose.roll>.5&&right.pose.yaw>.3&&right.pose.x>0);
 close(left.pose.x,-right.pose.x);close(left.pose.roll,-right.pose.roll);
 for(let i=0;i<180;i++)right.step(noKeys,1/60,2000+i*1000/60,clear,extent);
 assert.ok(Math.abs(right.pose.roll)<.01,'Assisted flight should level wings when banking input is released');
});

test('arrow keys match WASD flight controls',()=>{
 const wasd=fly(['KeyW','KeyD'],.5),arrows=fly(['ArrowUp','ArrowRight'],.5);
 assert.deepEqual(arrows.pose,wasd.pose);close(arrows.speed,wasd.speed);
});

test('crossing a world boundary exits without an explosion and leaves a valid return position',()=>{
 const sim=new FlightSimulation();sim.start(point(84.7,100,0),Math.PI/2);
 const bounds=[-100,-100,100,100];
 assert.equal(sim.step(noKeys,.1,1000,clear,bounds),'boundary');
 assert.equal(sim.phase,'idle');assert.equal(sim.active,false);assert.equal(sim.crashes,0);assert.equal(sim.hit,null);
 assert.ok(sim.pose.x<=85&&sim.pose.x>=-85);assert.ok(sim.pose.z<=85&&sim.pose.z>=-85);
 assert.equal(sim.step(noKeys,.1,6000,clear,bounds),null);
});

test('flight coordinate basis preserves orthogonal wing and fuselage collision offsets under attitude changes',()=>{
 const pose={x:30,y:200,z:70,yaw:1.15,pitch:.38,roll:-.63};
 const basis=flightBasis(pose),dot=(a:FlightPoint,b:FlightPoint)=>a.x*b.x+a.y*b.y+a.z*b.z;
 for(const vector of Object.values(basis))close(dot(vector,vector),1);
 close(dot(basis.forward,basis.right),0);close(dot(basis.forward,basis.up),0);close(dot(basis.right,basis.up),0);
 const wing=flightPoint(pose,7,0,0);close(Math.hypot(wing.x-pose.x,wing.y-pose.y,wing.z-pose.z),7);
 const nose=flightPoint(pose,0,4.7,0);close(Math.hypot(nose.x-pose.x,nose.y-pose.y,nose.z-pose.z),4.7);
});
