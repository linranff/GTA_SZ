import test from 'node:test';
import assert from 'node:assert/strict';
import {Light,MeshBuilder,NullEngine,PBRMaterial,PointLight,Scene,SpotLight,Vector3,type AbstractMesh} from '@babylonjs/core';
import {createLocalLighting,LOCAL_LIGHTING} from '../src/city-local-lighting.ts';

const center=LOCAL_LIGHTING.regions[0],eye={x:center.x,y:2,z:center.z};
function box(scene:Scene,name:string,x=0,z=0){const m=MeshBuilder.CreateBox(name,{size:2},scene);m.position.set(center.x+x,1,center.z+z);m.material=new PBRMaterial(name+'-material',scene);m.computeWorldMatrix(true);return m;}
function tick(local:ReturnType<typeof createLocalLighting>,p=eye,seconds=.6){for(let t=0;t<seconds;t+=.05)local.update(.05,p);}

test('camera Vector3 getters satisfy the update contract and activate nearby night lighting',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),wall=box(scene,'landmark_vector_wall');
 const local=createLocalLighting({scene,lamps:[[center.x,center.z,0,0]],parkLights:[],heightAt:()=>0,casters:()=>[wall]});
 const cameraPosition=new Vector3(eye.x,eye.y,eye.z);local.setMode('night');
 for(let i=0;i<12;i++)local.update(.05,cameraPosition,i===0);
 const stats=local.stats();assert.equal(stats.regionWeight,1);assert.equal(stats.activeLights,1);assert.equal(stats.activeShadowMaps,1);assert(Number.isFinite(stats.slots[0].intensity));assert(stats.slots[0].intensity>0);
 local.dispose();scene.dispose();engine.dispose();
});

test('local sample owns two lamps and one reusable shadow map; empty receivers and day mode submit neither',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),wall=box(scene,'landmark_example_wall');
 const water=box(scene,'terrain_water'),mountain=box(scene,'mountain_landscape'),atmosphere=box(scene,'atmosphere');
 atmosphere.material=new PBRMaterial('directional-night-environment',scene);
 const local=createLocalLighting({scene,lamps:[[center.x,center.z,0,0],[center.x+14,center.z,0,0]],parkLights:[],heightAt:()=>0,casters:()=>[wall,water,mountain,atmosphere]});
 const textures=scene.textures.filter(t=>t.isRenderTarget);assert.equal(textures.length,1);assert.equal(scene.lights.length,2);
 local.setMode('night');tick(local);let s=local.stats();assert.equal(s.activeLights,2);assert.equal(s.activeShadowMaps,1);assert.equal(s.casters,1);
 for(const light of scene.lights){assert(light.includedOnlyMeshes.includes(wall));assert(!light.includedOnlyMeshes.includes(water));assert(!light.includedOnlyMeshes.includes(mountain));assert(!light.includedOnlyMeshes.includes(atmosphere),'mesh name must exclude atmosphere even when its night material has no sky token');assert.equal(light.falloffType,Light.FALLOFF_GLTF);assert.equal((light as SpotLight).innerAngle,1.5);assert.equal((light as SpotLight).angle,2.6);}
 scene.shadowsEnabled=false;assert.equal(local.stats().activeShadowMaps,0);scene.shadowsEnabled=true;assert.equal(local.stats().activeShadowMaps,1);
 wall.setEnabled(false);local.update(.05,eye,true);s=local.stats();assert.equal(s.activeLights,0);assert.equal(s.activeShadowMaps,0);assert.equal(s.shadowRefreshRate,0);
 wall.setEnabled(true);local.update(.05,eye,true);tick(local);assert.equal(local.stats().activeLights,2);
 local.setMode('day');assert.equal(local.stats().activeLights,0);assert.equal(local.stats().activeShadowMaps,0);
 local.setMode('night');tick(local);local.setEnabled(false);assert.equal(local.stats().activeLights,0);local.setEnabled(true);tick(local);
 assert.equal(scene.textures.filter(t=>t.isRenderTarget)[0],textures[0],'mode and A/B reuse the original shadow texture');
 local.dispose();local.dispose();assert.equal(scene.lights.length,0);assert.equal(scene.textures.filter(t=>t.isRenderTarget).length,0);scene.dispose();engine.dispose();
});

test('fixture changes reach zero before repositioning and use existing road offsets and park lamp height',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 const floor=MeshBuilder.CreateGround('terrain_park',{width:350,height:150},scene);floor.position.set(center.x+40,0,center.z);floor.material=new PBRMaterial('floor',scene);
 const local=createLocalLighting({scene,lamps:[[center.x+1.5,center.z,1,0],[center.x+14,center.z,0,0],[center.x+80,center.z,0,0]],parkLights:[{id:'park-test',name:'test',x:center.x+96,z:center.z,height:12,radius:34,color:[1,1,1],power:1}],heightAt:()=>3,casters:()=>[]});
 local.setMode('night');tick(local);let before=local.stats();assert.equal(before.slots[0].position[0],center.x);assert.equal(before.slots[0].position[1],11.27);
 const next={x:center.x+95,y:5,z:center.z};local.update(.01,next,true);let switching=local.stats();assert(switching.slots[0].changing);assert.deepEqual(switching.slots[0].position,before.slots[0].position);
 let moved=false;
 for(let i=0;i<25;i++){
  const prior=local.stats().slots[0];local.update(.025,next);const now=local.stats().slots[0];
  if(prior.fixtureId!==now.fixtureId){assert.equal(now.intensity,0);assert.equal(now.enabled,false);moved=true;}
  const ids=local.stats().slots.map(s=>s.fixtureId).filter(Boolean);assert.equal(new Set(ids).size,ids.length);
 }
 assert(moved);const park=local.stats().slots.find(s=>s.fixtureId==='park-test');assert(park);assert.equal(park.position[1],14.56);
 local.dispose();scene.dispose();engine.dispose();
});

