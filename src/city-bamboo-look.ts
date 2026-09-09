import {MaterialPluginBase,PBRMaterial,ShaderLanguage,type AbstractMesh,type Scene,type UniformBuffer} from '@babylonjs/core';

type Mode='day'|'sunset'|'night';
type Role='glass'|'ribs'|'bands'|'stone'|'lamps';

/** Current landmarks.glb, after the existing loader's root-direction fix.
 * These are model bounds, not a new survey of the real building. */
export const BAMBOO_LOOK_TARGET={
 center:[-5146,0,-1216.62],
 towerHeight:235.2,
 podiumBounds:{min:[-5188,0,-1251.62],max:[-5104,9,-1181.62]},
 meshPrefix:'landmark_bamboo_',
} as const;

/** Game art parameters: honed podium, brushed structural metal and restrained
 * variation on the existing 80-sided glazing and 3-unit floor bands. No new
 * surveyed material, cladding joint, entrance, sign or lamp is implied. The
 * estimated stone courses below are an art finish on the existing solid. */
export const BAMBOO_LOOK_DEFAULTS={
 lowerFullHeight:36,
 lowerFadeHeight:78,
 glassRoughness:.205,
 glassPanelVariation:.045,
 glassNormalStrength:.008,
 glassDiffuse:.74,
 stoneRoughness:.74,
 stoneGrain:.065,
 stonePlinthTone:.62,
 stonePanelWidth:1.35,
 stonePanelHeight:.75,
 stoneJointWidth:.012,
 stoneJointNormal:.055,
 metalRoughness:.29,
 metalVariation:.055,
 contactShade:.24,
 lowerRibEmission:.13,
 windowSunsetHDR:.48,
 windowNightHDR:1.3,
 ringSunsetHDR:.14,
 ringNightHDR:.48,
 ringWidth:.10,
};
export type BambooLookParameters=typeof BAMBOO_LOOK_DEFAULTS;
type State={mode:Mode;parameters:BambooLookParameters};
type Surface={material:PBRMaterial;source:PBRMaterial;role:Role};
type Assignment={mesh:AbstractMesh;source:PBRMaterial;surface:Surface};

const ROLES:Record<string,Role>={landmarkglass:'glass',silver:'ribs',steel:'bands',stone:'stone',lampwarm:'lamps'};
const LIMITS:Record<keyof BambooLookParameters,readonly [number,number]>={
 lowerFullHeight:[12,60],lowerFadeHeight:[18,110],glassRoughness:[.13,.4],
 glassPanelVariation:[0,.09],glassNormalStrength:[0,.02],glassDiffuse:[.5,1],
 stoneRoughness:[.5,.95],stoneGrain:[0,.16],stonePlinthTone:[.4,1],
 stonePanelWidth:[.6,2.4],stonePanelHeight:[.35,1.5],stoneJointWidth:[.003,.035],stoneJointNormal:[0,.12],
 metalRoughness:[.2,.55],metalVariation:[0,.12],contactShade:[0,.45],lowerRibEmission:[0,1],
 windowSunsetHDR:[0,1.5],windowNightHDR:[0,3],ringSunsetHDR:[0,.7],ringNightHDR:[0,1.5],ringWidth:[.04,.3],
};
function lightingFor({mode,parameters:p}:State){return {
 windowHDR:mode==='day'?0:mode==='night'?p.windowNightHDR:p.windowSunsetHDR,
 ringHDR:mode==='day'?0:mode==='night'?p.ringNightHDR:p.ringSunsetHDR,
};}

