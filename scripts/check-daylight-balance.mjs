/** Matched sunshine, car-paint and facade review through ordinary game controls. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {observerUI} from './grassland-observer-ui.mjs';
const url=process.argv[2]??'http://127.0.0.1:5173/',out=process.argv[3]??'output/playwright/daylight-balance/after';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),ui=observerUI(page),errors=[],shots=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__,s=a.stats;return {mode:s.lightMode,observer:s.observer,camera:s.camera,cinematic:s.cinematic,car:s.lighting.carPaint,performance:a.performance};});
async function mode(value){for(let i=0;i<3;i++){if((await read()).mode===value)return;await page.keyboard.press('l');await page.waitForTimeout(400);}throw Error('Lighting mode failed');}
async function orbit(yaw,pitch,distance){for(let i=0;i<12;i++){const o=(await read()).observer,a=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),b=pitch-o.pitch;if(Math.abs(a)+Math.abs(b)<.001)break;await page.mouse.move(960,540);await page.mouse.down({button:'right'});await page.mouse.move(960+Math.max(-280,Math.min(280,-a/.0045)),540+Math.max(-180,Math.min(180,b/.0035)),{steps:6});await page.mouse.up({button:'right'});}const o=(await read()).observer;await page.mouse.wheel(0,Math.log(distance/o.distance)/.0012);await page.waitForTimeout(400);}
async function shot(name){await page.waitForTimeout(1800);const hidden=await page.addStyleTag({content:'#ui,#ui *,#toast{visibility:hidden!important}'});await page.screenshot({path:`${out}/${name}.png`});await hidden.evaluate(e=>e.remove());shots.push({name,...await read()});console.log('CAPTURE '+name);}
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:150000});await mode('day');await shot('day-driving');
 await page.keyboard.press('v');await orbit(-2.07,.18,7.7);await shot('day-car-rear');await orbit(1.05,.20,7.7);await shot('day-car-front');
 await ui.enter('bamboo');await orbit(-.65,.32,650);await shot('day-city');
 await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(6000);const performance=await read();await fs.writeFile(`${out}/performance.json`,JSON.stringify(performance,null,2));
 await ui.enter('baypark');await orbit(Math.PI,.10,180);await shot('day-bay');
 await mode('sunset');await shot('sunset-after-cycle');await mode('night');await shot('night-after-cycle');await mode('day');await shot('day-after-cycle');
}catch(error){errors.push(String(error));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({url,createdAt:new Date().toISOString(),errors,shots,scope:'Chrome Metal 1920x1080; matching UI camera poses; 6-second stationary city sample, not a sustained performance guarantee.'},null,2));await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
