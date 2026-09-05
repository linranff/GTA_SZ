import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bridgeRamp,createBridgeHeightSampler,type CoastalManifest} from '../src/city-coastal-infrastructure.ts';
import {manualSteeringInput,stepCar} from '../src/driving.ts';
import type {CityData} from '../src/city-types.ts';
const data=JSON.parse(readFileSync(new URL('../public/city/city.json',import.meta.url),'utf8')) as CityData;
const meta=JSON.parse(readFileSync(new URL('../public/city/coastal/infrastructure.json',import.meta.url),'utf8')) as CoastalManifest;
test('all mapped water-crossing decks clear the common water plane and remain road aligned',()=>{
 const sampler=createBridgeHeightSampler(data,meta,()=>0);let checks=0;
 for(const crossing of meta.crossings)for(let i=1;i<crossing.points.length;i++){const a=crossing.points[i-1],b=crossing.points[i];for(const t of [0,.25,.5,.75,1]){const h=sampler.heightAt(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t);assert(h>=2.799,`${crossing.name} ${crossing.id} ${h}`);assert(h-meta.waterHeight>3);checks++;}}
 assert(checks>100);assert(meta.crossings.some(c=>c.name==='后海二桥'));assert(meta.crossings.some(c=>c.name==='后海大桥'));
 assert.equal(sampler.heightAt(0,-9000),0,'open sea is not raised');
});
test('bridge ramps join smoothly and never exceed a 6 percent grade',()=>{let last=bridgeRamp(0);for(let d=.1;d<=72;d+=.1){const h=bridgeRamp(d);assert(h<=last+1e-9);assert((last-h)/.1<.061);last=h;}assert.equal(bridgeRamp(70),0);assert.equal(bridgeRamp(0),2.8);});
test('manual key steering reduces high-speed yaw without changing autopilot physics',()=>{
 const start={x:0,z:0,yaw:0,speed:20,steer:0,distance:0},full={...start},manual={...start};
 for(let i=0;i<30;i++){stepCar(full,{throttle:0,steer:1,handbrake:false},1/60);stepCar(manual,{throttle:0,steer:manualSteeringInput(1,manual.speed),handbrake:false},1/60);}
 assert(manual.yaw<full.yaw*.72);assert(manual.yaw>full.yaw*.40);assert.equal(manualSteeringInput(0,30),0);assert(manualSteeringInput(1,0)>manualSteeringInput(1,25));
});

import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {positionsOnWorldWaterPlane} from '../src/city-bay-water.ts';
test('water height remains exact under quantized GLB transforms and preserves the shoreline',()=>{
 const world=Matrix.Compose(new Vector3(8302.4449,8302.4449,-8302.4449),Quaternion.Identity(),new Vector3(0,-.1075,-5697.555));
 const original=new Float32Array([-.7,-1/32767,.4,.8,1/32767,-.9]),flat=positionsOnWorldWaterPlane(original,world,-.25);
 for(let i=0;i<flat.length;i+=3){const before=Vector3.TransformCoordinates(Vector3.FromArray(original,i),world),after=Vector3.TransformCoordinates(Vector3.FromArray(flat,i),world);assert(Math.abs(after.y+.25)<1e-6);assert(Math.abs(after.x-before.x)<.002);assert(Math.abs(after.z-before.z)<.002);}
});
