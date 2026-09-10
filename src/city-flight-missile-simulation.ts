import {flightBasis,flightPoint,type FlightPose,type FlightPoint,type FlightHit,type FlightSweep} from './city-flight-simulation.ts';

export const FLIGHT_MISSILE_LIMITS={capacity:6,reload:.85,lifetime:6,launchSpeed:135,maxSpeed:290,acceleration:95} as const;
export type FlightMissile={slot:number;position:FlightPoint;direction:FlightPoint;speed:number;age:number;yaw:number;pitch:number;roll:number;travel:number};
export type MissileImpact={hit:FlightHit;yaw:number};

/** Forward-fired game rockets. Sweep every travelled segment, including the
 * last one before timeout; a fast projectile must not skip a thin facade. */
export class FlightMissileSimulation{
 readonly missiles:FlightMissile[]=[];
 cooldown=0;shots=0;hits=0;private wing=1;
 fire(pose:FlightPose,airSpeed:number){
  const C=FLIGHT_MISSILE_LIMITS;
  if(this.cooldown>0||this.missiles.length>=C.capacity||![...Object.values(pose),airSpeed].every(Number.isFinite))return null;
  const slot=Array.from({length:C.capacity},(_,i)=>i).find(i=>!this.missiles.some(m=>m.slot===i))!;
  const missile:FlightMissile={slot,position:flightPoint(pose,this.wing*3.4,2.2,-.35),direction:flightBasis(pose).forward,
   speed:Math.min(C.maxSpeed,C.launchSpeed+Math.max(0,airSpeed)),age:0,yaw:pose.yaw,pitch:pose.pitch,roll:pose.roll,travel:0};
  this.wing*=-1;this.cooldown=C.reload;this.shots++;this.missiles.push(missile);return missile;
 }
 step(dt:number,sweep:FlightSweep){
  const impacts:MissileImpact[]=[];if(!Number.isFinite(dt)||dt<=0)return impacts;
  const C=FLIGHT_MISSILE_LIMITS,h=Math.min(.1,dt);this.cooldown=Math.max(0,this.cooldown-h);
  for(let i=this.missiles.length-1;i>=0;i--){
   const m=this.missiles[i],time=Math.min(h,C.lifetime-m.age),accelerating=Math.min(time,Math.max(0,(C.maxSpeed-m.speed)/C.acceleration));
   const speed=m.speed+C.acceleration*accelerating;
   const travel=m.speed*accelerating+.5*C.acceleration*accelerating**2+speed*(time-accelerating);
   const next={x:m.position.x+m.direction.x*travel,y:m.position.y+m.direction.y*travel,z:m.position.z+m.direction.z*travel};
   const hit=sweep(m.position,next);m.age+=time;m.speed=speed;m.travel+=travel;
   if(hit||m.age>=C.lifetime-1e-8){this.missiles.splice(i,1);if(hit){this.hits++;impacts.push({hit,yaw:m.yaw});}}
   else m.position=next;
  }
  return impacts;
 }
 clear(){this.missiles.length=0;this.cooldown=0;this.wing=1;}
}
