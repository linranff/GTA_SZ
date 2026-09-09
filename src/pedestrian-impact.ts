/** Small collision/ballistic controller; no scene objects, randomness or car mutation. */
export type ImpactCarPose={x:number;z:number;yaw:number;speed:number;groundY:number};
/** y is the pedestrian's foot height, in world coordinates. */
export type ImpactPerson={x:number;y:number;z:number;vx?:number;vz?:number};
type XYZ={x:number;y:number;z:number};
export type PedestrianImpact={velocity:XYZ;spin:XYZ;speed:number;normal:{x:number;z:number};contact:XYZ;fraction:number};
/** y is the centre of mass. rx/ry/rz are pitch/yaw/roll, in radians. */
export type PedestrianBody={x:number;y:number;z:number;vx:number;vy:number;vz:number;
 rx:number;ry:number;rz:number;wx:number;wy:number;wz:number;grounded:boolean;
 phase:'airborne'|'sliding'|'recovering';age:number;restTime:number;bounces:number;groundY:number};
export const PEDESTRIAN_IMPACT={carHalfWidth:1.03,carHalfLength:2.5,carHeight:1.45,personRadius:.28,personHeight:1.76,
 centreHeight:.9,gravity:18,maxHorizontalSpeed:26,maxVerticalSpeed:10,maxSpin:14,
 maxFrameDt:.1,maxSubsteps:6,restSeconds:.8} as const;
const C=PEDESTRIAN_IMPACT,clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const finite=(v:number|undefined,fallback=0)=>Number.isFinite(v)?v!:fallback;
const wrap=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;

function lineBox(x:number,z:number,dx:number,dz:number,hx:number,hz:number,lo:number,hi:number):number|null {
 for(const [p,d,h] of [[x,dx,hx],[z,dz,hz]]) {
  if(Math.abs(d)<1e-10){if(Math.abs(p)>h)return null;continue;}
  const a=(-h-p)/d,b=(h-p)/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return null;
 }
 return lo;
}
/** Exact line sweep against a rectangle rounded by the pedestrian radius. */
function roundedBoxSweep(x:number,z:number,dx:number,dz:number,lo:number,hi:number,r:number=C.personRadius):number|null {
 const w=C.carHalfWidth,l=C.carHalfLength;
 let first=Infinity;
 for(const [hx,hz] of [[w+r,l],[w,l+r]]){const t=lineBox(x,z,dx,dz,hx,hz,lo,hi);if(t!==null)first=Math.min(first,t);}
 const a=dx*dx+dz*dz;
 for(const cx of [-w,w])for(const cz of [-l,l]) {
  const px=x-cx,pz=z-cz,atX=px+dx*lo,atZ=pz+dz*lo;
  if(atX*atX+atZ*atZ<=r*r){first=Math.min(first,lo);continue;}
  if(a<1e-12)continue;
  const b=2*(px*dx+pz*dz),disc=b*b-4*a*(px*px+pz*pz-r*r);
  if(disc<0)continue;
  const t=(-b-Math.sqrt(disc))/(2*a);if(t>=lo&&t<=hi)first=Math.min(first,t);
 }
 return Number.isFinite(first)?first:null;
}

/** Both poses must describe actual movement after world collision rollback.
 * Straight movement uses an analytic sweep, so a long frame cannot skip a person.
 * Rotation uses bounded interval sweeps of the same rounded OBB.
 */
