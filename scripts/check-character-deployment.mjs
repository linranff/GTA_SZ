import {chromium} from 'playwright';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Run against a real static production preview, not the development middleware.
const base=process.env.CHARACTER_PREVIEW_URL??'http://127.0.0.1:4174';
const out='output/playwright/character-deployment';await mkdir(out,{recursive:true});
const checks=[],errors=[],requests=[];
const check=(name,data)=>{checks.push({name,pass:true,data});console.log(name,JSON.stringify(data??{}));};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
 assert.deepEqual((await readdir('dist/characters')).sort(),['CREDITS.txt','kuki.glb','manifest.json','yelan.glb']);
 const html=await (await context.request.get(base)).text();assert.ok(html.includes('/assets/')&&!html.includes('/@vite/client'));
 const manifest=await (await context.request.get(base+'/characters/manifest.json')).json();
 for(const model of manifest.models){
  const response=await context.request.get(base+'/characters/'+model.file);assert.equal(response.status(),200);
  const bytes=await response.body();assert.equal(bytes.length,model.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),model.sha256);
  assert.ok(bytes.equals(await readFile('local-only/characters/'+model.file)));
 }
 check('production HTTP serves both complete GLBs; bundle contains no source PMX, ZIP or blend');
 let rejectPlayer=true;
 await page.route('**/characters/kuki.glb',r=>rejectPlayer?r.fulfill({status:503,body:'Injected deployment failure'}):r.continue());
 await page.goto(base);await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});
 await page.locator('#city-loading').waitFor({state:'detached',timeout:120000});
 await page.waitForFunction(()=>!window.__SHENCHENGJI_CITY__.world.riderLoading);
 const fallback=await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;return {mode:w.controlMode,rider:!!w.rider};});
 assert.equal(fallback.mode,'car');assert.equal(fallback.rider,false);
 await page.keyboard.down('w');await page.waitForTimeout(400);await page.keyboard.up('w');
 assert.ok(await page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.state.speed>0));
 check('failed production character request keeps driving available',fallback);
 await page.evaluate(()=>{window.__SHENCHENGJI_CITY__.world.state.speed=0;});
 rejectPlayer=false;await page.locator('#character-loading button').click();
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.rider,null,{timeout:120000});
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.walk.active);
 const rider=await page.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;return {name:w.rider.name,mode:w.controlMode,texturesReady:w.rider.meshes.every(m=>m.material.getActiveTextures().every(t=>t.isReady()))};});
 assert.equal(rider.name,'久岐忍');assert.equal(rider.mode,'walking');assert.ok(rider.texturesReady);
 check('production retry loads playable Kuki with embedded textures',rider);
 await page.screenshot({path:out+'/kuki-production.png'});
 await page.evaluate(async()=>{await window.__SHENCHENGJI_CITY__.world.bambooCafe.ensureInterior();});
 const cafe=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.world.bambooCafe.stats.characters);
 assert.equal(cafe.assignments.zhixia,'yelan');assert.equal(cafe.assignments.wangshu,'yelan');assert.equal(cafe.assignments.xiaolan,'jk');assert.equal(cafe.animation.independentSkeletons,3);
 check('production cafe loads two independent Yelans and retains JK',cafe.assignments);
 assert.ok(!requests.some(url=>url.includes('/__local-characters/')));
 assert.ok(requests.some(url=>url.endsWith('/characters/kuki.glb'))&&requests.some(url=>url.endsWith('/characters/yelan.glb')));
 assert.equal(errors.length,0);check('no development-only requests or uncaught browser errors');
}catch(e){console.error(e);errors.push(String(e));process.exitCode=1;}
finally{await browser.close();await writeFile(out+'/report.json',JSON.stringify({checks,errors},null,2));}
