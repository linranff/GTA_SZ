import {AssetContainer,Color3,LoadAssetContainerAsync,Mesh,PBRMaterial,PointLight,Quaternion,TransformNode,Vector3,type AbstractMesh,type Scene} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export type CityLifeHubPose={x:number;z:number;heading:number;height:number;id?:string};
export type CityLifeHubMode='day'|'sunset'|'night';
export type CityLifeHubPoint={x:number;z:number;y:number};
export type CityLifeHub={
 root:TransformNode;meshes:AbstractMesh[];
 interactions:{entry:CityLifeHubPoint;delivery:CityLifeHubPoint;rest:CityLifeHubPoint};
 setMode:(mode:CityLifeHubMode)=>void;setNight:(night:boolean)=>void;
 stats:{file:string;meshes:number;triangles:number;originalBlenderAsset:boolean;footprint:[number,number];};
 dispose:()=>void;
};

const containers=new WeakMap<Scene,Promise<AssetContainer>>();
let serial=0;
/** A real shop front and forecourt for the life loop. The caller supplies a
 * validated, road-free site. Heading is Babylon rotation.y; at zero the shop
 * faces negative Z. Footprint 14.1 × 10.2m includes rear scooter parking. */
export async function createCityLifeHub(scene:Scene,pose:CityLifeHubPose):Promise<CityLifeHub>{
 let pending=containers.get(scene);
 if(!pending){
  pending=LoadAssetContainerAsync('/city/life-hub.glb',scene);
  containers.set(scene,pending);
  pending.catch(()=>containers.delete(scene));
 }
 const source=await pending,number=++serial;
 const copies=source.instantiateModelsToScene(name=>`life-hub-${pose.id??number}-${name}`,true,{doNotInstantiate:true});
 const root=new TransformNode(`life-hub-${pose.id??number}`,scene);
 root.position.set(pose.x,pose.height,pose.z);root.rotation.y=pose.heading;
 for(const node of copies.rootNodes){
  // Preserve the established Blender north/east axis convention. glTF's
  // default left-handed root half turn would mirror the mapped site pose.
  if(node instanceof TransformNode)node.rotationQuaternion=Quaternion.Identity();
  node.parent=root;
 }
 root.computeWorldMatrix(true);
 const meshes=root.getChildMeshes(false);
 const materials=new Set<PBRMaterial>();let triangles=0;
 for(const mesh of meshes){
  mesh.isPickable=false;mesh.receiveShadows=true;mesh.computeWorldMatrix(true);
  triangles+=(mesh.getTotalIndices?.()??0)/3;
  if(mesh.material instanceof PBRMaterial)materials.add(mesh.material);
 }
 const luminous:{material:PBRMaterial;base:Color3;kind:'sign'|'fixture'}[]=[];
 for(const material of materials){
  material.maxSimultaneousLights=5;material.enableSpecularAntiAliasing=true;
  material.environmentIntensity=.92;
  for(const texture of material.getActiveTextures())texture.anisotropicFilteringLevel=8;
  if(material.name.includes('hub_glass')){
   material.metallic=.06;material.roughness=.12;material.indexOfRefraction=1.47;
   material.alpha=.29;material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;
   material.needDepthPrePass=true;material.allowShaderHotSwapping=false;
   material.environmentIntensity=.96;material.backFaceCulling=false;
  }
  if(material.name.includes('hub_signs')||material.name.includes('hub_warm_light')||material.name.includes('hub_cool_light')){
   luminous.push({material,base:material.emissiveColor.clone(),kind:material.name.includes('hub_signs')?'sign':'fixture'});
  }
 }
 // A local light reveals the counter, canopy underside and doorstep. Restrict
 // it to this small asset so adding a hub cannot reshuffle city/car light slots.
 const light=new PointLight(`life-hub-counter-light-${number}`,Vector3.Zero(),scene);
 light.parent=root;light.position.set(0,2.5,-2.1);light.diffuse=new Color3(1,.75,.44);
 light.range=13;light.radius=.75;light.includedOnlyMeshes=meshes;
 const point=(x:number,z:number):CityLifeHubPoint=>{
  const p=Vector3.TransformCoordinates(new Vector3(x,.23,z),root.getWorldMatrix());
  return {x:p.x,z:p.z,y:p.y};
 };
 const setMode=(mode:CityLifeHubMode)=>{
  for(const item of luminous){
   const strength=mode==='day'?(item.kind==='sign'?.04:.11):mode==='sunset'?(item.kind==='sign'?.48:.65):1;
   item.material.emissiveColor.copyFrom(item.base).scaleInPlace(strength);
  }
  light.intensity=mode==='day'?.7:mode==='sunset'?8:22;
 };
 setMode('sunset');
 return {
  root,meshes,interactions:{entry:point(0,-4.35),delivery:point(3.95,-4.45),rest:point(-3.65,-3.3)},
  setMode,setNight:night=>setMode(night?'night':'sunset'),
  stats:{file:'life-hub.glb',meshes:meshes.filter(m=>m instanceof Mesh&&m.getTotalVertices()>0).length,triangles,originalBlenderAsset:true,footprint:[14.1,10.2]},
  dispose(){light.dispose();copies.dispose();root.dispose();for(const material of materials)material.dispose(false,false);},
 };
}
