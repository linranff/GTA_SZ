import assert from 'node:assert/strict';import {test} from 'node:test';import {CityObserver} from '../src/city-observer.ts';
const bounds=[-6000,-2500,6000,2500],flat=()=>0;
test('observer moves relative to view, preserves framing, and supports vertical/fast movement',()=>{
 const o=new CityObserver();o.begin({x:0,y:60,z:0},100,0,.3);const start=o.pose();for(let i=0;i<60;i++)o.step(new Set(['KeyW']),1/60,flat,bounds);assert.ok(o.pose().z>start.z+12);assert.equal(o.pose().x,start.x);assert.equal(o.pose().y,start.y);
 const before=o.pose();o.step(new Set(['KeyD','KeyE','ShiftLeft']),.05,flat,bounds);assert.ok(o.pose().x>before.x);assert.ok(o.pose().y>before.y);
 const p=o.pose();o.rotate(200,0);assert.ok(Math.abs(o.pose().x-p.x)>20);assert.ok(Math.abs(o.focus.z-13)<.0001);
});
test('drone height and world boundaries stay bounded even after extended ascent or zoom',()=>{
 const o=new CityObserver();o.begin({x:5999,y:100,z:2499},400,0,1.43);o.zoom(10000);for(let i=0;i<4000;i++)o.step(new Set(['KeyE','KeyD','KeyW','ShiftLeft']),.05,flat,bounds);assert.ok(o.pose().y<=2200.001);assert.ok(o.focus.x<=6000&&o.focus.z<=2500);
 o.zoom(-10000);for(let i=0;i<4000;i++)o.step(new Set(['KeyQ','ShiftLeft']),.05,flat,bounds);assert.ok(o.pose().y>=1.499);
});
