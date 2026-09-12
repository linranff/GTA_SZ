import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CITY_GRAPHICS_STORAGE_KEY,cityGraphicsRenderRatio,loadCityGraphicsQuality,resolveCityGraphicsQuality,saveCityGraphicsQuality} from '../src/city-graphics-quality.ts';

test('a valid review URL overrides the saved profile; malformed values fall back safely',()=>{
 assert.equal(resolveCityGraphicsQuality('high','low'),'high');
 assert.equal(resolveCityGraphicsQuality('ultra','low'),'low');
 assert.equal(resolveCityGraphicsQuality(null,'HIGH'),'medium');
 assert.equal(resolveCityGraphicsQuality('__proto__',null),'medium');
});
test('blocked storage does not prevent starting or changing quality',()=>{
 const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
 assert.equal(loadCityGraphicsQuality('?quality=low',blocked),'low');
 assert.equal(loadCityGraphicsQuality('',blocked),'medium');
 assert.equal(saveCityGraphicsQuality('high',blocked),false);
 let saved:string|null=null;
 const storage={getItem(key:string){assert.equal(key,CITY_GRAPHICS_STORAGE_KEY);return saved;},setItem(key:string,value:string){assert.equal(key,CITY_GRAPHICS_STORAGE_KEY);saved=value;}};
 assert.equal(saveCityGraphicsQuality('low',storage),true);
 assert.equal(loadCityGraphicsQuality('',storage),'low');
});
test('render resolution respects pixel budgets on Retina, 4K and ultrawide viewports',()=>{
 for(const [w,h,dpr] of [[1920,1080,2],[3840,2160,1],[3440,1440,1],[1280,720,2]]){
  const high=cityGraphicsRenderRatio('high',w,h,dpr),low=cityGraphicsRenderRatio('low',w,h,dpr);
  assert.ok(w*h*high*high<=1920*1080+1);
  assert.ok(w*h*low*low<=1600*900+1);
  assert.ok(low<=high&&high<=Math.min(dpr,1.5));
 }
 assert.equal(cityGraphicsRenderRatio('high',1920,1080,2),1);
 assert.equal(cityGraphicsRenderRatio('low',1920,1080,1),5/6);
 assert.ok(Number.isFinite(cityGraphicsRenderRatio('medium',0,NaN,Infinity)));
});
