import test from 'node:test';
import assert from 'node:assert/strict';
import {observerNearClip} from '../src/city-observer-depth.ts';

test('vertical flight gets depth precision even with a close orbit target',()=>{
 assert.equal(observerNearClip(12,2200,570),128);
 assert.equal(observerNearClip(420,1200,570),63);
 assert.equal(observerNearClip(3200,2200,570),128);
});
test('roof and mountain clearance protects nearby scenery instead of using ground height',()=>{
 assert.equal(observerNearClip(12,480,570),.3);
 assert.equal(observerNearClip(420,600,570),3);
 for(const height of [580,700,1200,2200])assert.ok(observerNearClip(12,height,570)<height-570);
 assert.equal(observerNearClip(420,200,570),1.26);
});
test('vehicle inspection and ordinary aerial near planes retain their close range',()=>{
 assert.equal(observerNearClip(7.7,2200,0,true),.15);
 assert.equal(observerNearClip(3,3,570),.3);
 assert.equal(observerNearClip(3200,320,570),4);
});
