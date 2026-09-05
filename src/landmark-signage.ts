import {Color3,Mesh,MeshBuilder,PBRMaterial,Texture,Vector3,type Scene} from '@babylonjs/core';

type LoadState='loading'|'ready'|'error';
type Artwork={id:string;placeId:string;exactText:string;url:string;width:number;height:number;sourceIds:string[]};
type Canopy={position:[number,number,number];size:[number,number,number];rotationY:number;albedoSrgb:string;roughness:number;status:'photo_interpretation_estimated'};
type Placement={id:string;placeId:string;text:string;textureUrl:string;position:[number,number,number];width:number;height:number;rotationY:number;
 surfaceNormal:[number,number,number];sourceIds:string[];illuminationVerified:boolean;emissiveAtDusk:number;emissiveAtNight:number;canopy?:Canopy};
type TextureEntry={texture:Texture;state:LoadState;url:string;width:number;height:number;meshes:Mesh[];error?:string};
type SignEntry={placement:Placement;mesh:Mesh;material:PBRMaterial;texture:TextureEntry};
type CanopyEntry={placementId:string;spec:Canopy;mesh:Mesh;material:PBRMaterial};
type Row=Record<string,unknown>;
const MANIFEST_URL='/city/landmark-signage.json';
// A bounded list of source-matched surfaces, not every known place name. Each
// artwork must still independently pass renderReady and placement validation.
const VERIFIED_SIGNS:Record<string,{placeId:string;text:string}>={
 'tencent-south-roof':{placeId:'tencent',text:'Tencent'},
 'qijie-entry-bilingual':{placeId:'qijie-gongguan',text:'七街公館\nSEVENTH AVENUE RESIDENCE'},
};
const row=(value:unknown):value is Row=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const number=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const strings=(value:unknown):value is string[]=>Array.isArray(value)&&value.length>0&&value.every(v=>typeof v==='string'&&v.length>0&&v.length<160);
const vec3=(value:unknown):value is [number,number,number]=>Array.isArray(value)&&value.length===3&&value.every(v=>number(v,-100000,100000));
const textureUrl=(value:unknown):value is string=>typeof value==='string'&&/^\/city\/textures\/signage\/[a-z0-9-]+\.png$/.test(value);

function artworkFrom(value:unknown):Artwork|null{
 if(!row(value)||typeof value.id!=='string'||value.renderReady!==true||value.placementStatus!=='photo_interpretation_estimated')return null;
 const verified=Object.hasOwn(VERIFIED_SIGNS,value.id)?VERIFIED_SIGNS[value.id]:undefined;
 if(!verified||value.exactText!==verified.text||!textureUrl(value.url)||!strings(value.sourceIds))return null;
 if(!number(value.width,1,512)||!Number.isInteger(value.width)||!number(value.height,1,128)||!Number.isInteger(value.height))return null;
 return {id:value.id,placeId:verified.placeId,exactText:verified.text,url:value.url,width:value.width,height:value.height,sourceIds:value.sourceIds};
}

