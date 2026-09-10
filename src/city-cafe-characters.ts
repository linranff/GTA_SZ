import {CHARACTERS_ENABLED,localCharacterManifest,loadLocalCharacter,characterProgress,type LocalCharacter} from './city-local-characters.ts';
import {ImportMeshAsync,Matrix,PBRMaterial,Quaternion,Vector3,type AbstractMesh,type AnimationGroup,type Scene,type Skeleton,type TransformNode} from '@babylonjs/core';
import type {CafeSpec} from './city-cafe-layout.ts';
import type {CafeStaffPose} from './city-cafe-staff-motion.ts';

type CharacterManifest={schemaVersion:number;staffAssignments:Record<string,string>;models:{id:string;file:string;triangles:number;bytes:number;height:number;rigged:boolean;gait:{authoredSpeed:number};local?:LocalCharacter}[]};
type CharacterFit={sourceHeight:number;displayHeight:number;verticalScale:number;horizontalScale:number;footOffset:number};
export type CafeCharacterStatus={loaded:boolean;error:string|null;assignments:Record<string,string>;triangles:number;source:'user-provided Tripo GLBs'|'MMD / miHoYo / 观海';proportions?:Record<string,CharacterFit>;animation?:{rigged:boolean;bones:number;clips:string[];independentSkeletons:number}};
type AnimatedStaff={id:string;anchor:TransformNode;groups:Record<'idle'|'walk'|'wave',AnimationGroup>;started:boolean;playing:boolean;authoredSpeed:number};

// Art-directed DISPLAY heights in this cafe, not claims about real people.
// These large-headed models had eyes well below the 1.68-unit player eye and
// looked undersized beside the 1.265-unit bar and 0.575-unit chair seats.
const CAFE_DISPLAY_HEIGHT:Record<string,number>={zhixia:1.96,wangshu:1.93,xiaolan:1.95};

function fitCharacter(root:TransformNode,meshes:AbstractMesh[],displayHeight:number):CharacterFit{
 // A cloned maid inherits the first maid's fitted transform. Reset it before
 // measuring so a second normalization cannot compound that first scaling.
 root.scaling.setAll(1);root.position.setAll(0);root.rotationQuaternion=Quaternion.Identity();
 const inverse=Matrix.Invert(root.computeWorldMatrix(true));
 let minY=Infinity,maxY=-Infinity;
 for(const mesh of meshes){
  const relative=mesh.computeWorldMatrix(true).multiply(inverse);
  for(const corner of mesh.getBoundingInfo().boundingBox.vectors){
   const p=Vector3.TransformCoordinates(corner,relative);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
  }
 }
 const sourceHeight=maxY-minY;
 if(!Number.isFinite(sourceHeight)||sourceHeight<.01)throw Error('Invalid cafe character height');
 const verticalScale=displayHeight/sourceHeight,horizontalScale=verticalScale*.97;
 root.scaling.set(horizontalScale,verticalScale,horizontalScale);
 // Keep the lowest point at the existing staff anchor, including future
 // supplied models whose exported origin is not already at the shoe sole.
 root.position.y=-minY*verticalScale;
 root.computeWorldMatrix(true);for(const mesh of meshes)mesh.computeWorldMatrix(true);
 return {sourceHeight,displayHeight,verticalScale,horizontalScale,footOffset:root.position.y};
}

/** Replace the old figures while preserving staff anchors and dialogue IDs.
 * Each import owns its own skeleton: two maids must not share animated bones. */
