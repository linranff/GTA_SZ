/** Assisted sightseeing flight; world units match the existing city. */
export type FlightPoint={x:number;y:number;z:number};
export type FlightPose=FlightPoint&{yaw:number;pitch:number;roll:number};
export type FlightHit={point:FlightPoint;kind:'building'|'terrain';id?:string};
export type FlightSweep=(from:FlightPoint,to:FlightPoint)=>FlightHit|null;
export const FLIGHT_RECOVERY_MS=3000;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function flightBasis(p:Pick<FlightPose,'yaw'|'pitch'|'roll'>){
 const sy=Math.sin(p.yaw),cy=Math.cos(p.yaw),sp=Math.sin(p.pitch),cp=Math.cos(p.pitch),sr=Math.sin(p.roll),cr=Math.cos(p.roll);
 const forward={x:sy*cp,y:sp,z:cy*cp},right={x:cy*cr+sy*sp*sr,y:-cp*sr,z:-sy*cr+cy*sp*sr};
 return {forward,right,up:{x:forward.y*right.z-forward.z*right.y,y:forward.z*right.x-forward.x*right.z,z:forward.x*right.y-forward.y*right.x}};
}
export function flightPoint(p:FlightPose,right:number,forward:number,up=0):FlightPoint{
 const b=flightBasis(p);return {x:p.x+b.right.x*right+b.forward.x*forward+b.up.x*up,y:p.y+b.right.y*right+b.forward.y*forward+b.up.y*up,z:p.z+b.right.z*right+b.forward.z*forward+b.up.z*up};
}
export class FlightSimulation{
 phase:'idle'|'flying'|'exploding'='idle';
 pose:FlightPose={x:0,y:120,z:0,yaw:0,pitch:0,roll:0};
 lastSafe:FlightPose={...this.pose};speed=48;throttle=.55;crashedAt=0;hit:FlightHit|null=null;crashes=0;
 get active(){return this.phase!=='idle';}
 start(point:FlightPoint,yaw:number){this.pose={...point,yaw,pitch:0,roll:0};this.lastSafe={...this.pose};this.speed=48;this.throttle=.55;this.phase='flying';this.hit=null;this.crashedAt=0;}
 stop(){this.phase='idle';this.hit=null;this.crashedAt=0;}
 step(keys:ReadonlySet<string>,dt:number,now:number,sweep:FlightSweep,extent:readonly number[]):'crashed'|'recovered'|'boundary'|null{
  if(this.phase==='idle')return null;
  if(this.phase==='exploding'){if(now-this.crashedAt>=FLIGHT_RECOVERY_MS){this.phase='idle';return 'recovered';}return null;}
  const axis=(pos:string[],neg:string[])=>Number(pos.some(k=>keys.has(k)))-Number(neg.some(k=>keys.has(k)));
  const pitch=axis(['KeyW','ArrowUp'],['KeyS','ArrowDown']),roll=axis(['KeyD','ArrowRight'],['KeyA','ArrowLeft']);
  const rudder=axis(['KeyE'],['KeyQ']),thrust=axis(['ShiftLeft','ShiftRight'],['Space']);
  let left=clamp(dt,0,.1);
  while(left>1e-7){
   const h=Math.min(left,1/120);left-=h;const before={...this.pose},p=this.pose;
   this.throttle=clamp(this.throttle+thrust*h*.4,0,1);
   p.pitch+=(pitch*.57-p.pitch)*(1-Math.exp(-h*1.7));p.roll+=(roll*.82-p.roll)*(1-Math.exp(-h*2.5));
   p.yaw+=h*(Math.tan(p.roll)*.75+rudder*.38);
   this.speed+=(24+this.throttle*53-p.pitch*13-this.speed)*(1-Math.exp(-h*.6));
   const direction=flightBasis(p).forward;
   p.x+=direction.x*this.speed*h;p.y+=direction.y*this.speed*h;p.z+=direction.z*this.speed*h;
   if(p.y>2100){p.y=2100;p.pitch=Math.min(0,p.pitch);}
   if(p.x<extent[0]+15||p.x>extent[2]-15||p.z<extent[1]+15||p.z>extent[3]-15){this.phase='idle';this.pose={...before};return 'boundary';}
   // Swept nose, tail, floats and wing points plus the full current wing edge:
   // a fast plane cannot jump through a thin facade between rendered frames.
   let hit:FlightHit|null=null;
   for(const [r,f,u] of [[0,4.7,0],[0,-5.2,0],[-6.9,0,1.1],[6.9,0,1.1],[-3.4,0,1.1],[3.4,0,1.1],[-1.64,1,-1.45],[1.64,1,-1.45],[0,0,0]]){
    hit=sweep(flightPoint(before,r,f,u),flightPoint(p,r,f,u));if(hit)break;
   }
   hit??=sweep(flightPoint(p,-6.9,0,1.1),flightPoint(p,6.9,0,1.1));
   if(hit){this.hit=hit;this.phase='exploding';this.crashedAt=now;this.crashes++;this.speed=0;return 'crashed';}
   this.lastSafe={...p};
  }
  return null;
 }
 get status(){return {phase:this.phase,active:this.active,position:{x:this.pose.x,y:this.pose.y,z:this.pose.z},yaw:this.pose.yaw,pitch:this.pose.pitch,roll:this.pose.roll,speed:this.speed,throttle:this.throttle,crashes:this.crashes,hit:this.hit,crashedAt:this.crashedAt};}
}
