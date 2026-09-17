import {ImportMeshAsync,Matrix,Mesh,PBRMaterial,Quaternion,Vector3,Color3,type Scene} from '@babylonjs/core';
/** Cantilever traffic signals at arterial junctions (public/city/signals). Poles, arms, heads and the
 * lit lenses are thin instances of one small GLB; phases run on a fixed two-group cycle per junction,
 * and holdDistance() lets NPC traffic and the autopilot stop at red stop lines. */
export type SignalArm={x:number;z:number;yaw:number;arm:number;side:number;group:number;lanes:number;road:string;stop:[number,number]};
export type SignalJunction={x:number;z:number;radius:number;offset:number;arms:SignalArm[]};
export type SignalCycle={greenA:number;amber:number;allRed:number;greenB:number};
export type SignalLayout={poleHeight:number;armZ:number;headZ:number;lensOffsets:Record<Aspect,[number,number,number]>;poleHead:{z:number;lensOffsets:Record<Aspect,[number,number,number]>}};
export type Aspect='red'|'amber'|'green';
const BASE='/city/signals/';
const ASPECTS:Aspect[]=['red','amber','green'];
export const cycleLength=(c:SignalCycle)=>c.greenA+c.greenB+2*(c.amber+c.allRed);
/** Aspect shown to each phase group at cycle time `t` (seconds since the junction's cycle start). */
export function signalAspects(c:SignalCycle,t:number):[Aspect,Aspect]{
 const total=cycleLength(c);t=((t%total)+total)%total;
 if(t<c.greenA)return ['green','red'];t-=c.greenA;
 if(t<c.amber)return ['amber','red'];t-=c.amber;
 if(t<c.allRed)return ['red','red'];t-=c.allRed;
 if(t<c.greenB)return ['red','green'];t-=c.greenB;
 if(t<c.amber)return ['red','amber'];
 return ['red','red'];
}
export const signalCell=(x:number,z:number)=>Math.floor(x/60)+','+Math.floor(z/60);
/** Distance along heading `yaw` from (x,z) to the nearest stop line the driver must hold at, or null.
 * `aspectOf` returns the aspect facing the arm; amber holds unless the car is already within 5 m. */