test('new and mode-restored receiver materials gain actual bounded light slots and recover on disable',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),wall=box(scene,'landmark_test_stone');
 const material=wall.material as PBRMaterial;material.maxSimultaneousLights=3;
 for(let i=0;i<7;i++)new PointLight('existing-'+i,Vector3.Zero(),scene);
 const car=box(scene,'hero-car'),carMaterial=car.material as PBRMaterial;carMaterial.maxSimultaneousLights=3;
 const fill=new PointLight('soft-vehicle-fill',Vector3.Zero(),scene);fill.includedOnlyMeshes=[car];
 const local=createLocalLighting({scene,lamps:[[center.x,center.z,0,0],[center.x+12,center.z,0,0]],parkLights:[],heightAt:()=>0,casters:()=>[wall]});
 local.setMode('night');tick(local);assert.equal(material.maxSimultaneousLights,9);assert.equal(carMaterial.maxSimultaneousLights,10);
 material.maxSimultaneousLights=6;local.setMode('night');local.update(.05,eye,true);assert.equal(material.maxSimultaneousLights,9);
 local.setEnabled(false);assert.equal(material.maxSimultaneousLights,6,'restores the most recent external mode baseline');assert.equal(carMaterial.maxSimultaneousLights,3);
 local.setEnabled(true);tick(local);const replacement=new PBRMaterial('later-local-plugin-material',scene);replacement.maxSimultaneousLights=4;wall.material=replacement;
 local.update(.05,eye,true);assert.equal(replacement.maxSimultaneousLights,9);assert.equal(material.maxSimultaneousLights,6);
 local.setMode('day');assert.equal(replacement.maxSimultaneousLights,4);
 local.dispose();scene.dispose();engine.dispose();
});

test('caster budget keeps material parts together and region/height transitions fully release local resources',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),parts:AbstractMesh[]=[];
 for(let i=0;i<47;i++)parts.push(box(scene,'separate-'+i));
 const stone=box(scene,'landmark_pair_stone',25),glass=box(scene,'landmark_pair_glass',25);parts.push(stone,glass);
 const floor=box(scene,'terrain_land');parts.push(floor);
 const local=createLocalLighting({scene,lamps:[[center.x,center.z,0,0]],parkLights:[],heightAt:()=>0,casters:()=>parts});
 local.setMode('night');tick(local);let s=local.stats();assert.equal(s.casters,47);assert.equal(s.skippedCasterGroups,1);
 const map=scene.lights.find(l=>l.name==='sample-local-lamp-0')!.getShadowGenerator()!.getShadowMap()!;
 assert(!map.renderList!.includes(stone));assert(!map.renderList!.includes(glass));assert(!map.renderList!.includes(floor));
 tick(local,{...eye,y:121});s=local.stats();assert.equal(s.regionWeight,0);assert.equal(s.activeLights,0);assert.equal(s.activeShadowMaps,0);
 tick(local);assert.equal(local.stats().activeLights,1);
 tick(local,{...eye,x:center.x+221});assert.equal(local.stats().activeLights,0);assert.equal(local.stats().activeShadowMaps,0);
 local.dispose();scene.dispose();engine.dispose();
});

test('vertical coastal walls cast local shadows while ground paving only receives the lamp',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),wall=box(scene,'coastal_shore_seawall');
 const paving=MeshBuilder.CreateGround('terrain_pavement',{width:20,height:20},scene);paving.position.set(center.x,0,center.z);paving.material=new PBRMaterial('paving',scene);
 const local=createLocalLighting({scene,lamps:[[center.x,center.z,0,0]],parkLights:[],heightAt:()=>0,casters:()=>[wall,paving]});
 local.setMode('night');tick(local);
 const light=scene.lights.find(l=>l.name==='sample-local-lamp-0')!,map=light.getShadowGenerator()!.getShadowMap()!;
 assert(light.includedOnlyMeshes.includes(wall));assert(light.includedOnlyMeshes.includes(paving));
 assert(map.renderList!.includes(wall),'the existing vertical seawall must occlude the new lamp');
 assert(!map.renderList!.includes(paving),'flat paving receives illumination without spending a caster draw');
 assert.equal(local.stats().casters,1);assert.equal(local.stats().activeShadowMaps,1);
 local.dispose();scene.dispose();engine.dispose();
});

