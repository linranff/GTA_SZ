import {test} from 'node:test';import assert from 'node:assert/strict';
import {NullEngine,Scene,PBRMaterial,HemisphericLight,Vector3,FreeCamera,MeshBuilder} from '@babylonjs/core';
import {preserveStreamingLightBudgets} from '../src/city-gltf-streaming.ts';
test('streamed assets do not raise existing scene light budgets; mode changes and concurrent loads survive',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);for(let i=0;i<12;i++)new HemisphericLight('light'+i,Vector3.Up(),scene);
 const city=new PBRMaterial('city',scene),car=new PBRMaterial('car',scene);city.maxSimultaneousLights=4;car.maxSimultaneousLights=10;
 const a=preserveStreamingLightBudgets(scene);city.maxSimultaneousLights=6;scene.onBeforeRenderObservable.notifyObservers(scene);
 const b=preserveStreamingLightBudgets(scene),newMaterial=new PBRMaterial('new',scene);
 for(const m of [city,car,newMaterial])m.maxSimultaneousLights=12;b();
 assert.equal(city.maxSimultaneousLights,6);assert.equal(car.maxSimultaneousLights,10);assert.equal(newMaterial.maxSimultaneousLights,12);
 newMaterial.maxSimultaneousLights=3;scene.onBeforeRenderObservable.notifyObservers(scene);
 for(const m of [city,car,newMaterial])m.maxSimultaneousLights=12;a();a();
 assert.equal(city.maxSimultaneousLights,6);assert.equal(car.maxSimultaneousLights,10);assert.equal(newMaterial.maxSimultaneousLights,3);
 scene.dispose();engine.dispose();
});

test('the loader promotion and its restore leave existing shaders alone; a real mid-stream change still dirties',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('camera',new Vector3(0,0,-10),scene);for(let i=0;i<12;i++)new HemisphericLight('light'+i,Vector3.Up(),scene);
 const city=new PBRMaterial('city',scene),raised=new PBRMaterial('raised',scene);city.maxSimultaneousLights=4;raised.maxSimultaneousLights=4;
 const boxes=[city,raised].map(m=>{const b=MeshBuilder.CreateBox(m.name,{size:1},scene);b.material=m;return b;});
 const lightsDirty=(i:number)=>(boxes[i].subMeshes[0].materialDefines as {_areLightsDirty:boolean}|null)?._areLightsDirty;
 scene.render();assert.equal(lightsDirty(0),false,'rendered once: defines exist and are clean');
 // Outside a load the setter dirties, as Babylon intends.
 city.maxSimultaneousLights=5;assert.equal(lightsDirty(0),true);scene.render();city.maxSimultaneousLights=4;scene.render();assert.equal(lightsDirty(0),false);
 const restore=preserveStreamingLightBudgets(scene);
 raised.maxSimultaneousLights=9; // another owner raising a budget while the GLB decodes
 scene.onBeforeRenderObservable.notifyObservers(scene);
 for(const m of [city,raised])m.maxSimultaneousLights=Math.max(m.maxSimultaneousLights,scene.lights.length); // the loader's promotion
 assert.equal(lightsDirty(0),false,'suppressed while the load is in flight');
 restore();
 assert.equal(city.maxSimultaneousLights,4);assert.equal(raised.maxSimultaneousLights,9);
 assert.equal(lightsDirty(0),false,'promotion + restore is a net no-op and must not dirty');
 assert.equal(lightsDirty(1),true,'the net change is dirtied at onReady');
 scene.render();city.maxSimultaneousLights=7;assert.equal(lightsDirty(0),true,'setters dirty normally again after the load');
 scene.dispose();engine.dispose();
});
