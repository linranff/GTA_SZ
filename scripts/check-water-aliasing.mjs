/** Actual GPU water views, using only normal camera controls and read-only diagnostics. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const url=process.argv[2]??'http://127.0.0.1:5173/';
const out=process.argv[3]??'output/playwright/water-beacons/water-after';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],shots=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__;return {mode:a.stats.lightMode,observer:a.stats.observer,water:a.stats.bayWater,performance:a.performance};});
async function aim(yaw,pitch,distance){
 for(let i=0;i<10;i++){
  const o=(await read()).observer,a=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),b=pitch-o.pitch;
  if(Math.abs(a)+Math.abs(b)<.001)break;
  await page.mouse.move(960,540);await page.mouse.down({button:'right'});
  await page.mouse.move(960+Math.max(-300,Math.min(300,-a/.0045)),540+Math.max(-180,Math.min(180,b/.0035)),{steps:6});
  await page.mouse.up({button:'right'});
 }
 const o=(await read()).observer;await page.mouse.wheel(0,Math.log(distance/o.distance)/.0012);
 await page.waitForTimeout(1800);
}
async function mode(target){for(let i=0;i<3&&(await read()).mode!==target;i++){await page.keyboard.press('l');await page.waitForTimeout(400);}}
async function capture(name){
 await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(4500);
 await page.screenshot({path:`${out}/${name}.png`});shots.push({name,...await read()});console.log('CAPTURE '+name);
}
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:150000});
 await page.keyboard.press('g');await mode('day');
 await aim(1.84,.35,420);await capture('day-bay');
 await aim(1.84,.075,95);await capture('day-grazing');
 await aim(1.84,.70,2600);await capture('day-high');
 await mode('night');await capture('night-high');
 await aim(1.84,.35,420);await capture('night-bay');
 await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.keyboard.down('ArrowRight');await page.waitForTimeout(4500);await page.keyboard.up('ArrowRight');
 shots.push({name:'night-turn',...await read()});
}catch(error){errors.push(String(error));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({url,createdAt:new Date().toISOString(),viewport:[1920,1080],errors,shots,scope:'Short Chrome Metal samples; visual review required separately, not a sustained frame-rate guarantee.'},null,2));await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
