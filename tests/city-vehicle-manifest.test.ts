import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {headlightAnchors,DEFAULT_HEADLIGHT_ANCHORS} from '../src/city-vehicle-manifest.ts';

test('a manifest without headlight anchors falls back instead of crashing (GTA_SZ#2)',()=>{
 const warnings:unknown[]=[];const original=console.warn;console.warn=(...args:unknown[])=>{warnings.push(args);};
 try{
  assert.deepEqual(headlightAnchors(undefined),DEFAULT_HEADLIGHT_ANCHORS,'missing field uses the hero defaults');
  assert.equal(warnings.length,0,'an absent field is the documented third-party case; no warning');
  assert.deepEqual(headlightAnchors([[1,2,3]]),DEFAULT_HEADLIGHT_ANCHORS,'one anchor is not enough for two headlights');
  assert.deepEqual(headlightAnchors([[1,2],[3,4,5]]),DEFAULT_HEADLIGHT_ANCHORS,'malformed tuples fall back');
  assert.deepEqual(headlightAnchors([[1,2,Number.NaN],[3,4,5]]),DEFAULT_HEADLIGHT_ANCHORS,'non-finite values fall back');
  assert.equal(warnings.length,3,'invalid values are reported once each');
 }finally{console.warn=original;}
 const own=headlightAnchors([[-.5,.8,2],[.5,.8,2],[0,0,0]]);
 assert.deepEqual(own,[[-.5,.8,2],[.5,.8,2]],'valid anchors are used, trimmed to two');
 headlightAnchors(undefined)[0][0]=99;
 assert.equal(DEFAULT_HEADLIGHT_ANCHORS[0][0],-.7,'callers get copies, not the shared default');
});

test('the shipped vehicle manifest satisfies the runtime contract',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/city/vehicle-manifest.json',import.meta.url),'utf8'));
 assert.ok(Number.isFinite(manifest.wheelRadius)&&manifest.wheelRadius>0);
 for(const key of ['lf','rf','lr','rr'])assert.equal(manifest.wheelCentresGltf[key].length,3,key);
 assert.deepEqual(headlightAnchors(manifest.recommendedHeadlightAnchorsGame),manifest.recommendedHeadlightAnchorsGame.slice(0,2));
});
