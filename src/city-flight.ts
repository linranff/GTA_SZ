import {ImportMeshAsync,TransformNode,Quaternion,Vector3,Ray,Matrix,PBRMaterial,type AbstractMesh,type Scene} from '@babylonjs/core';
import type {CityData} from './city-types.ts';
import {FlightExplosion} from './city-flight-explosion.ts';
import {FlightCityCollision} from './city-flight-collision.ts';
import {FlightSimulation,flightPoint,flightBasis,type FlightPoint,type FlightHit} from './city-flight-simulation.ts';

const vector=(p:FlightPoint)=>new Vector3(p.x,p.y,p.z);
type MeshCollider={mesh:AbstractMesh;world:Matrix;inverse:Matrix;min:Vector3;max:Vector3};
function boxInterval(a:FlightPoint,b:FlightPoint,min:Vector3,max:Vector3){
 let near=0,far=1;
 for(const axis of ['x','y','z'] as const){const d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(a[axis]<min[axis]||a[axis]>max[axis])return false;}else{const u=(min[axis]-a[axis])/d,v=(max[axis]-a[axis])/d;near=Math.max(near,Math.min(u,v));far=Math.min(far,Math.max(u,v));if(near>far)return false;}}
 return true;
}

/** One reusable aircraft and one short-lived explosion. No extra render loop. */
export class CityFlight{
 readonly sim=new FlightSimulation();readonly root:TransformNode;
 meshes:AbstractMesh[]=[];loading=false;loaded=false;
 private loadPromise:Promise<void>|null=null;private propeller:TransformNode|null=null;
 private collision:FlightCityCollision;private colliders:MeshCollider[]=[];
 private explosion:FlightExplosion|null=null;private impactEye=Vector3.Zero();
 private eye=Vector3.Zero();private target=Vector3.Zero();private crashPoint=Vector3.Zero();private dead=false;
 constructor(private scene:Scene,private data:CityData,private heightAt:(x:number,z:number)=>number,landmarks:AbstractMesh[],private onExplosion:()=>void){
  this.root=new TransformNode('bay-flight',scene);this.root.setEnabled(false);
  this.collision=new FlightCityCollision(data,heightAt);
  // Real landmark triangles preserve passages and bridge-like overhangs.
  // Ordinary buildings use their original footprint + roof height instead.
  for(const mesh of landmarks){
   if(mesh.isDisposed()||!mesh.getTotalVertices()||!/^(landmark_|detail_|civic_|bamboo_cafe_)/.test(mesh.name)||/terrain|lianhua|mountain|plant|tree|lamp|sign|light|shore|ground|paving|road/.test(mesh.name))continue;
   const world=mesh.computeWorldMatrix(true).clone(),bounds=mesh.getBoundingInfo().boundingBox;
   this.colliders.push({mesh,world,inverse:Matrix.Invert(world),min:bounds.minimumWorld.clone(),max:bounds.maximumWorld.clone()});
  }
 }
 get active(){return this.sim.active;}
 get stats(){return {...this.sim.status,loading:this.loading,loaded:this.loaded,altitude:Math.max(0,this.sim.pose.y-this.heightAt(this.sim.pose.x,this.sim.pose.z)),meshCount:this.meshes.length,landmarkColliders:this.colliders.length,explosionParticles:this.explosion?.stats.particles??0,explosion:this.explosion?.stats??null};}
 async load(){
  if(this.loaded)return;if(this.loadPromise)return this.loadPromise;
  this.loading=true;
  this.loadPromise=(async()=>{
   const result=await ImportMeshAsync('/city/floatplane.glb',this.scene);
   if(this.dead){for(const m of result.meshes)m.dispose();return;}
   // Same glTF root convention as the city: retain Z reflection, remove the
   // extra Y rotation. Authored -Z nose now points along game +Z.
   result.meshes[0].rotationQuaternion=Quaternion.Identity();result.meshes[0].parent=this.root;
   this.meshes=result.meshes.filter(m=>m.getTotalVertices()>0);
   for(const mesh of this.meshes){mesh.isPickable=false;mesh.receiveShadows=true;mesh.unfreezeWorldMatrix();if(mesh.material instanceof PBRMaterial){mesh.material.environmentIntensity=1;mesh.material.maxSimultaneousLights=4;}}
   this.propeller=result.transformNodes.find(n=>n.name==='floatplane_propeller')??null;
   if(this.propeller)this.propeller.rotationQuaternion=null;
   this.explosion??=new FlightExplosion(this.scene);
   // Compile the small effect shaders before takeoff, not during the 3-second
   // explosion. The burst never adds a light that recompiles the whole city.
   for(let i=0;i<100&&!this.explosion.isReady();i++)await new Promise(resolve=>setTimeout(resolve,20));
   this.loaded=true;
  })().finally(()=>{this.loading=false;this.loadPromise=null;});
  return this.loadPromise;
 }
 private sweep=(a:FlightPoint,b:FlightPoint):FlightHit|null=>{
  let hit=this.collision.sweep(a,b),closest=hit?Vector3.Distance(vector(a),vector(hit.point)):Infinity;
  const start=vector(a),delta=vector(b).subtract(start),length=delta.length();if(length<1e-6)return hit;
  const ray=new Ray(start,delta.scale(1/length),length);
  for(const c of this.colliders){if(c.mesh.isDisposed()||!boxInterval(a,b,c.min,c.max))continue;
   const pick=c.mesh.intersects(Ray.Transform(ray,c.inverse),false,undefined,false,c.world);
   if(pick.hit&&pick.pickedPoint){const distance=Vector3.Distance(start,pick.pickedPoint);if(distance<=length+.001&&distance<closest){closest=distance;hit={point:{x:pick.pickedPoint.x,y:pick.pickedPoint.y,z:pick.pickedPoint.z},kind:'building',id:c.mesh.name};}}
  }
  return hit;
 };
 start(eye:FlightPoint,yaw:number){
  if(!this.loaded||this.dead)return false;
  this.clearEffects();const extent=this.data.meta.extent;
  const p={x:Math.max(extent[0]+80,Math.min(extent[2]-80,eye.x)),y:Math.max(80,eye.y),z:Math.max(extent[1]+80,Math.min(extent[3]-80,eye.z))};
  p.y=Math.max(p.y,this.heightAt(p.x,p.z)+65);let clear=false;
  // Spawn only into free air, with room for the first second of forward flight.
  for(let i=0;i<60&&p.y<=2050;i++,p.y+=25){const pose={...p,yaw,pitch:0,roll:0};clear=true;
   for(const side of [-7,0,7]){const from=flightPoint(pose,side,-6,-1.5),to=flightPoint(pose,side,60,2.4);if(this.sweep(from,to)){clear=false;break;}}
   if(clear)break;
  }
  if(!clear)return false;
  this.sim.start(p,yaw);this.root.setEnabled(true);this.syncModel(0);
  const camera=this.chase();this.eye.copyFrom(camera.eye);this.target.copyFrom(camera.target);return true;
 }
 stop(){this.sim.stop();this.root.setEnabled(false);this.clearEffects();}
 step(keys:ReadonlySet<string>,dt:number,now:number){
  const result=this.sim.step(keys,dt,now,this.sweep,this.data.meta.extent);
  if(result==='crashed'){this.root.setEnabled(false);this.burst(vector(this.sim.hit!.point));this.onExplosion();}
  if(this.sim.phase==='flying')this.syncModel(dt);
  if(this.sim.phase==='exploding'){
   const seconds=(now-this.sim.crashedAt)/1000;this.explosion?.step(seconds);
   const away=this.impactEye.subtract(this.crashPoint).normalize(),desired=this.impactEye.add(away.scale(8*(1-Math.exp(-seconds*3))));
   const wall=this.sweep(this.impactEye,desired);this.eye.copyFrom(wall?this.impactEye:desired);
   const shake=.35*Math.exp(-seconds*3.5);this.eye.x+=Math.sin(seconds*63)*shake;this.eye.y+=Math.cos(seconds*71)*shake*.6;
   this.target.copyFrom(this.crashPoint).addInPlaceFromFloats(0,2+seconds*2.8,0);
  }else if(this.sim.phase==='flying'){
   const desired=this.chase(),amount=1-Math.exp(-dt*7);this.eye=Vector3.Lerp(this.eye,desired.eye,amount);this.target.copyFrom(desired.target);
   const origin={x:this.sim.pose.x,y:this.sim.pose.y+1,z:this.sim.pose.z},obstacle=this.sweep(origin,this.eye);
   if(obstacle){const direction=this.eye.subtract(vector(origin)).normalize(),distance=Math.max(1,Vector3.Distance(vector(origin),vector(obstacle.point))-1.2);this.eye.copyFrom(vector(origin).add(direction.scale(distance)));}
  }
  return result;
 }
 get camera(){return {eye:this.eye,target:this.target};}
 private chase(){const p=this.sim.pose,f=flightBasis(p).forward;return {eye:new Vector3(p.x-f.x*27,p.y+8-f.y*12,p.z-f.z*27),target:new Vector3(p.x+f.x*12,p.y+1.5+f.y*12,p.z+f.z*12)};}
 private syncModel(dt:number){const p=this.sim.pose;this.root.position.set(p.x,p.y,p.z);this.root.rotationQuaternion=Quaternion.RotationYawPitchRoll(p.yaw,-p.pitch,-p.roll);if(this.propeller)this.propeller.rotation.z+=dt*(45+this.sim.throttle*70);}
 private burst(position:Vector3){
  this.crashPoint.copyFrom(position);this.impactEye.copyFrom(this.eye);this.explosion?.burst(position,this.sim.pose.yaw);
 }
 private clearEffects(){this.explosion?.reset();}
 dispose(){this.dead=true;this.stop();this.explosion?.dispose();this.explosion=null;this.root.dispose(false,true);}
}
