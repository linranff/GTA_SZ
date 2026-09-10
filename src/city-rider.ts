import {AbstractMesh,Animation,AnimationGroup,ImportMeshAsync,PBRMaterial,TransformNode,type Scene} from '@babylonjs/core';
import {CHARACTERS_ENABLED,localCharacterManifest,loadLocalCharacter,characterProgress} from './city-local-characters.ts';
import {WALK_SPEED,RUN_SPEED} from './city-walk.ts';

export type RiderPose={x:number;y:number;z:number;yaw:number;speed:number};
export type CityRider={
 meshes:AbstractMesh[];
 name:string;
 setEnabled(enabled:boolean):void;
 setPose(pose:RiderPose,dt:number):void;
 dispose():void;
};

/** Configured PMX-derived avatar; existing rider when no asset source is configured.
 * Native, in-place skeletal clips share a contact clock. Preserve glTF handedness. */
export async function createCityRider(scene:Scene):Promise<CityRider>{
 characterProgress('player','loading',0,'久岐忍 · 正在读取角色');
 let local:Awaited<ReturnType<typeof localCharacterManifest>>['models'][number]|undefined;
 try{if(CHARACTERS_ENABLED)local=(await localCharacterManifest()).models.find(m=>m.id==='kuki');}
 catch(e){characterProgress('player','error',0,String((e as Error).message));throw e;}
 const manifest=local??await fetch('/city/rider/manifest.json').then(r=>{if(!r.ok)throw Error('Rider gait manifest unavailable');return r.json();}) as {gait:{walk:{cycleSeconds:number;authoredSpeed:number};run:{cycleSeconds:number;authoredSpeed:number}}};
 let owned:Awaited<ReturnType<typeof loadLocalCharacter>>|undefined;
 let result;
 try{result=local?(owned=await loadLocalCharacter(scene,local,n=>characterProgress('player','loading',n,'久岐忍 · 贴图与骨骼 '+Math.round(n*100)+'%'))):await ImportMeshAsync('/city/rider/rider.glb',scene);}
 catch(e){characterProgress('player','error',0,'久岐忍加载失败，仍可驾驶 · '+(e as Error).message);throw e;}
 const anchor=new TransformNode(local?'player-kuki-shinobu':'player-delivery-rider',scene);
 const source=result.meshes[0];source.parent=anchor;
 const meshes=result.meshes.filter(m=>m.getTotalVertices()>0);
 for(const mesh of meshes){
  mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;
  mesh.doNotSyncBoundingInfo=false;
  const material=mesh.material;
  if(material instanceof PBRMaterial&&!local){
   material.maxSimultaneousLights=6;material.environmentIntensity=.85;
   material.enableSpecularAntiAliasing=true;material.forceIrradianceInFragment=true;
   for(const texture of material.getActiveTextures())texture.anisotropicFilteringLevel=8;
  }
 }
 const find=(name:string)=>result.animationGroups.find(a=>a.name.toLowerCase().includes(name));
 const idle=find('idle'),walk=find('walk'),run=find('run');
 if(!idle||!walk||!run){owned?.dispose();anchor.dispose();characterProgress('player','error',0,'角色待机 / 行走 / 奔跑动画不完整，可重试');throw Error('角色待机 / 行走 / 奔跑动画不完整');}
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
 characterProgress('player','ready',1,'久岐忍已就绪');
 return {meshes,name:local?.name??'外卖骑手',setEnabled,setPose(pose,dt){
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
  if(owned){owned.dispose();anchor.dispose();return;}
  for(const group of result.animationGroups)group.dispose();
  for(const skeleton of result.skeletons)skeleton.dispose();
  anchor.dispose(false,true);
 }};
}
