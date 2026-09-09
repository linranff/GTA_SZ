import {test} from 'node:test';import assert from 'node:assert/strict';
import {NullEngine,Scene,PBRMaterial,HemisphericLight,Vector3} from '@babylonjs/core';
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