class BambooSurface extends MaterialPluginBase{
 constructor(material:PBRMaterial,private role:Role,private state:State){
  // Babylon caches effects by defines. These five generated shader bodies
  // need separate keys even when their meshes otherwise have equal attributes.
  super(material,'CityBambooSurface',215,{CITY_BAMBOO_SURFACE_ROLE:['glass','ribs','bands','stone','lamps'].indexOf(role)+1},true,true,true);
 }
 override getClassName(){return 'CityBambooSurface';}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override getUniforms(){return {
  ubo:[{name:'bambooLowRange',size:4,type:'vec4'},{name:'bambooGlassFinish',size:4,type:'vec4'},
   {name:'bambooStoneFinish',size:4,type:'vec4'},{name:'bambooMetalFinish',size:4,type:'vec4'},
   {name:'bambooStoneJoints',size:4,type:'vec4'},{name:'bambooLampFinish',size:4,type:'vec4'}],
  fragment:'uniform vec4 bambooLowRange,bambooGlassFinish,bambooStoneFinish,bambooMetalFinish,bambooStoneJoints,bambooLampFinish;',
 };}
 override bindForSubMesh(buffer:UniformBuffer){
  const p=this.state.parameters;
  buffer.updateFloat4('bambooLowRange',p.lowerFullHeight,p.lowerFadeHeight,p.contactShade,p.lowerRibEmission);
  buffer.updateFloat4('bambooGlassFinish',p.glassRoughness,p.glassPanelVariation,p.glassNormalStrength,p.glassDiffuse);
  buffer.updateFloat4('bambooStoneFinish',p.stoneRoughness,p.stoneGrain,p.stonePlinthTone,0);
  buffer.updateFloat4('bambooMetalFinish',p.metalRoughness,p.metalVariation,0,0);
  buffer.updateFloat4('bambooStoneJoints',p.stonePanelWidth,p.stonePanelHeight,p.stoneJointWidth,p.stoneJointNormal);
  const lighting=lightingFor(this.state);
  buffer.updateFloat4('bambooLampFinish',lighting.windowHDR,lighting.ringHDR,p.ringWidth,0);
 }
 override getCustomCode(type:string):Record<string,string>|null{
  if(type!=='fragment')return null;
  if(this.role==='lamps')return {
   CUSTOM_FRAGMENT_DEFINITIONS:'float bambooLampBase=0.;\nfloat bambooRingMask=0.;',
   CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
vec3 bambooLampPosition=vPositionW-vec3(-5146.,0.,-1216.62);
// The combined source mesh has three complete, capped ellipses below 9.2;
// all geometry above 9.2 is an existing warm window, not a new light surface.
bambooLampBase=1.-step(9.2,bambooLampPosition.y);
float bambooRimDistance=abs(1.-length(bambooLampPosition.xz/vec2(36.,30.)))*33.;
float bambooRimAA=max(fwidth(bambooRimDistance),.003);
bambooRingMask=1.-smoothstep(bambooLampFinish.z-bambooRimAA,bambooLampFinish.z+bambooRimAA,bambooRimDistance);
// Filled cap faces remain dark metal. Only the narrow original outside edge
// can emit; the full disc is never converted into a glowing podium.
surfaceAlbedo=mix(vec3(.13,.18,.19),vec3(.16,.18,.19),bambooLampBase);
`,
   CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:'metallicRoughness=mix(vec2(0.,.23),vec2(.52,.43),bambooLampBase);',
   CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
finalEmissive=mix(vec3(1.,.80,.54)*bambooLampFinish.x,
 vec3(1.,.76,.45)*bambooLampFinish.y*bambooRingMask,bambooLampBase);
`,
  };
  const glass=this.role==='glass',stone=this.role==='stone',ribs=this.role==='ribs';
  return {
   CUSTOM_FRAGMENT_DEFINITIONS:`
float bambooLow=0.;
float bambooAO=1.;
float bambooSurfaceRoughness=.3;
float bambooHash(vec2 p){
 vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
 q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);
}
float bambooNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(bambooHash(i),bambooHash(i+vec2(1.,0.)),f.x),
  mix(bambooHash(i+vec2(0.,1.)),bambooHash(i+1.),f.x),f.y);
}
`,
   CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
vec3 bambooPosition=vPositionW-vec3(-5146.,0.,-1216.62);
bambooLow=1.-smoothstep(bambooLowRange.x,bambooLowRange.y,bambooPosition.y);
float bambooAngle=atan(bambooPosition.z,bambooPosition.x);
// Reuse the actual model's 80 radial subdivisions and 3-unit steel rings.
vec2 bambooPanel=vec2((bambooAngle/6.28318530718+.5)*80.,bambooPosition.y/3.);
float bambooPixelSpan=max(fwidth(bambooPanel.x),fwidth(bambooPanel.y));
float bambooDetail=1.-smoothstep(.18,.65,bambooPixelSpan);
float bambooPanelTone=bambooHash(floor(bambooPanel));
${glass?`
vec2 bambooEdge=min(fract(bambooPanel),1.-fract(bambooPanel));
float bambooRibShade=1.-smoothstep(.06,.19,bambooEdge.x);
float bambooBandShade=1.-smoothstep(.025,.13,bambooEdge.y);
float bambooFootShade=1.-smoothstep(8.5,17.,bambooPosition.y);
bambooAO=1.-bambooLow*bambooLowRange.z*(bambooDetail*(.62*bambooRibShade+.36*bambooBandShade)+.44*bambooFootShade);
surfaceAlbedo*=mix(vec3(1.),vec3(.95,1.,1.015)*bambooGlassFinish.w,bambooLow);
surfaceAlbedo*=1.+(bambooPanelTone-.5)*.09*bambooLow*bambooDetail;
bambooSurfaceRoughness=bambooGlassFinish.x+(bambooPanelTone-.5)*bambooGlassFinish.y*bambooDetail+.032*bambooFootShade;
// Gentle fabrication waviness modifies the reflected sky, never paints one.
vec3 bambooTangent=normalize(vec3(-bambooPosition.z,0.,bambooPosition.x));
vec2 bambooWave=sin(fract(bambooPanel)*3.14159265)*vec2(bambooPanelTone-.5,bambooHash(floor(bambooPanel)+17.)-.5);
normalW=normalize(normalW+(bambooTangent*bambooWave.x+vec3(0.,bambooWave.y,0.))*bambooGlassFinish.z*bambooLow*bambooDetail);
`:stone?`
float bambooMacro=bambooNoise(bambooPosition.xz*.23);
float bambooGrain=bambooNoise(vec2(bambooAngle*35.,bambooPosition.y)*3.2);
float bambooGrainFade=1.-smoothstep(.24,1.,length(fwidth(bambooPosition))*3.2);
// Approx. 2.25 x 1.25 real-metre cladding, scaled by .60. It is an artistic
// joint layout, wrapped round the existing ellipse and sloped podium sides.
float bambooStoneAngle=atan(bambooPosition.z/35.,bambooPosition.x/42.)/6.28318530718+.5;
float bambooStoneColumns=floor(241.9/bambooStoneJoints.x+.5);
float bambooStoneRise=bambooPosition.y<2.?bambooPosition.y:(bambooPosition.y-2.)*1.70;
vec2 bambooSlab=vec2(bambooStoneAngle*bambooStoneColumns,bambooStoneRise/bambooStoneJoints.y);
vec2 bambooSlabFraction=fract(bambooSlab);
vec2 bambooJointDistance=min(bambooSlabFraction,1.-bambooSlabFraction)*bambooStoneJoints.xy;
vec2 bambooJointAA=max(fwidth(bambooSlab)*bambooStoneJoints.xy,vec2(.001));
vec2 bambooJoint=1.-smoothstep(vec2(bambooStoneJoints.z)-bambooJointAA,vec2(bambooStoneJoints.z)+bambooJointAA,bambooJointDistance);
float bambooJointFade=1.-smoothstep(.18,.6,max(fwidth(bambooSlab.x),fwidth(bambooSlab.y)));
bambooJoint*=bambooJointFade;
float bambooSeam=max(bambooJoint.x,bambooJoint.y);
float bambooSlabTone=bambooHash(floor(bambooSlab));
// The y=2 break is an existing podium ring, so this plinth follows geometry.
float bambooPlinth=1.-smoothstep(1.86,2.16,bambooPosition.y);
float bambooFoot=1.-smoothstep(.12,1.6,bambooPosition.y);
surfaceAlbedo*=mix(vec3(.97,1.,1.015),vec3(.92,.97,1.)*bambooStoneFinish.z,bambooPlinth);
surfaceAlbedo*=1.+(bambooMacro-.5)*.07+(bambooGrain-.5)*bambooStoneFinish.y*bambooGrainFade;
surfaceAlbedo*=(1.-bambooSeam*.23)*(1.+(bambooSlabTone-.5)*.045*bambooJointFade);
bambooSurfaceRoughness=bambooStoneFinish.x+(bambooGrain-.5)*.08*bambooGrainFade-.07*bambooPlinth;
bambooSurfaceRoughness+=bambooSeam*.09;
bambooAO=1.-bambooLowRange.z*(bambooFoot+.28*(1.-smoothstep(.02,.28,abs(bambooPosition.y-2.))));
bambooAO*=1.-bambooSeam*.10;
vec3 bambooStoneTangent=normalize(cross(vec3(0.,1.,0.),normalW)+vec3(.0001,0.,0.));
vec3 bambooStoneUp=normalize(cross(normalW,bambooStoneTangent));
vec2 bambooJointSlope=bambooJoint*(1.-2.*step(vec2(.5),bambooSlabFraction))*bambooStoneJoints.w;
normalW=normalize(normalW+bambooStoneTangent*((bambooGrain-.5)*.025*bambooGrainFade+bambooJointSlope.x)+bambooStoneUp*bambooJointSlope.y);
`:`
float bambooBrush=bambooNoise(vec2(bambooAngle*47.,bambooPosition.y*.48));
bambooSurfaceRoughness=bambooMetalFinish.x+(bambooBrush-.5)*bambooMetalFinish.y;
surfaceAlbedo*=mix(vec3(1.),vec3(.93,.97,1.),bambooLow);
bambooAO=1.-bambooLow*bambooLowRange.z*.42*(1.-smoothstep(8.,18.,bambooPosition.y));
`}
`,
   CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:`
metallicRoughness.g=mix(metallicRoughness.g,clamp(bambooSurfaceRoughness,.13,.96),bambooLow);
${glass?'metallicRoughness.r=mix(metallicRoughness.r,0.,bambooLow);':stone?'metallicRoughness.r=0.;':'metallicRoughness.r=mix(metallicRoughness.r,.78,bambooLow);'}
`,
   CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
// Analytic contact shading affects ambient/sky energy. Direct sun, headlights
// and existing shadow maps retain their physical directional response.
finalAmbient*=bambooAO;
#if !defined(UNLIT) && defined(REFLECTION)
finalIrradiance*=bambooAO;
finalRadianceScaled*=mix(1.,bambooAO,.35);
#endif
${ribs?'// Keep the already-authored upper rib lighting; reveal metal at street level.\nfinalEmissive*=mix(1.,bambooLowRange.w,bambooLow);':''}
`,
  };
 }
}

