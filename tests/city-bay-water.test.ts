import test from 'node:test';
import assert from 'node:assert/strict';
import {Effect,MeshBuilder,MirrorTexture,NullEngine,Scene,Texture,VertexBuffer} from '@babylonjs/core';
import {createBayWater} from '../src/city-bay-water.ts';
import type {CoastalManifest} from '../src/city-coastal-infrastructure.ts';

test('water antialiasing reaches the PBR shader before lighting and preserves the existing reflection budget',async()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 // Exercise the actual PBR include/plugin preprocessing path used by WebGL2.
 // NullEngine checks shader integration, not GPU compilation or visual quality.
 engine.getCaps().standardDerivatives=true;engine.getCaps().textureLOD=true;
 const mirror=new MirrorTexture('existing-bay-reflection',512,scene,true);mirror.blurKernel=1;mirror.refreshRate=3;
 const reflectionPasses=mirror.postProcesses.length,renderTargets=scene.textures.filter(t=>t.isRenderTarget).length;
 const water=MeshBuilder.CreateGround('terrain_water',{width:200,height:400},scene);
 const meta:CoastalManifest={schemaVersion:1,waterHeight:-.25,crossings:[],parkLights:[],shoreDistance:{url:'',extent:[-100,-200,100,200],maxDistance:120}};
 const bay=createBayWater(scene,mirror,[water],meta);
 try{
  assert.equal(bay.material.reflectionTexture,mirror);
  assert.equal(mirror.samplingMode,Texture.TRILINEAR_SAMPLINGMODE);
  assert.equal(mirror.refreshRate,3);assert.equal(mirror.getSize().width,512);
  assert.equal(mirror.postProcesses.length,reflectionPasses);
  assert.equal(scene.textures.filter(t=>t.isRenderTarget).length,renderTargets);
  let effect:Effect|undefined;bay.material.onEffectCreatedObservable.add(e=>{effect=e.effect;});
  await bay.material.forceCompilationAsync(water);
  assert(effect?.isReady(),'PBR effect must be generated');
  const shader=effect.fragmentSourceCode;
  assert.match(shader,/fwidth\(phase\)/,'filter the unwrapped wave phases before they alias');
  assert.match(shader,/reflectionLOD=max\(reflectionLOD,bayReflectionPixelLod\)/,'explicit PBR LOD must include projected sampling density');
  const variance=shader.indexOf('float bayUnresolvedVariance='),roughness=shader.indexOf('roughness=sqrt(sqrt('),lighting=shader.indexOf('float alphaG=convertRoughnessToAverageSlope(roughness)',roughness);
  assert(variance>=0&&roughness>variance&&lighting>roughness,`unresolved wave energy must affect both reflection and direct specular (${variance},${roughness},${lighting})`);
  assert(!shader.includes('$0'),'Babylon must expand every regular-expression injection');
 }finally{scene.dispose();engine.dispose();}
});

test('horizon water stays outside the complete mainland, including its quantized edges',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 const mirror=new MirrorTexture('existing-bay-reflection',512,scene,true);
 const waterBounds=[-6788.003,-14000,6788.003,2604.89],landBounds=[-6788.10,-2604.865,6788.10,9000];
 const ground=(name:string,b:number[])=>{const mesh=MeshBuilder.CreateGround(name,{width:b[2]-b[0],height:b[3]-b[1]},scene);mesh.position.set((b[0]+b[2])/2,0,(b[1]+b[3])/2);mesh.computeWorldMatrix(true);return mesh;};
 const water=ground('terrain_water',waterBounds),land=ground('terrain_land',landBounds);
 // Remote islands must not move the extension edge out and leave empty bay.
 ground('opposite_shore_terrain',[-9500,-11000,9470,-2320]);
 const renderTargets=scene.textures.filter(t=>t.isRenderTarget).length;
 const meta:CoastalManifest={schemaVersion:1,waterHeight:-.25,crossings:[],parkLights:[],shoreDistance:{url:'',extent:waterBounds,maxDistance:120}};
 const bay=createBayWater(scene,mirror,[water],meta);
 try{
  const extension=scene.getMeshByName('bay-horizon-water');assert(extension);
  const bounds=bay.stats().horizonCoverageBounds;assert(bounds);
  assert(Math.abs(bounds[0]+6788.10)<.001&&Math.abs(bounds[2]-6788.10)<.001,'the wider mainland edges must win over water quantization');
  assert(Math.abs(bounds[1]+14000)<.001&&Math.abs(bounds[3]-9000)<.001,'north edge must enclose all 9000m of the mainland backdrop');
  assert.equal(extension.getTotalIndices()/3,8,'keep the existing four quads');
  assert.equal(scene.textures.filter(t=>t.isRenderTarget).length,renderTargets,'no additional reflection target');
  const p=extension.getVerticesData(VertexBuffer.PositionKind)!,indices=extension.getIndices()!,box=land.getBoundingInfo().boundingBox;
  for(let i=0;i<indices.length;i+=3){
   const xs=[p[indices[i]*3],p[indices[i+1]*3],p[indices[i+2]*3]],zs=[p[indices[i]*3+2],p[indices[i+1]*3+2],p[indices[i+2]*3+2]];
   const overlapX=Math.min(Math.max(...xs),box.maximumWorld.x)-Math.max(Math.min(...xs),box.minimumWorld.x);
   const overlapZ=Math.min(Math.max(...zs),box.maximumWorld.z)-Math.max(Math.min(...zs),box.minimumWorld.z);
   assert(overlapX<=.001||overlapZ<=.001,`extension triangle ${i/3} must not cover mainland, even along the 9.7cm side strips`);
  }
 }finally{scene.dispose();engine.dispose();}
});

test('horizon water falls back to supplied water bounds without original terrain nodes',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),mirror=new MirrorTexture('existing-bay-reflection',128,scene,true);
 const water=MeshBuilder.CreateGround('standalone-bay',{width:200,height:400},scene);water.position.set(250,8,-500);
 const meta:CoastalManifest={schemaVersion:1,waterHeight:-.25,crossings:[],parkLights:[],shoreDistance:{url:'',extent:[150,-700,350,-300],maxDistance:120}};
 const bay=createBayWater(scene,mirror,[water],meta);
 try{
  assert.deepEqual(bay.stats().horizonCoverageBounds,[150,-700,350,-300]);
  assert.equal(scene.getMeshByName('bay-horizon-water')?.getTotalIndices()/3,8);
  for(const bounds of bay.stats().meshWorldHeights){assert(Math.abs(bounds.min+.25)<.0001);assert(Math.abs(bounds.max+.25)<.0001);}
 }finally{scene.dispose();engine.dispose();}
});
