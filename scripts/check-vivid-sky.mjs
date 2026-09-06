/** Quick actual-render sky review; only UI inputs and read-only diagnostics. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const url=process.argv[2]??'http://127.0.0.1:5173/';
const out=process.argv[3]??'output/playwright/vivid-sky';
const errors=[],shots=[],timings=[];
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__,s=a.stats;return {mode:s.lightMode,observer:s.observer,camera:s.camera,cinematic:s.cinematic,performance:a.performance};});
async function capture(name){await page.waitForTimeout(600);await page.screenshot({path:`${out}/${name}.png`});shots.push({name,...await read()});console.log('CAPTURE '+name);}
async function mode(value){for(let i=0;i<3;i++){if((await read()).mode===value)return;await page.keyboard.press('l');await page.waitForTimeout(350);}throw Error('Sky mode failed');}
async function orbit(yaw,pitch){for(let i=0;i<10;i++){
 const s=(await read()).observer,a=Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw)),b=pitch-s.pitch;
 if(Math.abs(a)<.001&&Math.abs(b)<.001)return;
 await page.mouse.move(960,540);await page.mouse.down({button:'right'});
 await page.mouse.move(960+Math.max(-300,Math.min(300,-a/.0045)),540+Math.max(-200,Math.min(200,b/.0035)),{steps:5});await page.mouse.up({button:'right'});await page.waitForTimeout(70);
}throw Error('Sky orientation failed');}
async function measure(name){await page.waitForTimeout(1000);await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(8500);timings.push({name,...await read()});console.log('PERFORMANCE '+JSON.stringify({name,...timings.at(-1).performance}));}
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:150000});
 await page.addStyleTag({content:'#ui,#ui *{visibility:hidden !important}'});
 await mode('night');await capture('night-driving');await measure('night-driving');
 await page.keyboard.press('g');await page.waitForTimeout(300);
 for(const [name,yaw] of [['north',0],['east',Math.PI/2],['south',Math.PI],['west',-Math.PI/2]]){await orbit(yaw,-.28);await capture('night-'+name);}
 await orbit(0,-.82);await capture('night-milky-way');await measure('night-milky-way');
 await mode('day');await orbit(0,-.28);await capture('day-north');await orbit(Math.PI/2,-.28);await capture('day-east');
 await mode('sunset');await capture('sunset');await mode('night');await capture('night-after-cycle');
}catch(e){errors.push(String(e));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({url,createdAt:new Date().toISOString(),viewport:[1920,1080],errors,shots,timings,scope:'Short stationary render review on current hardware, not sustained driving qualification.'},null,2));await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
