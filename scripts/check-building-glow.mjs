/** Current-build screenshots and short GPU/performance smoke; no asset rebuilds.
 * node scripts/check-building-glow.mjs [URL] [output-directory]
 * Use the same URL/build type, viewport and machine for before/after runs.
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const url=process.argv[2]??'http://127.0.0.1:5173/';
const out=process.argv[3]??'output/playwright/building-glow/after';
await fs.mkdir(out,{recursive:true});
const errors=[],shots=[],timings=[];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error'||/shader.*(?:error|failed)/i.test(m.text()))errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__;return {camera:a.stats.camera,observer:a.stats.observer,lightMode:a.stats.lightMode,cinematic:a.stats.cinematic,facadeDiversity:a.stats.facadeDiversity,performance:a.performance};});
async function shot(name){await page.waitForTimeout(1200);const bytes=await page.screenshot({path:path.join(out,name+'.png')});shots.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),...await read()});console.log('CAPTURE '+name);}
async function mode(value){for(let i=0;i<3;i++){if((await read()).lightMode===value)return;await page.keyboard.press('l');await page.waitForTimeout(400);}throw Error('Light mode did not switch');}
async function measure(name){await page.waitForTimeout(3000);await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(12000);const result=await read();timings.push({name,seconds:12,...result});console.log('PERFORMANCE '+JSON.stringify({name,...result.performance}));}
async function drag(dx,dy,pan=false){await page.mouse.move(960,540);if(pan)await page.keyboard.down('Shift');await page.mouse.down();await page.mouse.move(960+dx,540+dy,{steps:12});await page.mouse.up();if(pan)await page.keyboard.up('Shift');}
async function orbit(yaw,pitch,distance){const s=(await read()).observer;await drag(Math.atan2(Math.sin(s.yaw-yaw),Math.cos(s.yaw-yaw))/.0045,(pitch-s.pitch)/.0035);await page.mouse.wheel(0,Math.log(distance/s.distance)/.0012);await page.waitForTimeout(300);}
async function panFocus(target){
 // At yaw=0 the pan plane moves x/y; yaw=PI/2 then supplies z/y.
 await orbit(0,0,70);let s=(await read()).observer,scale=2*s.distance*Math.tan(.85/2)/1080;
 await drag(-(target.x-s.focus.x)/scale,(target.y-s.focus.y)/scale,true);
 await orbit(Math.PI/2,0,70);s=(await read()).observer;scale=2*s.distance*Math.tan(.85/2)/1080;
 await drag((target.z-s.focus.z)/scale,0,true);
}
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 await page.waitForFunction(()=>!window.__SHENCHENGJI_CITY__.performance.facades?.pending);
 await page.locator('#ui').evaluate(el=>el.style.visibility='hidden');
 await shot('sunset');await mode('night');await shot('night');await measure('night-driving-view');
 await page.keyboard.press('g');await shot('night-drone');await measure('night-drone');
 // A real ordinary building near the opening road, viewed from its south face.
 await panFocus({x:-2662.188,y:14,z:-791.424});await orbit(0,.06,45);
 await shot('night-windows-close');await mode('sunset');await shot('sunset-windows-close');
 await mode('day');await shot('day-windows-close');
 await page.keyboard.press('g');await shot('day');
 await mode('night');await shot('night-after-mode-cycle');
}finally{
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({url,createdAt:new Date().toISOString(),viewport:[1920,1080],errors,shots,timings,limitations:'12-second stationary view smoke, not sustained driving qualification. Camera movement uses ordinary mouse/keyboard input. Same-facade bounce approximates local diffuse light; no ground spill or volume scattering.'},null,2));
 await browser.close();
}
if(errors.length)throw Error(errors.join('\n'));
