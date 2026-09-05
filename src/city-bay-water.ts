import {Color3,Matrix,Vector3,MaterialPluginBase,PBRMaterial,ShaderLanguage,Texture,VertexBuffer,type AbstractEngine,type AbstractMesh,type BaseTexture,type MaterialDefines,type MirrorTexture,type Scene,type SubMesh,type UniformBuffer} from '@babylonjs/core';
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
  `,CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
   vec2 bayUV=(vPositionW.xz-cityBayExtent.xy)/cityBayExtent.zw;
   float shoreDistance=mix(120.,texture2D(cityShoreDistance,bayUV).r*120.,cityBayClock.z);
   vec2 wp=vPositionW.xz;float t=cityBayClock.x;
   float p1=dot(wp,vec2(.092,.171))-t*.72;
   float p2=dot(wp,vec2(-.238,.114))-t*.48;
   float p3=dot(wp,vec2(1.62,.83))-t*1.36;
   float p4=dot(wp,vec2(-.74,2.31))+t*.86;
   vec2 wind=vec2(.031,.059)*cos(p1)+vec2(-.020,.009)*cos(p2);
   wind+=vec2(.010,.006)*cos(p3)+vec2(-.005,.012)*cos(p4);
   float fineFade=1.-smoothstep(100.,680.,length(vPositionW-vEyePosition.xyz));
   normalW=normalize(vec3(wind.x*(.55+.45*fineFade),1.,wind.y*(.55+.45*fineFade)));
   float shallows=1.-smoothstep(2.,62.,shoreDistance);
   surfaceAlbedo=mix(vec3(.018,.069,.078),vec3(.060,.126,.113),shallows*.78);
   float foam=(1.-smoothstep(1.5,6.,shoreDistance))*smoothstep(.62,.92,sin(p1*.8+sin(p2))* .5+.5)*.11;
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
 mirror.mirrorPlane.d=meta.waterHeight;mirror.level=.92;
 const setNight=(night:boolean)=>{state.night=night?1:0;material.environmentIntensity=night?.78:1;};
 scene.onDisposeObservable.addOnce(()=>{state.shore.dispose();material.dispose(false,false);});
 return {material,update:(time:number)=>{state.time=time;},setNight,stats:()=>({meshWorldHeights:meshes.map(m=>({min:m.getBoundingInfo().boundingBox.minimumWorld.y,max:m.getBoundingInfo().boundingBox.maximumWorld.y})),shoreTextureReady:state.ready,waterLevel:meta.waterHeight,planarLevel:mirror.mirrorPlane.d,normalScale:'world-metres, four wind components, distance-filtered',lighting:'PBR with moon/sun specular; vehicle headlights excluded',night:!!state.night})};
}
