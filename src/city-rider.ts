import {AbstractMesh,Animation,AnimationGroup,ImportMeshAsync,PBRMaterial,TransformNode,type Scene} from '@babylonjs/core';
import {WALK_SPEED,RUN_SPEED} from './city-walk.ts';

export type RiderPose={x:number;y:number;z:number;yaw:number;speed:number};
export type CityRider={
 meshes:AbstractMesh[];
 setEnabled(enabled:boolean):void;
 setPose(pose:RiderPose,dt:number):void;
 dispose():void;
};

/** User-supplied Tripo rider, prepared at 1.78 metres with in-place skeletal
 * walk/run loops. The loader's handedness root is retained under our anchor. */
export async function createCityRider(scene:Scene):Promise<CityRider>{
 const manifest=await fetch('/city/rider/manifest.json').then(r=>{if(!r.ok)throw Error('Rider gait manifest unavailable');return r.json();}) as {gait:{walk:{cycleSeconds:number;authoredSpeed:number};run:{cycleSeconds:number;authoredSpeed:number}}};
 const result=await ImportMeshAsync('/city/rider/rider.glb',scene);
 const anchor=new TransformNode('player-delivery-rider',scene);
 const source=result.meshes[0];source.parent=anchor;
 const meshes=result.meshes.filter(m=>m.getTotalVertices()>0);
 for(const mesh of meshes){
  mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;
  mesh.doNotSyncBoundingInfo=false;
  const material=mesh.material;
  if(material instanceof PBRMaterial){
   material.maxSimultaneousLights=6;material.environmentIntensity=.85;
   material.enableSpecularAntiAliasing=true;material.forceIrradianceInFragment=true;
   for(const texture of material.getActiveTextures())texture.anisotropicFilteringLevel=8;
  }
 }
 const find=(name:string)=>result.animationGroups.find(a=>a.name.toLowerCase().includes(name));
 const idle=find('idle'),walk=find('walk'),run=find('run');
 const groups=[idle,walk,run].filter((g):g is AnimationGroup=>!!g);
 for(const group of groups){group.start(true);group.setWeightForAllAnimatables(group===idle?1:0);}
 // One neutral phase clock keeps left/right contacts aligned while blending
 // clips of different lengths. It continues even when a clip has zero weight.
 const phaseAnimation=new Animation('rider-stride-clock','phase',1,Animation.ANIMATIONTYPE_FLOAT,Animation.ANIMATIONLOOPMODE_CYCLE);
 phaseAnimation.setKeys([{frame:0,value:0},{frame:1,value:1}]);
 const phaseClock=scene.beginDirectAnimation({phase:0},[phaseAnimation],0,1,true);
 walk?.syncAllAnimationsWith(phaseClock);run?.syncAllAnimationsWith(phaseClock);
 const walkStride=manifest.gait.walk.cycleSeconds*manifest.gait.walk.authoredSpeed;
 const runStride=manifest.gait.run.cycleSeconds*manifest.gait.run.authoredSpeed;
 let enabled=false,walkWeight=0,runWeight=0,disposed=false;
 anchor.setEnabled(false);
 for(const group of groups)group.pause();
 phaseClock.pause();
 function setEnabled(value:boolean){
  if(disposed||enabled===value)return;
  enabled=value;anchor.setEnabled(value);
  if(value)phaseClock.restart();else phaseClock.pause();
  if(value)for(const group of groups)group.play(true);
  else for(const group of groups)group.pause();
 }
 return {meshes,setEnabled,setPose(pose,dt){
  if(disposed)return;
  anchor.position.set(pose.x,pose.y,pose.z);anchor.rotation.y=pose.yaw;
  if(!enabled)return;
  const speed=Math.abs(pose.speed),moving=speed>.1;
  const running=Math.min(1,Math.max(0,(speed-WALK_SPEED-.2)/(RUN_SPEED-WALK_SPEED-.2)));
  const smooth=1-Math.exp(-Math.max(0,Math.min(.1,dt))*12);
  walkWeight+=((moving?1-running:0)-walkWeight)*smooth;
  runWeight+=((moving?running:0)-runWeight)*smooth;
  idle?.setWeightForAllAnimatables(Math.max(0,1-walkWeight-runWeight));
  walk?.setWeightForAllAnimatables(walkWeight);run?.setWeightForAllAnimatables(runWeight);
  const movingWeight=walkWeight+runWeight,runBlend=movingWeight>.001?runWeight/movingWeight:0;
  phaseClock.speedRatio=moving?speed/(walkStride+(runStride-walkStride)*runBlend):0;
 },dispose(){
  if(disposed)return;disposed=true;
  phaseClock.stop();
  for(const group of result.animationGroups)group.dispose();
  for(const skeleton of result.skeletons)skeleton.dispose();
  anchor.dispose(false,true);
 }};
}
