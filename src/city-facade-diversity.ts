import {MaterialPluginBase,PBRMaterial,Texture,VertexBuffer,ShaderLanguage,type AbstractMesh,type MaterialDefines,type Scene,type UniformBuffer,type AbstractEngine,type SubMesh,type BaseTexture} from '@babylonjs/core';

/** Original ordinary-building grammar, independent of named landmark materials.
 * Input TEXCOORD_1: x = family + .25; y = stable building seed (0..65520).
 * Both atlas textures are shared by all managed materials; no per-building
 * material, mesh split, geometry generation, light, or render pass is added.
 */
type RGB=readonly [number,number,number];
/** Authored material sets, linear reflectance. These are plausible Shenzhen
 * typologies, not measurements of the individual OSM buildings. Glass is an
 * independent material choice, not the same fixed multiplier for every tower.
 */
export const FACADE_THEMES=[
 {name:'blue-steel',wall:[.135,.215,.300],glass:[.075,.170,.255],roughness:.30},
 {name:'sage-glass',wall:[.235,.345,.290],glass:[.075,.215,.155],roughness:.35},
 {name:'silver-glass',wall:[.490,.565,.605],glass:[.245,.340,.395],roughness:.32},
 {name:'warm-white',wall:[.710,.665,.555],glass:[.225,.270,.250],roughness:.43},
 {name:'sandstone',wall:[.520,.410,.285],glass:[.180,.220,.205],roughness:.45},
 {name:'graphite',wall:[.100,.125,.140],glass:[.085,.135,.155],roughness:.34},
 {name:'near-black',wall:[.027,.036,.044],glass:[.038,.060,.078],roughness:.28},
 {name:'pale-cool',wall:[.625,.680,.705],glass:[.305,.405,.445],roughness:.38},
 {name:'clay-render',wall:[.405,.240,.165],glass:[.125,.155,.150],roughness:.46},
 {name:'olive-render',wall:[.300,.385,.255],glass:[.130,.235,.160],roughness:.44},
 {name:'champagne-glass',wall:[.330,.290,.225],glass:[.240,.205,.130],roughness:.31},
 {name:'slate-blue',wall:[.064,.115,.190],glass:[.054,.125,.235],roughness:.29},
] as const satisfies ReadonlyArray<{name:string;wall:RGB;glass:RGB;roughness:number}>;
// Weighted use-specific pools, rather than every hue equally assigned everywhere.
const THEME_POOLS=[
 [0,0,0,1,1,2,5,6,6,10,11,11],
 [2,2,7,7,10,10,0,1,3,5,6,11],
 [3,3,3,4,4,7,7,8,8,9,9,5],
 [5,5,7,7,2,2,9,4,4,6,10,3],
] as const;
const OFFICE_LIGHTS=[[1,.68,.40],[1,.77,.57],[1,.86,.74],[.88,.93,1]] as const;
const HOME_LIGHTS=[[1,.57,.26],[1,.65,.35],[1,.72,.46],[1,.78,.58]] as const;
const NIGHT_EMISSION_GAIN=.80;
const NIGHT_LEVELS=[1.10,1.25,1.45,1.65,1.90,2.10] as const;
const mod=(n:number,d:number)=>((n%d)+d)%d;
function rounded(seed:number){return Math.floor((Number.isFinite(seed)?seed:0)+.5);}
function hash(x:number,y:number){const n=Math.sin(x*127.1+y*311.7)*43758.5453123;return n-Math.floor(n);}
export function facadeThemeFor(seed:number,family:number){
 const s=rounded(seed),f=Math.floor(family),office=f<2,industrial=f===6;
 const slot=mod(s*17+f*13,12),pool=THEME_POOLS[f===0?0:f===1?1:industrial?3:2],id=pool[slot],theme=FACADE_THEMES[id];
 const shade=.85+mod(s*5,13)/12*.25,glassShade=.91+mod(Math.floor(s/13)*7+f,11)/10*.16;
 const lightSlot=mod(Math.floor(s/7)+f*3,4),light=(office||industrial?OFFICE_LIGHTS:HOME_LIGHTS)[lightSlot];
 const level=NIGHT_LEVELS[mod(Math.floor(s/11)+f*3,6)],nightRadiance=level*(.93+mod(s*5,7)/6*.12);
 const duskRadiance=nightRadiance*(.26+mod(s*3,5)/4*.10),activity=mod(Math.floor(s/17)+f*7,13)/12;
 const floorProbability=industrial?.23+activity*.25:office?.36+activity*.30:.73+activity*.15;
 const suiteProbability=industrial?.37+activity*.18:office?.35+activity*.20:.13+activity*.24;
 const wholeFloorProbability=office?.025+activity*.035:0;
 return {id,name:theme.name,wall:theme.wall.map(v=>v*shade),glass:theme.glass.map(v=>v*glassShade),glassRoughness:theme.roughness,
  lightColor:[...light],temperatureFamily:office||industrial?'3300–5400 K artistic office set':'2800–3900 K artistic residential set',
  nightRadiance,duskRadiance,floorProbability,suiteProbability,wholeFloorProbability,office,industrial};
}
/** Spatial occupancy contract. Suites share an on/off state; office activity
 * groups two adjacent floors and 3–5 window bays, homes use pairs of windows.
 * The distant value is the exact expectation of the same hierarchical gates.
 */
