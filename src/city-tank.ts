import {ImportMeshAsync,TransformNode,Vector3,MeshBuilder,StandardMaterial,Color3,PBRMaterial,Ray,type Scene,type AbstractMesh} from '@babylonjs/core';
import type {CityData} from './city-types.ts';
import {FlightCityCollision} from './city-flight-collision.ts';
import {FlightExplosion} from './city-flight-explosion.ts';
import {advanceTankShell,TANK_LIMITS,type ShellPoint} from './city-tank-simulation.ts';
type Shell={position:ShellPoint;velocity:ShellPoint;age:number;mesh:AbstractMesh};
/** One player tank, bounded projectile pool, two shared aircraft fireball FX.
 * Firing never allocates lights or reloads models/materials. */
export class CityTank{
 readonly root:TransformNode;meshes:AbstractMesh[]=[];loaded=false;loading=false;active=false;
 turretYaw=0;barrelPitch=.06;shots=0;hits=0;private dead=false;private pending:Promise<void>|null=null;
 private turret:TransformNode|null=null;private barrel:TransformNode|null=null;private muzzle:TransformNode|null=null;
 private cooldown=0;private recoil=0;private barrelHome=Vector3.Zero();
 private shells:Shell[]=[];private tracers:AbstractMesh[]=[];private effects:{fx:FlightExplosion;age:number}[]=[];private sweep:FlightCityCollision;
 constructor(private scene:Scene,data:CityData,private heightAt:(x:number,z:number)=>number,private landmarks:()=>AbstractMesh[],private onExplosion:()=>void){this.root=new TransformNode('player-tank',scene);this.root.setEnabled(false);this.sweep=new FlightCityCollision(data,heightAt);}
 async load(){if(this.loaded)return;if(this.pending)return this.pending;this.loading=true;
  this.pending=(async()=>{
   const result=await ImportMeshAsync('/city/tank/tank.glb',this.scene);
   if(this.dead){result.meshes[0].dispose(false,true);return;}
   // Asset points +Z. Preserve the loader's complete handedness conversion.
   result.meshes[0].parent=this.root;this.meshes=result.meshes.filter(m=>m.getTotalVertices()>0);
   for(const mesh of this.meshes){mesh.isPickable=false;mesh.receiveShadows=true;mesh.unfreezeWorldMatrix();mesh.alwaysSelectAsActiveMesh=true;if(mesh.material instanceof PBRMaterial){mesh.material.maxSimultaneousLights=6;mesh.material.environmentIntensity=1;mesh.material.enableSpecularAntiAliasing=true;}}
   const nodes=[...result.transformNodes,...result.meshes];this.turret=nodes.find(n=>n.name==='tank_turret')??null;this.barrel=nodes.find(n=>n.name==='tank_barrel')??null;this.muzzle=nodes.find(n=>n.name==='tank_muzzle')??null;
   if(this.turret)this.turret.rotationQuaternion=null;if(this.barrel){this.barrel.rotationQuaternion=null;this.barrelHome.copyFrom(this.barrel.position);}
   const mat=new StandardMaterial('tank-shell-radiance',this.scene);mat.disableLighting=true;mat.emissiveColor=new Color3(1,.65,.17);
   for(let i=0;i<4;i++){const mesh=MeshBuilder.CreateSphere('tank-shell-'+i,{diameter:.20,segments:6},this.scene);mesh.material=mat;mesh.isPickable=false;mesh.setEnabled(false);this.tracers.push(mesh);}
   this.effects=Array.from({length:2},()=>({fx:new FlightExplosion(this.scene),age:99}));
   for(let i=0;i<100&&!this.effects.every(e=>e.fx.isReady());i++)await new Promise(r=>setTimeout(r,20));
   this.loaded=true;
  })().finally(()=>{this.loading=false;this.pending=null;});return this.pending;
 }
 setActive(active:boolean){this.active=active&&this.loaded;this.root.setEnabled(this.active);if(!active)this.clearEffects();}
 setPose(x:number,y:number,z:number,yaw:number){this.root.position.set(x,y+.05,z);this.root.rotation.y=yaw;this.root.computeWorldMatrix(true);}
 aim(keys:ReadonlySet<string>,dt:number){this.turretYaw+=((keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0))*dt*.65;this.barrelPitch=Math.max(-.06,Math.min(.38,this.barrelPitch+((keys.has('PageUp')?1:0)-(keys.has('PageDown')?1:0))*dt*.22));}
 fire(){if(!this.active||this.cooldown>0||!this.loaded)return false;
  this.syncModel();const yaw=this.root.rotation.y+this.turretYaw,direction=new Vector3(Math.sin(yaw)*Math.cos(this.barrelPitch),Math.sin(this.barrelPitch),Math.cos(yaw)*Math.cos(this.barrelPitch));
  const origin=this.muzzle?(this.muzzle.computeWorldMatrix(true),this.muzzle.getAbsolutePosition().clone()):this.root.position.add(direction.scale(5)).addInPlaceFromFloats(0,2.1,0);
  const mesh=this.tracers.find(m=>!m.isEnabled());if(!mesh)return false;
  mesh.position.copyFrom(origin);mesh.setEnabled(true);this.shells.push({position:{x:origin.x,y:origin.y,z:origin.z},velocity:{x:direction.x*TANK_LIMITS.shellSpeed,y:direction.y*TANK_LIMITS.shellSpeed,z:direction.z*TANK_LIMITS.shellSpeed},age:0,mesh});
  this.cooldown=TANK_LIMITS.reload;this.recoil=.42;this.shots++;this.onExplosion();return true;
 }
 private syncModel(){
  // The imported root reflects X, so its local yaw/pitch signs are reversed.
  if(this.turret)this.turret.rotation.y=-this.turretYaw;
  if(this.barrel){this.barrel.rotation.x=-this.barrelPitch;this.barrel.position.copyFrom(this.barrelHome).addInPlaceFromFloats(0,0,-this.recoil);}
 }
 step(dt:number){dt=Math.max(0,Math.min(.05,dt));this.cooldown=Math.max(0,this.cooldown-dt);this.recoil*=Math.exp(-dt*12);this.syncModel();
  for(const effect of this.effects)if(effect.age<3.5){effect.age+=dt;effect.fx.step(effect.age);if(effect.age>=3.5)effect.fx.reset();}
  for(const shell of [...this.shells]){
   const next=advanceTankShell(shell.position,shell.velocity,dt);let hit=this.sweep.sweep(shell.position,next);
   const start=new Vector3(shell.position.x,shell.position.y,shell.position.z),end=new Vector3(next.x,next.y,next.z),length=Vector3.Distance(start,end),ray=new Ray(start,end.subtract(start).normalize(),length);
   // Detailed landmarks have openings: use exact triangles instead of their
   // coarse footprint. Ray checks are only made for a few active shells.
   let best=hit?Vector3.Distance(start,new Vector3(hit.point.x,hit.point.y,hit.point.z)):length+.001;
   for(const mesh of this.landmarks()){
    if(mesh.isDisposed()||!/^(detail_|landmark_|civic_)/.test(mesh.name)||/ground|road|terrain|plant|lamp|sign/.test(mesh.name))continue;
    const b=mesh.getBoundingInfo().boundingBox;if(!ray.intersectsBoxMinMax(b.minimumWorld,b.maximumWorld))continue;
    const pick=ray.intersectsMesh(mesh,false);if(pick.hit&&pick.pickedPoint&&pick.distance<best){best=pick.distance;hit={point:{x:pick.pickedPoint.x,y:pick.pickedPoint.y,z:pick.pickedPoint.z},kind:'building'};}
   }
   shell.age+=dt;if(hit||shell.age>TANK_LIMITS.shellLifetime){
    shell.mesh.setEnabled(false);this.shells.splice(this.shells.indexOf(shell),1);
    if(hit){this.hits++;const effect=[...this.effects].sort((a,b)=>b.age-a.age)[0];effect.fx.reset();effect.fx.burst(new Vector3(hit.point.x,hit.point.y+.15,hit.point.z),this.root.rotation.y+this.turretYaw);effect.age=0;this.onExplosion();}
   }else{shell.position=next;shell.mesh.position.set(next.x,next.y,next.z);}
  }
 }
 clearEffects(){for(const s of this.shells)s.mesh.setEnabled(false);this.shells=[];for(const e of this.effects){e.fx.reset();e.age=99;}this.cooldown=0;}
 get stats(){return {loaded:this.loaded,loading:this.loading,active:this.active,shots:this.shots,hits:this.hits,shells:this.shells.length,cooldown:this.cooldown,turretYaw:this.turretYaw,barrelPitch:this.barrelPitch,effects:this.effects.filter(e=>e.age<3.5).length,meshes:this.meshes.length};}
 dispose(){this.dead=true;this.clearEffects();for(const e of this.effects)e.fx.dispose();for(const m of this.tracers)m.dispose(false,true);this.root.dispose(false,true);}
}
