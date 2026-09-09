import {Color3,PBRMaterial,RawTexture,Texture,type AbstractMesh,type Scene} from '@babylonjs/core';

/** Hero-only surface finishing; existing licensed body/wheel geometry, UVs,
 * fitted number plate and light lenses are retained. The red pigment and
 * smooth dielectric clearcoat are calibrated separately in linear space. */
export function refineHeroVehicleMaterials(scene:Scene,meshes:readonly AbstractMesh[]){
 const size=128;
 function grain(name:string,variation:number,repeats:number){const data=new Uint8Array(size*size*3);let seed=47919;for(let i=0;i<data.length;i+=3){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=128+Math.round(((seed&255)/255-.5)*variation);data[i+1]=128+Math.round((((seed>>>8)&255)/255-.5)*variation);data[i+2]=255;}const texture=RawTexture.CreateRGBTexture(data,size,size,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);texture.name=name;texture.gammaSpace=false;texture.uScale=repeats;texture.vScale=repeats;texture.wrapU=Texture.WRAP_ADDRESSMODE;texture.wrapV=Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=4;return texture;}
 const paintGrain=grain('hero-paint-microfinish',5,28),rubberGrain=grain('hero-rubber-grain',28,14);paintGrain.level=.055;rubberGrain.level=.2;
 const changed:string[]=[];
 for(const material of new Set(meshes.map(m=>m.material))){if(!(material instanceof PBRMaterial))continue;
  const name=material.name.replace(/\.\d+$/,'');
  if(name==='carpaint'){material.albedoColor=Color3.FromHexString('#B91925').toLinearSpace();material.metallic=.25;material.roughness=.30;material.environmentIntensity=.8;material.specularIntensity=1;material.clearCoat.isEnabled=true;material.clearCoat.intensity=1;material.clearCoat.roughness=.12;material.clearCoat.indexOfRefraction=1.5;material.clearCoat.bumpTexture=null;material.bumpTexture=paintGrain;}
  else if(name==='car_glass'){
   // Its depth-only and MRT colour passes have different fragment outputs.
   // Never reuse the previous pass's effect while this variant is compiling.
   material.allowShaderHotSwapping=false;material.albedoColor=new Color3(.018,.021,.024);material.alpha=.72;material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;material.needDepthPrePass=true;material.metallic=0;material.roughness=.12;material.environmentIntensity=1.05;material.specularIntensity=.88;material.indexOfRefraction=1.5;}
  else if(name==='car_chrome'){material.albedoColor=new Color3(.58,.62,.65);material.metallic=1;material.roughness=.2;}
  else if(name==='wheel_alloy'){material.albedoColor=new Color3(.38,.43,.47);material.metallic=.92;material.roughness=.27;}
  else if(name==='wheel_rubber'){material.albedoColor=new Color3(.021,.024,.027);material.roughness=.84;material.bumpTexture=rubberGrain;}
  else continue;
  material.enableSpecularAntiAliasing=true;changed.push(name);
 }
 return {get stats(){return {materials:changed,normalMaps:2,textureResolution:[size,size],glassAlpha:.72,paintSrgb:'#B91925',paintLayers:'red metallic pigment / smooth neutral dielectric clearcoat',sourceExteriorCurves:true};},dispose(){paintGrain.dispose();rubberGrain.dispose();}};
}
