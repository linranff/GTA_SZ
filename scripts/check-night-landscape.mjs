/** Same-view night terrain and road-puddle review, through ordinary UI input. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {observerUI} from './grassland-observer-ui.mjs';
const url=process.argv[2]??'http://127.0.0.1:5173/';
const out=process.argv[3]??'output/playwright/night-landscape/after';
await fs.mkdir(out,{recursive:true});
const errors=[],shots=[],timings=[];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1}),ui=observerUI(page);
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error'||/shader.*(?:fail|error)/i.test(m.text()))errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__,s=a.stats;return {camera:s.camera,observer:s.observer,lightMode:s.lightMode,grass:s.groundRelief?.grassMaterial,meadow:s.landscape?.meadow,puddles:s.rainPuddles,performance:a.performance};});
async function capture(name){await page.waitForTimeout(1200);await page.locator('#ui').evaluate(e=>e.style.visibility='hidden');try{await page.screenshot({path:path.join(out,name+'.png')});shots.push({name,...await read()});console.log('CAPTURE '+name);}finally{await page.locator('#ui').evaluate(e=>e.style.visibility='');}}
async function mode(value){for(let i=0;i<3;i++){if((await read()).lightMode===value)return;await page.keyboard.press('l');await page.waitForTimeout(500);}throw Error('Light mode failed');}
async function measure(name){await page.waitForTimeout(2000);await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(10000);timings.push({name,...await read()});console.log('PERFORMANCE '+JSON.stringify({name,...timings.at(-1).performance}));}
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__.stats.groundRelief.grassMaterial.ready);
 await mode('night');await capture('night-driving');await measure('night-driving');
 await page.keyboard.press('g');const s=await read(),f=s.observer.focus;
 await ui.pose({x:f.x,y:.1,z:f.z},{x:f.x+30,y:85,z:f.z-40});await capture('night-puddles');await mode('sunset');await capture('sunset-puddles');
 await ui.enter('baypark');await ui.pose({x:-2204,y:2.195022106,z:-796},{x:-2204,y:3.192783296,z:-808});
 await mode('night');await capture('night-grass-close');await measure('night-grass-close');
 await mode('day');await capture('day-grass-close');
 await ui.enter('lianhua');await mode('night');await capture('night-lianhua');await measure('night-lianhua');
 await mode('day');await capture('day-lianhua');await mode('night');await capture('night-lianhua-after-cycle');
}catch(error){errors.push(String(error));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({url,createdAt:new Date().toISOString(),viewport:[1920,1080],errors,shots,timings,limitations:'Each timing is a 10-second stationary smoke with the existing frame window, not sustained driving qualification.'},null,2));await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
