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

/** A faint texture-coloured skyglow floor keeps slopes readable at night;
 * moonlight, the HDR environment and street lamps supply everything else.
 * The floor is deliberately low: a night city reads as dark ground with
 * pools of lamp light, not as an evenly lit green carpet.
 * Runs after the public-ground irradiance plugin; adds no light or render pass.
 */
export const NIGHT_GROUND_FLOOR={terrain:.07,grass:.05,diffuseGain:1.12,roughnessDrop:.12,environment:.70,specular:.55,lights:6} as const;
class LandscapeNightLight extends MaterialPluginBase{
 constructor(material:PBRMaterial,private state:State,private kind:Surface){super(material,'CityLandscapeNightLight',230,{},true,true,true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override getUniforms(){return {ubo:[{name:'cityLandscapeNight',size:4,type:'vec4'}],fragment:'uniform vec4 cityLandscapeNight;'};}
 override bindForSubMesh(buffer:UniformBuffer){const night=this.state.mode==='night';buffer.updateFloat4('cityLandscapeNight',night?1:0,this.kind==='terrain'?NIGHT_GROUND_FLOOR.terrain:NIGHT_GROUND_FLOOR.grass,NIGHT_GROUND_FLOOR.diffuseGain,NIGHT_GROUND_FLOOR.roughnessDrop);}
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
 material.environmentIntensity=night?Math.max(entry.environment,NIGHT_GROUND_FLOOR.environment):entry.environment;
 material.specularIntensity=night?Math.max(entry.specular,NIGHT_GROUND_FLOOR.specular):entry.specular;
 // Hemisphere + moon + two headlamps + the two nearest street-lamp pools, in
 // scene order. Babylon fills the slots front to back, so a smaller cap would
 // silently drop the lamp pools from every verge and hill tile, not the headlamps.
 material.maxSimultaneousLights=night?Math.max(entry.lights,NIGHT_GROUND_FLOOR.lights):entry.lights;
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
 return {mode:state?.mode??'sunset',materials:state?.materials.size??0,night,terrainEmission:night?NIGHT_GROUND_FLOOR.terrain:0,grassEmission:night?NIGHT_GROUND_FLOOR.grass:0,diffuseGain:night?NIGHT_GROUND_FLOOR.diffuseGain:1,environmentIntensity:night?NIGHT_GROUND_FLOOR.environment:null,localLightCapacity:night?NIGHT_GROUND_FLOOR.lights:null,newLights:0,newPasses:0};
}