function canopyFrom(value:unknown,sign:{position:[number,number,number];width:number;height:number;rotationY:number;surfaceNormal:[number,number,number]}):Canopy|null{
 if(!row(value)||value.status!=='photo_interpretation_estimated'||!vec3(value.position)||!vec3(value.size))return null;
 if(!number(value.position[1],0,1500)||!number(value.size[0],.1,100)||!number(value.size[1],.02,1)||!number(value.size[2],.1,12))return null;
 if(value.size[1]>value.size[0]*.15||value.size[0]+.001<sign.width)return null;
 if(!number(value.rotationY,-Math.PI*2,Math.PI*2)||!number(value.roughness,0,1)||typeof value.albedoSrgb!=='string'||!/^#[a-fA-F0-9]{6}$/.test(value.albedoSrgb))return null;
 // Lettering stands above the front upper edge. Reject geometry that would
 // put it on a thin fascia, below the canopy, or unsupported in empty space.
 if(Math.abs(Math.sin(value.rotationY-sign.rotationY))>.001||Math.cos(value.rotationY-sign.rotationY)<.999)return null;
 const bottom=sign.position[1]-sign.height/2,top=value.position[1]+value.size[1]/2;
 if(Math.abs(bottom-top)>.02)return null;
 const dx=sign.position[0]-value.position[0],dz=sign.position[2]-value.position[2];
 const front=dx*sign.surfaceNormal[0]+dz*sign.surfaceNormal[2];
 const along=dx*Math.cos(sign.rotationY)-dz*Math.sin(sign.rotationY);
 if(Math.abs(front-value.size[2]/2)>.02||Math.abs(along)>(value.size[0]-sign.width)/2+.02)return null;
 return {position:value.position,size:value.size,rotationY:value.rotationY,albedoSrgb:value.albedoSrgb,roughness:value.roughness,status:'photo_interpretation_estimated'};
}

function placementFrom(value:unknown,art:Artwork):Placement|null{
 if(!row(value)||value.id!==art.id||value.placeId!==art.placeId||value.text!==art.exactText)return null;
 if(value.renderReady===false||value.placementStatus!=='photo_interpretation_estimated'||value.textureUrl!==art.url)return null;
 if(!vec3(value.position)||!number(value.position[1],0,1500)||!number(value.width,.05,100)||!number(value.height,.05,30))return null;
 if(!number(value.rotationY,-Math.PI*2,Math.PI*2)||!vec3(value.surfaceNormal)||!strings(value.sourceIds))return null;
 if(!value.sourceIds.every(id=>art.sourceIds.includes(id)))return null;
 // Babylon's single-sided native plane faces local -Z. At -12 degrees this
 // points approximately (+.208,0,-.978), matching the prepared facade normal.
 const expected=[-Math.sin(value.rotationY),0,-Math.cos(value.rotationY)];
 if(value.surfaceNormal.some((n,i)=>Math.abs(n-expected[i])>.001))return null;
 const illuminationVerified=value.illuminationVerified===true;
 if(illuminationVerified&&(!number(value.emissiveAtDusk,0,3)||!number(value.emissiveAtNight,0,3)))return null;
 const canopy=value.id==='qijie-entry-bilingual'?canopyFrom(value.canopy,{position:value.position,width:value.width,height:value.height,rotationY:value.rotationY,surfaceNormal:value.surfaceNormal}):null;
 if(value.id==='qijie-entry-bilingual'&&!canopy)return null;
 if(value.id!=='qijie-entry-bilingual'&&value.canopy!==undefined)return null;
 return {id:value.id,placeId:value.placeId,text:value.text,textureUrl:art.url,position:value.position,width:value.width,height:value.height,
  rotationY:value.rotationY,surfaceNormal:value.surfaceNormal,sourceIds:value.sourceIds,illuminationVerified,
  emissiveAtDusk:illuminationVerified?value.emissiveAtDusk as number:0,emissiveAtNight:illuminationVerified?value.emissiveAtNight as number:0,...(canopy?{canopy}:{})};
}

/** Optional evidence-gated signage layer. Await this after loading the building,
 * append returned meshes to the caller's landmark/culling list, and forward
 * night changes. Missing/invalid optional signage is reported through stats().
 * Texture loading continues after the manifest is read; pending planes have
 * visibility=0 so external setEnabled/culling cannot reveal a solid rectangle.
 */
export async function loadLandmarkSignage(scene:Scene){
 const meshes:Mesh[]=[],signs:SignEntry[]=[],textures=new Map<string,TextureEntry>();
 const canopies:CanopyEntry[]=[];
 const errors:string[]=[];
 const request=new AbortController();
 let manifestState:LoadState='loading',disposed=false,night=false,pendingArtworks=0,skippedPlacements=0;

 function updateEmission(sign:SignEntry){
  const verified=sign.placement.illuminationVerified&&sign.texture.state==='ready';
  sign.material.emissiveTexture=verified?sign.texture.texture:null;
  sign.material.emissiveColor=verified?Color3.White():Color3.Black();
  sign.material.emissiveIntensity=verified?(night?sign.placement.emissiveAtNight:sign.placement.emissiveAtDusk):0;
 }

 function setNight(value:boolean){night=value;for(const sign of signs)updateEmission(sign);}

 function dispose(){
  if(disposed)return;
  disposed=true;request.abort();
  for(const sign of signs){sign.mesh.dispose(false,false);sign.material.dispose(false,false);}
  for(const canopy of canopies){canopy.mesh.dispose(false,false);canopy.material.dispose(false,false);}
  for(const entry of textures.values())entry.texture.dispose();
  meshes.length=0;signs.length=0;canopies.length=0;textures.clear();
 }

 function stats(){
  const entries=[...textures.values()];
  const state=disposed?'disposed':manifestState==='error'?'error':manifestState==='loading'||entries.some(t=>t.state==='loading')?'loading':errors.length?'error':'ready';
  return {state,manifestState,night,meshCount:meshes.length,signCount:signs.length,canopyCount:canopies.length,readyMeshCount:signs.filter(s=>s.texture.state==='ready').length+canopies.length,
   additionalTriangles:meshes.reduce((sum,mesh)=>sum+mesh.getTotalIndices()/3,0),textureCount:textures.size,pendingArtworks,skippedPlacements,errors:[...errors],
   textures:entries.map(t=>({url:t.url,state:t.state,width:t.width,height:t.height,error:t.error??null})),
   placements:signs.map(s=>({id:s.placement.id,placeId:s.placement.placeId,sourceIds:[...s.placement.sourceIds],
    position:s.mesh.position.asArray(),width:s.placement.width,height:s.placement.height,rotationY:s.mesh.rotation.y,
    surfaceNormal:[...s.placement.surfaceNormal],illuminationVerified:s.placement.illuminationVerified,emissiveIntensity:s.material.emissiveIntensity})),
   canopies:canopies.map(c=>({placementId:c.placementId,position:c.mesh.position.asArray(),size:[...c.spec.size],rotationY:c.mesh.rotation.y,
    top:c.spec.position[1]+c.spec.size[1]/2,albedoSrgb:c.spec.albedoSrgb,albedoLinear:c.material.albedoColor.asArray(),roughness:c.material.roughness})),
  };
 }

 scene.onDisposeObservable.addOnce(dispose);
 const result={meshes,setNight,stats,dispose};
 if(scene.isDisposed){dispose();return result;}
 try{
  const response=await fetch(MANIFEST_URL,{signal:request.signal});
  if(!response.ok)throw new Error('manifest-http-'+response.status);
  const manifest:unknown=await response.json();
  if(disposed||scene.isDisposed)return result;
  if(!row(manifest)||manifest.schemaVersion!==1||manifest.noNewLights!==true||!Array.isArray(manifest.artwork)||!Array.isArray(manifest.placements)||
   typeof manifest.sourceEvidenceSha256!=='string'||! /^[a-f0-9]{64}$/.test(manifest.sourceEvidenceSha256))throw new Error('invalid-signage-manifest');
  pendingArtworks=manifest.artwork.filter(value=>row(value)&&value.renderReady!==true).length;
  const artworks=new Map(manifest.artwork.map(artworkFrom).filter((value):value is Artwork=>value!==null).map(art=>[art.id,art]));
  const seen=new Set<string>();
  for(const value of manifest.placements){
   const art=row(value)&&typeof value.id==='string'?artworks.get(value.id):undefined;
   const placement=art?placementFrom(value,art):null;
   if(!placement||!art||seen.has(placement.id)){
    skippedPlacements++;
    if(row(value)&&typeof value.id==='string'&&Object.hasOwn(VERIFIED_SIGNS,value.id))errors.push('invalid-or-unready-placement:'+value.id);
    continue;
   }
   seen.add(placement.id);
   let entry=textures.get(art.url);
   if(!entry){
    // Queue the callbacks because some engines can complete a cached texture
    // synchronously, before the constructor's return value has been assigned.
    const texture=new Texture(art.url,scene,{noMipmap:false,invertY:true,gammaSpace:true,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,
     onLoad:()=>queueMicrotask(()=>{
      if(disposed||scene.isDisposed)return;
      const target=textures.get(art.url);if(!target)return;
      const size=target.texture.getSize();
      if(size.width!==art.width||size.height!==art.height||size.width>512||size.height>128){
       target.state='error';target.error='unexpected-texture-dimensions';errors.push(target.error+':'+art.url);
       for(const mesh of target.meshes)mesh.visibility=0;
       for(const sign of signs)if(sign.texture===target)updateEmission(sign);
       return;
      }
      target.state='ready';target.width=size.width;target.height=size.height;
      for(const mesh of target.meshes)mesh.visibility=1;
      for(const sign of signs)if(sign.texture===target)updateEmission(sign);
     }),
     onError:()=>queueMicrotask(()=>{
      if(disposed||scene.isDisposed)return;
      const target=textures.get(art.url);if(!target)return;
      target.state='error';target.error='texture-load-failed';errors.push(target.error+':'+art.url);
      for(const mesh of target.meshes)mesh.visibility=0;
      for(const sign of signs)if(sign.texture===target)updateEmission(sign);
     }),
    });
    texture.name='landmark-signage:'+art.id;texture.hasAlpha=true;
    texture.wrapU=Texture.CLAMP_ADDRESSMODE;texture.wrapV=Texture.CLAMP_ADDRESSMODE;texture.anisotropicFilteringLevel=2;
    entry={texture,url:art.url,state:'loading',width:art.width,height:art.height,meshes:[]};textures.set(art.url,entry);
   }
   const material=new PBRMaterial('landmark-signage:'+placement.id,scene);
   material.albedoTexture=entry.texture;material.albedoColor=Color3.White();
   material.metallic=0;material.roughness=.58;material.environmentIntensity=1;
   material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHATEST;material.alphaCutOff=.40;
   material.useAlphaFromAlbedoTexture=true;material.backFaceCulling=true;
   material.emissiveColor=Color3.Black();material.emissiveIntensity=0;
   const mesh=MeshBuilder.CreatePlane('landmark-signage_'+placement.id,{width:placement.width,height:placement.height,sideOrientation:Mesh.FRONTSIDE},scene);
   mesh.position=Vector3.FromArray(placement.position);mesh.rotation.y=placement.rotationY;mesh.material=material;
   mesh.isPickable=false;mesh.receiveShadows=true;mesh.checkCollisions=false;mesh.visibility=entry.state==='ready'?1:0;
   mesh.metadata={kind:'landmark-signage',placeId:placement.placeId,sourceIds:[...placement.sourceIds],placementStatus:'photo_interpretation_estimated'};
   mesh.freezeWorldMatrix();
   const sign={placement,mesh,material,texture:entry};signs.push(sign);meshes.push(mesh);entry.meshes.push(mesh);updateEmission(sign);
   if(placement.canopy){
    const spec=placement.canopy;
    const canopyMaterial=new PBRMaterial('landmark-signage-canopy:'+placement.id,scene);
    canopyMaterial.albedoColor=Color3.FromHexString(spec.albedoSrgb).toLinearSpace(true);
    canopyMaterial.metallic=.1;canopyMaterial.roughness=spec.roughness;canopyMaterial.environmentIntensity=1;
    canopyMaterial.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;canopyMaterial.emissiveColor=Color3.Black();canopyMaterial.emissiveIntensity=0;
    const canopyMesh=MeshBuilder.CreateBox('landmark-signage-canopy_'+placement.id,{width:spec.size[0],height:spec.size[1],depth:spec.size[2]},scene);
    canopyMesh.position=Vector3.FromArray(spec.position);canopyMesh.rotation.y=spec.rotationY;canopyMesh.material=canopyMaterial;
    canopyMesh.isPickable=false;canopyMesh.receiveShadows=true;canopyMesh.checkCollisions=false;
    canopyMesh.metadata={kind:'landmark-signage-canopy',placeId:placement.placeId,sourceIds:[...placement.sourceIds],placementStatus:spec.status};
    canopyMesh.freezeWorldMatrix();
    // It is real geometry with no texture dependency. A failed text download
    // hides only the lettering plane, leaving the supported canopy visible.
    canopies.push({placementId:placement.id,spec,mesh:canopyMesh,material:canopyMaterial});meshes.push(canopyMesh);
   }
  }
  manifestState='ready';
 }catch(error){
  if(!disposed){manifestState='error';errors.push(error instanceof Error?error.message:'signage-manifest-load-failed');}
 }
 return result;
}