export function facadeOccupancyFor(seed:number,family:number,cell:readonly [number,number],night=true,unresolved=0){
 const s=mod(rounded(seed),4093),profile=facadeThemeFor(seed,family),f=Math.floor(family),office=profile.office;
 const width=office?3+mod(s,3):profile.industrial?4:2;
 const floorGroup=Math.floor(cell[1]/(office?2:1)),suite=Math.floor((cell[0]+mod(s,3))/width);
 const floorP=profile.floorProbability*(night?1:.34),suiteP=profile.suiteProbability,wholeP=profile.wholeFloorProbability*(night?1:.30);
 const floorLit=hash(floorGroup+71,s+53)<floorP?1:0;
 const suiteLit=hash(suite+floorGroup*23,s+193)<suiteP?1:0;
 const wholeLit=hash(floorGroup+113,s+317)<wholeP?1:0;
 const binary=floorLit*Math.max(suiteLit,wholeLit),expected=floorP*(wholeP+(1-wholeP)*suiteP);
 const fade=Math.max(0,Math.min(1,unresolved)),coverage=binary*(1-fade)+expected*fade;
 // A small suite-wide change, not independent random light colors per window.
 const roomScale=(.975+.05*hash(suite+floorGroup*7,s+419))*(1-fade)+fade;
 return {binary,expected,coverage,floorGroup,suite,roomScale,radiance:(night?profile.nightRadiance*NIGHT_EMISSION_GAIN:profile.duskRadiance)*roomScale,color:profile.lightColor};
}
export function facadeSeedContract(seed:number,family:number,cell:readonly [number,number]=[4,7],normal:readonly [number,number,number]=[.8,0,.6]){
 const canonical=rounded(seed),domain=mod(canonical,4093),length=Math.hypot(...normal)||1,q=normal.map(n=>Math.floor(n/length*32+.5)),face=q[0]*3.7+q[1]*1.1+q[2]*7.3;
 return {canonical,domain,theme:facadeThemeFor(canonical,family),face,phase:[hash(domain,face),hash(domain,17)],occupancy:facadeOccupancyFor(canonical,family,cell)};
}
const THEME_GLSL=String.raw`
float cityFacadeThemeIndex(vec2 info){float f=floor(info.x),slot=mod(floor(info.y+.5)*17.+f*13.,12.);
 ${THEME_POOLS.map((pool,i)=>(i===0?'if(f<.5)':i===1?'else if(f<1.5)':i===2?'else if(f<5.5||f>6.5)':'else')+'{'+pool.map((n,k)=>(k<11?'if(slot<'+(k+.5).toFixed(1)+')':'')+'return '+n+'.;').join('')+'}').join('\n')}
}
vec3 cityFacadeThemeFrom(vec2 info){float theme=cityFacadeThemeIndex(info),shade=.85+mod(floor(info.y+.5)*5.,13.)/12.*.25;
 ${FACADE_THEMES.map((t,i)=>(i<11?'if(theme<'+(i+.5).toFixed(1)+')':'')+'return vec3('+t.wall.map(v=>v.toFixed(4)).join(',')+')*shade;').join('\n')}
}
vec4 cityFacadeGlassFrom(vec2 info){float theme=cityFacadeThemeIndex(info),seed=floor(info.y+.5),f=floor(info.x),shade=.91+mod(floor(seed/13.)*7.+f,11.)/10.*.16;
 ${FACADE_THEMES.map((t,i)=>(i<11?'if(theme<'+(i+.5).toFixed(1)+')':'')+'return vec4(vec3('+t.glass.map(v=>v.toFixed(4)).join(',')+')*shade,'+t.roughness.toFixed(3)+');').join('\n')}
}
float cityFacadeNightLevel(vec2 info){float seed=floor(info.y+.5),f=floor(info.x),level=mod(floor(seed/11.)+f*3.,6.),value=1.10;
 ${NIGHT_LEVELS.slice(1).map((n,i)=>'if(level>'+ (i+.5).toFixed(1)+')value='+n.toFixed(2)+';').join('')}
 return value*(.93+mod(seed*5.,7.)/6.*.12);
}
vec4 cityFacadeLightFrom(vec2 info){float seed=floor(info.y+.5),f=floor(info.x),slot=mod(floor(seed/7.)+f*3.,4.);vec3 color;
 if(f<1.5||(f>5.5&&f<6.5)){
 ${OFFICE_LIGHTS.map((c,i)=>(i===0?'if(slot<.5)':i===1?'else if(slot<1.5)':i===2?'else if(slot<2.5)':'else ')+'color=vec3('+c.map(v=>v.toFixed(3)).join(',')+');').join('\n')}
 }else{
 ${HOME_LIGHTS.map((c,i)=>(i===0?'if(slot<.5)':i===1?'else if(slot<1.5)':i===2?'else if(slot<2.5)':'else ')+'color=vec3('+c.map(v=>v.toFixed(3)).join(',')+');').join('\n')}
 }
 return vec4(color,cityFacadeNightLevel(info));
}
vec4 cityFacadeActivityFrom(vec2 info){float seed=floor(info.y+.5),f=floor(info.x),a=mod(floor(seed/17.)+f*7.,13.)/12.,floorP,suiteP,wholeP=0.;
 if(f>5.5&&f<6.5){floorP=.23+a*.25;suiteP=.37+a*.18;}
 else if(f<1.5){floorP=.36+a*.30;suiteP=.35+a*.20;wholeP=.025+a*.035;}
 else{floorP=.73+a*.15;suiteP=.13+a*.24;}
 float dusk=cityFacadeNightLevel(info)*(.26+mod(seed*3.,5.)/4.*.10);
 return vec4(dusk,floorP,suiteP,wholeP);
}
`;

