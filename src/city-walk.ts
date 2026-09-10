import {clamp} from './driving.ts';
export const WALK_SPEED=1.6;
export const RUN_SPEED=4.2;
export const WALK_RADIUS=.23;
type Vehicle={x:number;z:number;yaw:number;speed:number};
/** Walking state and odometer are independent of the parked vehicle. */
export class CityWalk {
 active=false;x=0;z=0;yaw=0;pitch=0;distance=0;moving=false;speed=0;cameraDistance=3.7;
 constructor(private blocked:(x:number,z:number)=>boolean,private heightAt:(x:number,z:number)=>number){}
 clear(x:number,z:number){
  if(!Number.isFinite(this.heightAt(x,z))||this.blocked(x,z))return false;
  for(let i=0;i<8;i++){const a=i*Math.PI/4;if(this.blocked(x+Math.cos(a)*WALK_RADIUS,z+Math.sin(a)*WALK_RADIUS))return false;}
  return true;
 }
 private doors(car:{x:number;z:number;yaw:number},offset:number){return [offset,-offset,offset+.9,-offset-.9].map(side=>({x:car.x+Math.cos(car.yaw)*side,z:car.z-Math.sin(car.yaw)*side}));}
 exitCar(car:Vehicle,doorOffset=1.9){
  if(Math.abs(car.speed)>1)return false;
  const floor=this.heightAt(car.x,car.z);
  for(const p of this.doors(car,doorOffset)){
   // Reject a bridge edge, wall, vehicle hull, water or unsupported ground.
   if(!this.clear(p.x,p.z)||Math.abs(this.heightAt(p.x,p.z)-floor)>.55)continue;
   this.x=p.x;this.z=p.z;this.yaw=car.yaw;this.pitch=.06;this.active=true;this.moving=false;this.speed=0;return true;
  }
  return false;
 }
 canEnter(car:{x:number;z:number;yaw?:number;speed?:number},radius=5,doorOffset=1.9){
  if(Math.abs(car.speed??0)>1||Math.hypot(this.x-car.x,this.z-car.z)>=radius||Math.abs(this.heightAt(this.x,this.z)-this.heightAt(car.x,car.z))>.8)return false;
  // A nearby car behind a wall is not reachable. Check the path to a door,
  // excluding the hull rather than ignoring all collision for the last metre.
  return this.doors({...car,yaw:car.yaw??0},doorOffset).some(p=>{
   const distance=Math.hypot(p.x-this.x,p.z-this.z);if(distance>2.7||!this.clear(p.x,p.z))return false;
   const steps=Math.max(1,Math.ceil(distance/.15));let previous=this.heightAt(this.x,this.z);
   for(let i=1;i<=steps;i++){const x=this.x+(p.x-this.x)*i/steps,z=this.z+(p.z-this.z)*i/steps,h=this.heightAt(x,z);if(!this.clear(x,z)||Math.abs(h-previous)>.48)return false;previous=h;}
   return true;
  });
 }
 zoom(delta:number){this.cameraDistance=clamp(this.cameraDistance*Math.exp(clamp(delta,-400,400)*.0014),1.5,7);}
 look(dx:number,dy:number){this.yaw+=dx*.004;this.pitch=clamp(this.pitch+dy*.003,-1.0,1.05);}
 step(keys:Set<string>,dt:number){
  if(!this.active)return;
  dt=clamp(dt,0,.05);this.speed=0;
  this.yaw+=((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*1.6;
  this.pitch=clamp(this.pitch+((keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0))*dt,-1.0,1.05);
  let f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  const length=Math.hypot(f,s);this.moving=length>0;if(!length)return;f/=length;s/=length;
  const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?RUN_SPEED:WALK_SPEED;
  const dx=(Math.sin(this.yaw)*f+Math.cos(this.yaw)*s)*speed*dt,dz=(Math.cos(this.yaw)*f-Math.sin(this.yaw)*s)*speed*dt;
  const clear=(x:number,z:number)=>this.clear(x,z)&&Math.abs(this.heightAt(x,z)-this.heightAt(this.x,this.z))<.48;
  const oldX=this.x,oldZ=this.z;
  if(clear(this.x+dx,this.z+dz)){this.x+=dx;this.z+=dz;}
  else if(clear(this.x+dx,this.z))this.x+=dx;
  else if(clear(this.x,this.z+dz))this.z+=dz;
  const moved=Math.hypot(this.x-oldX,this.z-oldZ);this.distance+=moved;this.speed=dt>0?moved/dt:0;this.moving=moved>0;
 }
 get eye(){return {x:this.x,y:this.heightAt(this.x,this.z)+1.53+(this.moving?Math.sin(this.distance*7)*.008:0),z:this.z};}
}