test('receiver shader guards survive A/B, mode and region removal, and restore only owned settings on disposal',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),wall=box(scene,'landmark_guard_wall'),other=box(scene,'landmark_original_guard',3);
 const material=wall.material as PBRMaterial,originallyGuarded=other.material as PBRMaterial;originallyGuarded.allowShaderHotSwapping=false;
 const unrelated=box(scene,'distant-building',1000).material as PBRMaterial;
 const local=createLocalLighting({scene,lamps:[[center.x,center.z,0,0]],parkLights:[],heightAt:()=>0,casters:()=>[wall,other]});
 local.setMode('night');tick(local);assert.equal(material.allowShaderHotSwapping,false);assert.equal(originallyGuarded.allowShaderHotSwapping,false);assert.equal(unrelated.allowShaderHotSwapping,true);
 local.setEnabled(false);assert.equal(material.allowShaderHotSwapping,false,'A/B removal is itself a sampler transition');
 local.setEnabled(true);tick(local);local.setMode('day');assert.equal(material.allowShaderHotSwapping,false);
 local.setMode('night');tick(local,{...eye,y:121});assert.equal(material.allowShaderHotSwapping,false);
 originallyGuarded.allowShaderHotSwapping=true; // A later owner changes its original false setting.
 local.dispose();assert.equal(material.allowShaderHotSwapping,true);assert.equal(originallyGuarded.allowShaderHotSwapping,true);assert.equal(unrelated.allowShaderHotSwapping,true);
 assert.equal(local.stats().hotSwapGuardMaterials,0);scene.dispose();engine.dispose();
});

test('historical material light caps are bounded locally and restored after region exit',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),wall=box(scene,'landmark_oversized_wall');
 const material=wall.material as PBRMaterial;material.maxSimultaneousLights=15;
 const local=createLocalLighting({scene,lamps:[[center.x,center.z,0,0]],parkLights:[],heightAt:()=>0,casters:()=>[wall]});
 local.setMode('night');tick(local);assert.equal(material.maxSimultaneousLights,9);assert.equal(local.stats().maxReceiverLightCapacity,9);
 tick(local,{...eye,x:center.x+221});assert.equal(material.maxSimultaneousLights,15);assert.equal(local.stats().maxReceiverLightCapacity,0);
 local.dispose();assert.equal(material.maxSimultaneousLights,15);scene.dispose();engine.dispose();
});

test('moving hero retains the same light, PCF and material slots through fixture, region and day transitions',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),car=box(scene,'player-car');
 const material=car.material as PBRMaterial;material.maxSimultaneousLights=14;
 const local=createLocalLighting({scene,lamps:[[center.x,center.z,0,0],[center.x+14,center.z,0,0],[center.x+80,center.z,0,0]],parkLights:[],heightAt:()=>0,casters:()=>[car],stableReceivers:[car]});
 const slots=[...scene.lights],shadow=slots[0].getShadowGenerator()!.getShadowMap()!;
 const assertStable=()=>{
  assert.equal(material.maxSimultaneousLights,10);
  assert.equal(slots[0].shadowEnabled,true,'PCF variant remains compiled even at zero intensity');
  assert.equal(slots[1].shadowEnabled,false);
  for(const light of slots){assert(light.isEnabled());assert(light.canAffectMesh(car));assert(light.includedOnlyMeshes.includes(car));}
  assert.deepEqual(car.lightSources,slots,'lamp identity/order never changes');
 };
 local.setMode('night');tick(local);assertStable();assert(local.stats().activeLights>0);
 for(let i=0;i<100;i++){
  const p={x:center.x+i*3,y:2,z:center.z};car.position.x=p.x;car.computeWorldMatrix(true);local.update(.05,p,true);assertStable();
 }
 tick(local,{...eye,x:center.x+500},1);assertStable();assert.equal(local.stats().activeLights,0);assert.equal(local.stats().activeShadowMaps,0);
 assert(shadow.renderList!.includes(car),'resident list keeps the PCF shader define present');
 assert.deepEqual(shadow.getCustomRenderList!(0,shadow.renderList!,shadow.renderList!.length),[],'inactive lamp submits no shadow geometry');
 local.setMode('day');assertStable();local.setEnabled(false);assertStable();
 local.setEnabled(true);local.setMode('night');car.position.x=center.x;car.computeWorldMatrix(true);tick(local);assertStable();assert(local.stats().activeLights>0);
 // A streamed facade GLB globally raises existing material light budgets.
 // The renderer must restore the hero before readiness/compilation, including
 // a paused photo where the simulation update may not run at all.
 material.maxSimultaneousLights=14;scene.onBeforeRenderObservable.notifyObservers(scene);assertStable();
 local.setMode('day');material.maxSimultaneousLights=18;scene.onBeforeRenderObservable.notifyObservers(scene);assertStable();
 assert.equal(scene.lights.length,2,'reuses the same lights, no extra per-car light or shadow textures');
 assert.equal(scene.textures.filter(t=>t.isRenderTarget).length,1);
 local.dispose();assert.equal(material.maxSimultaneousLights,14);scene.dispose();engine.dispose();
});