const GLSL=String.raw`
#ifdef CITY_FACADE_VARIETY
#ifdef CITY_FACADE_GRADIENT
flat varying vec2 vCityFacadeInfo;
#else
varying vec2 vCityFacadeInfo;
#endif
varying vec3 vCityFacadeTheme;
varying vec4 vCityFacadeLight;
varying vec4 vCityFacadeGlass;
varying vec4 vCityFacadeActivity;
uniform sampler2D cityFacadeAtlas;
uniform sampler2D cityFacadeWindows;
float cityFacadeRoughness=.7;
float cityFacadeF0=.04;
vec3 cityFacadeSurfaceLinear=vec3(.5);
vec3 cityFacadeRadiance=vec3(0.);
float cityFacadeStableSeed(){return mod(floor(vCityFacadeInfo.y+.5),4093.);}
float cityFacadeHash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453123);}
vec2 cityFacadeGrid(){float f=floor(vCityFacadeInfo.x);return vec2(f<.5?6.:(f<2.5?4.:(f>5.5&&f<6.5?5.:3.)),f>5.5&&f<6.5?4.:8.);}
vec2 cityFacadePattern(vec2 uv){
 float f=floor(vCityFacadeInfo.x),s=cityFacadeStableSeed();
 vec2 period=vec2(14.,19.2);
 if(f>.5)period=vec2(18.,20.4);if(f>1.5)period=vec2(14.,17.6);
 if(f>2.5)period=vec2(20.,17.6);if(f>3.5)period=vec2(16.,22.4);
 if(f>4.5)period=vec2(12.,16.8);if(f>5.5)period=vec2(20.,16.);
 if(f>6.5)period=vec2(20.,18.4);
 // Per-building phase plus face direction: adjoining walls share a plausible
 // floor scale while separate buildings never all start at atlas column zero.
 float face=0.;
 #ifdef NORMAL
 face=dot(floor(normalize(vNormalW)*32.+.5),vec3(3.7,1.1,7.3));
 #endif
 vec2 phase=vec2(cityFacadeHash(vec2(s,face)),cityFacadeHash(vec2(s,17.)));
 return uv*24./period+phase;
}
vec2 cityFacadeAtlasFromPattern(vec2 pattern){
 float f=floor(vCityFacadeInfo.x);vec2 tile=vec2(mod(f,4.),floor(f/4.));
 return (tile*vec2(256.,512.)+vec2(8.)+fract(pattern)*vec2(240.,496.))/1024.;
}
vec4 cityFacadeSample(sampler2D source,vec2 pattern){
 vec2 atlasUV=cityFacadeAtlasFromPattern(pattern);
 #ifdef CITY_FACADE_GRADIENT
 // Derive before fract: a tile seam must never masquerade as a 200px footprint.
 vec2 dx=dFdx(pattern)*vec2(240.,496.)/1024.,dy=dFdy(pattern)*vec2(240.,496.)/1024.;
 return textureGrad(source,atlasUV,dx,dy);
 #else
 return texture2D(source,atlasUV);
 #endif
}
#endif
#ifdef ALBEDO
vec4 cityFacadeAlbedo(vec2 uv){
 #ifdef CITY_FACADE_VARIETY
 vec2 pattern=cityFacadePattern(uv);
 vec4 facadeTexel=cityFacadeSample(cityFacadeAtlas,pattern);
 cityFacadeRoughness=facadeTexel.a;
 // Alpha is a linear mixture of glass (.333) and wall (.780), not a
 // binary class after mip filtering. Recover area coverage continuously.
 float glazing=clamp((.780-facadeTexel.a)/(.780-.333),0.,1.);
 float glassRoughness=clamp(vCityFacadeGlass.a*.52,.14,.24);
 float luminance=dot(toLinearSpace(facadeTexel.rgb),vec3(.2126,.7152,.0722));
 float wallDetail=clamp(luminance/.48,.78,1.10),glassDetail=clamp(luminance/.105,.94,1.06);
 vec3 wall=vCityFacadeTheme*wallDetail;
 vec3 glass=vCityFacadeGlass.rgb*glassDetail*.32;
 
 vec3 surface=mix(wall,glass,glazing);
 #ifdef CITY_FACADE_GRADIENT
 vec2 cellDX=dFdx(pattern*cityFacadeGrid()),cellDY=dFdy(pattern*cityFacadeGrid());
 float unresolved=smoothstep(.35,1.2,max(length(cellDX),length(cellDY)));
 // At subpixel size show the building's mean reflectance, not a black/white grid.
 float family=floor(vCityFacadeInfo.x),meanGlass=.568;
 if(family>.5)meanGlass=.475;if(family>1.5)meanGlass=.311;if(family>2.5)meanGlass=.406;
 if(family>3.5)meanGlass=.355;if(family>4.5)meanGlass=.232;if(family>5.5)meanGlass=.263;if(family>6.5)meanGlass=.411;
 vec3 meanSurface=mix(vCityFacadeTheme,vCityFacadeGlass.rgb*.32,meanGlass);
 surface=mix(surface,meanSurface,unresolved*.82);
 glazing=mix(glazing,meanGlass,unresolved);
 #endif
 // Single-lobe approximation: once panes share a pixel, preserve the
 // narrow glass reflection and scale its F0 by covered area. Averaging
 // roughness with masonry had erased skyline reflections at drone distance.
 float glassLobe=smoothstep(.03,.20,glazing);
 cityFacadeRoughness=mix(.78,glassRoughness,glassLobe);
 cityFacadeF0=mix(.04,.04*glazing,glassLobe);
 cityFacadeSurfaceLinear=clamp(surface,vec3(.009),vec3(.82));
 return vec4(facadeTexel.rgb,1.);
 #else
 return texture2D(albedoSampler,uv);
 #endif
}
#endif
#ifdef EMISSIVE
vec3 cityFacadeEmission(vec2 uv){
 #ifdef CITY_FACADE_VARIETY
 vec2 pattern=cityFacadePattern(uv);
 vec3 stencil=cityFacadeSample(cityFacadeWindows,pattern).rgb;
 vec2 cell=floor(pattern*cityFacadeGrid());
 float seed=cityFacadeStableSeed();
 float family=floor(vCityFacadeInfo.x),office=1.-step(1.5,family),industrial=step(5.5,family)*(1.-step(6.5,family));
 float suiteWidth=mix(mix(2.,4.,industrial),3.+mod(seed,3.),office);
 float floorGroup=floor(cell.y/mix(1.,2.,office)),suite=floor((cell.x+mod(seed,3.))/suiteWidth);
 float floorP=vCityFacadeActivity.y*mix(.34,1.,cityFacadeNight),suiteP=vCityFacadeActivity.z,wholeP=vCityFacadeActivity.w*mix(.30,1.,cityFacadeNight);
 float floorLit=1.-step(floorP,cityFacadeHash(vec2(floorGroup+71.,seed+53.)));
 float suiteLit=1.-step(suiteP,cityFacadeHash(vec2(suite+floorGroup*23.,seed+193.)));
 float wholeLit=1.-step(wholeP,cityFacadeHash(vec2(floorGroup+113.,seed+317.)));
 float lit=floorLit*max(suiteLit,wholeLit);
 // The far-field value matches these hierarchical gates, not a generic city-wide density.
 float expected=floorP*(wholeP+(1.-wholeP)*suiteP),subpixel=0.;
 #ifdef CITY_FACADE_GRADIENT
 vec2 windowDX=dFdx(pattern*cityFacadeGrid()),windowDY=dFdy(pattern*cityFacadeGrid());
 // The atlas already filters individual window panes. Only average the
 // occupancy gates when their larger suite/floor group is itself subpixel;
 // otherwise dark offices gain an artificial luminous floor far too early.
 vec2 groupSize=vec2(suiteWidth,mix(1.,2.,office));
 vec2 groupDX=windowDX/groupSize,groupDY=windowDY/groupSize;
 subpixel=smoothstep(.45,1.2,max(length(groupDX),length(groupDY)));
 lit=mix(lit,expected,subpixel);
 #endif
 float coverage=stencil.r*lit;
 float roomBrightness=mix(mix(.975,1.025,cityFacadeHash(vec2(suite+floorGroup*7.,seed+419.))),1.,subpixel);
 float radiance=mix(vCityFacadeActivity.x,vCityFacadeLight.a*${NIGHT_EMISSION_GAIN.toFixed(2)},cityFacadeNight)*roomBrightness;
 cityFacadeRadiance=vCityFacadeLight.rgb*coverage*radiance;
 return cityFacadeRadiance;
 #else
 return texture2D(emissiveSampler,uv).rgb;
 #endif
}
#endif
`;

