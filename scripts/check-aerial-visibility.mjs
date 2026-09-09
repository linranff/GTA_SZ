import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const out='output/playwright/aerial-visibility';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
let result;
page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/src/main.ts*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace(/world\s*=\s*new DrivingWorld\(canvas\);/,m=>m+'window.__AERIAL_WORLD__=world;')});});
try{
 await page.goto('http://127.0.0.1:5173/');
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});
 await page.locator('#city-loading').waitFor({state:'detached',timeout:120000});
 await page.evaluate(()=>{
  const w=window.__AERIAL_WORLD__;w.toggleAerial();w.observer.distance=2400;w.observer.pitch=.72;
  const a=window.__AERIAL_AUDIT__={frames:[],drawn:new Set(),capture:false};
  const buildings=new Set(w.blocks.filter(b=>!b.road&&!b.detail).map(b=>b.mesh));
  for(const m of buildings)m.onAfterRenderObservable.add(()=>{if(w.engine.currentRenderPassId===w.camera.renderPassId)a.drawn.add(m.uniqueId);});
  w.scene.onBeforeRenderObservable.add(()=>{a.drawn.clear();});
  w.scene.onAfterRenderObservable.add(()=>{
   if(!a.capture)return;
   const active=w.scene.getActiveMeshes();
   const expected=active.data.slice(0,active.length).filter(m=>buildings.has(m)&&m.isEnabled()&&m.isVisible&&m.visibility>0);
   a.frames.push({frame:w.renderFrames,expected:expected.length,drawn:expected.filter(m=>a.drawn.has(m.uniqueId)).length,missing:expected.filter(m=>!a.drawn.has(m.uniqueId)).map(m=>m.name)});
  });
 });
 // Prime the high-view material variants, then turn rapidly while another
 // glTF streams. Assertions use actual main-camera mesh draws, not visibility flags.
 await page.waitForTimeout(5000);
 await page.evaluate(()=>{const w=window.__AERIAL_WORLD__;window.__AERIAL_AUDIT__.capture=true;void w.ensureRider();window.__AERIAL_ROTATE__=setInterval(()=>w.observer.rotate(20,0),16);});
 await page.waitForTimeout(12000);
 result=await page.evaluate(()=>{clearInterval(window.__AERIAL_ROTATE__);const a=window.__AERIAL_AUDIT__;a.capture=false;return {frames:a.frames,diagnostics:window.__AERIAL_WORLD__.diagnostics()};});
 await page.screenshot({path:`${out}/aerial.png`});
 const missingCity=result.frames.filter(f=>f.expected>=5&&f.drawn===0);
 const missingBlocks=result.frames.filter(f=>f.missing.length);
 result.summary={frames:result.frames.length,cityMissingFrames:missingCity.length,partialMissingFrames:missingBlocks.length,maximumMissing:Math.max(0,...missingBlocks.map(f=>f.missing.length))};
 console.log(JSON.stringify(result.summary));
 if(result.frames.length<100||missingCity.length)throw Error('Aerial city visibility regression');
}catch(e){errors.push(String(e));console.error(e);}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({result,errors},null,2));await browser.close();}
if(errors.length)process.exitCode=1;
