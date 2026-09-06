import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gradeDaylightRadiance,daylightHighlightLuminance} from '../src/city-daylight-environment.ts';

test('daylight leaves ordinary sky and cloud radiance intact',()=>{
 const sky=new Float32Array([0,0,0,.04,.18,.65,2,2.3,2.8,6,6,6]);
 const original=sky.slice();gradeDaylightRadiance(sky);assert.deepEqual(sky,original);
 assert.equal(daylightHighlightLuminance(8),8);
});

test('solar highlights stay finite, ordered and HDR without bleaching irradiance',()=>{
 // Actual source solar texel followed by neutral HDR glare at increasing energy.
 const solar=gradeDaylightRadiance(new Float32Array([360448,372736,348160]));
 const y=.2126*solar[0]+.7152*solar[1]+.0722*solar[2];
 assert.ok(y>31&&y<32.001);assert.ok(solar.every(v=>Number.isFinite(v)&&v>1&&v<65504));
 assert.ok(solar[0]>solar[1]&&solar[1]>solar[2],'solar core has a restrained warm tint');
 let previous=0;
 for(const energy of [8,8.001,12,24,100,1000,400000]){
  const result=gradeDaylightRadiance(new Float32Array([energy,energy,energy]));
  const luminance=.2126*result[0]+.7152*result[1]+.0722*result[2];
  assert.ok(luminance>previous&&luminance<32.001);previous=luminance;
 }
});
