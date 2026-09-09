import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshBuilder,NullEngine,PBRMaterial,RawTexture,Scene} from '@babylonjs/core';
import {BAMBOO_LOOK_TARGET,createBambooLook} from '../src/city-bamboo-look.ts';

function target(scene:Scene,role:string,material:PBRMaterial){
 const mesh=MeshBuilder.CreateBox('landmark_bamboo_'+role,{width:40,depth:40,height:8},scene);
 mesh.position.set(BAMBOO_LOOK_TARGET.center[0],4,BAMBOO_LOOK_TARGET.center[2]);mesh.material=material;
 return mesh;
}

test('Bamboo A/B restores shared source materials without changing other landmarks or allocating textures',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),source=new PBRMaterial('architecture:landmark-stone',scene);
 const texture=RawTexture.CreateRGBTexture(new Uint8Array([120,130,140]),1,1,scene);
 source.albedoTexture=texture;source.albedoColor.set(.79,.77,.71);
 const podium=target(scene,'stone',source),unrelated=MeshBuilder.CreateBox('landmark_pingan_stone',{},scene);unrelated.material=source;
 const sourceColor=source.albedoColor.clone(),initialTextures=scene.textures.length;
 let textureDisposals=0,sourceDisposals=0;
 texture.onDisposeObservable.add(()=>textureDisposals++);source.onDisposeObservable.add(()=>sourceDisposals++);
 const look=createBambooLook(scene),replacement=podium.material;
 assert.notEqual(replacement,source);assert.equal(unrelated.material,source);
 assert(source.albedoColor.equals(sourceColor));assert.equal(source.albedoTexture,texture);
 assert.equal(scene.textures.length,initialTextures);
 assert.equal(look.stats().activeMeshes,1);
 for(let i=0;i<3;i++){
  look.setEnabled(false);assert.equal(podium.material,source);assert.equal(look.stats().activeMeshes,0);
  look.setEnabled(true);assert.equal(podium.material,replacement);assert.equal(unrelated.material,source);
 }
 look.dispose();look.dispose();assert.equal(podium.material,source);
 assert.equal(sourceDisposals,0);assert.equal(textureDisposals,0);assert.equal(scene.textures.length,initialTextures);
 scene.dispose();engine.dispose();
});

test('Bamboo owns at most five materials and leaves other lamps and wrong-location meshes untouched',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),source=new PBRMaterial('source',scene);
 for(const role of ['landmarkglass','silver','steel','stone'])target(scene,role,source);
 target(scene,'lampwarm',source);
 const lamp=MeshBuilder.CreateBox('landmark_pingan_lampwarm',{},scene);lamp.material=source;
 const wrong=target(scene,'stone',source);wrong.position.x+=500;
 const initialLights=scene.lights.length,initialMeshes=scene.meshes.length,initialMaterials=scene.materials.length;
 const look=createBambooLook(scene);
 assert.equal(createBambooLook(scene),look);
 const stats=look.stats();assert.equal(stats.materials,5);assert.equal(stats.activeMeshes,5);assert.deepEqual(stats.missingRoles,[]);
 const shaderKeys=new Set<number>();
 for(const material of scene.materials.filter(m=>m.name.startsWith('bamboo-look:'))){
  const defines:Record<string,{default:number}>={};
  material.pluginManager!.getPlugin('CityBambooSurface')!.collectDefines(defines);
  shaderKeys.add(defines.CITY_BAMBOO_SURFACE_ROLE.default);
 }
 assert.equal(shaderKeys.size,5,'different generated shader bodies cannot share an effect-cache key');
 assert.equal(scene.materials.length,initialMaterials+5);assert.equal(scene.meshes.length,initialMeshes);assert.equal(scene.lights.length,initialLights);
 assert.equal(stats.newTextures+stats.newMeshes+stats.newDrawCalls+stats.newLights+stats.newRenderTargets,0);
 assert.equal(lamp.material,source);assert.equal(wrong.material,source);assert.equal(stats.skipped.length,1);
 look.dispose();assert.equal(scene.materials.length,initialMaterials);
 scene.dispose();engine.dispose();
});

