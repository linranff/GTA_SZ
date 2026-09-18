import {Constants,MaterialPluginBase,PBRMaterial,RawTexture,ShaderLanguage,Texture,type AbstractMesh,type MaterialDefines,type Scene,type UniformBuffer,type AbstractEngine,type SubMesh,type BaseTexture} from '@babylonjs/core';
import {ROOF_FINISHES,decodeRoofLookup} from './city-rooftop-plan.ts';

/** Ordinary roofs (block_*_roof) were one flat dark material. This plugin gives every building its
 * own roof finish (membrane, concrete, pale cement, gravel, terracotta, green roof, TPO, red tile)
 * from a 4 m/px city-wide lookup written by scripts/prepare_city_rooftops.mjs, tiles an 8 m detail
 * texture in world XZ (seams, grain, stains) on top, and adds a subtle derivative bump. No new
 * geometry, attribute or draw call: one R8 lookup + one 512² detail texture on the existing draw.
 */
type Lookup={file:string;cell:number;minX:number;minZ:number;width:number;height:number};
type Shared={lookup:RawTexture|null;detail:Texture|null;origin:[number,number];size:[number,number];ready:boolean;failures:string[]};
const DETAIL_URL='/city/textures/architecture/roof-detail.png';
const DETAIL_PERIOD=8;

const FINISH_GLSL=`vec3 cityRoofFinish(float f){${ROOF_FINISHES.map((r,i)=>(i<ROOF_FINISHES.length-1?`if(f<${(i+.5).toFixed(1)})`:'')+`return vec3(${r.color.map(v=>v.toFixed(3)).join(',')});`).join('')}}
vec3 cityRoofParams(float f){${ROOF_FINISHES.map((r,i)=>(i<ROOF_FINISHES.length-1?`if(f<${(i+.5).toFixed(1)})`:'')+`return vec3(${r.seams.toFixed(2)},${r.grain.toFixed(2)},${r.stains.toFixed(2)});`).join('')}}`;

const GLSL=String.raw`
#ifdef CITY_ROOF_SURFACE
uniform sampler2D cityRoofLookup;
uniform sampler2D cityRoofDetail;
float cityRoofRoughness=.8;
float cityRoofHeight=0.;
float cityRoofApplied=0.;
${FINISH_GLSL}
#if defined(CITY_ROOF_BUMP) && defined(NORMAL)
vec3 cityRoofBump(vec3 n){
 vec3 dpx=dFdx(vPositionW),dpy=dFdy(vPositionW);float dhx=dFdx(cityRoofHeight),dhy=dFdy(cityRoofHeight);
 vec3 r1=cross(dpy,n),r2=cross(n,dpx);float det=dot(dpx,r1);
 if(abs(det)>1e-14)n=normalize(abs(det)*n-sign(det)*(dhx*r1+dhy*r2));
 return n;
}
#endif
#endif
`;

