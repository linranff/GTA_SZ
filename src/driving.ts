import type {CityData,V2,Road} from './city-types.ts';
export type CarState={x:number;z:number;yaw:number;speed:number;steer:number;distance:number};
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function stepCar(s:CarState,input:{throttle:number;steer:number;handbrake:boolean},dt:number,grip=1){
 dt=clamp(dt,0,.05);const v=s.speed,desired=input.steer*.48/(1+Math.abs(v)*.026);s.steer+=(desired-s.steer)*Math.min(1,dt*7);
 let force=input.throttle>=0?input.throttle*9: v>1?input.throttle*18:input.throttle*5;
 if(input.throttle>0&&v<-.5)force=18;
 force-=v*.038+v*Math.abs(v)*.0022;
 if(input.throttle===0)force-=Math.sign(v)*Math.min(Math.abs(v)/Math.max(.001,dt),.8);
 if(input.handbrake)force-=Math.sign(v)*Math.min(Math.abs(v)/Math.max(.001,dt),10);
 s.speed=clamp(v+force*dt,-10,53*grip);
 s.yaw+=s.speed/3.2*Math.tan(s.steer)*dt*(input.handbrake?1.3:1);
 const moved=s.speed*dt;s.x+=Math.sin(s.yaw)*moved;s.z+=Math.cos(s.yaw)*moved;s.distance+=Math.abs(moved);
}
export function closest(x:number,z:number,a:V2,b:V2){const dx=b[0]-a[0],dz=b[1]-a[1];const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);const px=a[0]+dx*t,pz=a[1]+dz*t;return {x:px,z:pz,d:Math.hypot(x-px,z-pz),t};}
export function inRing(x:number,z:number,ring:V2[]){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
type Segment={a:V2;b:V2;road:Road};
export class CityCollision{
 cells=new Map<string,Segment[]>();bCells=new Map<string,V2[][]>();size=90;
 constructor(public data:CityData){
  for(const road of data.roads)for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i];const seg={a,b,road};
   for(let x=Math.floor(Math.min(a[0],b[0])/this.size)-1;x<=Math.floor(Math.max(a[0],b[0])/this.size)+1;x++)for(let z=Math.floor(Math.min(a[1],b[1])/this.size)-1;z<=Math.floor(Math.max(a[1],b[1])/this.size)+1;z++){const key=x+','+z;const q=this.cells.get(key)??[];q.push(seg);this.cells.set(key,q);}
  }
  for(const b of data.buildings){const ring=b.rings[0];const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);for(let x=Math.floor(Math.min(...xs)/this.size);x<=Math.floor(Math.max(...xs)/this.size);x++)for(let z=Math.floor(Math.min(...zs)/this.size);z<=Math.floor(Math.max(...zs)/this.size);z++){const key=x+','+z;const q=this.bCells.get(key)??[];q.push(ring);this.bCells.set(key,q);}}
 }
 nearest(x:number,z:number){let best:{x:number;z:number;d:number;yaw:number;road:Road}|null=null;for(const s of this.cells.get(Math.floor(x/this.size)+','+Math.floor(z/this.size))??[]){const p=closest(x,z,s.a,s.b);if(!best||p.d<best.d)best={...p,yaw:Math.atan2(s.b[0]-s.a[0],s.b[1]-s.a[1]),road:s.road};}return best;}
 blocked(x:number,z:number){
  const near=this.nearest(x,z);if(near&&near.d<near.road.width/2-.65)return false;
  for(const r of this.bCells.get(Math.floor(x/this.size)+','+Math.floor(z/this.size))??[]){if(inRing(x,z,r))return true;for(let i=1;i<r.length;i++)if(closest(x,z,r[i-1],r[i]).d<1.15)return true;}
  for(const m of this.data.landmarks)if(!m.detailCollision&&m.height>0&&Math.hypot(x-m.x,z-m.z)<(m.id==='civic'?65:m.id==='tencent'?46:24))return true;
  return !this.data.land.some(p=>inRing(x,z,p[0])&&!p.slice(1).some(r=>inRing(x,z,r)))||this.data.water.some(p=>inRing(x,z,p.rings[0])&&!p.rings.slice(1).some(r=>inRing(x,z,r)));
 }
}
