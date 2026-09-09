import {clamp,type CarState} from './driving.ts';
export const TANK_LIMITS={forward:14,reverse:5,acceleration:3.3,turnRate:.60,halfWidth:1.72,halfLength:3.4,reload:1.8,shellSpeed:145,gravity:9.81,shellLifetime:6} as const;
export function stepTank(state:CarState,input:{throttle:number;steer:number;handbrake:boolean},dt:number){
 dt=clamp(dt,0,.05);const v=state.speed,throttle=clamp(input.throttle,-1,1);
 const target=throttle*(throttle<0?TANK_LIMITS.reverse:TANK_LIMITS.forward),rate=input.handbrake?14:throttle*v<0?8:TANK_LIMITS.acceleration;
 state.speed+=clamp((input.handbrake?0:target)-v,-rate*dt,rate*dt);
 state.steer+=(clamp(input.steer,-1,1)*.6-state.steer)*(1-Math.exp(-dt*7));
 state.yaw+=state.steer/.6*TANK_LIMITS.turnRate*dt;
 const distance=state.speed*dt;state.x+=Math.sin(state.yaw)*distance;state.z+=Math.cos(state.yaw)*distance;state.distance+=Math.abs(distance);
}
export function tankFootprintClear(x:number,z:number,yaw:number,blocked:(x:number,z:number)=>boolean){
 for(const side of [-TANK_LIMITS.halfWidth,0,TANK_LIMITS.halfWidth])for(const along of [-TANK_LIMITS.halfLength,0,TANK_LIMITS.halfLength]){
  if(blocked(x+Math.cos(yaw)*side+Math.sin(yaw)*along,z-Math.sin(yaw)*side+Math.cos(yaw)*along))return false;
 }return true;
}
export type ShellPoint={x:number;y:number;z:number};
export function advanceTankShell(position:ShellPoint,velocity:ShellPoint,dt:number){
 const h=clamp(dt,0,.05),next={x:position.x+velocity.x*h,y:position.y+velocity.y*h-.5*TANK_LIMITS.gravity*h*h,z:position.z+velocity.z*h};
 velocity.y-=TANK_LIMITS.gravity*h;return next;
}