export function detectPedestrianImpact(before:Readonly<ImpactCarPose>,after:Readonly<ImpactCarPose>,person:Readonly<ImpactPerson>):PedestrianImpact|null {
 if(![before.x,before.z,before.yaw,before.speed,before.groundY,after.x,after.z,after.yaw,after.speed,after.groundY,person.x,person.y,person.z].every(Number.isFinite))return null;
 const dx=after.x-before.x,dz=after.z-before.z,travel=Math.hypot(dx,dz),dyaw=wrap(after.yaw-before.yaw);
 if(![dx,dz,travel,dyaw,person.x-before.x,person.z-before.z,after.groundY-before.groundY].every(Number.isFinite))return null;
 const carSpeed=Math.min(60,(Math.abs(before.speed)+Math.abs(after.speed))*.5);
 if(carSpeed<.35||travel<1e-5&&Math.abs(dyaw)<1e-5)return null;
 // Clip the sweep to vertical overlap; roads on a bridge cannot hit people below.
 let lo=0,hi=1;const dy=after.groundY-before.groundY,minY=person.y-C.carHeight,maxY=person.y+C.personHeight;
 if(Math.abs(dy)<1e-9){if(before.groundY<minY||before.groundY>maxY)return null;}
 else{const a=(minY-before.groundY)/dy,b=(maxY-before.groundY)/dy;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return null;}
 const projection=travel>1e-9?clamp(((person.x-before.x)*dx+(person.z-before.z)*dz)/(travel*travel),lo,hi):lo;
 const radius=Math.hypot(C.carHalfWidth,C.carHalfLength)+C.personRadius;
 if(Math.hypot(person.x-mix(before.x,after.x,projection),person.z-mix(before.z,after.z,projection))>radius)return null;
 const local=(t:number)=>{
  const yaw=before.yaw+dyaw*t,c=Math.cos(yaw),s=Math.sin(yaw),x=person.x-mix(before.x,after.x,t),z=person.z-mix(before.z,after.z,t);
  const right=x*c-z*s,forward=x*s+z*c,qx=clamp(right,-C.carHalfWidth,C.carHalfWidth),qz=clamp(forward,-C.carHalfLength,C.carHalfLength);
  return {c,s,right,forward,qx,qz,distance:Math.hypot(right-qx,forward-qz)-C.personRadius};
 };
 let fraction:number|null=null;
 if(Math.abs(dyaw)<1e-7) {
  const p=local(0);fraction=roundedBoxSweep(p.right,p.forward,-dx*p.c+dz*p.s,-dx*p.s-dz*p.c,lo,hi);
 }else{
  // Freeze orientation at each interval midpoint, conservatively widening by
  // its maximum corner rotation. Analytic translation then discards the empty
  // part of the interval. This avoids arbitrarily slow distance advancement
  // when a side panel moves almost parallel to a nearby pedestrian.
  const pending:[number,number][]=[[lo,hi]],corner=Math.hypot(C.carHalfWidth,C.carHalfLength);
  for(let checked=0;pending.length&&checked<128;checked++) {
   const [start,end]=pending.pop()!,mid=(start+end)*.5,yaw=before.yaw+dyaw*mid,c=Math.cos(yaw),s=Math.sin(yaw);
   const x=person.x-before.x,z=person.z-before.z,padding=2*corner*Math.sin(Math.abs(dyaw)*(end-start)/4);
   const entry=roundedBoxSweep(x*c-z*s,x*s+z*c,-dx*c+dz*s,-dx*s-dz*c,start,end,C.personRadius+padding);
   if(entry===null)continue;
   if(local(entry).distance<=1e-4){fraction=entry;break;}
   const sample=(entry+end)*.5;
   if(local(sample).distance<=1e-4) {
    let a=entry,b=sample;
    for(let i=0;i<16;i++){const t=(a+b)*.5;if(local(t).distance<=1e-4)b=t;else a=t;}
    fraction=b;break;
   }
   if(end-entry<1e-7)continue;
   pending.push([sample,end],[entry,sample]);
  }
 }
 if(fraction===null)return null;
 const p=local(fraction),sx=p.right-p.qx,sz=p.forward-p.qz,length=Math.hypot(sx,sz);
 const motionX=travel>1e-5?dx/travel:Math.sin(after.yaw)*Math.sign(after.speed),motionZ=travel>1e-5?dz/travel:Math.cos(after.yaw)*Math.sign(after.speed);
 let nx=motionX,nz=motionZ;
 if(length>1e-6){nx=(sx*p.c+sz*p.s)/length;nz=(-sx*p.s+sz*p.c)/length;}
 const pvx=clamp(finite(person.vx),-10,10),pvz=clamp(finite(person.vz),-10,10);
 const closing=(motionX*carSpeed-pvx)*nx+(motionZ*carSpeed-pvz)*nz;
 if(closing<-.1&&Math.abs(dyaw)<1e-7)return null;
 // Existing overlaps can touch a side panel: a small tangential transfer allows
 // a light side scrape without treating it as a head-on impact.
 const speed=clamp(Math.max(closing,carSpeed*.12),0,60);
 let pushX=nx*.65+motionX*.35,pushZ=nz*.65+motionZ*.35,pushLength=Math.hypot(pushX,pushZ);
 if(pushLength<1e-5){pushX=motionX;pushZ=motionZ;pushLength=1;}
 pushX/=pushLength;pushZ/=pushLength;
 const horizontal=Math.min(C.maxHorizontalSpeed,.25+speed*.58),lift=Math.min(C.maxVerticalSpeed,.12+Math.max(0,speed-1.2)*.22);
 const vx=pushX*horizontal+pvx*.15,vz=pushZ*horizontal+pvz*.15,scale=Math.min(1,C.maxHorizontalSpeed/Math.max(1e-9,Math.hypot(vx,vz)));
 const spin=Math.min(C.maxSpin,.18+speed*.34),side=clamp(p.right/C.carHalfWidth,-1,1);
 return {velocity:{x:vx*scale,y:lift,z:vz*scale},spin:{x:pushZ*spin,y:side*Math.min(6,speed*.12),z:-pushX*spin},speed,
  normal:{x:nx,z:nz},contact:{x:mix(before.x,after.x,fraction)+p.qx*p.c+p.qz*p.s,y:clamp(person.y+.8,mix(before.groundY,after.groundY,fraction),mix(before.groundY,after.groundY,fraction)+C.carHeight),z:mix(before.z,after.z,fraction)-p.qx*p.s+p.qz*p.c},fraction};
}

