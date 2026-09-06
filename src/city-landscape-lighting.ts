import {MaterialPluginBase,PBRMaterial,ShaderLanguage,type Scene,type UniformBuffer} from '@babylonjs/core';
import type {CinematicLightingMode} from './city-daylight.ts';

type Surface='terrain'|'grass';
type Entry={kind:Surface;environment:number;specular:number;lights:number};
type State={mode:CinematicLightingMode;materials:Map<PBRMaterial,Entry>};
const states=new WeakMap<Scene,State>();
function stateFor(scene:Scene){
 let state=states.get(scene);if(state)return state;
 state={mode:'sunset',materials:new Map()};states.set(scene,state);
 scene.onDisposeObservable.addOnce(()=>{state!.materials.clear();states.delete(scene);});return state;
}

/** A texture-coloured night floor keeps slopes readable while real direct and
 * environment lighting still supplies highlights, shade and broad hill shape.
 * Runs after the public-ground irradiance plugin; adds no light or render pass.
 */
class LandscapeNightLight extends MaterialPluginBase{
 constructor(material:PBRMaterial,private state:State,private kind:Surface){super(material,'CityLandscapeNightLight',230,{},true,true,true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override getUniforms(){return {ubo:[{name:'cityLandscapeNight',size:4,type:'vec4'}],fragment:'uniform vec4 cityLandscapeNight;'};}
 override bindForSubMesh(buffer:UniformBuffer){const night=this.state.mode==='night';buffer.updateFloat4('cityLandscapeNight',night?1:0,this.kind==='terrain'?.42:.32,1.55,.12);}
 override getCustomCode(type:string){if(type!=='fragment')return null;return {
  CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:`
   metallicRoughness.g=mix(metallicRoughness.g,max(.72,metallicRoughness.g-cityLandscapeNight.w),cityLandscapeNight.x);
  `,
  CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
   finalDiffuse*=mix(1.,cityLandscapeNight.z,cityLandscapeNight.x);
   float landscapeSkyFacing=.72+.28*clamp(normalW.y,0.,1.);
   finalEmissive+=surfaceAlbedo*cityLandscapeNight.x*cityLandscapeNight.y*landscapeSkyFacing;
  `,
 };}
}
function applyMode(material:PBRMaterial,entry:Entry,mode:CinematicLightingMode){
 const night=mode==='night';
 material.environmentIntensity=night?Math.max(entry.environment,1.45):entry.environment;
 material.specularIntensity=night?Math.max(entry.specular,.68):entry.specular;
 // Sun + hemisphere + two headlamps + two nearby street lamps. The former
 // three-slot cap discarded most local lighting on grass and the hillside.
 material.maxSimultaneousLights=night?Math.max(entry.lights,6):entry.lights;
}
export function applyLandscapeNightLight(scene:Scene,material:PBRMaterial,kind:Surface){
 const state=stateFor(scene);if(state.materials.has(material))return;
 const entry={kind,environment:material.environmentIntensity,specular:material.specularIntensity,lights:material.maxSimultaneousLights};
 state.materials.set(material,entry);new LandscapeNightLight(material,state,kind);applyMode(material,entry,state.mode);
 material.onDisposeObservable.addOnce(()=>state.materials.delete(material));
}
export function setLandscapeLightingMode(scene:Scene,mode:CinematicLightingMode){
 const state=stateFor(scene);state.mode=mode;for(const [material,entry] of state.materials)applyMode(material,entry,mode);
}
export function landscapeLightingStats(scene:Scene){
 const state=states.get(scene),night=state?.mode==='night';
 return {mode:state?.mode??'sunset',materials:state?.materials.size??0,night,terrainEmission:night?.42:0,grassEmission:night?.32:0,diffuseGain:night?1.55:1,environmentIntensity:night?1.45:null,localLightCapacity:night?6:null,newLights:0,newPasses:0};
}
