import {MaterialPluginBase,PBRMaterial,Texture,VertexBuffer,ShaderLanguage,type AbstractMesh,type MaterialDefines,type Scene,type UniformBuffer,type AbstractEngine,type SubMesh,type BaseTexture} from '@babylonjs/core';
import type {CinematicLightingMode} from './city-daylight.ts';

/** Original ordinary-building grammar, independent of named landmark materials.
 * Input TEXCOORD_1: x = family + .25; y = stable building seed (0..65520).
 * Both atlas textures are shared by all managed materials; no per-building
 * material, mesh split, geometry generation, light, or render pass is added.
 */
type RGB=readonly [number,number,number];
/** Authored material sets, linear reflectance. These are plausible Shenzhen
 * typologies, not measurements of the individual OSM buildings. Glass is an
 * independent material choice, not the same fixed multiplier for every tower.
 * Wall chroma sits at 55% of the earlier palette and glass at 75%: the city
 * is mostly grey-white tile, beige render and blue-green glazing, with colour
 * arriving from light, signage and a few accent buildings, not from every wall.
 */
export const FACADE_THEMES=[
 {name:'blue-steel',wall:[.166,.210,.257],glass:[.095,.166,.230],roughness:.30},
 {name:'sage-glass',wall:[.272,.333,.302],glass:[.101,.206,.161],roughness:.35},
 {name:'silver-glass',wall:[.518,.559,.581],glass:[.265,.336,.377],roughness:.32},
 {name:'warm-white',wall:[.690,.666,.605],glass:[.233,.267,.252],roughness:.43},
 {name:'sandstone',wall:[.477,.416,.348],glass:[.188,.218,.206],roughness:.45},
 {name:'graphite',wall:[.109,.123,.131],glass:[.095,.133,.148],roughness:.34},
 {name:'near-black',wall:[.030,.035,.040],glass:[.043,.059,.073],roughness:.28},
 {name:'pale-cool',wall:[.645,.676,.689],glass:[.325,.400,.430],roughness:.38},
 {name:'clay-render',wall:[.344,.253,.212],glass:[.131,.153,.150],roughness:.46},
 {name:'olive-render',wall:[.326,.373,.301],glass:[.149,.228,.172],roughness:.44},
 {name:'champagne-glass',wall:[.314,.292,.256],glass:[.232,.206,.149],roughness:.31},
 {name:'slate-blue',wall:[.085,.113,.154],glass:[.070,.123,.206],roughness:.29},
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
export const ACCENT_WINDOW_MOTIF=readonlyTuple(24,16);
export const RARE_WINDOW_LIGHT_RATE=6/(ACCENT_WINDOW_MOTIF[0]*ACCENT_WINDOW_MOTIF[1]);
// Deliberately saturated HDR accents: each 24 x 16 motif contains two red,
// two blue and two green panes, while the remaining windows keep normal light.
export const RARE_WINDOW_LIGHTS=[[1.35,.025,.012],[.018,.26,1.40],[.018,1.18,.075]] as const;
export const WINDOW_HDR_SCALES=[.92,.98,1.04,1.10] as const;
export const WINDOW_BLOOM_SCALES=[.94,1,1.06] as const;
export const WINDOW_KERNEL_SCALES=[.88,1,1.12] as const;
// Supplement suites only on active floors. Inactive office floors stay dark;
// the few independent accent panes remain the intentional exception.
export const NORMAL_WINDOW_FILL={dusk:.06,night:.10} as const;
// Dusk still has direct sun on the facades: interior lights are barely
// visible then and only take over once the sky has gone dark.
const NIGHT_EMISSION_GAIN=1.10;
const DUSK_EMISSION_GAIN=.55;
const WINDOW_BOUNCE_GAIN=.08;
/** World-Y layering and analytic relief for ordinary walls. Everything here is
 * a few ALU per pixel on the existing wall draw: no texture, vertex attribute,
 * light or pass is added, and the CPU/far-field energy contract is unchanged.
 * Heights are Blender metres above the block base, (1-TEXCOORD_0.y)*24 after the glTF V flip.
 * - ground: wall reflectance falls to 72% between 9 m and the shopfront top
 *   (canopy shade, tree cover and street grime on the first two floors).
 * - sky: image-based irradiance and reflection fall to 42% at the base and
 *   recover by 28 m; in a dense block the lower floors see little sky. Direct
 *   sun and the hemisphere fill are not touched. Under full daylight the floor
 *   is 62% instead: the sunlit road and the opposite block bounce light back
 *   into the canyon, a term nothing else in the scene models. At dusk and at
 *   night that bounce is gone and the lower floors stay in the dark.
 * - plant: 55% of office towers get a louvred mechanical floor every 9–13 rows
 *   from row 3; the band is solid, 78% wall reflectance and never lit at night.
 * - recess: glazing sits 10 cm behind the wall plane. The screen derivative of
 *   a glazing height field (one extra atlas alpha tap with a 14 cm footprint)
 *   tilts pane edges (surface-gradient bump), so mullions and reveals catch or
 *   shadow the low sun. Beyond street distance the pixel footprint dominates
 *   and the relief fades by itself instead of shimmering.
 * - lintelShade: the strip under each lintel loses 42% of its glass tint and
 *   image-based light; the cheapest read of a recessed pane at any distance.
 * - paneTilt: each resolved pane is rotated up to ±0.45° so a glass tower
 *   reflects the sky as a mosaic rather than one flat mirror.
 */
export const FACADE_RELIEF={groundFloor:.72,groundTop:9,skyFloor:.42,skyFloorDay:.62,skyTop:28,plantRate:.55,plantMinPeriod:9,plantPeriodSpan:5,plantWall:.78,recess:.10,recessRamp:.14,lintelShade:.42,paneTilt:.016} as const;
const NIGHT_LEVELS=[1.10,1.25,1.45,1.65,1.90,2.10] as const;
const mod=(n:number,d:number)=>((n%d)+d)%d;
function readonlyTuple<A extends number,B extends number>(a:A,b:B){return [a,b] as const;}
function rounded(seed:number){return Math.floor((Number.isFinite(seed)?seed:0)+.5);}
function hash(x:number,y:number){const n=Math.sin(x*127.1+y*311.7)*43758.5453123;return n-Math.floor(n);}
export function facadeWindowAccentFor(seed:number,cell:readonly [number,number]){
 const s=mod(rounded(seed),4093),x=mod(Math.floor(cell[0])+mod(s*5,24),24),y=mod(Math.floor(cell[1])+mod(Math.floor(s/24)*3,16),16);
 const slot=(x===1&&y===1)||(x===20&&y===13)?0:(x===17&&y===2)||(x===2&&y===14)?1:(x===10&&y===9)||(x===18&&y===6)?2:-1;
 return {rare:slot>=0,slot:Math.max(0,slot)};
}
export function facadeWindowLightFor(seed:number,cell:readonly [number,number],base:RGB,unresolved=0){
 const s=mod(rounded(seed),4093),x=Math.floor(cell[0]),y=Math.floor(cell[1]);
 const {rare,slot}=facadeWindowAccentFor(s,cell),fade=Math.max(0,Math.min(1,unresolved)),blend=rare?1-fade:0,accent=RARE_WINDOW_LIGHTS[slot];
 const hdrScale=WINDOW_HDR_SCALES[Math.min(WINDOW_HDR_SCALES.length-1,Math.floor(hash(x+s*.41+211,y+s*.23+337)*WINDOW_HDR_SCALES.length))];
 const bloomScale=WINDOW_BLOOM_SCALES[Math.min(WINDOW_BLOOM_SCALES.length-1,Math.floor(hash(x+s*.19+433,y+s*.47+557)*WINDOW_BLOOM_SCALES.length))];
 const kernelScale=WINDOW_KERNEL_SCALES[Math.min(WINDOW_KERNEL_SCALES.length-1,Math.floor(hash(x+s*.53+619,y+s*.11+773)*WINDOW_KERNEL_SCALES.length))];
 return {rare,slot,roll:rare?0:1,hdrScale:hdrScale*(rare?1.22:1)*(1-fade)+fade,bloomScale:bloomScale*(rare?1.12:1)*(1-fade)+fade,kernelScale:kernelScale*(1-fade)+fade,color:base.map((value,i)=>value*(1-blend)+accent[i]*blend) as [number,number,number]};
}
export function facadeThemeFor(seed:number,family:number){
 const s=rounded(seed),f=Math.floor(family),office=f<2,industrial=f===6;
 const slot=mod(s*17+f*13,12),pool=THEME_POOLS[f===0?0:f===1?1:industrial?3:2],id=pool[slot],theme=FACADE_THEMES[id];
 const shade=.85+mod(s*5,13)/12*.25,glassShade=.91+mod(Math.floor(s/13)*7+f,11)/10*.16;
 const lightSlot=mod(Math.floor(s/7)+f*3,4),light:RGB=(office||industrial?OFFICE_LIGHTS:HOME_LIGHTS)[lightSlot];
 const level=NIGHT_LEVELS[mod(Math.floor(s/11)+f*3,6)],nightRadiance=level*(.93+mod(s*5,7)/6*.12);
 const duskRadiance=nightRadiance*(.26+mod(s*3,5)/4*.10),activity=mod(Math.floor(s/17)+f*7,13)/12;
 const floorProbability=industrial?.23+activity*.25:office?.36+activity*.30:.73+activity*.15;
 const suiteProbability=industrial?.37+activity*.18:office?.35+activity*.20:.13+activity*.24;
 const wholeFloorProbability=office?.025+activity*.035:0;
 return {id,name:theme.name,wall:theme.wall.map(v=>v*shade),glass:theme.glass.map(v=>v*glassShade),glassRoughness:theme.roughness,
  lightColor:light,temperatureFamily:office||industrial?'3300–5400 K artistic office set':'2800–3900 K artistic residential set',
  nightRadiance,duskRadiance,floorProbability,suiteProbability,wholeFloorProbability,office,industrial};
}
/** Spatial occupancy contract. Suites share an on/off state; office activity
 * groups two adjacent floors and 3–5 window bays, homes use pairs of windows.
 * The distant value is the exact expectation of the same hierarchical gates.
 */
type WindowFootprint={suite:number;floor:number;pane:number};
export function facadeOccupancyFor(seed:number,family:number,cell:readonly [number,number],night=true,unresolved:number|WindowFootprint=0){
 const s=mod(rounded(seed),4093),profile=facadeThemeFor(seed,family),f=Math.floor(family),office=profile.office;
 const width=office?3+mod(s,3):profile.industrial?4:2;
 const floorGroup=Math.floor(cell[1]/(office?2:1)),suite=Math.floor((cell[0]+mod(s,3))/width);
 const floorP=profile.floorProbability*(night?1:.34),suiteP=profile.suiteProbability,wholeP=profile.wholeFloorProbability*(night?1:.30);
 const floorLit=hash(floorGroup+71,s+53)<floorP?1:0;
 const suiteLit=hash(suite+floorGroup*23,s+193)<suiteP?1:0;
 const wholeLit=hash(floorGroup+113,s+317)<wholeP?1:0;
 const normalP=night?NORMAL_WINDOW_FILL.night:NORMAL_WINDOW_FILL.dusk;
 const normalLit=hash(suite+floorGroup*31+587,s+881)<normalP?1:0;
 const clamp=(v:number)=>Math.max(0,Math.min(1,v)),footprint=typeof unresolved==='number'?{suite:unresolved,floor:unresolved,pane:unresolved}:unresolved;
 const suiteFade=clamp(footprint.suite),floorFade=clamp(footprint.floor),paneFade=clamp(footprint.pane),fade=Math.max(suiteFade,floorFade);
 const windowLight=facadeWindowLightFor(s,cell,profile.lightColor,paneFade);
 const suiteExpected=1-(1-suiteP)*(1-normalP),baseExpected=floorP*(wholeP+(1-wholeP)*suiteExpected);
 const binary=Math.max(floorLit*Math.max(suiteLit,wholeLit,normalLit),windowLight.rare?1:0),expected=RARE_WINDOW_LIGHT_RATE+(1-RARE_WINDOW_LIGHT_RATE)*baseExpected;
 const suites=Math.max(suiteLit,normalLit)*(1-suiteFade)+suiteExpected*suiteFade;
 const baseLit=floorLit*Math.max(wholeLit,suites)*(1-floorFade)+baseExpected*floorFade;
 const accentLit=(windowLight.rare?1:0)*(1-paneFade)+RARE_WINDOW_LIGHT_RATE*paneFade;
 const coverage=1-(1-baseLit)*(1-accentLit);
 // Brightness stays suite-wide; a sparse deterministic pane tint is layered on top.
 const roomScale=(.975+.05*hash(suite+floorGroup*7,s+419))*(1-fade)+fade;
 return {binary,expected,coverage,floorLit,floorGroup,suite,roomScale,radiance:(night?profile.nightRadiance*NIGHT_EMISSION_GAIN:profile.duskRadiance*DUSK_EMISSION_GAIN)*roomScale,color:windowLight.color,rareColor:windowLight.rare,rareColorSlot:windowLight.slot,hdrScale:windowLight.hdrScale,bloomScale:windowLight.bloomScale,kernelScale:windowLight.kernelScale};
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
vec3 cityFacadeBounce=vec3(0.);
float cityFacadeGlazing=0.;
float cityFacadeRecess=0.;
float cityFacadeSolid=0.;
float cityFacadeSky=1.;
float cityFacadeResolved=1.;
vec2 cityFacadeCell=vec2(0.);
float cityFacadeStableSeed(){return mod(floor(vCityFacadeInfo.y+.5),4093.);}
float cityFacadeHash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453123);}
#if defined(CITY_FACADE_GRADIENT) && defined(NORMAL)
vec3 cityFacadeRelief(vec3 n){
 // Glazing sits behind the wall plane; its screen-space coverage gradient is
 // the reveal slope at every pane edge (Mikkelsen surface-gradient bump).
 vec3 dpx=dFdx(vPositionW),dpy=dFdy(vPositionW);
 float h=-${FACADE_RELIEF.recess.toFixed(3)}*cityFacadeRecess,dhx=dFdx(h),dhy=dFdy(h);
 vec3 r1=cross(dpy,n),r2=cross(n,dpx);float det=dot(dpx,r1);
 if(abs(det)>1e-14)n=normalize(abs(det)*n-sign(det)*(dhx*r1+dhy*r2));
 // Per-pane rotation of resolved glass only; the wall frame stays true.
 vec3 t=cross(vec3(0.,1.,0.),n);float tl=length(t);
 if(tl>1e-3){t/=tl;vec3 b=cross(n,t);float seed=cityFacadeStableSeed();
  vec2 tilt=(vec2(cityFacadeHash(cityFacadeCell+vec2(seed*.07+31.,seed*.03+57.)),cityFacadeHash(cityFacadeCell+vec2(seed*.05+93.,seed*.09+11.)))-.5)
   *${FACADE_RELIEF.paneTilt.toFixed(3)}*smoothstep(.2,.7,cityFacadeGlazing)*cityFacadeResolved;
  n=normalize(n+t*tilt.x+b*tilt.y);}
 return n;
}
#endif
vec2 cityFacadeWindowAccent(vec2 cell,float seed){
 float x=mod(cell.x+mod(seed*5.,24.),24.),y=mod(cell.y+mod(floor(seed/24.)*3.,16.),16.),slot=-1.;
 if((abs(x-1.)<.5&&abs(y-1.)<.5)||(abs(x-20.)<.5&&abs(y-13.)<.5))slot=0.;
 else if((abs(x-17.)<.5&&abs(y-2.)<.5)||(abs(x-2.)<.5&&abs(y-14.)<.5))slot=1.;
 else if((abs(x-10.)<.5&&abs(y-9.)<.5)||(abs(x-18.)<.5&&abs(y-6.)<.5))slot=2.;
 return vec2(step(0.,slot),max(0.,slot));
}
vec3 cityFacadeWindowLight(vec3 base,vec2 cell,float seed,float unresolved){
 vec2 pick=cityFacadeWindowAccent(cell,seed);if(pick.x<.5)return base;vec3 accent;
 if(pick.y<.5)accent=vec3(1.35,.025,.012);else if(pick.y<1.5)accent=vec3(.018,.26,1.40);else accent=vec3(.018,1.18,.075);
 return mix(accent,base,unresolved);
}
vec3 cityFacadeWindowVariation(vec2 cell,float seed){
 float hdrSlot=floor(cityFacadeHash(vec2(cell.x+seed*.41+211.,cell.y+seed*.23+337.))*4.);float hdr=.92;
 if(hdrSlot>.5)hdr=.98;if(hdrSlot>1.5)hdr=1.04;if(hdrSlot>2.5)hdr=1.10;
 float bloomSlot=floor(cityFacadeHash(vec2(cell.x+seed*.19+433.,cell.y+seed*.47+557.))*3.);float bloom=.94;
 if(bloomSlot>.5)bloom=1.;if(bloomSlot>1.5)bloom=1.06;
 float kernelSlot=floor(cityFacadeHash(vec2(cell.x+seed*.53+619.,cell.y+seed*.11+773.))*3.);float kernel=.88;
 if(kernelSlot>.5)kernel=1.;if(kernelSlot>1.5)kernel=1.12;
 return vec3(hdr,bloom,kernel);
}
vec2 cityFacadeGrid(){float f=floor(vCityFacadeInfo.x);return vec2(f<.5?6.:(f<2.5?4.:(f>5.5&&f<6.5?5.:3.)),f>5.5&&f<6.5?4.:8.);}
vec2 cityFacadePeriod(){
 float f=floor(vCityFacadeInfo.x);
 vec2 period=vec2(14.,19.2);
 if(f>.5)period=vec2(18.,20.4);if(f>1.5)period=vec2(14.,17.6);
 if(f>2.5)period=vec2(20.,17.6);if(f>3.5)period=vec2(16.,22.4);
 if(f>4.5)period=vec2(12.,16.8);if(f>5.5)period=vec2(20.,16.);
 if(f>6.5)period=vec2(20.,18.4);
 return period;
}
vec2 cityFacadePattern(vec2 uv){
 float s=cityFacadeStableSeed();
 // Per-building phase plus face direction: adjoining walls share a plausible
 // floor scale while separate buildings never all start at atlas column zero.
 float face=0.;
 #ifdef NORMAL
 face=dot(floor(normalize(vNormalW)*32.+.5),vec3(3.7,1.1,7.3));
 #endif
 vec2 phase=vec2(cityFacadeHash(vec2(s,face)),cityFacadeHash(vec2(s,17.)));
 return uv*24./cityFacadePeriod()+phase;
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
float cityFacadeWindowSample(vec2 pattern,float kernelScale){
 vec2 atlasUV=cityFacadeAtlasFromPattern(pattern);
 #ifdef CITY_FACADE_GRADIENT
 // A small per-pane footprint change acts as a discrete prefilter kernel.
 // Global post-process Bloom remains shared; no extra layer or draw call.
 vec2 dx=dFdx(pattern)*vec2(240.,496.)/1024.*kernelScale,dy=dFdy(pattern)*vec2(240.,496.)/1024.*kernelScale;
 return textureGrad(cityFacadeWindows,atlasUV,dx,dy).r;
 #else
 return texture2D(cityFacadeWindows,atlasUV).r;
 #endif
}
// Every bounce tap uses its own occupied room. An unlit neighbour cannot
// produce light just because the receiving wall belongs to an occupied suite.
float cityFacadeRoomLit(vec2 pattern){
 vec2 cell=floor(pattern*cityFacadeGrid());float seed=cityFacadeStableSeed();
 float family=floor(vCityFacadeInfo.x),office=1.-step(1.5,family),industrial=step(5.5,family)*(1.-step(6.5,family));
 float width=mix(mix(2.,4.,industrial),3.+mod(seed,3.),office);
 float floorGroup=floor(cell.y/mix(1.,2.,office)),suite=floor((cell.x+mod(seed,3.))/width);
 float floorP=vCityFacadeActivity.y*mix(.34,1.,cityFacadeNight),wholeP=vCityFacadeActivity.w*mix(.30,1.,cityFacadeNight);
 float floorLit=1.-step(floorP,cityFacadeHash(vec2(floorGroup+71.,seed+53.)));
 float suiteLit=1.-step(vCityFacadeActivity.z,cityFacadeHash(vec2(suite+floorGroup*23.,seed+193.)));
 float wholeLit=1.-step(wholeP,cityFacadeHash(vec2(floorGroup+113.,seed+317.)));
 float normalP=mix(${NORMAL_WINDOW_FILL.dusk.toFixed(2)},${NORMAL_WINDOW_FILL.night.toFixed(2)},cityFacadeNight);
 float normalLit=1.-step(normalP,cityFacadeHash(vec2(suite+floorGroup*31.+587.,seed+881.)));
 return max(floorLit*max(max(suiteLit,wholeLit),normalLit),cityFacadeWindowAccent(cell,seed).x);
}
float cityFacadeBounceTap(vec2 pattern){
 vec2 atlasUV=cityFacadeAtlasFromPattern(pattern);
 #ifdef CITY_FACADE_GRADIENT
 // A small world-space filter softens each tap; taking derivatives before
 // atlas wrapping also prevents light leaking between architectural families.
 vec2 footprint=.45/cityFacadePeriod()*vec2(240.,496.)/1024.;
 float mask=textureGrad(cityFacadeWindows,atlasUV,vec2(footprint.x,0.),vec2(0.,footprint.y)).r;
 #else
 float mask=texture2D(cityFacadeWindows,atlasUV,1.5).r;
 #endif
 return mask*cityFacadeRoomLit(pattern);
}
#endif
#ifdef ALBEDO
vec4 cityFacadeAlbedo(vec2 uv){
 #ifdef CITY_FACADE_VARIETY
 vec2 pattern=cityFacadePattern(uv),grid=cityFacadeGrid();
 vec4 facadeTexel=cityFacadeSample(cityFacadeAtlas,pattern);
 cityFacadeRoughness=facadeTexel.a;
 // Alpha is a linear mixture of glass (.333) and wall (.780), not a
 // binary class after mip filtering. Recover area coverage continuously.
 float glazing=clamp((.780-facadeTexel.a)/(.780-.333),0.,1.);
 float glassRoughness=clamp(vCityFacadeGlass.a*.52,.14,.24);
 float luminance=dot(toLinearSpace(facadeTexel.rgb),vec3(.2126,.7152,.0722));
 float wallDetail=clamp(luminance/.48,.78,1.10),glassDetail=clamp(luminance/.105,.94,1.06);
 float unresolved=0.,rowsUnresolved=0.;
 #ifdef CITY_FACADE_GRADIENT
 vec2 cellDX=dFdx(pattern*grid),cellDY=dFdy(pattern*grid);
 unresolved=smoothstep(.35,1.2,max(length(cellDX),length(cellDY)));
 rowsUnresolved=smoothstep(.35,1.2,length(vec2(cellDX.y,cellDY.y)));
 #endif
 // World-Y layering, see FACADE_RELIEF. city_mesh.py writes v = z/24 and the
 // glTF export flips V, so height above the block base is (1-v)*24; the wall
 // itself starts above the separate shopfront glazing (v max = 1-3.5/24).
 float seed=cityFacadeStableSeed(),family=floor(vCityFacadeInfo.x),height=(1.-uv.y)*24.,row=floor(pattern.y*grid.y);
 float office=1.-step(1.5,family),plantPeriod=${FACADE_RELIEF.plantMinPeriod.toFixed(1)}+mod(seed,${FACADE_RELIEF.plantPeriodSpan.toFixed(1)});
 float plant=office*step(${(1-FACADE_RELIEF.plantRate).toFixed(2)},cityFacadeHash(vec2(seed,131.)))*step(12.,height)*step(mod(row+floor(seed/5.),plantPeriod),.5)*(1.-rowsUnresolved);
 float groundT=smoothstep(3.,${FACADE_RELIEF.groundTop.toFixed(1)},height),groundWall=mix(${FACADE_RELIEF.groundFloor.toFixed(2)},1.,groundT);
 glazing*=1.-plant;
 // Reveal: atlas panes start near the cell top (small fract = high z), so the
 // strip under the lintel sees neither sky nor sun. Applied to the glass tint
 // and, via cityFacadeSky, to the image-based terms; fades with resolution.
 vec2 paneUV=fract(pattern*grid)-.5;
 float lintel=(1.-smoothstep(-.46,-.10,paneUV.y))*glazing*(1.-unresolved);
 vec3 wall=vCityFacadeTheme*wallDetail*mix(1.,${FACADE_RELIEF.plantWall.toFixed(2)},plant)*groundWall;
 vec3 glass=vCityFacadeGlass.rgb*glassDetail*.32*mix(.86,1.,groundT)*(1.-${FACADE_RELIEF.lintelShade.toFixed(2)}*lintel);
 cityFacadeSky=mix(cityFacadeSkyFloor,1.,smoothstep(0.,${FACADE_RELIEF.skyTop.toFixed(1)},height))*(1.-${FACADE_RELIEF.lintelShade.toFixed(2)}*lintel);
 float recessField=glazing;
 #ifdef CITY_FACADE_GRADIENT
 // Height field for the reveal slope: a ~2 texel footprint so the edge spans
 // 2–3 px at street distance instead of a 1 px line; beyond that the pixel
 // footprint dominates and the field is as smooth as the visible glazing.
 vec2 reliefFootprint=max(max(abs(dFdx(pattern)),abs(dFdy(pattern))),vec2(${FACADE_RELIEF.recessRamp.toFixed(2)})/cityFacadePeriod())*vec2(240.,496.)/1024.;
 recessField=clamp((.780-textureGrad(cityFacadeAtlas,cityFacadeAtlasFromPattern(pattern),vec2(reliefFootprint.x,0.),vec2(0.,reliefFootprint.y)).a)/(.780-.333),0.,1.)*(1.-plant);
 #endif
 cityFacadeRecess=recessField;

 vec3 surface=mix(wall,glass,glazing);
 #ifdef CITY_FACADE_GRADIENT
 // At subpixel size show the building's mean reflectance, not a black/white grid.
 float meanGlass=.568;
 if(family>.5)meanGlass=.475;if(family>1.5)meanGlass=.311;if(family>2.5)meanGlass=.406;
 if(family>3.5)meanGlass=.355;if(family>4.5)meanGlass=.232;if(family>5.5)meanGlass=.263;if(family>6.5)meanGlass=.411;
 vec3 meanSurface=mix(vCityFacadeTheme*groundWall,vCityFacadeGlass.rgb*.32,meanGlass);
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
 cityFacadeGlazing=glazing;cityFacadeSolid=plant;cityFacadeCell=floor(pattern*grid);cityFacadeResolved=1.-unresolved;
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
 vec2 cell=floor(pattern*cityFacadeGrid());
 float seed=cityFacadeStableSeed();
 vec2 accent=cityFacadeWindowAccent(cell,seed);
 float family=floor(vCityFacadeInfo.x),office=1.-step(1.5,family),industrial=step(5.5,family)*(1.-step(6.5,family));
 float suiteWidth=mix(mix(2.,4.,industrial),3.+mod(seed,3.),office);
 float floorGroup=floor(cell.y/mix(1.,2.,office)),suite=floor((cell.x+mod(seed,3.))/suiteWidth);
 float floorP=vCityFacadeActivity.y*mix(.34,1.,cityFacadeNight),suiteP=vCityFacadeActivity.z,wholeP=vCityFacadeActivity.w*mix(.30,1.,cityFacadeNight);
 float floorLit=1.-step(floorP,cityFacadeHash(vec2(floorGroup+71.,seed+53.)));
 float suiteLit=1.-step(suiteP,cityFacadeHash(vec2(suite+floorGroup*23.,seed+193.)));
 float wholeLit=1.-step(wholeP,cityFacadeHash(vec2(floorGroup+113.,seed+317.)));
 float normalP=mix(${NORMAL_WINDOW_FILL.dusk.toFixed(2)},${NORMAL_WINDOW_FILL.night.toFixed(2)},cityFacadeNight);
 float normalLit=1.-step(normalP,cityFacadeHash(vec2(suite+floorGroup*31.+587.,seed+881.)));
 float suiteExpected=1.-(1.-suiteP)*(1.-normalP);
 float baseExpected=floorP*(wholeP+(1.-wholeP)*suiteExpected);
 float suiteFade=0.,floorFade=0.,paneFade=0.;
 #ifdef CITY_FACADE_GRADIENT
 vec2 windowDX=dFdx(pattern*cityFacadeGrid()),windowDY=dFdy(pattern*cityFacadeGrid());
 // A grazing view can compress suites horizontally while each floor is
 // still several pixels tall. Filter those gates independently so a dark
 // resolved floor never receives the whole building's average emission.
 suiteFade=smoothstep(.65,1.4,length(vec2(windowDX.x,windowDY.x))/suiteWidth);
 floorFade=smoothstep(.65,1.4,length(vec2(windowDX.y,windowDY.y))/mix(1.,2.,office));
 paneFade=smoothstep(.55,1.25,max(length(windowDX),length(windowDY)));
 #endif
 float subpixel=max(suiteFade,floorFade);
 float suites=mix(max(suiteLit,normalLit),suiteExpected,suiteFade);
 float baseLit=mix(floorLit*max(wholeLit,suites),baseExpected,floorFade);
 float accentLit=mix(accent.x,${RARE_WINDOW_LIGHT_RATE.toFixed(8)},paneFade);
 float lit=1.-(1.-baseLit)*(1.-accentLit);
 vec3 variation=cityFacadeWindowVariation(cell,seed)*vec3(mix(1.,1.22,accent.x),mix(1.,1.12,accent.x),1.);
 variation=mix(variation,vec3(1.),paneFade);
 vec3 stencil=vec3(cityFacadeWindowSample(pattern,variation.z));
 // Interior variety: blinds and curtains dim individual panes and the visible
 // room is brightest near the pane centre, so lit windows stop reading as a
 // barcode of identical white blocks. Both terms fade to their mean once panes
 // fall below pixel size, keeping the far-field energy the CPU mirror expects.
 vec2 paneUV=fract(pattern*cityFacadeGrid())-.5;
 float blind=cityFacadeHash(vec2(cell.x*1.7+seed*.031+911.,cell.y*2.3+seed*.017+1213.));
 float curtain=mix(.28,1.,smoothstep(.12,.92,blind));
 float interior=mix(.66,1.,1.-smoothstep(.12,.52,length(paneUV*vec2(1.,.85))));
 float paneShade=mix(curtain*interior,.52,paneFade);
 // Mechanical floors are solid louvres: no room, no light.
 float coverage=stencil.r*lit*paneShade*(1.-cityFacadeSolid);
 float roomBrightness=mix(mix(.86,1.08,cityFacadeHash(vec2(suite+floorGroup*7.,seed+419.))),1.,subpixel);
 float radiance=mix(vCityFacadeActivity.x,vCityFacadeLight.a*${NIGHT_EMISSION_GAIN.toFixed(2)},cityFacadeNight)*roomBrightness*cityFacadeGlow.x*variation.x;
 // Bloom extracts only the HDR shoulder. Vary that excess independently while
 // preserving the main window exposure and the shared post-process threshold.
 radiance+=max(0.,radiance-.9)*(variation.y-1.);
 vec3 windowLight=cityFacadeWindowLight(vCityFacadeLight.rgb,cell,seed,paneFade);
 cityFacadeRadiance=windowLight*coverage*radiance;
 // Approximate short-range diffuse bounce on this facade, separately from
 // the optical bloom. The original sharp window mask still owns emission.
 // Without screen derivatives we cannot safely suppress far-field bounce.
 float resolved=0.;
 #ifdef CITY_FACADE_GRADIENT
 resolved=1.-smoothstep(.18,.65,max(length(windowDX),length(windowDY)));
 #endif
 if(resolved>.01&&cityFacadeGlow.y>0.){
  vec2 spread=.65/cityFacadePeriod();
  float halo=(cityFacadeBounceTap(pattern+spread)+cityFacadeBounceTap(pattern-spread)+cityFacadeBounceTap(pattern+vec2(spread.x,-spread.y))+cityFacadeBounceTap(pattern+vec2(-spread.x,spread.y)))*.25;
  cityFacadeBounce=windowLight*radiance*halo*(1.-stencil.r)*resolved*cityFacadeGlow.y;
 }
 return cityFacadeRadiance;
 #else
 return texture2D(emissiveSampler,uv).rgb;
 #endif
}
#endif
`;

type Shared={albedo:Texture;windows:Texture;ready:boolean;night:boolean;mode?:CinematicLightingMode;failures:string[]};
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
 override getUniforms(){return {ubo:[{name:'cityFacadeNight',size:1,type:'float'},{name:'cityFacadeGlow',size:2,type:'vec2'},{name:'cityFacadeSkyFloor',size:1,type:'float'}],fragment:'#ifdef CITY_FACADE_VARIETY\nuniform float cityFacadeNight;\nuniform vec2 cityFacadeGlow;\nuniform float cityFacadeSkyFloor;\n#endif'};}
 override bindForSubMesh(buffer:UniformBuffer,_scene:Scene,_engine:AbstractEngine,_subMesh:SubMesh){const mode=this.shared.mode??(this.shared.night?'night':'sunset');buffer.updateFloat('cityFacadeNight',this.shared.night?1:0);buffer.updateFloat2('cityFacadeGlow',mode==='day'?0:mode==='sunset'?DUSK_EMISSION_GAIN:1,mode==='day'?0:WINDOW_BOUNCE_GAIN);buffer.updateFloat('cityFacadeSkyFloor',mode==='day'?FACADE_RELIEF.skyFloorDay:FACADE_RELIEF.skyFloor);buffer.setTexture('cityFacadeAtlas',this.shared.albedo);buffer.setTexture('cityFacadeWindows',this.shared.windows);}
 override getActiveTextures(active:BaseTexture[]){active.push(this.shared.albedo,this.shared.windows);}
 override hasTexture(texture:BaseTexture){return texture===this.shared.albedo||texture===this.shared.windows;}
 override getCustomCode(type:string):Record<string,string>|null{
  if(type==='vertex')return {CUSTOM_VERTEX_DEFINITIONS:'#ifdef CITY_FACADE_VARIETY\n#ifdef CITY_FACADE_GRADIENT\nflat varying vec2 vCityFacadeInfo;\n#else\nvarying vec2 vCityFacadeInfo;\n#endif\nvarying vec3 vCityFacadeTheme;\nvarying vec4 vCityFacadeLight;\nvarying vec4 vCityFacadeGlass;\nvarying vec4 vCityFacadeActivity;\n'+THEME_GLSL+'\n#endif',CUSTOM_VERTEX_MAIN_END:'#ifdef CITY_FACADE_VARIETY\nvCityFacadeInfo=uv2;\nvCityFacadeTheme=cityFacadeThemeFrom(uv2);\nvCityFacadeLight=cityFacadeLightFrom(uv2);\nvCityFacadeGlass=cityFacadeGlassFrom(uv2);\nvCityFacadeActivity=cityFacadeActivityFrom(uv2);\n#endif'};
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_DEFINITIONS:GLSL,
   CUSTOM_FRAGMENT_UPDATE_ALBEDO:'#ifdef CITY_FACADE_VARIETY\n// Whole-building linear theme replaces legacy per-vertex palette multiplication.\nsurfaceAlbedo=cityFacadeSurfaceLinear;\n#endif',
   // Runs after the albedo hook (which fills the relief globals) and before
   // normalW feeds NdotV, the reflection vector and every light.
   CUSTOM_FRAGMENT_BEFORE_LIGHTS:'#if defined(CITY_FACADE_VARIETY) && defined(CITY_FACADE_GRADIENT) && defined(NORMAL)\nnormalW=cityFacadeRelief(normalW);\n#endif',
   CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:'#if defined(CITY_FACADE_VARIETY) && defined(EMISSIVE)\nfinalEmissive=cityFacadeRadiance;\nfinalDiffuse+=surfaceAlbedo*cityFacadeBounce;\n#endif\n'+
    // Sky-visibility occlusion on image-based terms only; sun and hemisphere stay.
    '#if defined(CITY_FACADE_VARIETY) && defined(REFLECTION) && !defined(UNLIT)\nfinalIrradiance*=cityFacadeSky;finalRadianceScaled*=cityFacadeSky;\n#endif',
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
 function setMode(mode:CinematicLightingMode){shared.mode=mode;shared.night=mode==='night';}
 return {applyMeshes,setMode,setNight:(night:boolean)=>setMode(night?'night':'sunset'),stats:()=>({ready:shared.ready,failures:[...shared.failures],managedMaterials:plugins.size,assignments,families:8,extraTextureBytesWithMipmaps:6990506,newDrawCalls:0,night:shared.night,buildingThemes:12,themeScope:'stable metadata building group; ordinary marked walls only; all named landmarks excluded',legacyVertexTint:'neutralized after multiply on themed walls',windowRadiance:'building-level HDR/color temperature; grouped suites/floors; glazing-only',normalWindowFill:{...NORMAL_WINDOW_FILL,grouping:'suite/floor groups',role:'dominant ordinary fluorescent/warm-white light'},rareWindowColors:{rate:RARE_WINDOW_LIGHT_RATE,motif:[...ACCENT_WINDOW_MOTIF],quota:{red:2,blue:2,green:2},palette:['red','blue','green'],forcedLit:true,hdrBoost:1.22,bloomBoost:1.12,scope:'resolved ordinary-building panes only',landmarkExclusions:['pingan','bamboo']},windowOpticalVariation:{hdr:[...WINDOW_HDR_SCALES],bloom:[...WINDOW_BLOOM_SCALES],kernel:[...WINDOW_KERNEL_SCALES],stable:true,scope:'ordinary-building panes only'},atlasMipDerivatives:'continuous pattern on WebGL2',seedStability:'flat varying + integer rounding + bounded hash + quantized face',
  windowEmissionGain:{dusk:DUSK_EMISSION_GAIN,night:NIGHT_EMISSION_GAIN},
  relief:{...FACADE_RELIEF,scope:'ordinary marked walls; analytic per-pixel, no normal/AO texture, no new attribute or pass',skyOcclusionAppliesTo:'environment irradiance and reflection only'},
  windowRadianceRange:{dusk:[.62,1.96],night:[1.54,3.51],accentMultiplier:[1.12,1.3664]},mode:shared.mode??'sunset',
  windowBounce:{scope:'same-facade diffuse approximation; no ground or cross-building spill',gain:shared.mode==='day'?0:WINDOW_BOUNCE_GAIN,extraMaskSamples:4,farFieldFade:true},windowGrouping:'office 3–5 bays × 2 floors; ordinary-light fill only on active floors; home two-window units',windowFarField:'filter horizontal suites and vertical floors independently; average pane tint and energy only when unresolved'})};
}
