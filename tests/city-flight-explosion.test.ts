import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
import {FlightExplosion,FLIGHT_FIREBALLS,fireballEnvelope} from '../src/city-flight-explosion.ts';

test('detonations spread across the first 1.21 seconds and extinguish by drone recovery',()=>{
 assert.equal(FLIGHT_FIREBALLS.length,9);
 const count=(t:number)=>FLIGHT_FIREBALLS.filter(f=>fireballEnvelope(t,f.at).visible).length;
 assert.equal(count(-.01),0);assert.equal(count(0),1);assert.equal(count(.33),3);assert.equal(count(.70),6);assert.equal(count(1.22),9);assert.equal(count(3),0);
 const early=fireballEnvelope(.25,0),late=fireballEnvelope(2.5,0);
 assert(early.heat>late.heat,'An old fireball must cool into smoke rather than remain white hot');
 assert(early.growth>.8&&late.opacity===1,'Secondary detonations have time to expand before the final fade');
});

test('repeated explosions reuse bounded pools and cancel every visible element on reset',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.activeCamera=new FreeCamera('test',new Vector3(0,10,-40),scene);
 const fx=new FlightExplosion(scene),counts={meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,particles:scene.particleSystems.length};
 try{
  for(let repeat=0;repeat<4;repeat++){
   fx.burst(new Vector3(10+repeat*200,35,-12),repeat*.7);fx.step(.75);
   assert.equal(fx.stats.fireballs,6);assert.equal(fx.stats.fragments,24);assert.equal(fx.stats.waves,3);
   fx.step(1.5);assert.equal(fx.stats.fireballs,9);assert.equal(fx.stats.waves,4);
   for(const mesh of scene.meshes){const box=mesh.getBoundingInfo().boundingBox;assert(mesh.position.asArray().every(Number.isFinite));assert(box.minimum.asArray().every(Number.isFinite));}
   fx.reset();assert.deepEqual(fx.stats,{active:false,seconds:0,fireballs:0,particles:0,fragments:0,waves:0});
   assert.deepEqual({meshes:scene.meshes.length,materials:scene.materials.length,textures:scene.textures.length,particles:scene.particleSystems.length},counts);
  }
  fx.dispose();assert.equal(scene.meshes.length,0);assert.equal(scene.particleSystems.length,0);
 }finally{scene.dispose();engine.dispose();}
});
