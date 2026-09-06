import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {GetCubeMapTextureData} from '@babylonjs/core/Misc/HighDynamicRange/hdr.js';
import {CITY_SUNSET_SOURCE,sunsetDisplayScale} from '../src/city-sunset-environment.ts';

test('delivered sunset contains HDR highlights, orange clouds and an indigo reverse',()=>{
 const bytes=readFileSync(new URL('../public'+CITY_SUNSET_SOURCE.file,import.meta.url));
 assert.equal(bytes.length,CITY_SUNSET_SOURCE.bytes);
 const size=128,cube=GetCubeMapTextureData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),size),center=(size/2*size+size/2)*3;
 const warm=cube.front as Float32Array,cool=cube.back as Float32Array;
 assert.ok(warm[center]>warm[center+2]*3,'sunward horizon retains amber/red');
 assert.ok(cool[center+2]>cool[center]*2,'opposite sky is indigo');
 let peak=0;
 for(const key of ['right','left','up','down','front','back'] as const)for(const value of cube[key]){assert.ok(Number.isFinite(value)&&value>=0);peak=Math.max(peak,value);}
 assert.ok(peak>20,'PBR radiance must not be replaced by an SDR or capped display cube');
});

test('sky display shoulder retains highlight differences and colour ratios',()=>{
 const a=20*sunsetDisplayScale(20),b=200*sunsetDisplayScale(200);
 assert.ok(b>a&&b<4.3);
 assert.equal(sunsetDisplayScale(.5),1);
 const rgb=[20,9,3],scale=sunsetDisplayScale(20),display=rgb.map(v=>v*scale);
 assert.ok(Math.abs(display[0]/display[1]-rgb[0]/rgb[1])<.00001);
});
