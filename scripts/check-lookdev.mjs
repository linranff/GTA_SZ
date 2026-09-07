/** Fixed look-dev reference shots. Every visual change must re-run all of them.
 * Usage: GAME_URL=http://127.0.0.1:5173/ node scripts/check-lookdev.mjs <label>
 * Final numbers must come from `vite preview` of a fresh build; the dev server is for iteration only.
 * Cameras: spawn sunset drive, night/day Binhai Blvd, day Lianhua north panorama,
 * Tencent drone in three lighting modes, anti-solar sunset sky. Stationary 6 s
 * frame-time samples at three of them. Screenshots are 1920x1080 Chrome Metal.
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {observerUI} from './grassland-observer-ui.mjs';
const label=process.argv[2]??new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
const out=`output/playwright/lookdev/${label}`;await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),ui=observerUI(page),errors=[],shots=[],performance={};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__;return {lightMode:a.stats.lightMode,observer:a.stats.observer,camera:a.stats.camera,cinematic:a.stats.cinematic};});
const perf=()=>page.evaluate(()=>{const p=window.__SHENCHENGJI_CITY__.performance;return {meanFps:p.meanFps,p50:p.p50,p95:p.p95,p99:p.p99,over50ms:p.over50ms,gpuMs:p.gpuMs,renderSubmitMs:p.renderSubmitMs,updateMs:p.updateMs,drawCalls:p.drawCalls,triangles:p.triangles,meshes:p.meshes,resolution:p.resolution,samples:p.samples};});
async function shot(name){await page.waitForTimeout(1500);await page.screenshot({path:`${out}/${name}.png`});const info=await read();shots.push({name,lightMode:info.lightMode,camera:info.camera,observer:info.observer.active?info.observer:null});console.log('CAPTURE '+name+' ['+info.lightMode+']');}
async function sample(name,ms=6000){await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(ms);performance[name]=await perf();console.log('PERF '+name+' '+JSON.stringify({fps:+performance[name].meanFps.toFixed(1),p95:+performance[name].p95.toFixed(1),gpuMs:+performance[name].gpuMs.toFixed(2),draws:performance[name].drawCalls}));}
async function aim(yaw,pitch,distance){for(let i=0;i<12;i++){const o=(await read()).observer,a=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),b=pitch-o.pitch;if(Math.abs(a)+Math.abs(b)<.001)break;await page.mouse.move(960,540);await page.mouse.down({button:'right'});await page.mouse.move(960+Math.max(-280,Math.min(280,-a/.0045)),540+Math.max(-180,Math.min(180,b/.0035)),{steps:6});await page.mouse.up({button:'right'});}
 for(let i=0;i<4;i++){const o=(await read()).observer;if(Math.abs(o.distance-distance)<.5)break;await page.mouse.wheel(0,Math.log(distance/o.distance)/.0012);await page.waitForTimeout(150);}}
async function mode(target){for(let i=0;i<3;i++){if((await read()).lightMode===target)return;await page.keyboard.press('l');await page.waitForTimeout(400);}throw Error('light mode '+target+' unreachable');}
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 await page.waitForTimeout(2500);
 await mode('sunset');await shot('01-spawn-sunset');await sample('driving-sunset');
 await mode('night');await shot('02-night-road');await sample('driving-night');
 await mode('day');await shot('03-day-road');
 await ui.enter('lianhua');await aim(0,.24,1800);await shot('04-day-lianhua-north');await sample('drone-day-lianhua');
 await ui.enter('tencent');await aim(-2.2,.28,480);await shot('05-day-tencent-drone');
 await mode('sunset');await shot('06-sunset-tencent-drone');await sample('drone-sunset-tencent');
 await aim(1.26,.10,700);await shot('07-sunset-antisolar-sky');
 await mode('night');await aim(-2.2,.28,480);await shot('08-night-tencent-drone');
 await page.keyboard.press('g');await page.waitForTimeout(800);await mode('sunset');await shot('09-return-driving');
}catch(e){errors.push(String(e));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{
 const summary={label,generated:new Date().toISOString(),errors,shots,performance,scope:'Fixed reference cameras; 1080p Chrome Metal headless; stationary 6 s samples. Human review of the PNGs is required; numbers alone do not prove appearance.'};
 await fs.writeFile(`${out}/report.json`,JSON.stringify(summary,null,2));await browser.close();
}
if(errors.length)throw Error(errors.join('\n'));