export async function replaceCafeCharacters(scene:Scene,spec:CafeSpec,oldMeshes:AbstractMesh[],isDisposed:()=>boolean){
 const response=await fetch('/city/bamboo-cafe/characters/manifest.json');
 if(!response.ok)throw Error('Cafe character manifest is unavailable');
 const manifest=await response.json() as CharacterManifest;
 if(CHARACTERS_ENABLED){
  characterProgress('cafe','loading',0,'夜兰 · 正在准备两位咖啡馆角色');
  const local=(await localCharacterManifest()).models.find(m=>m.id==='yelan')!;
  manifest.models.push({id:'yelan',file:local.file,triangles:local.triangles,bytes:local.bytes,height:local.displayHeight,rigged:true,gait:{authoredSpeed:local.gait.walk.authoredSpeed},local});
  manifest.staffAssignments={...manifest.staffAssignments,zhixia:'yelan',wangshu:'yelan'};
 }
 const owners=spec.staff.map(staff=>({staff,root:scene.getTransformNodeByName('staff_'+staff.id),kind:manifest.staffAssignments[staff.id]}));
 if(manifest.schemaVersion!==1||owners.some(o=>!o.root||!manifest.models.some(m=>m.id===o.kind)))throw Error('Cafe character assignment does not match the existing staff');
 const imported:AbstractMesh[]=[];
 const newRoots:TransformNode[]=[];
 const newMeshes:AbstractMesh[]=[];
 const allGroups:AnimationGroup[]=[],skeletons:Skeleton[]=[],staffAnimations:AnimatedStaff[]=[];
 const proportions:Record<string,CharacterFit>={};
 try{
  for(const target of owners){
   const kind=target.kind;
   const model=manifest.models.find(m=>m.id===kind)!;
   if(!/^[a-z-]+\.glb$/.test(model.file))throw Error('Invalid cafe character asset path');
   const result=model.local?await loadLocalCharacter(scene,model.local,n=>characterProgress('cafe','loading',(owners.indexOf(target)+n)/owners.length,'夜兰 · '+target.staff.name+' '+Math.round(n*100)+'%')):await ImportMeshAsync('/city/bamboo-cafe/characters/'+model.file,scene);
   imported.push(...result.meshes);
   allGroups.push(...result.animationGroups);skeletons.push(...result.skeletons);
   for(const group of result.animationGroups)group.stop();
   if(isDisposed())throw Error('Cafe disposed while loading staff');
   const source=result.meshes[0];source.setEnabled(false);
   // The existing interior root already owns glTF -> Babylon handedness.
   // Keeping another loader mirror here would reverse the character twice.
   source.rotationQuaternion=Quaternion.Identity();source.scaling.setAll(1);source.position.setAll(0);
   {
    const root=source;
    root.name='staff_user_'+target.staff.id;root.parent=target.root!;root.setEnabled(false);newRoots.push(root);
    const meshes=root.getChildMeshes(false).filter(m=>m.getTotalVertices()>0);
    if(!meshes.length)throw Error('Empty cafe character mesh');
    proportions[target.staff.id]=fitCharacter(root,meshes,model.local?.displayHeight??CAFE_DISPLAY_HEIGHT[target.staff.id]??1.94);
    for(const mesh of meshes){
     mesh.name='staff_user_'+target.staff.id+'_'+kind;mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;
     const material=mesh.material;
     if(material instanceof PBRMaterial&&!model.local){
      material.maxSimultaneousLights=6;material.environmentIntensity=.72;
      material.forceIrradianceInFragment=true;material.enableSpecularAntiAliasing=true;
      for(const texture of material.getActiveTextures())texture.anisotropicFilteringLevel=8;
     }
     newMeshes.push(mesh);
    }
    const groups=Object.fromEntries((['idle','walk','wave'] as const).map(name=>{
     const group=result.animationGroups.find(a=>a.name.toLowerCase().includes('cafe'+name));
     if(!group)throw Error('Cafe character animation missing: '+kind+'/'+name);
     return [name,group];
    })) as AnimatedStaff['groups'];
    if(!result.skeletons.length)throw Error('Cafe character skeleton missing: '+kind);
    staffAnimations.push({id:target.staff.id,anchor:target.root!,groups,started:false,playing:false,authoredSpeed:model.gait.authoredSpeed*proportions[target.staff.id].horizontalScale});
   }
  }
  // Commit only after BOTH outfits loaded, retaining original characters as a
  // visible fallback if either import fails. Do not dispose their idle roots.
  for(const mesh of oldMeshes.filter(m=>m.name.startsWith('staff_')))mesh.dispose(false,false);
  for(const root of newRoots)root.setEnabled(true);
  const update=(poses:readonly CafeStaffPose[],active:boolean)=>{
   for(const staff of staffAnimations){
    const pose=poses.find(p=>p.id===staff.id);if(!pose)continue;
    // Existing interior glTF root owns the Z mirror. The local staff anchor is
    // Blender X / height / -north, while navigation uses X / north.
    staff.anchor.position.x=pose.x;staff.anchor.position.z=-pose.z;
    staff.anchor.rotationQuaternion??=Quaternion.Identity();
    Quaternion.RotationYawPitchRollToRef(pose.heading,0,0,staff.anchor.rotationQuaternion);
    if(active&&!staff.started){
     for(const [name,group]of Object.entries(staff.groups)){group.start(true,1);group.setWeightForAllAnimatables(name==='idle'?1:0);}
     staff.started=true;staff.playing=true;
    }else if(staff.started&&staff.playing!==active){for(const group of Object.values(staff.groups)){if(active)group.play(true);else group.pause();}staff.playing=active;}
    if(!active)continue;
    const wave=pose.wave,walk=Math.min(1-wave,pose.walk);
    staff.groups.idle.setWeightForAllAnimatables(Math.max(0,1-walk-wave));
    staff.groups.walk.setWeightForAllAnimatables(walk);staff.groups.walk.speedRatio=Math.max(0,pose.speed/staff.authoredSpeed);
    staff.groups.wave.setWeightForAllAnimatables(wave);
   }
  };
  if(CHARACTERS_ENABLED)characterProgress('cafe','ready',1,'咖啡馆夜兰角色已就绪');
  return {meshes:newMeshes,update,dispose:()=>{for(const a of allGroups)a.dispose();for(const s of skeletons)s.dispose();},status:{loaded:true,error:null,assignments:manifest.staffAssignments,
   triangles:owners.reduce((sum,o)=>sum+manifest.models.find(m=>m.id===o.kind)!.triangles,0),source:CHARACTERS_ENABLED?'MMD / miHoYo / 观海':'user-provided Tripo GLBs',proportions,
   animation:{rigged:true,bones:skeletons.reduce((n,s)=>n+s.bones.length,0),clips:['idle','walk','wave'],independentSkeletons:skeletons.length}} satisfies CafeCharacterStatus};
 }catch(error){
  for(const a of allGroups)a.dispose();for(const s of skeletons)s.dispose();
  for(const root of newRoots)if(!root.isDisposed())root.dispose(false,true);
  for(const mesh of imported)if(!mesh.isDisposed())mesh.dispose(false,false);
  if(CHARACTERS_ENABLED)characterProgress('cafe','error',0,'咖啡馆角色加载失败，可重试');
  throw error;
 }
}
