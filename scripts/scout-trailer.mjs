/** Read-only location scouting for a 120 s trailer, using in-game map/orbit UI. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {observerUI} from './grassland-observer-ui.mjs';
const out='output/playwright/trailer-scout';await fs.mkdir(out,{recursive:true});
const extra=process.argv.includes('--extra');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),ui=observerUI(page),errors=[],shots=[],resources=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,1200));});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);if(r.request().resourceType()==='script')resources.push(r);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__;return {mode:a.stats.lightMode,observer:a.stats.observer,camera:a.stats.camera,performance:a.performance};});
async function mode(target){for(let i=0;i<3;i++){if((await read()).mode===target)return;await page.keyboard.press('l');await page.waitForTimeout(500);}throw Error('Cannot enter '+target);}
async function aim(yaw,pitch,distance){
 for(let i=0;i<12;i++){const o=await ui.read(),a=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),b=pitch-o.pitch;if(Math.abs(a)+Math.abs(b)<.001)break;await page.mouse.move(960,540);await page.mouse.down({button:'right'});await page.mouse.move(960+Math.max(-280,Math.min(280,-a/.0045)),540+Math.max(-180,Math.min(180,b/.0035)),{steps:6});await page.mouse.up({button:'right'});}
 await page.mouse.wheel(0,Math.log(distance/(await ui.read()).distance)/.0012);await page.waitForTimeout(500);
}
async function shot(name){await page.waitForTimeout(1400);const h=await page.addStyleTag({content:'#ui,#ui *,#toast{visibility:hidden!important} #toast{display:none!important}'});await page.screenshot({path:`${out}/${name}.png`});await h.evaluate(el=>el.remove());shots.push({name,...await read()});console.log('SCOUT '+name);}
try{
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 if(extra){
 await ui.enter('bamboo');await aim(-.55,-.05,780);await mode('night');await shot('16-bamboo-reflection-wide');
 await ui.enter('lianhua');await aim(Math.PI,.26,850);await mode('day');await shot('17-lianhua-cbd-reveal');
 await ui.enter('bamboo');await aim(1.15,.26,2000);await mode('sunset');await shot('18-nanshan-coastal-aerial');
 await ui.enter('civic');await aim(-.90,.42,1700);await mode('day');await shot('19-futian-day-aerial');
 await mode('night');await shot('20-futian-night-aerial');await mode('sunset');await shot('21-futian-sunset-aerial');
 await page.keyboard.press('g');await shot('22-binhai-drive-sunset');
 }else{
 await ui.enter('bamboo');await aim(-.55,-.035,650);await mode('night');await shot('01-bamboo-night-water');await mode('day');await shot('02-bamboo-day-water');
 await aim(-.85,.14,400);await mode('sunset');await shot('03-bamboo-sunset-facade');
 await ui.enter('lianhua');await aim(0,.28,1450);await mode('day');await shot('04-lianhua-wide');await aim(0,.22,800);await shot('05-lianhua-push');
 await ui.enter('tencent');await aim(-2.2,.28,340);await mode('day');await shot('06-tencent-day');await mode('night');await shot('07-tencent-night');
 await ui.enter('civic');await aim(0,.22,310);await mode('day');await shot('08-civic-day');
 await ui.enter('fortune-plaza');await aim(-.60,.18,140);await mode('sunset');await shot('09-fortune-sunset');
 await ui.enter('qijie-gongguan');await aim(-1.25,.15,165);await mode('day');await shot('10-qijie-day');
 await ui.enter('mixc-world');await aim(-1.4,.20,430);await shot('11-mixc-day');
 await ui.enter('bamboo');await aim(-2.2,.35,2700);await mode('sunset');await shot('12-bay-sunset-wide');
 await page.keyboard.press('g');await mode('day');await shot('13-binhai-drive-day');await mode('night');await shot('14-binhai-drive-night');
 }
}catch(e){errors.push(String(e));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{const hashes=[],seen=new Set();for(const r of resources){if(seen.has(r.url()))continue;seen.add(r.url());try{hashes.push({url:r.url(),sha256:createHash('sha256').update(await r.body()).digest('hex')});}catch{}}
 await fs.writeFile(`${out}/${extra?'report-extra':'report'}.json`,JSON.stringify({date:new Date().toISOString(),errors,hashes,shots,scope:'Current live game location scouting; 1080p still frames, no claim that camera motion or offline video export has been implemented.'},null,2));await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
