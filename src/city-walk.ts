import {clamp} from './driving.ts';
export const WALK_SPEED=1.6;
export const RUN_SPEED=4.2;

/** First-person street exploration. The parked car keeps its own state/odometer. */
export class CityWalk {
 active=false;x=0;z=0;yaw=0;pitch=0;distance=0;moving=false;speed=0;
 constructor(private blocked:(x:number,z:number)=>boolean,private heightAt:(x:number,z:number)=>number){}
 exitCar(car:{x:number;z:number;yaw:number;speed:number},doorOffset=1.9){
  if(Math.abs(car.speed)>1)return false;
  for(const offset of [doorOffset,-doorOffset,doorOffset+.9,-doorOffset-.9]){
   const x=car.x+Math.cos(car.yaw)*offset,z=car.z-Math.sin(car.yaw)*offset;
   if(this.blocked(x,z))continue;
   this.x=x;this.z=z;this.yaw=car.yaw;this.pitch=0;this.active=true;return true;
  }
  return false;
 }
 canEnter(car:{x:number;z:number},radius=5){return Math.hypot(this.x-car.x,this.z-car.z)<radius;}
 look(dx:number,dy:number){this.yaw+=dx*.004;this.pitch=clamp(this.pitch+dy*.003,-1.15,1.15);}
 step(keys:Set<string>,dt:number){
  if(!this.active)return;
  dt=clamp(dt,0,.05);this.speed=0;
  this.yaw+=((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*1.6;
  this.pitch=clamp(this.pitch+((keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0))*dt,-1.15,1.15);
  let f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  const length=Math.hypot(f,s);this.moving=length>0;if(!length)return;f/=length;s/=length;
  const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?RUN_SPEED:WALK_SPEED;
  const dx=(Math.sin(this.yaw)*f+Math.cos(this.yaw)*s)*speed*dt,dz=(Math.cos(this.yaw)*f-Math.sin(this.yaw)*s)*speed*dt;
  const clear=(x:number,z:number)=>!this.blocked(x,z)&&Math.abs(this.heightAt(x,z)-this.heightAt(this.x,this.z))<.55;
  const oldX=this.x,oldZ=this.z;
  if(clear(this.x+dx,this.z+dz)){this.x+=dx;this.z+=dz;}
  else if(clear(this.x+dx,this.z))this.x+=dx;
  else if(clear(this.x,this.z+dz))this.z+=dz;
  const moved=Math.hypot(this.x-oldX,this.z-oldZ);this.distance+=moved;this.speed=dt>0?moved/dt:0;this.moving=moved>0;
 }
 get eye(){return {x:this.x,y:this.heightAt(this.x,this.z)+1.68+(this.moving?Math.sin(this.distance*7)*.018:0),z:this.z};}
}