/** Make five texture-free materials. Source materials may be shared with other
 * landmarks, so neither cloning textures nor temporarily editing sources is safe.
 * Scene HDR/BRDF remain scene-owned; dispose(false,false) never releases either. */
function createSurface(scene:Scene,source:PBRMaterial,role:Role,state:State):Surface{
 const material=new PBRMaterial('bamboo-look:'+role,scene);
 material.backFaceCulling=source.backFaceCulling;
 material.sideOrientation=source.sideOrientation;
 material.twoSidedLighting=source.twoSidedLighting;
 material.maxSimultaneousLights=source.maxSimultaneousLights;
 material.usePhysicalLightFalloff=source.usePhysicalLightFalloff;
 material.useGLTFLightFalloff=source.useGLTFLightFalloff;
 material.imageProcessingConfiguration=source.imageProcessingConfiguration;
 material.alpha=1;material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
 material.enableSpecularAntiAliasing=true;
 material.indexOfRefraction=source.indexOfRefraction;
 material.metallicF0Factor=source.metallicF0Factor;
 material.metallicReflectanceColor.copyFrom(source.metallicReflectanceColor);
 material.specularIntensity=source.specularIntensity;
 material.directIntensity=source.directIntensity;
 material.environmentBRDFTexture=source.environmentBRDFTexture;
 new BambooSurface(material,role,state);
 return {material,source,role};
}

