import {Constants,MaterialPluginBase,PBRMaterial,RawTexture,ShaderLanguage,Texture,type AbstractMesh,type MaterialDefines,type Scene,type UniformBuffer,type AbstractEngine,type SubMesh,type BaseTexture} from '@babylonjs/core';
import type {CinematicLightingMode} from './city-daylight.ts';

/** City-scale ambient occlusion for ground, walls and roofs. Screen-space AO reaches 2.5 m and is off from
 * the drone; sun shadows stop at the shadow box. What was missing is the city's own shadow falloff: dark
 * alleys, tower bases and podium roofs against open plazas and boulevards. That field is baked once from
 * the footprints (scripts/prepare_city_ambient.mjs → public/city/ambient/occlusion.png, sky visibility at
 * 0/12/40 m, 4 m/px) and read here with one texture fetch on the existing draw: no pass, buffer or
 * geometry. It scales image-based light fully and direct light by a small mode-dependent share, so sunlit
 * faces keep their shadow-map contrast while shade deepens where the city closes in.
 */
export type AmbientMeta={version:number;file:string;cell:number;minX:number;minZ:number;width:number;height:number;heights:number[];fadeTop:number};
export type AmbientSurface='ground'|'wall'|'roof';
type Shared={map:RawTexture|null;origin:[number,number];size:[number,number];heights:[number,number,number];fadeTop:number;direct:number;ready:boolean;enabled:boolean;failures:string[]};

/** Strength = how much of the baked occlusion applies; inset = metres the sample moves against the surface
 * normal (walls read the self-excluded field inside their own footprint rather than the pavement at the
 * kerb). Direct = share applied to sun + hemisphere; none at night, where finalDiffuse is street lamps. */
export const CITY_AMBIENT_LOOK={
 ground:{strength:.85,inset:0},
 wall:{strength:.60,inset:2.0},
 roof:{strength:.70,inset:0},
 direct:{day:.30,sunset:.24,night:0} as Record<CinematicLightingMode,number>,
} as const;
const META_URL='/city/ambient/occlusion.json';

const GLSL=String.raw`
#ifdef CITY_AMBIENT
uniform sampler2D cityAmbientMap;
// Sky visibility for a receiver at world p with normal n: three baked heights blended by world height,
// fading to open sky above the last one. Outside the raster the city is absent, so nothing is occluded.
float cityAmbientAt(vec3 p,vec3 n){
 vec2 uv=(p.xz-n.xz*cityAmbientParams.y-cityAmbientOrigin)/cityAmbientSize;
 if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return 1.;
 vec3 s=texture2D(cityAmbientMap,uv).rgb;
 float y=max(p.y,0.),h0=cityAmbientHeights.x,h1=cityAmbientHeights.y,h2=cityAmbientHeights.z;
 float ao=y<h1?mix(s.r,s.g,clamp((y-h0)/(h1-h0),0.,1.)):mix(s.g,s.b,clamp((y-h1)/(h2-h1),0.,1.));
 ao=mix(ao,1.,smoothstep(h2,cityAmbientHeights.w,y));
 return mix(1.,ao,cityAmbientParams.x);
}
#endif
`;