/** Support of the rotating half-height .87 / half-width .30 / half-depth .22 OBB. */
export function pedestrianSupportHeight(body:Pick<PedestrianBody,'rx'|'rz'>):number {
 const pitch=finite(body.rx),roll=finite(body.rz);
 return .87*Math.abs(Math.cos(pitch)*Math.cos(roll))+.30*Math.abs(Math.cos(pitch)*Math.sin(roll))+.22*Math.abs(Math.sin(pitch))+.05;
}
export function createPedestrianBody(person:Readonly<ImpactPerson>,impact:Readonly<PedestrianImpact>):PedestrianBody {
 const groundY=finite(person.y);
 return {x:finite(person.x),y:groundY+C.centreHeight,z:finite(person.z),vx:clamp(finite(impact.velocity.x),-C.maxHorizontalSpeed,C.maxHorizontalSpeed),vy:clamp(finite(impact.velocity.y),-C.maxVerticalSpeed,C.maxVerticalSpeed),vz:clamp(finite(impact.velocity.z),-C.maxHorizontalSpeed,C.maxHorizontalSpeed),
  rx:0,ry:0,rz:0,wx:clamp(finite(impact.spin.x),-C.maxSpin,C.maxSpin),wy:clamp(finite(impact.spin.y),-C.maxSpin,C.maxSpin),wz:clamp(finite(impact.spin.z),-C.maxSpin,C.maxSpin),grounded:false,phase:'airborne',age:0,restTime:0,bounces:0,groundY};
}

/** Mutates only the pedestrian body. Work is capped at six 60-Hz substeps even
 * after a suspended tab; excess frame time is dropped instead of tunnelling.
 * blocked is the world's static wall/land-boundary predicate (not other bodies).
 */
