/** Matched daylight/coast cameras using the game's normal map and camera controls.
 * GAME_URL=http://127.0.0.1:4173 node scripts/check-daylight-coast.mjs before|after
 * Review PNGs as well as report.json; stationary samples do not prove driving FPS.
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {observerUI} from './grassland-observer-ui.mjs';
const label=process.argv[2]??'after',out=`output/playwright/daylight-coast/${label}`;
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const ui=observerUI(page),errors=[],shots=[],resources=[],samples={};
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|feedback loop|Error compiling/i.test(m.text()))errors.push(m.text().slice(0,2000));});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);if(r.request().resourceType()==='script')resources.push(r);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__;return {stats:a.stats,performance:a.performance};});
async function mode(target){for(let i=0;i<3;i++){if((await read()).stats.lightMode===target)return;await page.keyboard.press('l');await page.waitForTimeout(500);}throw Error('Cannot enter '+target);}
async function aim(yaw,pitch,distance){
 for(let i=0;i<12;i++){const o=await ui.read(),a=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),b=pitch-o.pitch;if(Math.abs(a)+Math.abs(b)<.001)break;await page.mouse.move(960,540);await page.mouse.down({button:'right'});await page.mouse.move(960+Math.max(-280,Math.min(280,-a/.0045)),540+Math.max(-180,Math.min(180,b/.0035)),{steps:6});await page.mouse.up({button:'right'});}
 for(let i=0;i<4;i++){const o=await ui.read();if(Math.abs(o.distance-distance)<.05)break;await page.mouse.wheel(0,Math.log(distance/o.distance)/.0012);await page.waitForTimeout(150);}
}
async function shot(name){await page.waitForTimeout(2200);const hidden=await page.addStyleTag({content:'#ui,#ui *,#toast{visibility:hidden!important;opacity:0!important}'});await page.screenshot({path:`${out}/${name}.png`});await hidden.evaluate(e=>e.remove());shots.push({name,...await read()});console.log('CAPTURE '+name);}
async function sample(name){await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(8000);samples[name]=(await read()).performance;console.log('SAMPLE '+name+' '+samples[name].meanFps.toFixed(1)+' FPS');}
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 await page.waitForTimeout(2500);await mode('day');await shot('01-day-road');await sample('day-road');
 await page.keyboard.press('v');await aim(-2.07,.18,7.7);await shot('02-day-car-rear');await aim(1.05,.20,7.7);await shot('03-day-car-front');
 await ui.enter('baypark');await aim(Math.PI,.006,180);await shot('04-bay-low');await sample('bay-low');
 await aim(Math.PI,.16,180);await shot('05-bay-raised');
 await aim(Math.PI,.24,1700);await shot('06-bay-aerial');
 await aim(-Math.PI/2,.02,1500);await shot('07-west-coast');
 // The map's park pin is inland; inspect an actual shoreline position too.
 await ui.pose({x:-1500,y:1.5,z:-795},{x:-784,y:2,z:-795});await shot('07b-coast-eye-height');
 await ui.pose({x:-1500,y:1.5,z:-795},{x:-784,y:25,z:-795});await shot('07c-coast-25m');
 await ui.enter('bamboo');await aim(-.65,.32,650);await shot('08-day-city');
 await mode('sunset');await shot('09-sunset-city');await mode('night');await shot('10-night-city');
 await page.keyboard.press('g');await mode('day');await shot('11-return-day-road');
}catch(e){errors.push(String(e));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{
 const hashes=[],seen=new Set();for(const r of resources){if(seen.has(r.url()))continue;seen.add(r.url());try{hashes.push({url:r.url(),sha256:createHash('sha256').update(await r.body()).digest('hex')});}catch{}}
 await fs.writeFile(`${out}/report.json`,JSON.stringify({label,date:new Date().toISOString(),errors,hashes,shots,samples,scope:'1920×1080 DPR1, Chrome Metal; ordinary UI cameras and lighting switch. Eight-second stationary samples.'},null,2));await browser.close();
}
if(errors.length)throw Error(errors.join('\n'));