function syncSurface({material,source,role}:Surface){
 material.albedoColor.copyFrom(source.albedoColor);
 material.roughness=source.roughness;
 material.metallic=source.metallic;
 material.environmentIntensity=source.environmentIntensity;
 // Architecture's mode controller owns existing line emission. Copy its most
 // recent value, then attenuate only lower ribs in the fragment shader.
 material.emissiveColor.copyFrom(source.emissiveColor);
 material.emissiveIntensity=source.emissiveIntensity;
 // The lamp shader owns window/rim radiance in absolute, mode-specific HDR.
 // The source's whole-mesh emissive factor must never leak back through.
 if(role==='lamps'){material.emissiveColor.set(0,0,0);material.emissiveIntensity=0;}
}

export type BambooLook={
 setMode(mode:Mode):void;
 setEnabled(enabled:boolean):void;
 tune(overrides:Partial<BambooLookParameters>):BambooLookParameters;
 stats():{
  enabled:boolean;disposed:boolean;mode:Mode;assignedMeshes:number;activeMeshes:number;
  materials:number;materialBudget:number;roles:Role[];missingRoles:Role[];
  newTextures:number;newTextureBytes:number;newMeshes:number;newDrawCalls:number;newLights:number;newRenderTargets:number;
  target:typeof BAMBOO_LOOK_TARGET;parameters:BambooLookParameters;basis:string;skipped:string[];
  lighting:{windowHDR:number;ringHDR:number;ringMaskWidth:number;heightSplit:number;caps:string};
 };
 dispose():void;
};
const controllers=new WeakMap<Scene,BambooLook>();