export function stepPedestrianBody(body:PedestrianBody,dt:number,heightAt:(x:number,z:number)=>number,blocked:(x:number,z:number)=>boolean):void {
 if(!Number.isFinite(dt)||dt<=0||body.phase==='recovering')return;
 for(const key of ['x','y','z','vx','vy','vz','rx','ry','rz','wx','wy','wz','age','restTime','groundY','bounces'] as const)body[key]=finite(body[key]);
 const horizontal=Math.hypot(body.vx,body.vz),velocityScale=Math.min(1,C.maxHorizontalSpeed/Math.max(1e-9,horizontal));body.vx*=velocityScale;body.vz*=velocityScale;body.vy=clamp(body.vy,-40,C.maxVerticalSpeed);
 for(const key of ['wx','wy','wz'] as const)body[key]=clamp(body[key],-C.maxSpin,C.maxSpin);
 const frame=Math.min(dt,C.maxFrameDt),steps=Math.min(C.maxSubsteps,Math.ceil(frame*60)),h=frame/steps;
 const clear=(x:number,z:number)=>!blocked(x,z)&&!blocked(x+C.personRadius,z)&&!blocked(x-C.personRadius,z)&&!blocked(x,z+C.personRadius)&&!blocked(x,z-C.personRadius);
 for(let i=0;i<steps;i++) {
  if(body.age===0)body.y=Math.max(body.y,body.groundY+pedestrianSupportHeight(body));
  body.age+=h;
  if(body.grounded) {
   const pitch=wrap(body.rx),target=(pitch>=0?1:-1)*Math.PI/2,settle=1-Math.exp(-9*h);
   body.rx+=wrap(target-body.rx)*settle;body.rz+=wrap(-body.rz)*settle;
   body.wx*=Math.exp(-10*h);body.wz*=Math.exp(-10*h);
  }else{body.vy-=C.gravity*h;body.rx+=body.wx*h;body.rz+=body.wz*h;}
  body.ry+=body.wy*h;
  const dx=body.vx*h,dz=body.vz*h,segments=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.18));
  // At the configured speed/substep caps this loop has at most three iterations.
  for(let j=0;j<segments;j++) {
   const x=body.x+dx/segments,z=body.z+dz/segments;
   if(clear(x,z)){body.x=x;body.z=z;continue;}
   const alongX=clear(x,body.z),alongZ=clear(body.x,z);
   if(alongX&&!alongZ){body.x=x;body.vz*=-.12;body.vx*=.7;}
   else if(alongZ&&!alongX){body.z=z;body.vx*=-.12;body.vz*=.7;}
   else{body.vx*=-.1;body.vz*=-.1;}
   break;
  }
  const floor=heightAt(body.x,body.z);body.groundY=finite(floor,body.groundY);
  const support=pedestrianSupportHeight(body),bottom=body.groundY+support;
  if(body.grounded) {
   // A lower terrain level releases the body; small slopes retain ground contact.
   if(body.y>bottom+.3){body.grounded=false;body.phase='airborne';body.vy=0;}
   else{body.y=bottom;body.vy=0;}
  }else{
   body.y+=body.vy*h;
   if(body.y<=bottom) {
    body.y=bottom;
    if(body.vy< -2&&body.bounces===0){body.vy=Math.min(1.25,-body.vy*.14);body.bounces=1;body.wx*=.45;body.wy*=.45;body.wz*=.45;}
    else{body.vy=0;body.grounded=true;body.phase='sliding';body.wx*=.25;body.wy*=.25;body.wz*=.25;}
   }
  }
  const damping=Math.exp(-(body.grounded?3.4:.25)*h),spinDamping=Math.exp(-(body.grounded?5:.35)*h);
  body.vx*=damping;body.vz*=damping;body.wx*=spinDamping;body.wy*=spinDamping;body.wz*=spinDamping;
  body.rx=wrap(body.rx);body.ry=wrap(body.ry);body.rz=wrap(body.rz);
  const resting=body.grounded&&Math.hypot(body.vx,body.vz)<.18&&Math.abs(Math.abs(body.rx)-Math.PI/2)<.08&&Math.abs(body.rz)<.08;
  body.restTime=resting?body.restTime+h:0;
  if(body.restTime>=C.restSeconds){body.phase='recovering';body.vx=body.vy=body.vz=body.wx=body.wy=body.wz=0;break;}
 }
}
