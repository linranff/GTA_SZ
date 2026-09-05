import {Color3, MaterialPluginBase, PBRMaterial, ShaderLanguage, Texture, type BaseTexture, type MaterialDefines, type Scene, type UniformBuffer} from '@babylonjs/core';

const BASE='/city/grassland-v2/';
type GrassState={textures:Texture[];ready:boolean;errors:string[];plugins:Set<GrassSurface>;materials:Set<PBRMaterial>};
const states=new WeakMap<Scene,GrassState>();

/** Profiling switch only: permits a same-build A/B without adding gameplay UI. */
export function grassBaseline(){return typeof location!=='undefined'&&new URLSearchParams(location.search).get('grass')==='baseline';}

class GrassSurface extends MaterialPluginBase {
 constructor(material:PBRMaterial,private state:GrassState,private park:boolean){super(material,'CityGrassPBR',205,{CITY_GRASS_PBR:false},true,true,true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override prepareDefines(defines:MaterialDefines){(defines as MaterialDefines&{CITY_GRASS_PBR:boolean}).CITY_GRASS_PBR=this.state.ready;}
 override getSamplers(samplers:string[]){samplers.push('cityLawnColor','cityLawnNormal','citySoilColor','citySoilNormal','cityLitterColor','cityLitterNormal');}
 override getUniforms(){return {ubo:[{name:'cityGrassPark',size:1,type:'float'}],fragment:'uniform float cityGrassPark;'};}
 override bindForSubMesh(buffer:UniformBuffer){buffer.updateFloat('cityGrassPark',this.park?1:0);['cityLawnColor','cityLawnNormal','citySoilColor','citySoilNormal','cityLitterColor','cityLitterNormal'].forEach((name,i)=>buffer.setTexture(name,this.state.textures[i]));}
 override getActiveTextures(active:BaseTexture[]){active.push(...this.state.textures);}
 override hasTexture(texture:BaseTexture){return this.state.textures.includes(texture as Texture);}
 override getCustomCode(type:string):Record<string,string>|null {
  if(type!=='fragment')return null;
  return {
   CUSTOM_FRAGMENT_DEFINITIONS:`
    #ifdef CITY_GRASS_PBR
    uniform sampler2D cityLawnColor,cityLawnNormal,citySoilColor,citySoilNormal,cityLitterColor,cityLitterNormal;
    vec3 cityGrassTint=vec3(1.0);
    float cityGrassSoil=0.0;
    float cityGrassRoughness=0.92;
    float cityGrassNoise(vec2 p){
     vec2 q=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
     vec4 h=fract(sin(vec4(dot(q,vec2(127.1,311.7)),dot(q+vec2(1.,0.),vec2(127.1,311.7)),dot(q+vec2(0.,1.),vec2(127.1,311.7)),dot(q+vec2(1.),vec2(127.1,311.7))))*43758.5453);
     return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
    }
    #endif`,
   CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
    #ifdef CITY_GRASS_PBR
    vec2 gp=vPositionW.xz;
    float grassPatch=cityGrassNoise(gp*.043);
    float grassFine=cityGrassNoise(gp*.22+13.0);
    float grassDistance=length(vEyePosition.xyz-vPositionW);
    float grassDetail=1.0-smoothstep(24.,110.,grassDistance);
    // The same world mapping covers base terrain, relief and protected DSM.
    // Broad irregular blending prevents obvious repeated mowing stripes.
    vec2 lawnUV=gp/.84;
    vec2 lawnUV2=mat2(.8,.6,-.6,.8)*lawnUV*.83+vec2(23.7,5.1);
    vec3 lawnA=toLinearSpace(texture2D(cityLawnColor,lawnUV).rgb);
    vec3 lawnB=toLinearSpace(texture2D(cityLawnColor,lawnUV2).rgb);
    vec3 soil=toLinearSpace(texture2D(citySoilColor,gp/1.2+7.).rgb);
    vec3 litter=toLinearSpace(texture2D(cityLitterColor,mat2(0.,1.,-1.,0.)*gp/1.2).rgb);
    float worn=clamp(cityGrassSoil*.34+(1.-cityGrassPark)*.06+smoothstep(.65,.92,grassPatch)*.06,0.,.40);
    float leafy=smoothstep(.62,.86,grassFine)*(.04+.10*cityGrassSoil);
    vec3 lawn=mix(lawnA,lawnB,.25+.45*grassPatch);
    // Keep the measured texture luminance; subtle warm/dry patches are spatial,
    // not a uniform saturated green overlay.
    surfaceAlbedo=mix(mix(lawn,soil,worn),litter,leafy)*mix(vec3(1.),cityGrassTint,.48);
    surfaceAlbedo*=mix(vec3(.95,.98,.93),vec3(1.02,1.01,.95),grassPatch);
    cityGrassRoughness=.96;
    // At aerial distances keep only broad geometry normals and albedo/macro;
    // do not pay for three invisible fine-normal samples across the city.
    if(grassDetail>.001){
     vec3 gn=texture2D(cityLawnNormal,lawnUV).rgb;
     vec3 sn=texture2D(citySoilNormal,gp/1.2+7.).rgb;
     vec3 ln=texture2D(cityLitterNormal,mat2(0.,1.,-1.,0.)*gp/1.2).rgb;
     vec2 litterSlope=vec2(ln.g*2.-1.,-(ln.r*2.-1.));
     vec2 grassSlope=mix(mix(gn.rg*2.-1.,sn.rg*2.-1.,worn),litterSlope,leafy);
     vec3 grassTangent=normalize(vec3(1.,0.,0.)-normalW*normalW.x);
     vec3 grassBitangent=normalize(cross(grassTangent,normalW));
     normalW=normalize(normalW+(grassTangent*grassSlope.x+grassBitangent*grassSlope.y)*.42*grassDetail);
     cityGrassRoughness=mix(.96,mix(mix(gn.b,sn.b,worn),ln.b,leafy),grassDetail);
    }
    #endif`,
   CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:`
    #ifdef CITY_GRASS_PBR
    metallicRoughness=vec2(0.,cityGrassRoughness);
    #endif`,
  };
 }
}

export function applyGrassMaterial(scene:Scene,material:PBRMaterial,park=true){
 if(grassBaseline())return;
 let state=states.get(scene);
 if(!state){
  state={textures:[],ready:false,errors:[],plugins:new Set(),materials:new Set()};states.set(scene,state);
  const shared=state;let loaded=0;let disposed=false;
  for(const file of ['lawn-color.jpg','lawn-normal-roughness.png','soil-color.jpg','soil-normal-roughness.png','litter-color.jpg','litter-normal-roughness.png']){
   const texture=new Texture(BASE+file,scene,{noMipmap:false,invertY:false,gammaSpace:file.includes('color'),samplingMode:Texture.TRILINEAR_SAMPLINGMODE,
    onLoad:()=>queueMicrotask(()=>{if(disposed)return;if(++loaded!==6)return;shared.ready=true;for(const m of shared.materials)m.albedoTexture=null;for(const plugin of shared.plugins)plugin.markAllDefinesAsDirty();}),
    onError:message=>{if(!disposed)shared.errors.push(file+': '+message);}});
   texture.anisotropicFilteringLevel=4;shared.textures.push(texture);
  }
  scene.onDisposeObservable.addOnce(()=>{disposed=true;for(const t of shared.textures)t.dispose();shared.plugins.clear();shared.materials.clear();states.delete(scene);});
 }
 if(state.materials.has(material))return;
 material.metallic=0;material.roughness=.94;material.albedoColor=Color3.White();material.emissiveColor=Color3.Black();
 material.specularIntensity=.32;material.enableSpecularAntiAliasing=true;material.maxSimultaneousLights=3;
 // Terrain uses the shared sky environment, never a planar road/water mirror.
 material.reflectionTexture=null;material.environmentIntensity=.75;
 if(state.ready)material.albedoTexture=null;
 const shared=state,plugin=new GrassSurface(material,shared,park);
 shared.materials.add(material);shared.plugins.add(plugin);
 material.onDisposeObservable.addOnce(()=>{shared.materials.delete(material);shared.plugins.delete(plugin);});
}

export function grassMaterialStats(scene:Scene){const state=states.get(scene);return {mode:grassBaseline()?'baseline':'layered-pbr',ready:state?.ready??false,materials:state?.materials.size??0,textures:state?.textures.length??0,errors:state?.errors??[],extraPasses:0};}