/** Initialize after architecture GLBs and cinematic look, then invoke setMode
 * after architecture.setMode. setEnabled(false) restores exact source pointers.
 * There is no per-frame CPU work, mesh data change or ground overlay. */
export function createBambooLook(scene:Scene):BambooLook{
 const existing=controllers.get(scene);if(existing)return existing;
 const state:State={mode:'sunset',parameters:{...BAMBOO_LOOK_DEFAULTS}};
 const surfaces=new Map<Role,Surface>(),assignments:Assignment[]=[],skipped:string[]=[];
 let enabled=true,disposed=scene.isDisposed;
 if(!disposed)for(const mesh of scene.meshes){
  const match=mesh.name.match(/^landmark_bamboo_(landmarkglass|silver|steel|stone|lampwarm)(?:\.\d+)?$/);
  if(!match||mesh.isDisposed()||!mesh.getTotalVertices())continue;
  if(!(mesh.material instanceof PBRMaterial)){skipped.push(mesh.name+':not-pbr');continue;}
  mesh.computeWorldMatrix(true);
  const box=mesh.getBoundingInfo().boundingBox;
  if(Math.abs(box.centerWorld.x-BAMBOO_LOOK_TARGET.center[0])>2||Math.abs(box.centerWorld.z-BAMBOO_LOOK_TARGET.center[2])>2||box.maximumWorld.y>237||box.minimumWorld.y<-.15){
   skipped.push(mesh.name+':outside-model-bounds');continue;
  }
  const role=ROLES[match[1]],source=mesh.material;
  let surface=surfaces.get(role);
  if(!surface){surface=createSurface(scene,source,role,state);surfaces.set(role,surface);syncSurface(surface);}
  assignments.push({mesh,source,surface});mesh.material=surface.material;
 }
 function setMode(mode:Mode){
  if(disposed)return;state.mode=mode;
  for(const surface of surfaces.values())syncSurface(surface);
 }
 function setEnabled(value:boolean){
  if(disposed)return;
  enabled=value;
  if(value)for(const surface of surfaces.values())syncSurface(surface);
  for(const {mesh,source,surface} of assignments){
   if(mesh.isDisposed())continue;
   // Do not overwrite a later, separately owned material replacement.
   if(value&&mesh.material===source)mesh.material=surface.material;
   else if(!value&&mesh.material===surface.material)mesh.material=source;
  }
 }
 function tune(overrides:Partial<BambooLookParameters>){
  if(disposed)return {...state.parameters};
  for(const key of Object.keys(LIMITS) as (keyof BambooLookParameters)[]){
   const value=overrides[key];if(value===undefined||!Number.isFinite(value))continue;
   const [min,max]=LIMITS[key];state.parameters[key]=Math.max(min,Math.min(max,value));
  }
  state.parameters.lowerFadeHeight=Math.max(state.parameters.lowerFullHeight+6,state.parameters.lowerFadeHeight);
  return {...state.parameters};
 }
 function stats(){return {
  enabled:enabled&&!disposed,disposed,mode:state.mode,assignedMeshes:assignments.length,
  activeMeshes:assignments.filter(({mesh,surface})=>!mesh.isDisposed()&&mesh.material===surface.material).length,
  materials:surfaces.size,materialBudget:5,roles:[...surfaces.keys()],missingRoles:(['glass','ribs','bands','stone','lamps'] as Role[]).filter(role=>!surfaces.has(role)),
  newTextures:0,newTextureBytes:0,newMeshes:0,newDrawCalls:0,newLights:0,newRenderTargets:0,
  target:BAMBOO_LOOK_TARGET,parameters:{...state.parameters},basis:'game-art treatment of existing model surfaces; no new surveyed detail',skipped:[...skipped],
  lighting:{...lightingFor(state),ringMaskWidth:state.parameters.ringWidth,heightSplit:9.2,caps:'source filled caps retained as nonemissive metal; edge-only emission'},
 };}
 function dispose(){
  if(disposed)return;
  setEnabled(false);disposed=true;
  scene.onDisposeObservable.remove(observer);
  for(const {material} of surfaces.values())material.dispose(false,false);
  surfaces.clear();assignments.length=0;controllers.delete(scene);
 }
 const observer=disposed?null:scene.onDisposeObservable.addOnce(dispose);
 const controller:BambooLook={setMode,setEnabled,tune,stats,dispose};
 if(!disposed)controllers.set(scene,controller);
 return controller;
}
