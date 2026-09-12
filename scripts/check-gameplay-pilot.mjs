import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const out='output/playwright/gameplay-pilot';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const report={viewport:[1920,1080],errors,checks:[]};
try{
 if(process.env.ONLY_CITY!=='1'){
 await page.goto('http://127.0.0.1:5287/combat-lab.html');
 await page.waitForFunction(()=>window.__combatLab);
 await page.locator('#start').click();
 await page.waitForFunction(()=>document.pointerLockElement?.id==='range');
 report.checks.push('real start button acquires pointer lock');
 await page.mouse.click(960,540);
 await page.waitForFunction(()=>Number(document.querySelector('#shots').textContent)===1);
 await page.keyboard.press('r');
 await page.waitForFunction(()=>document.querySelector('#ammo').textContent.trim()==='10');
 report.checks.push('mouse click fires; reload replenishes magazine');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.querySelector('#paused').hidden);
 await page.waitForFunction(()=>!document.pointerLockElement);
 const releasedShots=await page.locator('#shots').textContent();
 await page.mouse.click(960,540);
 assert.equal(await page.locator('#shots').textContent(),releasedShots);
 await page.waitForTimeout(1600);
 await page.locator('#resume').click();
 await page.waitForFunction(()=>document.pointerLockElement?.id==='range');
 report.checks.push('Escape pauses and releases; paused click cannot shoot; resume button reacquires pointer');
 await page.screenshot({path:`${out}/combat-live.png`});
 report.combat=await page.evaluate(()=>window.__combatLab.samplePerf());
 }
 if(process.env.ONLY_COMBAT!=='1'){
 await page.goto('http://127.0.0.1:5287/');
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 await page.locator('#city-loading').waitFor({state:'detached',timeout:60000});
 await page.locator('.story-entry').waitFor({state:'visible',timeout:30000});
 await page.locator('.story-entry').click();
 await page.locator('.story-hud').waitFor({state:'visible'});
 assert.match(await page.locator('.story-hud').textContent(),/海湾生活驿站/);
 await page.locator('#map-button').click();
 await page.keyboard.press('Escape');
 report.checks.push('city loads; story starts with hub objective; map still opens and closes');
 await page.screenshot({path:`${out}/city-story-live.png`});
 // Position fixtures exercise actual UI, persistence, route and wallet wiring;
 // they are deliberately not driving-time or collision/performance evidence.
 await page.keyboard.press('f');
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.world.walk?.active,null,{timeout:60000});
 async function moveTo(point){
  await page.evaluate(async([x,z])=>{
   const w=window.__SHENCHENGJI_CITY__.world;
   w.cancelAutoDrive('qa-position-fixture');w.keys.clear();
   while(Math.hypot(w.walk.x-x,w.walk.z-z)>.1){
    const d=Math.hypot(w.walk.x-x,w.walk.z-z),k=Math.min(20/d,1);
    w.walk.x+=(x-w.walk.x)*k;w.walk.z+=(z-w.walk.z)*k;w.walk.speed=0;
    await new Promise(requestAnimationFrame);
   }
  },point);
 }
 const beforeCash=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.career.cash);
 report.branches=[];
 for(const branch of ['go-bay-direct','detour-park']){
  if(branch==='detour-park')await page.locator('.story-entry').click();
  const visited=[];
  for(let guard=0;guard<35;guard++){
   const state=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.story);
   if(state.phase==='done')break;
   if(state.phase==='travel'){
    visited.push(state.step.id);await moveTo(state.step.point);
    await page.keyboard.press('e');
    await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.story.phase!=='travel');
   }else if(state.phase==='dialogue'){
    if(state.step.id==='office-meet')await page.screenshot({path:`${out}/story-dialogue.png`});
    await page.locator('.story-dialog [data-story="continue"]').click();
   }else if(state.phase==='choice'){
    await page.screenshot({path:`${out}/story-choice.png`});
    await page.locator(`[data-choice="${branch}"]`).click();
   }else throw Error(`Unexpected story phase ${state.phase}`);
  }
  const end=await page.evaluate(()=>({story:window.__SHENCHENGJI_CITY__.stats.story,cash:window.__SHENCHENGJI_CITY__.stats.career.cash,paused:window.__SHENCHENGJI_CITY__.world.paused}));
  assert.equal(end.story.phase,'done');assert.equal(end.story.payout,'paid');assert.equal(end.cash,beforeCash+180);assert.equal(end.paused,false);
  assert.equal(visited.includes('park-help'),branch==='detour-park');
  report.branches.push({branch,visited,cash:end.cash,method:'incremental position fixture + actual DOM buttons and main wallet'});
 }
 await page.keyboard.press('y');
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.rainWeather.enabled);
 report.rain=await page.evaluate(()=>({road:window.__SHENCHENGJI_CITY__.stats.roadSurface,puddles:window.__SHENCHENGJI_CITY__.stats.rainPuddles,weather:window.__SHENCHENGJI_CITY__.stats.rainWeather}));
 assert.equal(report.rain.road.raining,true);assert.equal(report.rain.puddles.raining,true);
 await page.screenshot({path:`${out}/rain-retained.png`});
 await page.keyboard.press('y');
 await page.waitForFunction(()=>!window.__SHENCHENGJI_CITY__.stats.rainWeather.enabled);
 report.checks.push('both story branches complete through main; shared wallet pays once; Y rain toggles and wet road reflection retained');
 report.story=await page.evaluate(()=>({save:localStorage.getItem('shenchengji-city-story-v1'),api:Object.keys(window.__SHENCHENGJI_CITY__)}));
 }
 assert.equal(errors.length,0,errors.join('\n'));
}catch(error){
 report.failure=String(error);
 report.failureState=await page.evaluate(()=>({at:location.href,lock:!!document.pointerLockElement,combat:window.__combatLab?.core.view,target:document.elementFromPoint(960,540)?.outerHTML.slice(0,300)})).catch(()=>null);
 await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});
 throw error;
}finally{
 await fs.writeFile(`${out}/review.json`,JSON.stringify(report,null,2)+'\n');
 await fs.writeFile(`${out}/${process.env.ONLY_COMBAT==='1'?'combat':process.env.ONLY_CITY==='1'?'city':'full'}-review.json`,JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
console.log(JSON.stringify({checks:report.checks,errors:report.errors,branches:report.branches,combat:report.combat},null,2));
