import {Color3,PBRMaterial,Texture,VertexBuffer,Mesh,type AbstractMesh,type BaseTexture,type Scene} from '@babylonjs/core';
import {TencentWindowLighting,attachTencentWindowData} from './city-landmark-lighting.ts';

type RGB=readonly [number,number,number];
type TextureKind='curtain-glass'|'warm-residential'|'light-stone';
type Profile={color:RGB;roughness:number;metallic:number;texture?:TextureKind;environment?:number;lineEmission?:RGB};
type AssetKind='ordinary'|'landmark'|'detail';
type TextureSlot={url:string;state:'loading'|'ready'|'failed';texture:Texture|null;fallback:BaseTexture|null;users:Set<PBRMaterial>;failure?:string;
 maskUrl:string;maskState:'loading'|'ready'|'failed';mask:Texture|null;maskFailure?:string};

/** Colors below are already linear RGB artistic parameters: do not apply sRGB
 * decoding again. Material/color roles follow data/materials/shenzhen-palette.json
 * and docs/materials/shenzhen-palette-references.md; these values are authoring
 * approximations for this scene, not measured reflectance. Ordinary-building vertex
 * colors remain multiplicative, including palettes repaired in the offline GLB.
 * The 28 finite profiles plus three possible no-UV variants cap this cache at 31.
 */
const PROFILES={
 'city-office':{color:[.80,.88,.94],roughness:.33,metallic:.035,texture:'curtain-glass',environment:1.05},
 'city-residential':{color:[.97,.94,.88],roughness:.72,metallic:0,texture:'warm-residential'},
 'city-stone':{color:[.93,.92,.89],roughness:.79,metallic:0,texture:'light-stone'},
 'city-concrete':{color:[.72,.69,.63],roughness:.84,metallic:0},
 'city-roof':{color:[.25,.28,.29],roughness:.88,metallic:0},
 'city-shopfront':{color:[.28,.36,.39],roughness:.34,metallic:.025},
 'city-steel':{color:[.43,.49,.53],roughness:.46,metallic:.66},
 'city-silver':{color:[.67,.70,.70],roughness:.43,metallic:.64},
 'tencent-glass':{color:[.20,.31,.36],roughness:.38,metallic:.035,environment:.85},
 'tencent-window':{color:[.13,.21,.25],roughness:.36,metallic:.025,environment:.85},
 'tencent-champagne':{color:[.55,.51,.43],roughness:.44,metallic:.56},
 'kk100-glass':{color:[.55,.67,.75],roughness:.29,metallic:.04,environment:1.05},
 'pingan-glass':{color:[.61,.66,.69],roughness:.31,metallic:.055,environment:1.08},
 'diwang-glass':{color:[.38,.61,.57],roughness:.31,metallic:.03,environment:1.04},
 'mixc-glass':{color:[.60,.67,.70],roughness:.37,metallic:.025},
 'qijie-glass':{color:[.39,.48,.54],roughness:.35,metallic:.025},
 'fortune-glass':{color:[.38,.55,.66],roughness:.34,metallic:.03},
 'fortune-window':{color:[.26,.38,.46],roughness:.32,metallic:.02},
 'bamboo-glass':{color:[.44,.62,.66],roughness:.30,metallic:.04},
 'bamboo-ribs':{color:[.72,.76,.77],roughness:.40,metallic:.67,lineEmission:[.78,.9,1]},
 'recess-glass':{color:[.28,.35,.40],roughness:.34,metallic:.02},
 'qijie-render':{color:[.66,.68,.67],roughness:.78,metallic:0},
 'neutral-concrete':{color:[.73,.74,.72],roughness:.81,metallic:0},
 'fortune-band':{color:[.83,.85,.84],roughness:.42,metallic:.46},
 'brushed-aluminum':{color:[.72,.76,.77],roughness:.40,metallic:.67},
 'landmark-steel':{color:[.47,.53,.56],roughness:.43,metallic:.69},
 'landmark-stone':{color:[.79,.77,.71],roughness:.77,metallic:0},
 'civic-gold':{color:[.68,.50,.30],roughness:.47,metallic:.53},
} as const satisfies Record<string,Profile>;
type ProfileId=keyof typeof PROFILES;
const TEXTURE_URLS:Record<TextureKind,string>={
 'curtain-glass':'/city/textures/architecture/curtain-glass.png',
 'warm-residential':'/city/textures/architecture/warm-residential.png',
 'light-stone':'/city/textures/architecture/light-stone.png',
};
const ORDINARY:Record<string,ProfileId>={office:'city-office',residential:'city-residential',stone:'city-stone',concrete:'city-concrete',roof:'city-roof',darkglass:'city-shopfront',steel:'city-steel',silver:'city-silver'};
const GLASS:Record<string,ProfileId>={tencent:'tencent-glass',kk100:'kk100-glass',pingan:'pingan-glass',diwang:'diwang-glass','mixc-world':'mixc-glass','qijie-gongguan':'qijie-glass','fortune-plaza':'fortune-glass',bamboo:'bamboo-glass',civic:'recess-glass'};
const TEXTURE_CHANNELS=['albedoTexture','baseWeightTexture','baseDiffuseRoughnessTexture','ambientTexture','opacityTexture','reflectionTexture','emissiveTexture','reflectivityTexture','metallicTexture','metallicReflectanceTexture','reflectanceTexture','microSurfaceTexture','bumpTexture','lightmapTexture','environmentBRDFTexture'] as const;

