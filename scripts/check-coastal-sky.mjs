/** Current-build coastal edge, sparse daytime clouds and sea-reflection review. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {observerUI} from './grassland-observer-ui.mjs';
const url=process.argv[2]??'http://127.0.0.1:5173/';
const out=process.argv[3]??'output/playwright/coastal-sky/after';
const errors=[],shots=[],timings=[];
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),ui=observerUI(page);
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__,s=a.stats;return {mode:s.lightMode,observer:s.observer,camera:s.camera,cinematic:s.cinematic,bayWater:s.bayWater,performance:a.performance};});
const hidden=()=>page.addStyleTag({content:'#ui,#ui *,#toast{visibility:hidden !important}'});
async function capture(name){await page.waitForTimeout(1200);const h=await hidden();await page.screenshot({path:`${out}/${name}.png`});await h.evaluate(el=>el.remove());shots.push({name,...await read()});console.log('CAPTURE '+name);}
async function mode(value){for(let i=0;i<3;i++){if((await read()).mode===value)return;await page.keyboard.press('l');await page.waitForTimeout(450);}throw Error('Mode failed');}
async function orbit(yaw,pitch,distance){for(let i=0;i<10;i++){
 const s=(await read()).observer,a=Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw)),b=pitch-s.pitch;
 if(Math.abs(a)<.001&&Math.abs(b)<.001)break;
 await page.mouse.move(960,540);await page.mouse.down({button:'right'});await page.mouse.move(960+Math.max(-300,Math.min(300,-a/.0045)),540+Math.max(-200,Math.min(200,b/.0035)),{steps:5});await page.mouse.up({button:'right'});await page.waitForTimeout(80);
 }const s=(await read()).observer;await page.mouse.wheel(0,Math.log(distance/s.distance)/.0012);await page.waitForTimeout(800);
}
async function measure(name){const h=await hidden();await page.waitForTimeout(1800);await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(10000);timings.push({name,...await read()});await h.evaluate(el=>el.remove());console.log('PERFORMANCE '+JSON.stringify({name,...timings.at(-1).performance}));}
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 await ui.enter('bamboo');await orbit(-2.2,.35,3200);await mode('sunset');await capture('sunset-mountain-west');
 await orbit(Math.PI,.45,3200);await capture('sunset-mountain-south');await measure('high-coast');
 await mode('day');await capture('day-mountain-south');
 await ui.enter('baypark');await orbit(Math.PI,.055,350);await capture('day-sea');await measure('day-sea');
 await ui.pulse('w',12500);await capture('day-sea-open');
 await orbit(Math.PI,-.24,120);await capture('day-sky-south');await orbit(Math.PI/2,-.24,120);await capture('day-sky-east');await orbit(0,-.40,120);await capture('day-sky-north');
 await mode('night');await capture('night-after-cycle');
}catch(e){errors.push(String(e));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({url,createdAt:new Date().toISOString(),errors,shots,timings,scope:'1920x1080 Chrome Metal; same UI camera controls, UI hidden during screenshots and 10-second measurements. Short samples, not a sustained performance qualification.'},null,2));await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
