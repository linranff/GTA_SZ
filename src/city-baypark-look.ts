import {
 MaterialPluginBase,PBRMaterial,ShaderLanguage,
 type AbstractEngine,type AbstractMesh,type MaterialDefines,type Scene,type SubMesh,type UniformBuffer,
} from '@babylonjs/core';

type Mode='day'|'sunset'|'night';
type SurfaceKind=1|2|3|4;
type State={enabled:boolean;disposed:boolean;mode:Mode;meshes:Map<AbstractMesh,SurfaceKind>};

/** The named sample is an existing coast strip by 中湾阅海广场. Coordinates
 * follow city.json's east/up/north frame (real metres * .60), not GCJ-02.
 * Paver sizes, joints and weathering are authored look development estimates;
 * they are not measurements or a reconstruction of a verified paving pattern. */
export const BAYPARK_LOOK={
 center:[-2283.27,-794.82],fullRadius:420,outerRadius:600,
 detailNear:22,detailFar:115,paverSize:[.72,.36],jointWidth:.006,
 additionalMeshes:0,additionalTriangles:0,additionalTextures:0,
 additionalLights:0,additionalRenderTargets:0,
} as const;

/** Arithmetic mean after sRGB -> linear conversion of the current 512 px
 * paving.jpg; the same JPEG is embedded in terrain.glb. It replaces the old
 * baked grid only within the sample, retaining its measured reflectance.
 * Keeping the old image's pixel colour here would superimpose its thick grid
 * over the authored joints. This calibration adds no runtime image/sample. */
export const BAYPARK_PAVING={
 source:'public/city/textures/paving.jpg',
 sha256:'7e1694da8ea09973f9306adebe088ee29abc218078b8a707442c2348f81738d1',
 meanLinear:[.166116,.195645,.185488],
} as const;

const NAME='CityBayparkSurface';
const DEFINES={CITY_BAYPARK_SURFACE:false};
const controllers=new WeakMap<Scene,ReturnType<typeof buildBayparkLook>>();

/** Only the shipped coastal ribbon/coping/wall/rock meshes. In particular,
 * neither shared concrete building materials, roads, grass nor water qualify.
 * The terrain ribbon is the existing ~4-unit strip from build_city_ground.py;
 * this module does not infer missing footways from city.json. */
function surfaceKind(name:string):SurfaceKind|undefined {
 if(name==='terrain_pavement')return 1;
 if(name==='terrain_concrete'||name==='coastal_shore_concrete')return 2;
 if(name==='coastal_shore_seawall')return 3;
 if(name==='coastal_shore_coastal-rock')return 4;
 return undefined;
}
function intersectsSample(mesh:AbstractMesh){
 mesh.computeWorldMatrix(true);
 const {minimumWorld:lo,maximumWorld:hi}=mesh.getBoundingInfo().boundingBox;
 const [x,z]=BAYPARK_LOOK.center;
 return Math.hypot(Math.max(lo.x-x,0,x-hi.x),Math.max(lo.z-z,0,z-hi.z))<BAYPARK_LOOK.outerRadius;
}

