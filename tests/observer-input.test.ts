import assert from 'node:assert/strict';import {test} from 'node:test';import {CityObserver} from '../src/city-observer.ts';
const flat=()=>0,bounds=[-6000,-2500,6000,2500];const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('arrows look from the current position while WASD translates',()=>{
 const o=new CityObserver();o.begin({x:0,y:150,z:0},300,0,.3);const position=o.pose();for(let i=0;i<60;i++)o.step(new Set(['ArrowRight','ArrowUp']),1/60,flat,bounds);
 close(o.pose().x,position.x);close(o.pose().y,position.y);close(o.pose().z,position.z);assert.ok(o.yaw>1);assert.ok(o.pitch<-.49);
 const p=o.pose();o.step(new Set(['KeyW']),.05,flat,bounds);assert.ok(Math.hypot(o.pose().x-p.x,o.pose().z-p.z)>1);close(o.pose().y,p.y);
});
test('pressed drag pans without changing angles or distance; orbit remains separate',()=>{
 const o=new CityObserver();o.begin({x:0,y:120,z:0},300,0,.3);const p=o.pose(),f={...o.focus};o.pan(100,60,1080);assert.ok(o.pose().x<p.x-20);assert.ok(o.pose().y>p.y+10);close(o.pose().x-p.x,o.focus.x-f.x);close(o.pose().y-p.y,o.focus.y-f.y);close(o.yaw,0);close(o.pitch,.3);close(o.distance,300);
 const target={...o.focus};o.rotate(100,10);assert.deepEqual(o.focus,target);assert.ok(o.yaw<0);
});
