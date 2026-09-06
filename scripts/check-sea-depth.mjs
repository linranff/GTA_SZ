/** Reproduce high-altitude ground/water depth fighting through ordinary UI input. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=process.argv[2]??'http://127.0.0.1:5173/',out=process.argv[3]??'output/playwright/sea-depth/after',before=process.argv[4]==='before';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:out,size:{width:1920,height:1080}}}),page=await context.newPage();
const errors=[],shots=[],checks=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__,s=a.stats;return {mode:s.lightMode,observer:s.observer,camera:s.camera,water:s.bayWater,performance:a.performance};});
async function aim(yaw,pitch){for(let i=0;i<12;i++){const o=(await read()).observer,a=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),b=pitch-o.pitch;if(Math.abs(a)+Math.abs(b)<.001)break;await page.mouse.move(960,540);await page.mouse.down({button:'right'});await page.mouse.move(960+Math.max(-280,Math.min(280,-a/.0045)),540+Math.max(-180,Math.min(180,b/.0035)),{steps:6});await page.mouse.up({button:'right'});}}
async function shot(name){await page.screenshot({path:`${out}/${name}.png`});shots.push({name,...await read()});console.log('CAPTURE '+name);}
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:150000});await page.keyboard.press('g');await page.keyboard.press('l');await aim(0,.30);
 await page.keyboard.down('Shift');await page.keyboard.down('e');
 for(let i=0;i<32;i++){await page.waitForTimeout(500);if((await read()).observer.position.y>=2199)break;}
 await page.keyboard.up('e');await page.keyboard.up('Shift');
 const o=(await read()).observer;assert.ok(o.position.y>2000,'reach drone ceiling through E flight');
 await page.mouse.move(960,540);await page.mouse.wheel(0,Math.log(12/o.distance)/.0012);await page.waitForTimeout(1000);
 await shot('night-north-high');
 if(!before){assert.ok((await read()).camera.minZ>=100,'actual flight height must override small orbit distance');assert.ok((await read()).water.horizonCoverageBounds[3]>8900,'sea ring starts beyond mainland');checks.push('height-based depth and mainland bounds');}
 await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.keyboard.down('d');
 for(let i=0;i<8;i++){await page.waitForTimeout(200);await shot('night-strafe-'+i);}
 await page.keyboard.up('d');
 await page.keyboard.down('ArrowRight');await page.waitForTimeout(1800);await page.keyboard.up('ArrowRight');await shot('night-turned');
 await aim(1.84,.30);await shot('night-opposite-shore');await page.keyboard.press('l');await page.waitForTimeout(900);await shot('day-opposite-shore');
 await aim(0,.30);await shot('day-north-high');await page.keyboard.down('a');await page.waitForTimeout(1400);await page.keyboard.up('a');await shot('day-north-moved');
 await page.keyboard.press('g');await page.waitForTimeout(900);assert.equal((await read()).camera.minZ,.75);await shot('return-driving');
 await page.keyboard.press('v');await page.waitForTimeout(700);assert.equal((await read()).camera.minZ,.15);await shot('vehicle-inspection');await page.keyboard.press('v');
 await page.keyboard.press('c');await page.waitForTimeout(600);assert.ok((await read()).camera.minZ<.2);await shot('cockpit');checks.push('driving, vehicle inspection and cockpit near planes preserved');
}catch(error){errors.push(String(error));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{const video=page.video();await context.close();await video?.saveAs(`${out}/flight.webm`);await fs.writeFile(`${out}/report.json`,JSON.stringify({url,errors,checks,shots,scope:'Chrome Metal 1920x1080; actual vertical flight + short orbit distance, lateral motion and turning; includes recording overhead.'},null,2));await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
