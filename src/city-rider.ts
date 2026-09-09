import {AbstractMesh,AnimationGroup,ImportMeshAsync,PBRMaterial,TransformNode,type Scene} from '@babylonjs/core';

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
 let enabled=false,walkWeight=0,runWeight=0,disposed=false;
 anchor.setEnabled(false);
 for(const group of groups)group.pause();
 function setEnabled(value:boolean){
  if(disposed||enabled===value)return;
  enabled=value;anchor.setEnabled(value);
  if(value)for(const group of groups)group.play(true);
  else for(const group of groups)group.pause();
 }
 return {meshes,setEnabled,setPose(pose,dt){
  if(disposed)return;
  anchor.position.set(pose.x,pose.y,pose.z);anchor.rotation.y=pose.yaw;
  if(!enabled)return;
  const speed=Math.abs(pose.speed),moving=speed>.1;
  const running=Math.min(1,Math.max(0,(speed-3.05)/1.5));
  const smooth=1-Math.exp(-Math.max(0,Math.min(.1,dt))*12);
  walkWeight+=((moving?1-running:0)-walkWeight)*smooth;
  runWeight+=((moving?running:0)-runWeight)*smooth;
  idle?.setWeightForAllAnimatables(Math.max(0,1-walkWeight-runWeight));
  walk?.setWeightForAllAnimatables(walkWeight);run?.setWeightForAllAnimatables(runWeight);
  if(walk)walk.speedRatio=Math.min(1.35,Math.max(.6,speed/2.7));
  if(run)run.speedRatio=Math.min(1.4,Math.max(.8,speed/5.3));
 },dispose(){
  if(disposed)return;disposed=true;
  for(const group of result.animationGroups)group.dispose();
  for(const skeleton of result.skeletons)skeleton.dispose();
  anchor.dispose(false,true);
 }};
}
