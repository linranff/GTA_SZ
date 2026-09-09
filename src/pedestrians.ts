import {DynamicInstances} from './dynamic-instances.ts';
import {closest,clamp} from './driving.ts';
import {createPedestrianBody,detectPedestrianImpact,stepPedestrianBody,pedestrianSupportHeight,type PedestrianBody,type ImpactCarPose} from './pedestrian-impact.ts';
import {ImportMeshAsync,Mesh,Matrix,Quaternion,Vector3,type Scene,type AbstractMesh} from '@babylonjs/core';
type Walker={path:number[];t:number;speed:number;phase:number;x:number;z:number;dir:number;yaw:number;slot:number;
 body:PedestrianBody|null;recovery:number;recoverPitch:number;recoverRoll:number;returning:boolean;cooldown:number};
const IMPACT_LIMIT=8,PELVIS=.9;
type Part='body'|'leftLeg'|'rightLeg'|'leftArm'|'rightArm';
const partKey=(name:string):Part=>name.includes('leg_-1')?'leftLeg':name.includes('leg_1')?'rightLeg':name.includes('arm_-1')?'leftArm':name.includes('arm_1')?'rightArm':'body';
const JOINTS=[['leftLeg',-.105,.89],['rightLeg',.105,.89],['leftArm',-.21,1.35],['rightArm',.21,1.35]] as const;
const smooth=(t:number)=>t*t*(3-2*t);
/** Sidewalk walking and bounded impact bodies share the same instanced meshes. */
export class CityPedestrians{
 private instances=new DynamicInstances();
 private bounds=new Map<Part,{min:number[];max:number[]}>();
 private totalImpacts=0;private lastImpactSpeed=0;private peakActive=0;
 private scaleScratch=new Vector3();private positionScratch=new Vector3();private rotationScratch=new Quaternion();
 private rootScratch=Matrix.Identity();private jointScratch=Matrix.Identity();private matrixScratch=Matrix.Identity();private rotationMatrix=Matrix.Identity();
 private centerPivot=Matrix.Translation(0,-PELVIS,0);
 private joints=JOINTS.map(([,x,y])=>({before:Matrix.Translation(-x,-y,0),after:Matrix.Translation(x,y,0)}));
 paths:number[][]=[];people:Walker[]=[];meshes:Mesh[]=[];origin=[1e9,1e9];time=0;
 constructor(public scene:Scene,public heightAt:(x:number,z:number)=>number=()=>0,private blocked:(x:number,z:number)=>boolean=()=>false){}
 async init(){this.paths=await(await fetch('/city/pedestrian-paths.json')).json();const r=await ImportMeshAsync('/city/pedestrian.glb',this.scene);
  for(const src of r.meshes){if(!(src instanceof Mesh)||!src.getTotalVertices())continue;src.parent=null;src.makeGeometryUnique();src.bakeTransformIntoVertices(Matrix.Scaling(1,1,-1));src.position.setAll(0);src.scaling.setAll(1);src.rotationQuaternion=Quaternion.Identity();src.alwaysSelectAsActiveMesh=true;src.isPickable=false;src.receiveShadows=true;src.setEnabled(false);this.meshes.push(src);
   const key=partKey(src.name),box=src.getBoundingInfo().boundingBox,b=this.bounds.get(key)??{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
   box.minimum.asArray().forEach((v,i)=>b.min[i]=Math.min(b.min[i],v));box.maximum.asArray().forEach((v,i)=>b.max[i]=Math.max(b.max[i],v));this.bounds.set(key,b);}
 }
 place(x:number,z:number){
  this.origin=[x,z];const near=this.paths.map((p,i)=>({p,i,d:Math.hypot((p[0]+p[2])/2-x,(p[1]+p[3])/2-z)})).filter(p=>p.d<330&&Math.hypot(p.p[2]-p.p[0],p.p[3]-p.p[1])>.1).sort((a,b)=>a.d-b.d);
  // Retain visible impact/recovery slots during normal city streaming. A real
  // fast-travel moves them outside this radius, so it never sweeps a car hit.
  const retained=new Map(this.people.filter(p=>(p.body||p.returning)&&Math.hypot(p.x-x,p.z-z)<400).map(p=>[p.slot,p]));
  const count=Math.min(56,Math.max(near.length,retained.size?Math.max(...retained.keys())+1:0)),next:Walker[]=[];
  for(let i=0;i<count;i++){
   const old=retained.get(i);if(old){next.push(old);continue;}if(!near.length)continue;
   const {p}=near[Math.floor(i*near.length/count)];next.push({path:p,t:(i*.618)%1,speed:.8+(i%7)*.1,phase:i*1.31,x:p[0],z:p[1],dir:i%2?1:-1,yaw:0,slot:i,body:null,recovery:0,recoverPitch:0,recoverRoll:0,returning:false,cooldown:0});
  }
  this.people=next;this.update(0,x,z);
 }
 collideVehicle(before:ImpactCarPose,after:ImpactCarPose){
  let active=this.people.filter(p=>p.body&&p.body.phase!=='recovering').length,hits=0,peakSpeed=0;
  if(Math.hypot(after.x-before.x,after.z-before.z)<.001)return {hits,peakSpeed};
  for(const p of this.people){
   if(active>=IMPACT_LIMIT)break;if(p.body||p.cooldown>0)continue;
   const impact=detectPedestrianImpact(before,after,{x:p.x,y:this.heightAt(p.x,p.z)+.1,z:p.z,vx:Math.sin(p.yaw)*p.speed,vz:Math.cos(p.yaw)*p.speed});
   if(!impact)continue;
   p.body=createPedestrianBody({x:p.x,y:this.heightAt(p.x,p.z)+.1,z:p.z},impact);p.body.ry=p.yaw;const c=Math.cos(p.yaw),s=Math.sin(p.yaw);p.body.wx=impact.spin.x*c-impact.spin.z*s;p.body.wz=impact.spin.x*s+impact.spin.z*c;
   p.recovery=0;p.returning=false;p.cooldown=2;active++;hits++;peakSpeed=Math.max(peakSpeed,impact.speed);
  }
  this.totalImpacts+=hits;if(hits)this.lastImpactSpeed=peakSpeed;this.peakActive=Math.max(this.peakActive,active);return {hits,peakSpeed};
 }
 private walk(p:Walker,dt:number){
  const [ax,az,bx,bz]=p.path;
  if(p.returning){
   const target=closest(p.x,p.z,[ax,az],[bx,bz]),distance=target.d;
   if(distance<.06){p.t=target.t;p.x=target.x;p.z=target.z;p.returning=false;return;}
   const amount=Math.min(distance,p.speed*dt),dx=(target.x-p.x)/distance*amount,dz=(target.z-p.z)/distance*amount,oldX=p.x,oldZ=p.z;
   const clear=(x:number,z:number)=>!this.blocked(x,z)&&Math.abs(this.heightAt(x,z)-this.heightAt(p.x,p.z))<.45;
   if(clear(p.x+dx,p.z+dz)){p.x+=dx;p.z+=dz;}else if(clear(p.x+dx,p.z)){p.x+=dx;}else if(clear(p.x,p.z+dz)){p.z+=dz;}
   if(Math.hypot(p.x-oldX,p.z-oldZ)>.0001)p.yaw=Math.atan2(p.x-oldX,p.z-oldZ);return;
  }
  p.t+=p.dir*p.speed*dt/Math.max(.1,Math.hypot(bx-ax,bz-az));if(p.t>=1){p.t=1;p.dir=-1;}if(p.t<=0){p.t=0;p.dir=1;}
  p.x=ax+(bx-ax)*p.t;p.z=az+(bz-az)*p.t;p.yaw=Math.atan2((bx-ax)*p.dir,(bz-az)*p.dir);
 }
 update(dt:number,x:number,z:number){
  dt=clamp(dt,0,.1);this.time+=dt;if(Math.hypot(x-this.origin[0],z-this.origin[1])>220){this.place(x,z);return;}
  const matrices:Record<string,number[]>={body:[],leftLeg:[],rightLeg:[],leftArm:[],rightArm:[]};
  for(const p of this.people){
   const scale=.94+(p.slot%5)*.025;p.cooldown=Math.max(0,p.cooldown-dt);
   if(p.body){
    const body=p.body;stepPedestrianBody(body,dt,this.heightAt,this.blocked);p.x=body.x;p.z=body.z;p.yaw=body.ry;
    if(body.phase==='recovering'){
     if(p.recovery===0){p.recoverPitch=body.rx;p.recoverRoll=body.rz;}
     p.recovery+=dt;const t=smooth(clamp(p.recovery/1.35,0,1));body.rx=p.recoverPitch*(1-t);body.rz=p.recoverRoll*(1-t);
     body.y=this.heightAt(body.x,body.z)+Math.max(pedestrianSupportHeight(body),.1+PELVIS*scale*t);
     if(t===1){p.body=null;p.returning=true;p.cooldown=1.5;}
    }
   }else this.walk(p,dt);
   const offset=matrices.body.length,body=p.body,gait=Math.sin(this.time*p.speed*6+p.phase)*.38;
   this.scaleScratch.setAll(scale);
   Quaternion.RotationYawPitchRollToRef(body?.ry??p.yaw,body?.rx??0,body?.rz??0,this.rotationScratch);
   this.positionScratch.set(p.x,body?body.y:this.heightAt(p.x,p.z)+.1+Math.abs(Math.sin(this.time*6+p.phase))*.018,p.z);
   Matrix.ComposeToRef(this.scaleScratch,this.rotationScratch,this.positionScratch,this.rootScratch);
   if(body)this.centerPivot.multiplyToRef(this.rootScratch,this.rootScratch);
   this.rootScratch.copyToArray(matrices.body,matrices.body.length);
   for(let j=0;j<JOINTS.length;j++){
    const [key]=JOINTS[j],arm=j>=2,side=j%2===0?-1:1;let pitch=(j===0||j===3?gait:-gait)*(arm?.8:1),roll=0;
    if(body){
     if(body.grounded||body.phase==='recovering'){pitch=0;roll=arm?side*.38*(1-smooth(clamp(p.recovery/1.35,0,1))):side*.04;}
     else{pitch=Math.sin(body.age*8+p.phase+j*1.7)*(arm?.72:.48);roll=side*(arm?.58:.15);}
    }
    Quaternion.RotationYawPitchRollToRef(0,pitch,roll,this.rotationScratch);Matrix.FromQuaternionToRef(this.rotationScratch,this.rotationMatrix);
    const joint=this.joints[j];joint.before.multiplyToRef(this.rotationMatrix,this.jointScratch);this.jointScratch.multiplyToRef(joint.after,this.jointScratch);this.jointScratch.multiplyToRef(this.rootScratch,this.matrixScratch);this.matrixScratch.copyToArray(matrices[key],matrices[key].length);
   }
   if(body&&(body.grounded||body.phase==='recovering')){
    // The simple body support drives physics; the actual five articulated
    // mesh bounds keep shoes/hands above the surface while lying/getting up.
    let lowest=Infinity;
    for(const [key,b] of this.bounds){const m=matrices[key],cx=(b.min[0]+b.max[0])*.5,cy=(b.min[1]+b.max[1])*.5,cz=(b.min[2]+b.max[2])*.5,ex=(b.max[0]-b.min[0])*.5,ey=(b.max[1]-b.min[1])*.5,ez=(b.max[2]-b.min[2])*.5;
     const y=m[offset+13]+cx*m[offset+1]+cy*m[offset+5]+cz*m[offset+9]-Math.abs(m[offset+1])*ex-Math.abs(m[offset+5])*ey-Math.abs(m[offset+9])*ez;lowest=Math.min(lowest,y);}
    const lift=Math.max(0,this.heightAt(p.x,p.z)+.025-lowest);if(lift)for(const key of Object.keys(matrices))matrices[key][offset+13]+=lift;
   }
  }
  for(const m of this.meshes){const key=partKey(m.name);const data=matrices[key];this.instances.update(m,data);if(data.length&&m.name.includes('shirt'))this.instances.colors(m,this.people.length,[[1,1,1,1],[2.8,2.2,1.7,1],[2.7,.6,.25,1],[.45,.55,.7,1]]);}
 }
 get stats(){return {people:this.people.length,totalImpacts:this.totalImpacts,lastImpactSpeed:this.lastImpactSpeed,activeBodies:this.people.filter(p=>p.body&&p.body.phase!=='recovering').length,recovering:this.people.filter(p=>p.body?.phase==='recovering').length,returning:this.people.filter(p=>p.returning).length,limit:IMPACT_LIMIT,peakActive:this.peakActive,meshTemplates:this.meshes.length};}
 get casters():AbstractMesh[]{return this.meshes;}
}
