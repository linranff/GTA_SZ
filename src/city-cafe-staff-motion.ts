import type {CafeCollider,CafeSpec} from './city-cafe-layout.ts';

type Point={x:number;z:number};
export type CafeStaffPose=Point&{id:string;heading:number;speed:number;greeting:boolean;wave:number;walk:number};
type Agent=CafeStaffPose&{route:Point[];next:number;wait:number;waveTime:number;cooldown:number};
const CLEARANCE=.43;
const TAU=Math.PI*2;
const approach=(value:number,target:number,rate:number,dt:number)=>value+(target-value)*(1-Math.exp(-rate*dt));
const angle=(value:number,target:number,dt:number)=>value+Math.atan2(Math.sin(target-value),Math.cos(target-value))*(1-Math.exp(-5*dt));

/** Small authored service routes through the cafe's clear aisles. The barista
 * stays BEHIND the counter. All segments are checked against the real furniture
 * manifest before an employee is allowed to leave their original anchor. */
export const CAFE_STAFF_ROUTES:Record<string,readonly (readonly [number,number])[]>={
 zhixia:[[-2.25,-3.45],[-3.9,-3.45],[-3.9,-5.55],[-.7,-5.55],[-.7,-2.1],[-2.25,-2.1]],
 wangshu:[[5.65,5],[3.4,5.3],[.3,5.3],[3.4,5.3]],
 xiaolan:[[4,-.2],[4,1.75],[.2,1.75],[.2,-1.65],[4,-1.65]],
};

export function cafeStaffPointClear(p:Point,colliders:readonly CafeCollider[],width=18,depth=14){
 return Math.abs(p.x)<width/2-.6&&Math.abs(p.z)<depth/2-.6&&!colliders.some(b=>Math.abs(p.x-b.x)<b.width/2+CLEARANCE&&Math.abs(p.z-b.z)<b.depth/2+CLEARANCE);
}
export function cafeStaffRouteClear(route:readonly Point[],colliders:readonly CafeCollider[],width=18,depth=14){
 return route.length>0&&route.every((a,i)=>{
  const b=route[(i+1)%route.length],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.12));
  for(let j=0;j<=steps;j++)if(!cafeStaffPointClear({x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps},colliders,width,depth))return false;
  return true;
 });
}

export function createCafeStaffMotion(spec:CafeSpec,colliders:readonly CafeCollider[]){
 const agents:Agent[]=spec.staff.map((s,i)=>{
  const route=(CAFE_STAFF_ROUTES[s.id]??[[s.position[0],s.position[1]]]).map(([x,z])=>({x,z}));
  if(!cafeStaffRouteClear(route,colliders,spec.footprint.width,spec.footprint.depth))throw Error('Cafe staff route intersects furniture: '+s.id);
  return {id:s.id,x:s.position[0],z:s.position[1],heading:s.heading,speed:0,greeting:false,wave:0,walk:0,route,next:1%route.length,wait:1.8+i*1.7,waveTime:0,cooldown:0};
 });
 function update(dt:number,player:Point|null,active:boolean){
  if(!active)return agents;
  dt=Math.min(.06,Math.max(0,dt));
  for(const a of agents){
   a.cooldown=Math.max(0,a.cooldown-dt);
   const playerDistance=player?Math.hypot(a.x-player.x,a.z-player.z):Infinity;
   // A little hysteresis prevents repeated waving as the player hovers around
   // the interaction radius. Dialogue never drifts away while being read.
   a.greeting=playerDistance<(a.greeting?3.3:2.7);
   if(a.greeting&&player){
    if(a.cooldown<=0&&a.waveTime<=0){a.waveTime=3.5;a.cooldown=12;}
    a.heading=angle(a.heading,Math.atan2(player.x-a.x,a.z-player.z),dt);
   }
   a.waveTime=Math.max(0,a.waveTime-dt);
   a.wave=approach(a.wave,a.waveTime>.25?1:0,6,dt);
   const goal=a.route[a.next],dx=goal.x-a.x,dz=goal.z-a.z,distance=Math.hypot(dx,dz);
   let desired=0;
   if(!a.greeting&&a.wave<.05){
    if(a.wait>0)a.wait=Math.max(0,a.wait-dt);
    else if(distance<.07){a.next=(a.next+1)%a.route.length;a.wait=a.id==='wangshu'?3.8:2.6;}
    else{
     a.heading=angle(a.heading,Math.atan2(dx,-dz),dt);
     const turnError=Math.abs(Math.atan2(Math.sin(Math.atan2(dx,-dz)-a.heading),Math.cos(Math.atan2(dx,-dz)-a.heading)));
     desired=(a.id==='wangshu'?.40:.58)*Math.max(0,1-turnError/1.3)*Math.min(1,distance/.30);
    }
   }
   a.speed=approach(a.speed,desired,7,dt);
   const travel=Math.min(distance,a.speed*dt),next={x:a.x+(distance?dx/distance:0)*travel,z:a.z+(distance?dz/distance:0)*travel};
   const occupied=agents.some(other=>other!==a&&Math.hypot(next.x-other.x,next.z-other.z)<.90)||(player&&Math.hypot(next.x-player.x,next.z-player.z)<.85);
   if(!occupied&&cafeStaffPointClear(next,colliders,spec.footprint.width,spec.footprint.depth)){a.x=next.x;a.z=next.z;}else a.speed=0;
   a.walk=approach(a.walk,Math.min(1,a.speed/.40)*(1-a.wave),9,dt);
   if(Math.abs(a.heading)>TAU*8)a.heading%=TAU;
  }
  return agents;
 }
 return {agents,update};
}
