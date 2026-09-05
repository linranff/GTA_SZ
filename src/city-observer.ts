/** One camera rig for G, map landmarks and vehicle inspection. */
export class CityObserver{
 active=false;
 focus={x:0,y:0,z:0};
 yaw=0;pitch=.35;distance=420;
 begin(focus:{x:number;y:number;z:number},distance:number,angle:number,elevation:number){
  this.active=true;this.focus={...focus};this.distance=Math.max(3,distance);this.yaw=-angle;this.pitch=elevation;
 }
 rotate(dx:number,dy:number){this.yaw-=dx*.0045;this.pitch=Math.max(-1.43,Math.min(1.43,this.pitch+dy*.0035));}
 /** Turn the view from the current camera position; arrow keys do not orbit the car. */
 look(yawDelta:number,pitchDelta:number){
  const p=this.pose();this.yaw+=yawDelta;this.pitch=Math.max(-1.43,Math.min(1.43,this.pitch+pitchDelta));
  const h=Math.cos(this.pitch)*this.distance;
  this.focus={x:p.x+Math.sin(this.yaw)*h,y:p.y-Math.sin(this.pitch)*this.distance,z:p.z+Math.cos(this.yaw)*h};
 }
 /** Grab-and-drag pan in the view plane. Caller invokes only while pressed.
  * Speed tracks the visible span, so small close-ups and city panoramas agree. */
 pan(dx:number,dy:number,viewportHeight:number,fast=false){
  const scale=2*this.distance*Math.tan(.85/2)/Math.max(180,viewportHeight)*(fast?2:1);
  const right=-dx*scale,up=dy*scale,s=Math.sin(this.yaw),c=Math.cos(this.yaw),sp=Math.sin(this.pitch);
  this.focus.x+=c*right+s*sp*up;this.focus.y+=Math.cos(this.pitch)*up;this.focus.z+=-s*right+c*sp*up;
 }
 zoom(delta:number){this.distance=Math.max(3,Math.min(3200,this.distance*Math.exp(delta*.0012)));}
 pose(){const horizontal=Math.cos(this.pitch)*this.distance;return {x:this.focus.x-Math.sin(this.yaw)*horizontal,y:this.focus.y+Math.sin(this.pitch)*this.distance,z:this.focus.z-Math.cos(this.yaw)*horizontal};}
 step(keys:Set<string>,dt:number,heightAt:(x:number,z:number)=>number,extent:number[]){
  const axis=(positive:string[],negative:string[])=>Number(positive.some(k=>keys.has(k)))-Number(negative.some(k=>keys.has(k)));
  const forward=axis(['KeyW'],['KeyS']),right=axis(['KeyD'],['KeyA']),up=axis(['KeyE'],['KeyQ']);
  this.look(axis(['ArrowRight'],['ArrowLeft'])*Math.min(dt,.05)*1.05,axis(['ArrowDown'],['ArrowUp'])*Math.min(dt,.05)*.8);
  const length=Math.max(1,Math.hypot(forward,right,up));
  const speed=Math.max(4,Math.min(90,this.distance*.13))*(keys.has('ShiftLeft')||keys.has('ShiftRight')?3:1),d=speed*Math.min(dt,.05)/length;
  this.focus.x+=(Math.sin(this.yaw)*forward+Math.cos(this.yaw)*right)*d;
  this.focus.z+=(Math.cos(this.yaw)*forward-Math.sin(this.yaw)*right)*d;
  this.focus.y+=up*d;
  this.focus.x=Math.max(extent[0],Math.min(extent[2],this.focus.x));this.focus.z=Math.max(extent[1],Math.min(extent[3],this.focus.z));
  const p=this.pose(),floor=heightAt(p.x,p.z)+1.5;
  if(p.y<floor)this.focus.y+=floor-p.y;
  if(p.y>2200)this.focus.y-=p.y-2200;
 }
 get status(){return {active:this.active,position:this.pose(),focus:{...this.focus},yaw:this.yaw,pitch:this.pitch,distance:this.distance};}
}