test('Bamboo warm windows and capped podium rings have independent bounded mode radiance',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),source=new PBRMaterial('lampwarm',scene);
 source.emissiveColor.set(1,.48,.16);source.emissiveIntensity=5;
 const mesh=target(scene,'lampwarm',source),sourcePositions=Array.from(mesh.getVerticesData('position')!);
 const other=MeshBuilder.CreateBox('other-lamp',{},scene);other.material=source;
 const look=createBambooLook(scene),material=mesh.material as PBRMaterial,plugin=material.pluginManager!.getPlugin('CityBambooSurface')!;
 const uniforms:Record<string,number[]>={},buffer={updateFloat4:(name:string,...values:number[])=>{uniforms[name]=values;}};
 for(const mode of ['night','day','sunset','day'] as const){
  look.setMode(mode);plugin.bindForSubMesh(buffer as never,scene,engine,undefined as never);
  const lighting=look.stats().lighting;
  assert.equal(uniforms.bambooLampFinish[0],lighting.windowHDR);assert.equal(uniforms.bambooLampFinish[1],lighting.ringHDR);
  if(mode==='day'){assert.equal(lighting.windowHDR,0);assert.equal(lighting.ringHDR,0);}
  else assert(lighting.ringHDR<lighting.windowHDR);
  assert.equal(material.emissiveIntensity,0,'source full-mesh emission is never reintroduced');
  assert.equal(source.emissiveIntensity,5);assert.equal(other.material,source);
 }
 look.tune({windowNightHDR:2.1,ringNightHDR:.3,ringWidth:.07});look.setMode('night');
 assert.deepEqual({...look.stats().lighting, caps:undefined},{windowHDR:2.1,ringHDR:.3,ringMaskWidth:.07,heightSplit:9.2,caps:undefined});
 assert.deepEqual(Array.from(mesh.getVerticesData('position')!),sourcePositions,'capped source geometry is retained for a later asset fix');
 const fragment=plugin.getCustomCode('fragment')!;
 assert.match(fragment.CUSTOM_FRAGMENT_BEFORE_LIGHTS,/step\(9\.2,bambooLampPosition\.y\)/);
 assert.match(fragment.CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION,/bambooLampFinish\.y\*bambooRingMask/);
 look.dispose();assert.equal(mesh.material,source);assert.equal(source.emissiveIntensity,5);
 scene.dispose();engine.dispose();
});

test('Bamboo follows existing mode emission while retaining bounded tune values and lower-only shading',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),source=new PBRMaterial('architecture:bamboo-ribs',scene);
 source.emissiveColor.set(.78,.9,1);source.emissiveIntensity=1.2;
 const ribs=target(scene,'silver',source),look=createBambooLook(scene);
 const material=ribs.material as PBRMaterial;
 for(const mode of ['night','day','sunset','day'] as const){
  source.emissiveIntensity=mode==='night'?2.8:mode==='sunset'?1.2:0;look.setMode(mode);
  assert.equal(material.emissiveIntensity,source.emissiveIntensity);assert.equal(look.stats().mode,mode);
 }
 const tuned=look.tune({lowerFullHeight:60,lowerFadeHeight:20,glassNormalStrength:4,stoneRoughness:NaN,lowerRibEmission:-1});
 assert.equal(tuned.lowerFadeHeight,66);assert.equal(tuned.glassNormalStrength,.02);assert.equal(tuned.stoneRoughness,.74);assert.equal(tuned.lowerRibEmission,0);
 const plugin=material.pluginManager!.getPlugin('CityBambooSurface')!;
 const fragment=plugin.getCustomCode('fragment')!;
 assert.match(fragment.CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION,/finalEmissive\*=mix\(1\.,bambooLowRange\.w,bambooLow\)/);
 assert.doesNotMatch(Object.values(fragment).join('\n'),/texture2D|finalEmissive\s*\+=/);
 look.dispose();scene.dispose();engine.dispose();
});

test('Bamboo disposal respects a later material assignment owned by another feature',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),source=new PBRMaterial('source',scene);
 const mesh=target(scene,'landmarkglass',source),look=createBambooLook(scene),later=new PBRMaterial('later',scene);
 mesh.material=later;look.setEnabled(false);look.setEnabled(true);look.dispose();
 assert.equal(mesh.material,later);
 scene.dispose();engine.dispose();
});
