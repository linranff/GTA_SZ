import {Color3,DynamicTexture,MaterialPluginBase,Matrix,Mesh,PBRMaterial,ShaderLanguage,Texture,Vector3,Quaternion,type AbstractEngine,type AbstractMesh,type BaseTexture,type MaterialDefines,type Scene,type SubMesh,type UniformBuffer} from '@babylonjs/core';
import type {ParkLight} from './city-coastal-infrastructure.ts';
type State={texture:DynamicTexture;x:number;z:number;night:number};
class PublicLightField extends MaterialPluginBase{
 constructor(material:PBRMaterial,private state:State){super(material,'CityPublicLightField',210,{CITY_PUBLIC_LIGHT_FIELD:true},true,true,true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override prepareDefines(d:MaterialDefines){(d as MaterialDefines&{CITY_PUBLIC_LIGHT_FIELD:boolean}).CITY_PUBLIC_LIGHT_FIELD=true;}
 override getSamplers(s:string[]){s.push('cityPublicIrradiance');}
 override getUniforms(){return {ubo:[{name:'cityLightField',size:4,type:'vec4'}],fragment:'uniform vec4 cityLightField;'};}
 override bindForSubMesh(buffer:UniformBuffer,_scene:Scene,_engine:AbstractEngine,_sub:SubMesh){buffer.updateFloat4('cityLightField',this.state.x,this.state.z,2048,this.state.night);buffer.setTexture('cityPublicIrradiance',this.state.texture);}
 override getActiveTextures(textures:BaseTexture[]){textures.push(this.state.texture);}
 override hasTexture(texture:BaseTexture){return texture===this.state.texture;}
 override getCustomCode(type:string){if(type!=='fragment')return null;return {CUSTOM_FRAGMENT_DEFINITIONS:'uniform sampler2D cityPublicIrradiance;',CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
   vec2 publicUV=(vPositionW.xz-cityLightField.xy)/cityLightField.z+.5;
   float publicInside=1.-smoothstep(.42,.49,max(abs(publicUV.x-.5),abs(publicUV.y-.5)));
   vec3 publicLux=texture2D(cityPublicIrradiance,publicUV).rgb;
   // Incident diffuse irradiance on the receiver, not an emissive ground decal.
   finalDiffuse+=surfaceAlbedo*publicLux*cityLightField.w*publicInside*max(0.,normalW.y)*3.6;
  `};}
}
/** Stable world-space illumination for every nearby street/park lamp.
 * One clipmap upload per 256m cell, never a per-frame moving light decal.
 * Two pooled real lights remain responsible for nearby specular highlights.
 */
export function createPublicLighting(scene:Scene,lamps:number[][],parks:ParkLight[],templates:AbstractMesh[],heightAt:(x:number,z:number)=>number){
 const texture=new DynamicTexture('public-ground-irradiance',{width:1024,height:1024},scene,true,Texture.TRILINEAR_SAMPLINGMODE);texture.gammaSpace=false;texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;texture.anisotropicFilteringLevel=4;
 const state:State={texture,x:1e9,z:1e9,night:0},materials=new Set<PBRMaterial>();let uploads=0,visiblePoles=0,lastScan=0;
 const poles=templates.filter(m=>m instanceof Mesh&&m.getTotalVertices()>0) as Mesh[];for(const m of poles){
  // Normalize the reusable GLB before applying game-space instance transforms.
  // Meshopt exports node scale/translation, which must not scale lamp positions.
  const transform=m.computeWorldMatrix(true).clone();m.unfreezeWorldMatrix();m.parent=null;m.makeGeometryUnique();m.bakeTransformIntoVertices(transform);m.position.setAll(0);m.scaling.setAll(1);m.rotationQuaternion=Quaternion.Identity();m.computeWorldMatrix(true);
  m.isPickable=false;m.receiveShadows=true;m.setEnabled(false);
 }
 const fields=lamps.map(l=>({x:l[0]-l[2]*2.5,z:l[1]-l[3]*2.5,radius:20,color:[1,.65,.34],power:.72})).concat(parks.map(p=>({x:p.x,z:p.z,radius:p.radius,color:p.color,power:p.power})));
 function attach(){for(const mesh of scene.meshes){if(!/^(?:roads_|terrain_(?:land|park|pavement)|ground_relief_|detail_lianhua_|rain-|rain_|coastal_bridge_|city_meadow_)/.test(mesh.name))continue;const m=mesh.material;if(m instanceof PBRMaterial&&!materials.has(m)){materials.add(m);new PublicLightField(m,state);}}}
 function setNight(night:boolean){state.night=night?1:.17;for(const mesh of poles){const m=mesh.material;if(m instanceof PBRMaterial&&/^lamp/.test(m.name)){m.emissiveColor.copyFrom(new Color3(.76,.84,1).scale(night?2.1:.45));m.emissiveIntensity=1;}}}
 function setMode(mode:'sunset'|'night'|'day'){setNight(mode==='night');if(mode==='day'){state.night=0;for(const mesh of poles){const m=mesh.material;if(m instanceof PBRMaterial&&/^lamp/.test(m.name))m.emissiveIntensity=0;}}}
 function update(x:number,z:number,force=false){
  if(performance.now()-lastScan>2500){lastScan=performance.now();attach();}
  const cx=Math.round(x/256)*256,cz=Math.round(z/256)*256;if(!force&&cx===state.x&&cz===state.z)return;
  const ctx=texture.getContext() as CanvasRenderingContext2D;ctx.globalCompositeOperation='source-over';ctx.fillStyle='black';ctx.fillRect(0,0,1024,1024);ctx.globalCompositeOperation='lighter';
  for(const l of fields){const px=(l.x-cx)/2+512,pz=(l.z-cz)/2+512,r=l.radius/2;if(px< -r||px>1024+r||pz< -r||pz>1024+r)continue;const col=l.color.map(v=>Math.round(v*l.power*150)),gradient=ctx.createRadialGradient(px,pz,0,px,pz,r);gradient.addColorStop(0,`rgba(${col.join(',')},1)`);gradient.addColorStop(.35,`rgba(${col.join(',')},.75)`);gradient.addColorStop(.72,`rgba(${col.join(',')},.20)`);gradient.addColorStop(1,`rgba(${col.join(',')},0)`);ctx.fillStyle=gradient;ctx.fillRect(px-r,pz-r,r*2,r*2);}
  ctx.globalCompositeOperation='source-over';texture.update(false,false);state.x=cx;state.z=cz;uploads++;
  const selected=parks.filter(p=>Math.hypot(p.x-x,p.z-z)<950),matrices=new Float32Array(selected.length*16);selected.forEach((p,i)=>Matrix.Translation(p.x,heightAt(p.x,p.z),p.z).copyToArray(matrices,i*16));visiblePoles=selected.length;
  for(const mesh of poles){mesh.setEnabled(selected.length>0);if(selected.length){mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceRefreshBoundingInfo();}}
 }
 function dispose(){texture.dispose();for(const m of poles)m.dispose(false,false);}
 attach();setNight(false);scene.onDisposeObservable.addOnce(dispose);
 return {update,setNight,setMode,meshes:poles,stats:()=>({publicLamps:lamps.length,parkHighLights:parks.length,visiblePoles,groundMaterials:materials.size,clipmapUploads:uploads,clipmapWorldSize:2048,texelMetres:2,night:state.night===1,staticFootprints:true})};
}