export class CityAmbientPlugin extends MaterialPluginBase{
 constructor(material:PBRMaterial,private shared:Shared,readonly surface:AmbientSurface){super(material,'CityAmbient',190,{CITY_AMBIENT:false},true,true,true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override prepareDefines(defines:MaterialDefines,_scene:Scene,_mesh:AbstractMesh){(defines as MaterialDefines&{CITY_AMBIENT:boolean}).CITY_AMBIENT=this.shared.ready&&this.shared.enabled;}
 override getSamplers(samplers:string[]){samplers.push('cityAmbientMap');}
 override getUniforms(){return {ubo:[{name:'cityAmbientOrigin',size:2,type:'vec2'},{name:'cityAmbientSize',size:2,type:'vec2'},{name:'cityAmbientParams',size:3,type:'vec3'},{name:'cityAmbientHeights',size:4,type:'vec4'}],
  fragment:'#ifdef CITY_AMBIENT\nuniform vec2 cityAmbientOrigin;\nuniform vec2 cityAmbientSize;\nuniform vec3 cityAmbientParams;\nuniform vec4 cityAmbientHeights;\n#endif'};}
 override bindForSubMesh(buffer:UniformBuffer,_scene:Scene,_engine:AbstractEngine,_subMesh:SubMesh){
  const s=this.shared,look=CITY_AMBIENT_LOOK[this.surface];
  buffer.updateFloat2('cityAmbientOrigin',s.origin[0],s.origin[1]);buffer.updateFloat2('cityAmbientSize',s.size[0],s.size[1]);
  buffer.updateFloat3('cityAmbientParams',look.strength,look.inset,s.direct);buffer.updateFloat4('cityAmbientHeights',s.heights[0],s.heights[1],s.heights[2],s.fadeTop);
  if(s.map)buffer.setTexture('cityAmbientMap',s.map);
 }
 override getActiveTextures(active:BaseTexture[]){if(this.shared.map)active.push(this.shared.map);}
 override hasTexture(texture:BaseTexture){return texture===this.shared.map;}
 override getCustomCode(type:string):Record<string,string>|null{
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_DEFINITIONS:GLSL,
   CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:String.raw`#ifdef CITY_AMBIENT
{
 float cityAo=cityAmbientAt(vPositionW,normalW);
#if defined(REFLECTION) && !defined(UNLIT)
 finalIrradiance*=cityAo;finalRadianceScaled*=cityAo;
#endif
 finalAmbient*=cityAo;
 finalDiffuse*=mix(1.,cityAo,cityAmbientParams.z);
}
#endif`};
 }
}

/** Decode the RGB PNG into an RGB8 trilinear texture (row 0 = minZ, no Y flip; values are data, not colour). */
async function loadMap(scene:Scene,meta:AmbientMeta,url:string){
 const response=await fetch(url);if(!response.ok)throw Error('Ambient map unavailable: '+response.status);
 const bitmap=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
 if(bitmap.width!==meta.width||bitmap.height!==meta.height)throw Error(`Ambient map size ${bitmap.width}×${bitmap.height} ≠ meta ${meta.width}×${meta.height}`);
 const canvas=new OffscreenCanvas(meta.width,meta.height),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('2d context unavailable');
 ctx.drawImage(bitmap,0,0);bitmap.close();
 const rgba=ctx.getImageData(0,0,meta.width,meta.height).data,data=new Uint8Array(meta.width*meta.height*3);
 let sum=0;for(let i=0,n=meta.width*meta.height;i<n;i++){data[i*3]=rgba[i*4];data[i*3+1]=rgba[i*4+1];data[i*3+2]=rgba[i*4+2];sum+=rgba[i*4];}
 const texture=new RawTexture(data,meta.width,meta.height,Constants.TEXTUREFORMAT_RGB,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE,Constants.TEXTURETYPE_UNSIGNED_BYTE);
 texture.name='city-ambient-occlusion';texture.wrapU=Texture.CLAMP_ADDRESSMODE;texture.wrapV=Texture.CLAMP_ADDRESSMODE;
 return {texture,meanGround:sum/(meta.width*meta.height*255)};
}

/** Create before any material is attached; `load()` fetches the meta + map and lights every plugin up. */
export function createCityAmbient(scene:Scene){
 const shared:Shared={map:null,origin:[0,0],size:[1,1],heights:[0,12,40],fadeTop:150,direct:CITY_AMBIENT_LOOK.direct.sunset,ready:false,enabled:true,failures:[]};
 const plugins=new Map<PBRMaterial,CityAmbientPlugin>();let meta:AmbientMeta|null=null,meanGround=1;
 const refresh=()=>{for(const p of plugins.values())p.markAllDefinesAsDirty();};
 function attach(material:PBRMaterial,surface:AmbientSurface){if(!plugins.has(material))plugins.set(material,new CityAmbientPlugin(material,shared,surface));}
 async function load(metaUrl=META_URL){
  try{
   const response=await fetch(metaUrl);if(!response.ok)throw Error('Ambient meta unavailable: '+response.status);
   const m:AmbientMeta=await response.json();if(m.version!==1||m.heights?.length!==3)throw Error('Ambient meta version unsupported');
   const result=await loadMap(scene,m,metaUrl.replace(/[^/]*$/,'')+m.file);if(scene.isDisposed){result.texture.dispose();return;}
   meta=m;shared.map=result.texture;meanGround=result.meanGround;shared.origin=[m.minX,m.minZ];shared.size=[m.width*m.cell,m.height*m.cell];shared.heights=[m.heights[0],m.heights[1],m.heights[2]];shared.fadeTop=m.fadeTop;shared.ready=true;refresh();
  }catch(error){shared.failures.push(String(error));shared.ready=false;refresh();}
 }
 function setMode(mode:CinematicLightingMode){shared.direct=CITY_AMBIENT_LOOK.direct[mode];}
 /** Look-dev / profiling: disable to measure or A/B the layer without unloading it. */
 function setEnabled(enabled:boolean){if(shared.enabled===enabled)return;shared.enabled=enabled;refresh();}
 scene.onDisposeObservable.addOnce(()=>{shared.map?.dispose();plugins.clear();});
 return {attach,load,setMode,setEnabled,
  stats:()=>({ready:shared.ready,enabled:shared.enabled,failures:[...shared.failures],materials:plugins.size,surfaces:Object.fromEntries((['ground','wall','roof'] as AmbientSurface[]).map(s=>[s,[...plugins.values()].filter(p=>p.surface===s).length])),
   map:meta?{...meta,gpuBytes:Math.round(meta.width*meta.height*3*4/3),meanGroundVisibility:+meanGround.toFixed(3)}:null,look:CITY_AMBIENT_LOOK,direct:shared.direct})};
}