type Shared={albedo:Texture;windows:Texture;ready:boolean;night:boolean;failures:string[]};
export class CityFacadeDiversityPlugin extends MaterialPluginBase{
 constructor(material:PBRMaterial,private shared:Shared){super(material,'CityFacadeDiversity',190,{CITY_FACADE_VARIETY:false,CITY_FACADE_GRADIENT:false},true,true,true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override prepareDefines(defines:MaterialDefines,_scene:Scene,mesh:AbstractMesh){
  const d=defines as MaterialDefines&{CITY_FACADE_VARIETY:boolean;CITY_FACADE_GRADIENT:boolean};
  d.CITY_FACADE_VARIETY=this.shared.ready&&mesh.isVerticesDataPresent(VertexBuffer.UV2Kind)&&/^block_-?\d+_-?\d+_/.test(mesh.name);
  d.CITY_FACADE_GRADIENT=d.CITY_FACADE_VARIETY&&((_scene.getEngine() as AbstractEngine&{webGLVersion?:number}).webGLVersion??1)>=2;
 }
 override getAttributes(attributes:string[],_scene:Scene,mesh:AbstractMesh){if(mesh.isVerticesDataPresent(VertexBuffer.UV2Kind)&&!attributes.includes(VertexBuffer.UV2Kind))attributes.push(VertexBuffer.UV2Kind);}
 override getSamplers(samplers:string[]){samplers.push('cityFacadeAtlas','cityFacadeWindows');}
 override getUniforms(){return {ubo:[{name:'cityFacadeNight',size:1,type:'float'}],fragment:'#ifdef CITY_FACADE_VARIETY\nuniform float cityFacadeNight;\n#endif'};}
 override bindForSubMesh(buffer:UniformBuffer,_scene:Scene,_engine:AbstractEngine,_subMesh:SubMesh){buffer.updateFloat('cityFacadeNight',this.shared.night?1:0);buffer.setTexture('cityFacadeAtlas',this.shared.albedo);buffer.setTexture('cityFacadeWindows',this.shared.windows);}
 override getActiveTextures(active:BaseTexture[]){active.push(this.shared.albedo,this.shared.windows);}
 override hasTexture(texture:BaseTexture){return texture===this.shared.albedo||texture===this.shared.windows;}
 override getCustomCode(type:string):Record<string,string>|null{
  if(type==='vertex')return {CUSTOM_VERTEX_DEFINITIONS:'#ifdef CITY_FACADE_VARIETY\n#ifdef CITY_FACADE_GRADIENT\nflat varying vec2 vCityFacadeInfo;\n#else\nvarying vec2 vCityFacadeInfo;\n#endif\nvarying vec3 vCityFacadeTheme;\nvarying vec4 vCityFacadeLight;\nvarying vec4 vCityFacadeGlass;\nvarying vec4 vCityFacadeActivity;\n'+THEME_GLSL+'\n#endif',CUSTOM_VERTEX_MAIN_END:'#ifdef CITY_FACADE_VARIETY\nvCityFacadeInfo=uv2;\nvCityFacadeTheme=cityFacadeThemeFrom(uv2);\nvCityFacadeLight=cityFacadeLightFrom(uv2);\nvCityFacadeGlass=cityFacadeGlassFrom(uv2);\nvCityFacadeActivity=cityFacadeActivityFrom(uv2);\n#endif'};
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_DEFINITIONS:GLSL,
   CUSTOM_FRAGMENT_UPDATE_ALBEDO:'#ifdef CITY_FACADE_VARIETY\n// Whole-building linear theme replaces legacy per-vertex palette multiplication.\nsurfaceAlbedo=cityFacadeSurfaceLinear;\n#endif',
   CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:'#if defined(CITY_FACADE_VARIETY) && defined(EMISSIVE)\nfinalEmissive=cityFacadeRadiance;\n#endif',
   '!vec4 albedoTexture=texture2D\\(albedoSampler,vAlbedoUV\\+uvOffset\\);':'vec4 albedoTexture=cityFacadeAlbedo(vAlbedoUV+uvOffset);',
   '!vec3 emissiveColorTex=texture2D\\(emissiveSampler,vEmissiveUV\\+uvOffset\\)\\.rgb;':'vec3 emissiveColorTex=cityFacadeEmission(vEmissiveUV+uvOffset);',
   CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:'#ifdef CITY_FACADE_VARIETY\nmetallicRoughness.r=0.;metallicRoughness.g=cityFacadeRoughness;reflectivityColor.a=cityFacadeF0;metallicReflectanceFactors=vec4(1.);\n#endif',
  };
 }
}

/** Invoke applyMeshes after createArchitectureMaterials.applyMeshes. Existing
 * COLOR_0 remains untouched in the asset. For marked ordinary walls, a final
 * albedo hook replaces its multiplication with a single building-wide theme.
 * Named landmarks and unmarked roof/near-detail meshes retain their authored material.
 * Keep the original albedo/emissive references: they supply Babylon's material
 * defines and provide a safe fallback on older unmarked assets or load failure.
 * The existing architecture controller can still own setNight and its references.
 */
export function createFacadeDiversity(scene:Scene,baseURL='/city/textures/architecture'){
 const plugins=new Map<PBRMaterial,CityFacadeDiversityPlugin>();let assignments=0;
 const shared:Shared={albedo:null as unknown as Texture,windows:null as unknown as Texture,ready:false,night:false,failures:[]};
 const loaded=()=>queueMicrotask(()=>{if(scene.isDisposed)return;shared.ready=Boolean(shared.albedo?.isReady()&&shared.windows?.isReady());for(const p of plugins.values())p.markAllDefinesAsDirty();});
 for(const [key,file] of [['albedo','facade-atlas.png'],['windows','facade-windows.png']] as const){
  shared[key]=new Texture(baseURL+'/'+file,scene,{invertY:false,noMipmap:false,gammaSpace:true,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,onLoad:loaded,onError:message=>{shared.failures.push(file+': '+message);shared.ready=false;for(const p of plugins.values())p.markAllDefinesAsDirty();}});
  shared[key].wrapU=Texture.CLAMP_ADDRESSMODE;shared[key].wrapV=Texture.CLAMP_ADDRESSMODE;shared[key].anisotropicFilteringLevel=4;
 }
 function applyMeshes(meshes:AbstractMesh[],assetName:string){if(!/(?:^|\/)buildings(?:\.glb)?$/.test(assetName))return;
  for(const mesh of meshes){if(!mesh.isVerticesDataPresent(VertexBuffer.UV2Kind)||!/^block_-?\d+_-?\d+_/.test(mesh.name)||!(mesh.material instanceof PBRMaterial))continue;
   if(!plugins.has(mesh.material))plugins.set(mesh.material,new CityFacadeDiversityPlugin(mesh.material,shared));assignments++;
  }
 }
 scene.onDisposeObservable.addOnce(()=>{shared.albedo.dispose();shared.windows.dispose();plugins.clear();});
 return {applyMeshes,setNight:(night:boolean)=>{shared.night=night;},stats:()=>({ready:shared.ready,failures:[...shared.failures],managedMaterials:plugins.size,assignments,families:8,extraTextureBytesWithMipmaps:6990506,newDrawCalls:0,night:shared.night,buildingThemes:12,themeScope:'stable metadata building group; ordinary marked walls only',legacyVertexTint:'neutralized after multiply on themed walls',windowRadiance:'building-level HDR/color temperature; grouped suites/floors; glazing-only',atlasMipDerivatives:'continuous pattern on WebGL2',seedStability:'flat varying + integer rounding + bounded hash + quantized face',windowRadianceRange:{dusk:[.25,.82],night:[.79,1.82]},windowGrouping:'office 3–5 bays × 2 floors; home two-window units',windowFarField:'filter suite/floor footprint; preserve dark groups until unresolved'})};
}