export function signalHold(arms:Iterable<SignalArm>,x:number,z:number,yaw:number,aspectOf:(arm:SignalArm)=>Aspect,reach=60):number|null{
 const fx=Math.sin(yaw),fz=Math.cos(yaw);let best:number|null=null;
 for(const arm of arms){
  // Heads face approaching traffic, so a car this arm controls travels opposite to arm.yaw.
  if(Math.cos(arm.yaw-yaw)>-.8)continue;
  const dx=arm.stop[0]-x,dz=arm.stop[1]-z,ahead=dx*fx+dz*fz;if(ahead<-1||ahead>reach)continue;
  if(Math.abs(dx*fz-dz*fx)>arm.lanes+1.5)continue;
  const aspect=aspectOf(arm);if(aspect==='green'||(aspect==='amber'&&ahead<5))continue;
  if(best===null||ahead<best)best=ahead;
 }
 return best;
}
export class CityTrafficSignals{
 junctions:SignalJunction[]=[];cycle:SignalCycle={greenA:13,amber:3,allRed:1.2,greenB:10};layout!:SignalLayout;
 private roles=new Map<string,Mesh[]>();private cells=new Map<string,{arm:SignalArm;junction:SignalJunction}[]>();
 private lastX=Infinity;private lastZ=Infinity;private lastAerial=false;private lastAspects='';private structuralDirty=true;private nearby:SignalJunction[]=[];
 time=0;visibleArms=0;triangles=0;private sourceTriangles=0;private lensMaterials=new Map<Aspect,PBRMaterial>();
 constructor(private scene:Scene,private heightAt:(x:number,z:number)=>number){}
 async init(){
  const [manifest,data]=await Promise.all([fetch(BASE+'manifest.json').then(r=>{if(!r.ok)throw Error('Traffic signal manifest unavailable');return r.json();}),fetch(BASE+'traffic-signals.json').then(r=>{if(!r.ok)throw Error('Traffic signal placements unavailable');return r.json();})]);
  this.layout=manifest.layout;this.sourceTriangles=manifest.triangles;this.cycle=data.cycle;this.junctions=data.junctions;
  for(const junction of this.junctions)for(const arm of junction.arms){const key=signalCell(arm.stop[0],arm.stop[1]);let cell=this.cells.get(key);if(!cell){cell=[];this.cells.set(key,cell);}cell.push({arm,junction});}
  const asset=await ImportMeshAsync(BASE+manifest.file,this.scene);
  for(const mesh of asset.meshes){
   if(!(mesh instanceof Mesh)||!mesh.getTotalVertices())continue;
   // Detach from the glTF root and bake its Z flip (Blender north -> game +Z), as the other prototypes do.
   mesh.parent=null;mesh.makeGeometryUnique();mesh.bakeTransformIntoVertices(Matrix.Scaling(1,1,-1));mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotationQuaternion=Quaternion.Identity();
   mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);
   const role=mesh.name.split('_')[0];
   if(mesh.material instanceof PBRMaterial){
    mesh.material.maxSimultaneousLights=3;mesh.material.enableSpecularAntiAliasing=true;mesh.material.environmentIntensity=.7;
    const aspect=ASPECTS.find(a=>role==='signal-lens-'+a);
    if(aspect){mesh.material.unlit=false;mesh.material.emissiveColor=this.lensColor(aspect);mesh.material.albedoColor=this.lensColor(aspect).scale(.35);mesh.material.roughness=.35;mesh.material.metallic=0;mesh.material.environmentIntensity=.2;this.lensMaterials.set(aspect,mesh.material);}
   }
   let list=this.roles.get(role);if(!list){list=[];this.roles.set(role,list);}list.push(mesh);
  }
  asset.meshes[0]?.dispose(false,false);
 }
 private lensColor(aspect:Aspect){return aspect==='red'?new Color3(2.6,.08,.04):aspect==='amber'?new Color3(2.4,1.1,.06):new Color3(.15,2.4,.9);}
 /** Night lenses glow harder so the bloom pass picks them up at distance. */
 setNight(night:boolean){for(const [aspect,material] of this.lensMaterials)material.emissiveColor=this.lensColor(aspect).scale(night?1.8:1);}
 get casters(){return [...this.roles.values()].flat().filter(m=>!m.name.startsWith('signal-lens'));}
 get meshes(){return [...this.roles.values()].flat();}
 aspectFor(junction:SignalJunction,arm:SignalArm,time=this.time){return signalAspects(this.cycle,time+junction.offset)[arm.group===0?0:1];}
 /** Stop-line hold for a vehicle at (x,z) heading `yaw`; see signalHold(). */
 holdDistance(x:number,z:number,yaw:number):number|null{
  const cx=Math.floor(x/60),cz=Math.floor(z/60),arms:SignalArm[]=[],owner=new Map<SignalArm,SignalJunction>();
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const entry of this.cells.get((cx+i)+','+(cz+j))??[]){arms.push(entry.arm);owner.set(entry.arm,entry.junction);}
  return signalHold(arms,x,z,yaw,arm=>this.aspectFor(owner.get(arm)!,arm));
 }
 update(dt:number,x:number,z:number,aerial=false){
  this.time+=dt;
  if(aerial!==this.lastAerial||Math.hypot(x-this.lastX,z-this.lastZ)>25){
   this.lastX=x;this.lastZ=z;this.lastAerial=aerial;const radius=aerial?650:420;
   this.nearby=this.junctions.filter(j=>Math.hypot(j.x-x,j.z-z)<radius).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)).slice(0,aerial?40:24);
   this.structuralDirty=true;
  }
  // Lens buffers change only when an aspect flips; pole/arm/head buffers only when the junction set moves.
  const aspects=this.nearby.map(j=>signalAspects(this.cycle,this.time+j.offset).join('')).join('|');
  if(!this.structuralDirty&&aspects===this.lastAspects)return;
  const structural=this.structuralDirty;this.structuralDirty=false;this.lastAspects=aspects;
  const arms:{arm:SignalArm;junction:SignalJunction}[]=[];for(const junction of this.nearby)for(const arm of junction.arms)arms.push({arm,junction});
  this.visibleArms=arms.length;
  if(!arms.length){for(const mesh of this.meshes)mesh.setEnabled(false);this.triangles=0;return;}
  const L=this.layout,pole=new Float32Array(arms.length*16),armBuf=new Float32Array(arms.length*16),head=new Float32Array(arms.length*16);
  const lens:Record<Aspect,number[]>={red:[],amber:[],green:[]};
  const scratch=new Matrix(),rot=new Matrix(),tip=new Vector3(),local=new Vector3(),world=new Vector3();
  arms.forEach(({arm,junction},i)=>{
   const y=this.heightAt(arm.x,arm.z),q=Quaternion.RotationAxis(Vector3.Up(),arm.yaw),base=new Vector3(arm.x,y,arm.z);
   Matrix.ComposeToRef(Vector3.One(),q,base,scratch);scratch.copyToArray(pole,i*16);
   // Arm along local +X (driver's left when the pole stands on their right); a median pole mirrors it by a half turn.
   const armRot=arm.side<0?Quaternion.RotationAxis(Vector3.Up(),arm.yaw+Math.PI):q;
   Matrix.ComposeToRef(new Vector3(arm.arm,1,1),armRot,base,scratch);scratch.copyToArray(armBuf,i*16);
   Matrix.FromQuaternionToRef(q,rot);Vector3.TransformCoordinatesFromFloatsToRef(arm.side<0?-arm.arm:arm.arm,0,0,rot,tip);tip.addInPlace(base);
   Matrix.ComposeToRef(Vector3.One(),q,tip,scratch);scratch.copyToArray(head,i*16);
   const aspect=this.aspectFor(junction,arm);
   if(!aerial){
    // Blender (x, y=forward, z=up) -> game local (x, y=up, z=forward).
    const o=L.lensOffsets[aspect];local.set(o[0],o[2],o[1]);Vector3.TransformCoordinatesToRef(local,rot,world);world.addInPlace(tip);
    Matrix.ComposeToRef(Vector3.One(),q,world,scratch);lens[aspect].push(...scratch.asArray());
    const p=L.poleHead.lensOffsets[aspect];local.set(p[0],p[2],p[1]);Vector3.TransformCoordinatesToRef(local,rot,world);world.addInPlace(base);
    Matrix.ComposeToRef(Vector3.One(),q,world,scratch);lens[aspect].push(...scratch.asArray());
   }
  });
  const set=(role:string,buffer:Float32Array|number[],count:number)=>{for(const mesh of this.roles.get(role)??[]){if(!count){mesh.setEnabled(false);continue;}mesh.setEnabled(true);mesh.thinInstanceSetBuffer('matrix',buffer instanceof Float32Array?buffer:new Float32Array(buffer),16,true);mesh.thinInstanceRefreshBoundingInfo();}};
  if(structural){set('signal-pole',pole,arms.length);set('signal-arm',armBuf,arms.length);set('signal-head',head,arms.length);}
  for(const aspect of ASPECTS)set('signal-lens-'+aspect,lens[aspect],lens[aspect].length/16);
  this.triangles=arms.length*this.sourceTriangles;
 }
 get stats(){return {junctions:this.junctions.length,arms:this.junctions.reduce((n,j)=>n+j.arms.length,0),visibleArms:this.visibleArms,triangles:this.triangles,drawCalls:this.visibleArms?this.meshes.filter(m=>m.isEnabled()).length:0};}
 dispose(){for(const mesh of this.meshes)mesh.dispose(false,true);this.roles.clear();}
}
