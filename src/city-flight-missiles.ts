import {Mesh,MeshBuilder,TransformNode,StandardMaterial,Color3,Quaternion,Vector3,type Scene} from '@babylonjs/core';
import {FlightExplosion} from './city-flight-explosion.ts';
import {FlightMissileSimulation,FLIGHT_MISSILE_LIMITS,type FlightMissile} from './city-flight-missile-simulation.ts';
import type {FlightPose,FlightSweep} from './city-flight-simulation.ts';

type Visual={root:TransformNode;flame:Mesh;wake:Mesh};
/** Allocate at aircraft load, reuse on every shot. No dynamic city lights,
 * asset loading, shader variants or timers are created when a missile hits. */
export class FlightMissiles{
 readonly sim=new FlightMissileSimulation();
 private visuals:Visual[]=[];private materials:StandardMaterial[]=[];private meshes:Mesh[]=[];
 private effects:{fx:FlightExplosion;age:number}[]=[];
 constructor(scene:Scene,private sweep:FlightSweep,private onImpact:()=>void){
  const material=(name:string,color:Color3,glow=0,alpha=1)=>{
   const m=new StandardMaterial('flight-missile-'+name,scene);m.disableLighting=true;m.emissiveColor=color.scale(glow||1);m.alpha=alpha;
   this.materials.push(m);return m;
  };
  const body=material('ceramic',new Color3(.66,.70,.73)),dark=material('fins',new Color3(.10,.14,.18));
  const hot=material('exhaust',new Color3(1,.42,.035),2.5),smoke=material('wake',new Color3(.34,.39,.44),0,.22);
  smoke.disableDepthWrite=true;
  for(let slot=0;slot<FLIGHT_MISSILE_LIMITS.capacity;slot++){
   const root=new TransformNode('flight-missile-'+slot,scene);
   const part=(mesh:Mesh,mat:StandardMaterial)=>{mesh.parent=root;mesh.material=mat;mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;this.meshes.push(mesh);return mesh;};
   // Local +Z is the nose; a compact missile has a tapered nose and four fins.
   const barrel=part(MeshBuilder.CreateCylinder('missile-body',{height:1.85,diameter:.24,tessellation:10},scene),body);barrel.rotation.x=Math.PI/2;
   const nose=part(MeshBuilder.CreateCylinder('missile-nose',{height:.5,diameterTop:0,diameterBottom:.24,tessellation:10},scene),dark);nose.rotation.x=Math.PI/2;nose.position.z=1.175;
   for(let i=0;i<4;i++){
    const fin=part(MeshBuilder.CreateBox('missile-fin',{width:.40,height:.025,depth:.38},scene),dark),angle=i*Math.PI/2;
    fin.rotation.z=angle;fin.position.set(Math.cos(angle)*.22,Math.sin(angle)*.22,-.67);
   }
   const flame=part(MeshBuilder.CreateCylinder('missile-exhaust',{height:1,diameterTop:.03,diameterBottom:.24,tessellation:8},scene),hot);flame.rotation.x=-Math.PI/2;
   const wake=part(MeshBuilder.CreateCylinder('missile-wake',{height:1,diameterTop:.7,diameterBottom:.11,tessellation:8},scene),smoke);wake.rotation.x=-Math.PI/2;
   root.setEnabled(false);this.visuals.push({root,flame,wake});
  }
  this.effects=Array.from({length:2},()=>({fx:new FlightExplosion(scene),age:99}));
 }
 isReady(){return this.meshes.every(m=>m.material!.isReady(m))&&this.effects.every(e=>e.fx.isReady());}
 fire(pose:FlightPose,speed:number){const missile=this.sim.fire(pose,speed);if(!missile)return false;this.draw(missile);return true;}
 private draw(m:FlightMissile){
  const {root,flame,wake}=this.visuals[m.slot];root.setEnabled(true);root.position.set(m.position.x,m.position.y,m.position.z);
  root.rotationQuaternion=Quaternion.RotationYawPitchRoll(m.yaw,-m.pitch,-m.roll);
  const flicker=1+Math.sin(m.age*83+m.slot)*.13;flame.scaling.y=1.8*flicker;flame.position.z=-.93-flame.scaling.y/2;
  wake.scaling.y=Math.min(17,m.travel);wake.position.z=-1.9-wake.scaling.y/2;wake.setEnabled(wake.scaling.y>.01);
 }
 step(dt:number){
  if(!Number.isFinite(dt)||dt<=0)return;
  const h=Math.min(.1,dt);
  for(const e of this.effects)if(e.age<3.2){e.age+=h;e.fx.step(e.age);if(e.age>=3.2)e.fx.reset();}
  for(const impact of this.sim.step(h,this.sweep)){
   const effect=this.effects.reduce((a,b)=>a.age>b.age?a:b),p=impact.hit.point;
   effect.fx.burst(new Vector3(p.x,p.y+.15,p.z),impact.yaw);effect.age=0;this.onImpact();
  }
  for(let i=0;i<this.visuals.length;i++)if(!this.sim.missiles.some(m=>m.slot===i))this.visuals[i].root.setEnabled(false);
  for(const m of this.sim.missiles)this.draw(m);
 }
 clear(){this.sim.clear();for(const v of this.visuals)v.root.setEnabled(false);for(const e of this.effects){e.fx.reset();e.age=99;}}
 get stats(){return {shots:this.sim.shots,hits:this.sim.hits,active:this.sim.missiles.length,cooldown:this.sim.cooldown,
  effects:this.effects.filter(e=>e.age<3.2).length,fireballs:this.effects.reduce((n,e)=>n+e.fx.stats.fireballs,0)};}
 dispose(){this.clear();for(const v of this.visuals)v.root.dispose(false);for(const m of this.materials)m.dispose();for(const e of this.effects)e.fx.dispose();}
}
