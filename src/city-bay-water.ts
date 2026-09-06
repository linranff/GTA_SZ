import {Color3,Matrix,Mesh,Vector3,VertexData,MaterialPluginBase,PBRMaterial,ShaderLanguage,Texture,VertexBuffer,type AbstractEngine,type AbstractMesh,type BaseTexture,type MaterialDefines,type MirrorTexture,type Scene,type SubMesh,type UniformBuffer} from '@babylonjs/core';
import type {CoastalManifest} from './city-coastal-infrastructure.ts';
type BayState={time:number;night:number;shore:Texture;extent:number[];ready:boolean};
class BaySurface extends MaterialPluginBase{
 constructor(material:PBRMaterial,private state:BayState){super(material,'CityBaySurface',180,{CITY_BAY_SURFACE:true},true,true,true);}
 override isCompatible(l:ShaderLanguage){return l===ShaderLanguage.GLSL;}
 override prepareDefines(d:MaterialDefines){(d as MaterialDefines&{CITY_BAY_SURFACE:boolean}).CITY_BAY_SURFACE=true;}
 override getSamplers(s:string[]){s.push('cityShoreDistance');}
 override getUniforms(){return {ubo:[{name:'cityBayClock',size:4,type:'vec4'},{name:'cityBayExtent',size:4,type:'vec4'}],fragment:'uniform vec4 cityBayClock;uniform vec4 cityBayExtent;'};}
 override bindForSubMesh(b:UniformBuffer,_s:Scene,_e:AbstractEngine,_m:SubMesh){const e=this.state.extent;b.updateFloat4('cityBayClock',this.state.time,this.state.night,this.state.ready?1:0,0);b.updateFloat4('cityBayExtent',e[0],e[1],e[2]-e[0],e[3]-e[1]);b.setTexture('cityShoreDistance',this.state.shore);}
 override getActiveTextures(t:BaseTexture[]){t.push(this.state.shore);}
 override hasTexture(t:BaseTexture){return t===this.state.shore;}
 override getCustomCode(type:string){if(type!=='fragment')return null;return {CUSTOM_FRAGMENT_DEFINITIONS:'uniform sampler2D cityShoreDistance;',
  '!reflectionCoords.y=1\\.0-reflectionCoords.y;':`$0
   // Projection mirrors otherwise ignore wave normals: keep the exact mirror
   // projection and perturb only its sample, never the camera or its timing.
   reflectionCoords+=normalW.xz*vec2(.023,.040)*mix(1.,.30,smoothstep(100.,900.,length(vPositionW-vEyePosition.xyz)));
  `,
  '!reflectionLOD=reflectionLOD\\*vReflectionMicrosurfaceInfos.y\\+vReflectionMicrosurfaceInfos.z;':`$0
   // PBR picks an explicit mip from roughness. Also honour the projected
   // pixel footprint, so distant building/sky reflections cannot undersample.
   #ifndef REFLECTIONMAP_3D
    vec2 bayReflectionDx=dFdx(reflectionCoords)*vReflectionMicrosurfaceInfos.x;
    vec2 bayReflectionDy=dFdy(reflectionCoords)*vReflectionMicrosurfaceInfos.x;
    float bayReflectionPixelLod=.5*log2(max(1.,max(dot(bayReflectionDx,bayReflectionDx),dot(bayReflectionDy,bayReflectionDy))));
    reflectionLOD=max(reflectionLOD,bayReflectionPixelLod);
   #endif
  `,
  '!float roughness=reflectivityOut\\.roughness;':`$0
   // Subpixel waves still scatter light: retain their slope variance as
   // roughness instead of turning distant water into a perfectly flat mirror.
   roughness=sqrt(sqrt(roughness*roughness*roughness*roughness+bayUnresolvedVariance));
   microSurface=1.-roughness;
  `,CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
   vec2 bayUV=(vPositionW.xz-cityBayExtent.xy)/cityBayExtent.zw;
   float shoreInside=step(0.,bayUV.x)*step(bayUV.x,1.)*step(0.,bayUV.y)*step(bayUV.y,1.);
   float shoreDistance=mix(120.,texture2D(cityShoreDistance,bayUV).r*120.,cityBayClock.z*shoreInside);
   vec2 wp=vPositionW.xz;float t=cityBayClock.x;
   // Long, perfectly straight sine fronts read as a radiating grid even when
   // resolved. Slowly bend them at two incommensurate scales, without a noise
   // texture. The pixel filter below sees the warped phase and its derivatives.
   vec2 bayBend=vec2(
    sin(dot(wp,vec2(.017,.011))-t*.060)+.45*sin(dot(wp,vec2(-.031,.007))+t*.041),
    sin(dot(wp,vec2(-.013,.019))+t*.052)+.45*sin(dot(wp,vec2(.006,.029))-t*.047)
   );
   vec2 wavePosition=wp+bayBend*18.;
   float p1=dot(wavePosition,vec2(.092,.171))-t*.72;
   float p2=dot(wavePosition,vec2(-.238,.114))-t*.48;
   float p3=dot(wavePosition,vec2(1.62,.83))-t*1.36;
   float p4=dot(wavePosition,vec2(-.74,2.31))+t*.86;
   // Differentiate unwrapped phases, never cos(phase): sampled normals have
   // already aliased by then. Suppress each frequency before Nyquist (PI
   // radians/pixel), including low waves at grazing angles and drone heights.
   vec4 phase=vec4(p1,p2,p3,p4);
   vec4 waveWeight=1.-smoothstep(vec4(.35),vec4(1.80),fwidth(phase));
   // Preserve close ripples; at overview distances broad sky reflections
   // dominate instead of equally strong crests stretching across the bay.
   float bayResolvedStrength=mix(1.,.08,smoothstep(80.,1100.,length(vPositionW-vEyePosition.xyz)));
   float bayWindPatch=.80+.20*sin(dot(wp,vec2(.0047,-.0061))+bayBend.x*1.5);
   waveWeight*=bayResolvedStrength*bayWindPatch;
   vec2 wind=vec2(.024,.040)*cos(p1)*waveWeight.x+vec2(-.014,.007)*cos(p2)*waveWeight.y;
   wind+=vec2(.010,.006)*cos(p3)*waveWeight.z+vec2(-.005,.012)*cos(p4)*waveWeight.w;
   float bayUnresolvedVariance=dot(vec4(.001088,.0001225,.000068,.0000845),1.-waveWeight*waveWeight);
   normalW=normalize(vec3(wind.x,1.,wind.y));
   float shallows=1.-smoothstep(2.,62.,shoreDistance);
   surfaceAlbedo=mix(vec3(.018,.069,.078),vec3(.060,.126,.113),shallows*.78);
   float foam=(1.-smoothstep(1.5,6.,shoreDistance))*smoothstep(.62,.92,sin(p1*.8+sin(p2))* .5+.5)*.11*min(waveWeight.x,waveWeight.y);
   surfaceAlbedo=mix(surfaceAlbedo,vec3(.32,.34,.30),foam);
  `};}
}
/** Keep compression node transforms while changing only the world-space height. */
export function positionsOnWorldWaterPlane(original:ArrayLike<number>,world:Matrix,height:number){
 const inverse=Matrix.Invert(world),point=new Vector3(),local=new Vector3(),p=new Float32Array(original);
 for(let i=0;i<p.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(p[i],p[i+1],p[i+2],world,point);point.y=height;Vector3.TransformCoordinatesToRef(point,inverse,local);local.toArray(p,i);}
 return p;
}
export function createBayWater(scene:Scene,mirror:MirrorTexture,meshes:AbstractMesh[],meta:CoastalManifest){
 const material=new PBRMaterial('living-bay',scene);material.albedoColor=new Color3(.025,.095,.105);material.metallic=0;material.roughness=.13;material.indexOfRefraction=1.333;material.metallicF0Factor=1;material.reflectionTexture=mirror;material.environmentIntensity=1;material.maxSimultaneousLights=2;material.enableSpecularAntiAliasing=true;material.backFaceCulling=false;
 const state:BayState={time:0,night:0,shore:null as unknown as Texture,extent:meta.shoreDistance.extent,ready:false};state.shore=new Texture(meta.shoreDistance.url,scene,{invertY:false,gammaSpace:false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,onLoad:()=>{state.ready=true;}});state.shore.wrapU=state.shore.wrapV=Texture.CLAMP_ADDRESSMODE;new BaySurface(material,state);
 for(const mesh of meshes){const original=mesh.getVerticesData(VertexBuffer.PositionKind);if(original){mesh.setVerticesData(VertexBuffer.PositionKind,positionsOnWorldWaterPlane(original,mesh.computeWorldMatrix(true),meta.waterHeight),false);mesh.refreshBoundingInfo({applySkeleton:false});}mesh.material=material;mesh.receiveShadows=false;}
 // The original mainland reaches farther north than its water mesh. Starting
 // this ring at water-only bounds put sea just 25cm below that entire backdrop,
 // which produced broad grass/water depth bands in aerial views. Enclose every
 // original terrain surface, including their independent GLB quantization.
 // Opposite-shore mountains are islands above the bay, not part of this edge.
 const terrainMeshes=scene.meshes.filter(m=>m.name.startsWith('terrain_')&&m.getTotalVertices()>0);
 const bounds=(terrainMeshes.length?terrainMeshes:meshes).map(m=>{m.computeWorldMatrix(true);return m.getBoundingInfo().boundingBox;});
 const x0=Math.min(...bounds.map(b=>b.minimumWorld.x)),x1=Math.max(...bounds.map(b=>b.maximumWorld.x));
 const z0=Math.min(...bounds.map(b=>b.minimumWorld.z)),z1=Math.max(...bounds.map(b=>b.maximumWorld.z));
 const extension=new Mesh('bay-horizon-water',scene),v=new VertexData(),positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
 if(bounds.length)for(const [a,b,c,d] of [[-50000,-50000,x0,50000],[x1,-50000,50000,50000],[x0,-50000,x1,z0],[x0,z1,x1,50000]]){
  const offset=positions.length/3;positions.push(a,meta.waterHeight,b,c,meta.waterHeight,b,c,meta.waterHeight,d,a,meta.waterHeight,d);
  normals.push(0,1,0,0,1,0,0,1,0,0,1,0);uvs.push(0,0,1,0,1,1,0,1);indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
 }
 v.positions=positions;v.normals=normals;v.uvs=uvs;v.indices=indices;v.applyToMesh(extension);
 extension.material=material;extension.isPickable=false;extension.receiveShadows=false;extension.freezeWorldMatrix();meshes.push(extension);
 // The existing RTT already has mipmaps; blending adjacent levels prevents
 // reflection shimmer without another reflection pass or a larger texture.
 mirror.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
 mirror.mirrorPlane.d=meta.waterHeight;mirror.level=.92;
 const setNight=(night:boolean)=>{state.night=night?1:0;material.environmentIntensity=night?.78:1;};
 scene.onDisposeObservable.addOnce(()=>{extension.dispose(false,false);state.shore.dispose();material.dispose(false,false);});
 return {material,update:(time:number)=>{state.time=time;},setNight,stats:()=>({meshWorldHeights:meshes.map(m=>({min:m.getBoundingInfo().boundingBox.minimumWorld.y,max:m.getBoundingInfo().boundingBox.maximumWorld.y})),horizonCoverageBounds:bounds.length?[x0,z0,x1,z1]:null,shoreTextureReady:state.ready,waterLevel:meta.waterHeight,planarLevel:mirror.mirrorPlane.d,normalScale:'world-metres, four wind components, pixel-footprint filtered',reflectionFiltering:'trilinear mipmaps with projected pixel footprint',subpixelWaves:'slope variance retained as roughness',lighting:'PBR with moon/sun specular; vehicle headlights excluded',night:!!state.night})};
}