function assetKind(assetName:string):AssetKind|null{
 const path=assetName.split(/[?#]/,1)[0].replace(/\\/g,'/').replace(/\.glb$/i,'');
 const name=path.slice(path.lastIndexOf('/')+1);
 if(name==='buildings'||name==='facades'||/(?:^|\/)facade-tiles\//.test(path))return 'ordinary';
 if(name==='landmarks')return 'landmark';
 if(name==='landmark-detail')return 'detail';
 return null;
}

function sourceRole(material:PBRMaterial):string{return material.name.toLowerCase().replace(/\.\d+$/,'');}

function profileFor(mesh:AbstractMesh,kind:AssetKind,role:string):ProfileId|null{
 if(kind==='ordinary'){
  if(!/^(?:block|facade)_-?\d+_-?\d+_/.test(mesh.name))return null;
  return ORDINARY[role]??null;
 }
 // Detail files also contain terrain, paths and trees. Require a known building
 // id as well as a whitelisted architectural surface; never retint its plants.
 const prefix=kind==='detail'?'detail_':'landmark_';
 if(!mesh.name.startsWith(prefix))return null;
 const id=Object.keys(GLASS).find(candidate=>mesh.name.startsWith(prefix+candidate+'_'));
 if(!id)return null;
 if(role==='landmarkglass'||role==='office')return GLASS[id];
 if(role==='darkglass')return id==='tencent'?'tencent-window':id==='fortune-plaza'?'fortune-window':id==='qijie-gongguan'?'qijie-glass':'recess-glass';
 if(role==='concrete')return id==='qijie-gongguan'?'qijie-render':'neutral-concrete';
 if(role==='silver')return id==='bamboo'?'bamboo-ribs':id==='fortune-plaza'?'fortune-band':'brushed-aluminum';
 if(role==='steel')return 'landmark-steel';
 if(role==='stone')return 'landmark-stone';
 if(role==='gold')return id==='tencent'?'tencent-champagne':'civic-gold';
 // Authored landmark/detail roof factors are intact (.22,.27,.28), unlike the
 // ordinary-building MixRGB export. Preserve them and all lamps/civic red.
 return null;
}

/** Source-preserving clone without creating copies of embedded/large textures.
 * Texture detachment is synchronous and restored before this function returns;
 * the browser cannot render midway through this operation. The clone keeps its
 * scene-owned BRDF LUT. No source material or source texture is recolored.
 */
function cloneWithoutTextures(source:PBRMaterial,name:string):PBRMaterial{
 const previous=TEXTURE_CHANNELS.map(channel=>[channel,source[channel]] as const);
 try{
  for(const [channel] of previous)source[channel]=null;
  return source.clone(name,true);
 }finally{for(const [channel,texture] of previous)source[channel]=texture;}
}

/** Call after each relevant GLB import, including streamed facade tiles, and
 * after generic loader initialization. Remove the old architecture overrides
 * in setupReflections. Unload meshes with dispose(false,false): these materials
 * and textures belong to this scene-wide cache, not to an individual tile.
 */
export function createArchitectureMaterials(scene:Scene){
 const materials=new Map<string,{material:PBRMaterial;profile:Profile;id:ProfileId}>();
 const tencentLights=new Map<PBRMaterial,TencentWindowLighting>();
 const materialProfiles=new WeakMap<PBRMaterial,Profile>();
 const textures=new Map<TextureKind,TextureSlot>();
 const managed=new WeakSet<PBRMaterial>();
 const applied=new WeakSet<AbstractMesh>();
 const released=new WeakSet<BaseTexture>();
 const repairs={roof:0,concrete:0,darkglass:0,steel:0,silver:0};
 let mode:'sunset'|'night'|'day'='sunset',night=false,assignments=0,retiredMaterials=0,releasedTextures=0,withoutUV=0;

 const protectedTextures=()=>{
  const result=new Set<BaseTexture>();
  if(scene.environmentTexture)result.add(scene.environmentTexture);
  if(scene.environmentBRDFTexture)result.add(scene.environmentBRDFTexture);
  for(const slot of textures.values()){
   if(slot.texture)result.add(slot.texture);
   if(slot.mask)result.add(slot.mask);
   if(slot.fallback)result.add(slot.fallback);
  }
  return result;
 };

 function releaseUnused(candidates:Iterable<BaseTexture>){
  const inUse=protectedTextures();
  for(const material of scene.materials)for(const texture of material.getActiveTextures())inUse.add(texture);
  for(const texture of candidates)if(!inUse.has(texture)&&!released.has(texture)){
   released.add(texture);texture.dispose();releasedTextures++;
  }
 }

 function attachAlbedo(kind:TextureKind,material:PBRMaterial,fallback:BaseTexture|null){
  let slot=textures.get(kind);
  if(!slot){
   slot={url:TEXTURE_URLS[kind],state:'loading',texture:null,fallback,users:new Set(),
    maskUrl:'/city/textures/architecture/'+kind+'-windows.png',maskState:'loading',mask:null};
   textures.set(kind,slot);
   const entry=slot;
   entry.texture=new Texture(entry.url,scene,{noMipmap:false,invertY:false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,gammaSpace:true,
    onLoad:()=>queueMicrotask(()=>{
     if(scene.isDisposed||!entry.texture)return;
     const size=entry.texture.getSize();
     if(size.width>1024||size.height>1024){
      entry.state='failed';entry.failure='texture-exceeds-1024';const rejected=entry.texture;entry.texture=null;releaseUnused([rejected]);return;
     }
     entry.state='ready';
     updateTextureUsers(entry);
     const old=entry.fallback;entry.fallback=null;if(old)releaseUnused([old]);
    }),
    onError:()=>queueMicrotask(()=>{
     if(scene.isDisposed)return;
     entry.state='failed';entry.failure='load-failed';
     const rejected=entry.texture;entry.texture=null;if(rejected)releaseUnused([rejected]);
    }),
   });
   entry.texture.name='architecture:'+kind;
   entry.texture.wrapU=Texture.WRAP_ADDRESSMODE;entry.texture.wrapV=Texture.WRAP_ADDRESSMODE;
   entry.texture.anisotropicFilteringLevel=2;
   entry.mask=new Texture(entry.maskUrl,scene,{noMipmap:false,invertY:false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,gammaSpace:true,
    onLoad:()=>queueMicrotask(()=>{
     if(scene.isDisposed||!entry.mask)return;
     const size=entry.mask.getSize();
     if(size.width>256||size.height>256){
      entry.maskState='failed';entry.maskFailure='mask-exceeds-256';const rejected=entry.mask;entry.mask=null;releaseUnused([rejected]);return;
     }
     entry.maskState='ready';updateTextureUsers(entry);
    }),
    onError:()=>queueMicrotask(()=>{
     if(scene.isDisposed)return;
     entry.maskState='failed';entry.maskFailure='load-failed';
     const rejected=entry.mask;entry.mask=null;if(rejected)releaseUnused([rejected]);
    }),
   });
   entry.mask.name='architecture:'+kind+'-windows';
   entry.mask.wrapU=Texture.WRAP_ADDRESSMODE;entry.mask.wrapV=Texture.WRAP_ADDRESSMODE;
   entry.mask.anisotropicFilteringLevel=2;
  }else if(!slot.fallback&&slot.state!=='ready'&&fallback){
   slot.fallback=fallback;
   for(const target of slot.users)target.albedoTexture=fallback;
  }
  slot.users.add(material);
  material.albedoTexture=slot.state==='ready'?slot.texture:slot.fallback;
  material.emissiveTexture=slot.state==='ready'&&slot.maskState==='ready'?slot.mask:null;
 }

 function updateTextureUsers(slot:TextureSlot){
  for(const target of slot.users){
   target.albedoTexture=slot.state==='ready'?slot.texture:slot.fallback;
   // Both new assets must be ready. Never place this grid over a legacy atlas.
   target.emissiveTexture=slot.state==='ready'&&slot.maskState==='ready'?slot.mask:null;
   const profile=materialProfiles.get(target);if(profile)applyNight(target,profile);
  }
 }

 function applyNight(material:PBRMaterial,profile:Profile){
  // Only the new sparse mask aligned to its new albedo can emit. Authored
  // landmark lamp/LED meshes remain outside this controller.
  const slot=profile.texture?textures.get(profile.texture):undefined;
  const aligned=Boolean(slot&&slot.state==='ready'&&slot.maskState==='ready'&&material.albedoTexture===slot.texture&&material.emissiveTexture===slot.mask);
  material.emissiveIntensity=aligned?(night?2.0:mode==='day'?0:1.5):0;
  material.emissiveColor=aligned?new Color3(1,.94,.83):Color3.Black();
  if(profile.lineEmission){
   material.emissiveColor=new Color3(...profile.lineEmission);
   material.emissiveIntensity=mode==='day'?0:night?2.8:1.2;
  }
  const windows=tencentLights.get(material);if(windows)windows.mode=mode;
  material.environmentIntensity=profile.environment??.96;
 }

 function materialFor(source:PBRMaterial,id:ProfileId,hasUV:boolean){
  const profile:Profile=PROFILES[id];
  const textured=Boolean(profile.texture&&hasUV);
  // Profile + bounded source-surface class, never mesh id / tile id / material
  // uniqueId. Two source glass names intentionally share a solid glass profile.
  const key=id+(profile.texture?(textured?':uv':':solid'):'');
  const cached=materials.get(key);
  if(cached){
   if(textured&&profile.texture){
    const slot=textures.get(profile.texture);
    if(slot&&slot.state!=='ready'&&!slot.fallback&&source.albedoTexture)attachAlbedo(profile.texture,cached.material,source.albedoTexture);
   }
   return cached.material;
  }
  const material=cloneWithoutTextures(source,'architecture:'+key);
  material.albedoColor=new Color3(...profile.color);
  material.metallic=profile.metallic;material.roughness=profile.roughness;
  // These profiles are actual solid glazing meshes, not mixed wall atlases.
  // Keep each landmark hue; lower diffuse backing so sky Fresnel is legible.
  const solidGlazing=/(?:glass|window)$/.test(id)||id==='city-shopfront';
  if(solidGlazing){material.albedoColor.scaleInPlace(.42);material.metallic=0;material.roughness=Math.max(.14,Math.min(.23,profile.roughness*.55));}
  material.specularIntensity=1;material.metallicReflectanceColor=Color3.White();
  material.enableSpecularAntiAliasing=true;
  material.indexOfRefraction=1.5;material.metallicF0Factor=1;
  material.alpha=1;material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
  material.useAlphaFromAlbedoTexture=false;material.unlit=false;
  material.clearCoat.isEnabled=false;material.subSurface.isRefractionEnabled=false;
  material.subSurface.isTranslucencyEnabled=false;material.sheen.isEnabled=false;
  material.disableBumpMap=true;
  materialProfiles.set(material,profile);
  if(id==='tencent-glass')tencentLights.set(material,new TencentWindowLighting(material));
  if(textured&&profile.texture){
   attachAlbedo(profile.texture,material,source.albedoTexture);
  }
  applyNight(material,profile);
  managed.add(material);materials.set(key,{material,profile,id});
  return material;
 }

 function applyMeshes(meshes:AbstractMesh[],assetName:string){
  if(scene.isDisposed)return;
  const kind=assetKind(assetName);if(!kind)return;
  const replaced=new Set<PBRMaterial>();
  for(const mesh of meshes){
   if(mesh.isDisposed()||!mesh.getTotalVertices()||!(mesh.material instanceof PBRMaterial))continue;
   if(managed.has(mesh.material))continue;
   const source=mesh.material,role=sourceRole(source),id=profileFor(mesh,kind,role);
   if(!id)continue;
   const hasUV=mesh.isVerticesDataPresent(VertexBuffer.UVKind);
   mesh.material=materialFor(source,id,hasUV);
   if(id==='tencent-glass'&&mesh instanceof Mesh)attachTencentWindowData(mesh);
   // Vertex colors are owned by the mesh. This preserves repaired per-building
   // palette data without a per-vertex scan, recolor, split or extra draw call.
   if(mesh.isVerticesDataPresent(VertexBuffer.ColorKind))mesh.useVertexColors=true;
   if(!applied.has(mesh)){
    applied.add(mesh);assignments++;
    if((PROFILES[id] as Profile).texture&&!hasUV)withoutUV++;
    if(kind==='ordinary'&&role in repairs)repairs[role as keyof typeof repairs]++;
   }
   replaced.add(source);
  }
  // Imported architecture is single-material per mesh, but check any unrelated
  // scene mesh or multi-material before releasing an old imported material.
  const oldTextures=new Set<BaseTexture>();
  for(const source of replaced){
   if(scene.meshes.some(mesh=>mesh.material===source)||scene.multiMaterials.some(m=>m.subMaterials.includes(source)))continue;
   for(const texture of source.getActiveTextures())oldTextures.add(texture);
   source.dispose(false,false);retiredMaterials++;
  }
  releaseUnused(oldTextures);
 }

 function setMode(value:'sunset'|'night'|'day'){
  mode=value;night=value==='night';
  for(const {material,profile} of materials.values())applyNight(material,profile);
 }

 function stats(){
  return {managedMaterials:materials.size,materialBudget:31,assignments,night,withoutUV,
   landmarkLighting:{basis:'user_requested_artistic',dayEmission:0,tencentWindowMaterials:tencentLights.size,tencentWindowHDR:mode==='day'?0:night?1.5:.55,bambooRibHDR:mode==='day'?0:night?2.8:1.2},
   repairedOrdinarySurfaces:{...repairs},retiredMaterials,releasedTextures,
   profiles:[...materials.keys()],
   sharedAlbedoTextures:(Object.keys(TEXTURE_URLS) as TextureKind[]).map(kind=>{const slot=textures.get(kind);return {kind,url:TEXTURE_URLS[kind],state:slot?.state??'not-requested',
    size:slot?.state==='ready'?slot.texture?.getSize():null,fallback:Boolean(slot?.fallback),failure:slot?.failure??null};}),
   sharedWindowMasks:(Object.keys(TEXTURE_URLS) as TextureKind[]).map(kind=>{const slot=textures.get(kind);return {kind,url:'/city/textures/architecture/'+kind+'-windows.png',state:slot?.maskState??'not-requested',
    size:slot?.maskState==='ready'?slot.mask?.getSize():null,failure:slot?.maskFailure??null};}),
   reusedEmissionMasks:0,architectureEmission:'aligned-window-masks',
  };
 }

 scene.onDisposeObservable.addOnce(()=>{materials.clear();textures.clear();tencentLights.clear();});
 return {applyMeshes,setMode,setNight:(night:boolean)=>setMode(night?'night':'sunset'),stats};
}
