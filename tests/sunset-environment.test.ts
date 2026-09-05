import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gradeSunsetRadiance,sunsetDisplayScale} from '../src/city-sunset-environment.ts';

test('sunset grading preserves HDR energy and separates warm clouds from cool gaps',()=>{
 const pixels=new Float32Array([4,3.8,3.9, .3,.5,1, 0,0,0]);
 assert.equal(gradeSunsetRadiance(pixels),pixels);
 assert.ok(pixels[0]>4.3,'reflection highlights retain their original HDR range');
 assert.ok(pixels[0]>pixels[2]*2,'clouds shift to coral and amber');
 assert.ok(pixels[5]>pixels[3],'clear sky retains a cooler counterpoint');
 assert.deepEqual(Array.from(pixels.slice(6)),[0,0,0]);
 assert.ok(Array.from(pixels).every(v=>Number.isFinite(v)&&v>=0));
});

test('extreme sunset highlights retain their hue without a broad white clipping plateau',()=>{
 const data=gradeSunsetRadiance(new Float32Array([20,18,15, 200,180,150]));
 assert.ok(data[3]>data[0]*9.9,'IBL remains linear rather than capped');
 const a=data[0]*sunsetDisplayScale(data[0]),b=data[3]*sunsetDisplayScale(data[3]);
 assert.ok(b>a&&b<4.3,'only the displayed sky has bounded highlights');
 assert.equal(sunsetDisplayScale(.5),1);
 assert.ok(Math.abs(data[0]/data[1]-data[3]/data[4])<.00001);
 assert.ok(data[1]<data[0]*.65&&data[2]<data[0]*.5);
});
