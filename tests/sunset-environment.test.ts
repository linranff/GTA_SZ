import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {GetCubeMapTextureData} from '@babylonjs/core/Misc/HighDynamicRange/hdr.js';
import {CITY_SUNSET_SOURCE,gradeSunsetRadiance,sunsetFireWeight,sunsetDisplayScale} from '../src/city-sunset-environment.ts';

test('restored photographic sunset retains its source and uncompressed PBR highlights',()=>{
 const bytes=readFileSync(new URL('../public'+CITY_SUNSET_SOURCE.file,import.meta.url));
 assert.equal(bytes.length,CITY_SUNSET_SOURCE.bytes);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'cafc52b99ce15d84bd039826a0333f5ab0259d8c1f4feb2f7faf5fafa039108a');
 const size=64,cube=GetCubeMapTextureData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),size);
 let peak=0;
 for(const [face,key] of (['right','left','up','down','front','back'] as const).entries()){
  gradeSunsetRadiance(cube[key] as Float32Array,face,size);
  for(const value of cube[key]){assert.ok(Number.isFinite(value)&&value>=0);peak=Math.max(peak,value);}
 }
 assert.ok(peak>20,'PBR radiance must not be replaced by an SDR or capped display cube');
});

test('cloud grading separates dark undersides and preserves warm/cool directional identity',()=>{
 assert.equal(sunsetFireWeight(.6,0,.8),1);
 assert.equal(sunsetFireWeight(-.6,0,-.8),0);
 assert.ok(Math.abs(sunsetFireWeight(1e-6,1,0)-sunsetFireWeight(0,1,1e-6))<1e-5,'mask stays continuous at the zenith');
 const size=4,center=(size/2*size+size/2)*3;
 const warm=gradeSunsetRadiance(new Float32Array(size*size*3).fill(2),4,size);
 const cool=gradeSunsetRadiance(new Float32Array(size*size*3).fill(2),5,size);
 assert.ok(warm[center]>warm[center+2]*2,'sunward lit clouds remain orange');
 assert.ok(cool[center+2]>cool[center]*2,'reverse sky remains indigo');
 const clouds=gradeSunsetRadiance(new Float32Array([.4,.4,.4,2,2,2,0,0,0]));
 assert.ok(clouds[2]>clouds[0],'dark undersides retain a cool cast');
 assert.ok(clouds[3]>clouds[5]*2,'bright clouds retain warm colour');
 assert.deepEqual(Array.from(clouds.slice(6)),[0,0,0]);
});

test('sky display shoulder retains highlight differences and colour ratios',()=>{
 const a=20*sunsetDisplayScale(20),b=200*sunsetDisplayScale(200);
 assert.ok(b>a&&b<4.3);
 assert.equal(sunsetDisplayScale(.5),1);
 const rgb=[20,9,3],scale=sunsetDisplayScale(20),display=rgb.map(v=>v*scale);
 assert.ok(Math.abs(display[0]/display[1]-rgb[0]/rgb[1])<.00001);
});