class BayparkSurface extends MaterialPluginBase {
 constructor(material:PBRMaterial,private state:State){
  super(material,NAME,215,DEFINES,true,false,true);
  // A shared concrete/pavement material can draw unrelated meshes back to
  // back. HardBind runs on EVERY submesh; the normal material bind is cached.
  // That distinction prevents the previous receiver's kind leaking to a road
  // or building, while preserving the already attached public-light plugin.
  this.registerForExtraEvents=true;this.doNotSerialize=true;this._enable(true);
 }
 setState(state:State){this.state=state;this.markAllDefinesAsDirty();}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override prepareDefines(defines:MaterialDefines){
  (defines as MaterialDefines&{CITY_BAYPARK_SURFACE:boolean}).CITY_BAYPARK_SURFACE=!this.state.disposed;
 }
 override getUniforms(){return {
  ubo:[{name:'cityBayparkControl',size:4,type:'vec4'}],
  fragment:'uniform vec4 cityBayparkControl;',
 };}
 override hardBindForSubMesh(buffer:UniformBuffer,_scene:Scene,_engine:AbstractEngine,subMesh:SubMesh){
  const kind=this.state.enabled&&!this.state.disposed?this.state.meshes.get(subMesh.getMesh())??0:0;
  buffer.updateFloat4('cityBayparkControl',BAYPARK_LOOK.center[0],BAYPARK_LOOK.center[1],kind,1);
 }
 override getCustomCode(type:string):Record<string,string>|null {
  if(type!=='fragment')return null;
  return {
   CUSTOM_FRAGMENT_DEFINITIONS:`
    #ifdef CITY_BAYPARK_SURFACE
    float cityBayparkMask=0.;
    float cityBayparkRoughness=.86;
    float cityBayparkOcclusion=1.;
    float cityBayparkHash(vec2 p){
     vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);
     return fract((q.x+q.y)*q.z);
    }
    float cityBayparkNoise(vec2 p){
     vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
     return mix(mix(cityBayparkHash(i),cityBayparkHash(i+vec2(1.,0.)),f.x),
                mix(cityBayparkHash(i+vec2(0.,1.)),cityBayparkHash(i+vec2(1.)),f.x),f.y);
    }
    // Box-filtered millimetre seams keep their energy as they become smaller
    // than a pixel, instead of widening into black stripes at aerial distance.
    float cityBayparkLine(float signedDistance,float halfWidth,float footprint){
     float w=max(footprint,.0005);
     return clamp((halfWidth-signedDistance)/w+.5,0.,1.)-
            clamp((-halfWidth-signedDistance)/w+.5,0.,1.);
    }
    // Analytic bevel derivative; no extra normal map or dependent sample.
    float cityBayparkBevel(float p){
     float t=clamp((abs(p)-.003)/.022,0.,1.);
     return sign(p)*6.*t*(1.-t);
    }
    #endif`,
   CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
    #ifdef CITY_BAYPARK_SURFACE
    vec2 bayLocal=vPositionW.xz-cityBayparkControl.xy;
    float bayRadius=length(bayLocal);
    cityBayparkMask=(1.-smoothstep(420.,600.,bayRadius))*step(.5,cityBayparkControl.z);
    // Derivatives are evaluated outside the spatial branch, including its
    // edge quads. The fine relief fades before its wavelength is sub-pixel.
    vec2 bayDx=dFdx(vPositionW.xz),bayDy=dFdy(vPositionW.xz);
    float bayPixel=max(length(bayDx),length(bayDy));
    if(cityBayparkMask>.0001){
     float bayKind=cityBayparkControl.z;
     float bayPaver=1.-step(1.5,bayKind);
     float bayCap=step(1.5,bayKind)*(1.-step(2.5,bayKind));
     float bayWall=step(2.5,bayKind)*(1.-step(3.5,bayKind));
     float bayRock=step(3.5,bayKind);
     float bayDistance=length(vEyePosition.xyz-vPositionW);
     float bayDetail=1.-smoothstep(22.,115.,bayDistance);
     float bayRelief=bayDetail*(1.-smoothstep(.012,.075,bayPixel));
     float bayPatch=cityBayparkNoise(bayLocal*.075+17.);
     float bayGrain=cityBayparkNoise(bayLocal*2.6+vPositionW.y*.7);
     // A broadly east/northeast joint alignment for this sample only. It is
     // an authored stone finish, not evidence of the actual laying pattern.
     vec2 bayAlong=vec2(.9396926,.3420201),bayAcross=vec2(-.3420201,.9396926);
     vec2 bayQ=vec2(dot(bayLocal,bayAlong),dot(bayLocal,bayAcross));
     float bayJoint=0.;vec2 baySlope=vec2(0.);float baySlab=0.;
     if(bayPaver>.5){
      vec2 baySize=vec2(.72,.36);
      float bayRow=floor(bayQ.y/baySize.y);
      vec2 bayCell=vec2(bayQ.x/baySize.x+mod(bayRow,2.)*.5,bayQ.y/baySize.y);
      vec2 baySigned=(fract(bayCell+.5)-.5)*baySize;
      vec2 bayFootprint=abs(vec2(dot(bayDx,bayAlong),dot(bayDx,bayAcross)))+
                        abs(vec2(dot(bayDy,bayAlong),dot(bayDy,bayAcross)));
      bayJoint=max(cityBayparkLine(baySigned.x,.003,bayFootprint.x),
                   cityBayparkLine(baySigned.y,.003,bayFootprint.y));
      baySlope=vec2(cityBayparkBevel(baySigned.x),cityBayparkBevel(baySigned.y))*.07;
      baySlab=(cityBayparkHash(floor(bayCell))-.5)*.10*bayDetail;
     }else if(bayCap+bayWall>.5){
      // Sparse expansion joints in the existing concrete, not added masonry.
      float baySigned=(fract(bayQ.x/2.4+.5)-.5)*2.4;
      bayJoint=cityBayparkLine(baySigned,.004,bayPixel);
      baySlope.x=cityBayparkBevel(baySigned)*.075;
     }
     float bayWet=(1.-smoothstep(-.34,.17,vPositionW.y+(bayPatch-.5)*.16))*(1.-bayPaver);
     // The path stays predominantly dry. Slight patchy dampness changes its
     // roughness, never its emission or transparency, in every lighting mode.
     bayWet+=bayPaver*smoothstep(.66,.91,bayPatch)*.16;
     float bayDryRoughness=mix(.83,.92,bayRock);
     bayDryRoughness+=mix(-.045,.04,bayPatch);
     cityBayparkRoughness=clamp(bayDryRoughness-bayWet*mix(.21,.34,bayWall+bayRock)+bayJoint*.06,.56,.98);
     vec3 bayTint=mix(vec3(1.025,1.015,.98),vec3(.98,1.005,1.015),bayPatch);
     float bayAggregate=(bayGrain-.5)*mix(.085,.04,bayPaver)*bayDetail;
     float bayFineFade=1.-smoothstep(.006,.020,bayPixel);
     if(bayPaver>.5&&bayFineFade>.001){
      // Fine stone granules fade as a pixel covers their wavelength; the
      // broader slab colour remains stable after these samples disappear.
      bayAggregate+=(cityBayparkNoise(bayLocal*72.)-.5)*.04*bayFineFade;
     }
     float bayTone=(1.+baySlab+bayAggregate)*(1.-bayJoint*mix(.30,.20,bayPaver)*bayDetail)*(1.-bayWet*.23);
     vec3 bayBase=surfaceAlbedo;
     if(bayPaver>.5){
      bayBase=vec3(${BAYPARK_PAVING.meanLinear.join(',')})*vAlbedoColor.rgb;
     }
     surfaceAlbedo=mix(surfaceAlbedo,bayBase*bayTint*bayTone,cityBayparkMask);
     // Darken only reflected sky in the recesses. Direct light and the
     // public-light irradiance remain computed from the actual receiver.
     cityBayparkOcclusion=1.-cityBayparkMask*(bayJoint*mix(.18,.12,bayPaver)*bayDetail+bayWet*.055);
     if(bayRelief>.0001){
      vec3 bayGradient=vec3(bayAlong.x*baySlope.x+bayAcross.x*baySlope.y,0.,
                            bayAlong.y*baySlope.x+bayAcross.y*baySlope.y);
      // A very small aggregate slope also breaks the rock/coping highlights.
      bayGradient+=vec3(bayGrain-.5,0.,bayPatch-.5)*mix(.035,.09,bayRock);
      bayGradient-=normalW*dot(normalW,bayGradient);
      normalW=normalize(normalW-bayGradient*bayRelief*cityBayparkMask);
     }
    }
    #endif`,
   CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:`
    #ifdef CITY_BAYPARK_SURFACE
    metallicRoughness.g=mix(metallicRoughness.g,cityBayparkRoughness,cityBayparkMask);
    #endif`,
   CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
    #ifdef CITY_BAYPARK_SURFACE
    finalIrradiance*=cityBayparkOcclusion;
    finalRadianceScaled*=cityBayparkOcclusion;
    #endif`,
  };
 }
}