export class CityRoofSurfacePlugin extends MaterialPluginBase{
 constructor(material:PBRMaterial,private shared:Shared){super(material,'CityRoofSurface',195,{CITY_ROOF_SURFACE:false,CITY_ROOF_BUMP:false},true,true,true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override prepareDefines(defines:MaterialDefines,scene:Scene,mesh:AbstractMesh){
  const d=defines as MaterialDefines&{CITY_ROOF_SURFACE:boolean;CITY_ROOF_BUMP:boolean};
  d.CITY_ROOF_SURFACE=this.shared.ready&&/^block_-?\d+_-?\d+_roof$/.test(mesh.name);
  d.CITY_ROOF_BUMP=d.CITY_ROOF_SURFACE&&((scene.getEngine() as AbstractEngine&{webGLVersion?:number}).webGLVersion??1)>=2;
 }
 override getSamplers(samplers:string[]){samplers.push('cityRoofLookup','cityRoofDetail');}
 override getUniforms(){return {ubo:[{name:'cityRoofOrigin',size:2,type:'vec2'},{name:'cityRoofSize',size:2,type:'vec2'}],fragment:'#ifdef CITY_ROOF_SURFACE\nuniform vec2 cityRoofOrigin;\nuniform vec2 cityRoofSize;\n#endif'};}
 override bindForSubMesh(buffer:UniformBuffer,_scene:Scene,_engine:AbstractEngine,_subMesh:SubMesh){
  buffer.updateFloat2('cityRoofOrigin',this.shared.origin[0],this.shared.origin[1]);buffer.updateFloat2('cityRoofSize',this.shared.size[0],this.shared.size[1]);
  if(this.shared.lookup)buffer.setTexture('cityRoofLookup',this.shared.lookup);if(this.shared.detail)buffer.setTexture('cityRoofDetail',this.shared.detail);
 }
 override getActiveTextures(active:BaseTexture[]){if(this.shared.lookup)active.push(this.shared.lookup);if(this.shared.detail)active.push(this.shared.detail);}
 override hasTexture(texture:BaseTexture){return texture===this.shared.lookup||texture===this.shared.detail;}
 override getCustomCode(type:string):Record<string,string>|null{
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_DEFINITIONS:GLSL,
   CUSTOM_FRAGMENT_UPDATE_ALBEDO:String.raw`#ifdef CITY_ROOF_SURFACE
 vec2 cityRoofUV=(vPositionW.xz-cityRoofOrigin)/cityRoofSize;
 float cityRoofCode=texture2D(cityRoofLookup,cityRoofUV).r*255.;
 if(cityRoofCode>.5&&all(greaterThanEqual(cityRoofUV,vec2(0.)))&&all(lessThanEqual(cityRoofUV,vec2(1.)))){
  float cityRoofFinishId=floor((cityRoofCode-1.)/16.+.001),cityRoofTint=mod(cityRoofCode-1.,16.)/15.;
  vec4 d=texture2D(cityRoofDetail,vPositionW.xz/${DETAIL_PERIOD.toFixed(1)});
  vec3 p=cityRoofParams(cityRoofFinishId);
  // Per-building brightness within a finish, then sheet seams, grain and rain stains from the detail tile.
  vec3 base=cityRoofFinish(cityRoofFinishId)*(.84+cityRoofTint*.30);
  float seams=d.r*p.x,grain=(d.g-.5)*p.y,stains=d.b*p.z;
  surfaceAlbedo=clamp(base*(1.-seams*.35)*(1.+grain*.55)*(1.-stains*.42),vec3(.004),vec3(.9));
  cityRoofRoughness=clamp(.78+grain*.22+stains*.12-seams*.08,.5,1.);
  cityRoofHeight=(d.a-.5)*.04*max(p.x,p.y);
  cityRoofApplied=1.;
 }
#endif`,
   CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:'#ifdef CITY_ROOF_SURFACE\nif(cityRoofApplied>.5){metallicRoughness.r=0.;metallicRoughness.g=cityRoofRoughness;}\n#endif',
   CUSTOM_FRAGMENT_BEFORE_LIGHTS:'#if defined(CITY_ROOF_SURFACE) && defined(CITY_ROOF_BUMP) && defined(NORMAL)\nif(cityRoofApplied>.5)normalW=cityRoofBump(normalW);\n#endif',
  };
 }
}

/** Decode the grey PNG lookup into an R8 nearest texture (row 0 = minZ, no Y flip). */
async function loadLookup(scene:Scene,meta:Lookup,url:string){
 const response=await fetch(url);if(!response.ok)throw Error('Roof lookup unavailable: '+response.status);
 const bitmap=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
 if(bitmap.width!==meta.width||bitmap.height!==meta.height)throw Error(`Roof lookup size ${bitmap.width}×${bitmap.height} ≠ plan ${meta.width}×${meta.height}`);
 const canvas=new OffscreenCanvas(meta.width,meta.height),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('2d context unavailable');
 ctx.drawImage(bitmap,0,0);bitmap.close();
 const rgba=ctx.getImageData(0,0,meta.width,meta.height).data,data=new Uint8Array(meta.width*meta.height);
 let covered=0;for(let i=0;i<data.length;i++){data[i]=rgba[i*4];if(data[i])covered++;}
 const texture=new RawTexture(data,meta.width,meta.height,Constants.TEXTUREFORMAT_R,scene,false,false,Texture.NEAREST_SAMPLINGMODE,Constants.TEXTURETYPE_UNSIGNED_BYTE);
 texture.name='roof-lookup';texture.wrapU=Texture.CLAMP_ADDRESSMODE;texture.wrapV=Texture.CLAMP_ADDRESSMODE;
 return {texture,covered};
}

/** Create before the architecture materials; `attach` is called for the shared city-roof material.
 * `load(lookupMeta)` runs once plan.json is known (the rooftop layer fetches it). */
export function createRoofSurface(scene:Scene){
 const shared:Shared={lookup:null,detail:null,origin:[0,0],size:[1,1],ready:false,failures:[]};
 const plugins=new Map<PBRMaterial,CityRoofSurfacePlugin>();let covered=0,meta:Lookup|null=null;
 const refresh=()=>{shared.ready=Boolean(shared.lookup&&shared.detail?.isReady());for(const p of plugins.values())p.markAllDefinesAsDirty();};
 shared.detail=new Texture(DETAIL_URL,scene,{invertY:false,noMipmap:false,gammaSpace:false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,onLoad:()=>queueMicrotask(()=>{if(!scene.isDisposed)refresh();}),onError:message=>{shared.failures.push('roof-detail.png: '+message);shared.detail=null;refresh();}});
 shared.detail.wrapU=Texture.WRAP_ADDRESSMODE;shared.detail.wrapV=Texture.WRAP_ADDRESSMODE;shared.detail.anisotropicFilteringLevel=4;shared.detail.name='roof-detail';
 function attach(material:PBRMaterial){if(!plugins.has(material))plugins.set(material,new CityRoofSurfacePlugin(material,shared));}
 async function load(lookup:Lookup,base='/city/rooftops/'){
  meta=lookup;
  try{const result=await loadLookup(scene,lookup,base+lookup.file);if(scene.isDisposed){result.texture.dispose();return;}
   shared.lookup=result.texture;covered=result.covered;shared.origin=[lookup.minX,lookup.minZ];shared.size=[lookup.width*lookup.cell,lookup.height*lookup.cell];refresh();}
  catch(error){shared.failures.push(String(error));refresh();}
 }
 scene.onDisposeObservable.addOnce(()=>{shared.lookup?.dispose();shared.detail?.dispose();plugins.clear();});
 return {attach,load,stats:()=>({ready:shared.ready,failures:[...shared.failures],materials:plugins.size,lookup:meta?{...meta,coveredCells:covered,gpuBytes:meta.width*meta.height}:null,detail:{url:DETAIL_URL,period:DETAIL_PERIOD,ready:Boolean(shared.detail?.isReady())},finishes:ROOF_FINISHES.map(f=>f.id),decode:decodeRoofLookup})};
}