function buildBayparkLook(scene:Scene){
 const state:State={enabled:true,disposed:false,mode:'sunset',meshes:new Map()};
 const plugins=new Set<BayparkSurface>();
 for(const mesh of scene.meshes){
  const kind=surfaceKind(mesh.name);
  if(!kind||!mesh.getTotalVertices()||!(mesh.material instanceof PBRMaterial)||!intersectsSample(mesh))continue;
  state.meshes.set(mesh,kind);
  const existing=mesh.material.pluginManager?.getPlugin(NAME);
  const plugin=existing instanceof BayparkSurface?existing:new BayparkSurface(mesh.material,state);
  plugin.setState(state);plugins.add(plugin);
 }
 function setMode(mode:Mode){if(!state.disposed)state.mode=mode;}
 function setEnabled(enabled:boolean){if(!state.disposed)state.enabled=enabled;}
 function stats(){return {
  enabled:state.enabled&&!state.disposed,mode:state.mode,disposed:state.disposed,
  center:[...BAYPARK_LOOK.center],fullRadius:BAYPARK_LOOK.fullRadius,outerRadius:BAYPARK_LOOK.outerRadius,
  meshes:[...state.meshes.keys()].map(mesh=>mesh.name),materials:plugins.size,
  additionalMeshes:0,additionalTriangles:0,additionalTextures:0,additionalLights:0,additionalRenderTargets:0,
  receiverMask:'named existing coast meshes + per-submesh gate + smooth world radius',
  pavingBaseColorLinear:[...BAYPARK_PAVING.meanLinear],
  materialEstimate:'authored 1.2 m × 0.6 m stone slabs, 10 mm joints and concrete weathering; not surveyed',
 };}
 const observer=scene.onDisposeObservable.addOnce(dispose);
 function dispose(){
  if(state.disposed)return;
  state.enabled=false;state.disposed=true;state.meshes.clear();
  for(const plugin of plugins)plugin.markAllDefinesAsDirty();
  plugins.clear();scene.onDisposeObservable.remove(observer);controllers.delete(scene);
  // No originals were replaced or edited. Disposed plugins compile away and
  // can be reused by a later controller; shared public lighting stays intact.
 }
 return {setMode,setEnabled,stats,dispose};
}

/** Call after the models, landscape and cinematic materials are initialized.
 * A/B changes only one uniform: original PBR values, textures, mesh assignment,
 * existing lighting plugins and all global scene settings stay intact. */
export function createBayparkLook(scene:Scene){
 const existing=controllers.get(scene);if(existing)return existing;
 const look=buildBayparkLook(scene);controllers.set(scene,look);return look;
}
