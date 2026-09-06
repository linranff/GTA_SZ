/** Same high-altitude UI views before/after distant city integration. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {observerUI} from './grassland-observer-ui.mjs';
const url=process.argv[2]??'http://127.0.0.1:5173/';
const out=process.argv[3]??'output/playwright/distant-city/after';
const groundOnly=process.argv[4]==='ground';
const errors=[],shots=[],timings=[];
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),ui=observerUI(page);
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__,s=a.stats;return {mode:s.lightMode,observer:s.observer,camera:s.camera,publicLighting:s.publicLighting,performance:a.performance};});
async function capture(name){await page.waitForTimeout(900);const hidden=await page.addStyleTag({content:'#ui,#ui *{visibility:hidden !important}'});await page.screenshot({path:`${out}/${name}.png`});await hidden.evaluate(el=>el.remove());shots.push({name,...await read()});console.log('CAPTURE '+name);}
async function mode(value){for(let i=0;i<3;i++){if((await read()).mode===value)return;await page.keyboard.press('l');await page.waitForTimeout(450);}throw Error('Mode failed');}
async function orbit(yaw,pitch,distance){for(let i=0;i<10;i++){
 const s=(await read()).observer,a=Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw)),b=pitch-s.pitch;
 if(Math.abs(a)<.001&&Math.abs(b)<.001)break;
 await page.mouse.move(960,540);await page.mouse.down({button:'right'});await page.mouse.move(960+Math.max(-300,Math.min(300,-a/.0045)),540+Math.max(-200,Math.min(200,b/.0035)),{steps:5});await page.mouse.up({button:'right'});await page.waitForTimeout(80);
 }const s=(await read()).observer;await page.mouse.wheel(0,Math.log(distance/s.distance)/.0012);await page.waitForTimeout(800);
}
async function measure(name,move=false){await page.waitForTimeout(1800);await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());if(move)await page.keyboard.down('ArrowRight');try{await page.waitForTimeout(10000);}finally{if(move)await page.keyboard.up('ArrowRight');}timings.push({name,...await read()});console.log('PERFORMANCE '+JSON.stringify({name,...timings.at(-1).performance}));}
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 if(groundOnly){
 await mode('night');await capture('night-driving-fresh');await measure('night-driving-fresh');
 await ui.enter('lianhua');await orbit(-.65,.70,3200);await page.keyboard.press('g');await page.waitForTimeout(4000);
 await capture('night-driving-return');await measure('night-driving-return');
 await mode('day');await mode('night');await capture('night-driving-mode-cycle');await measure('night-driving-mode-cycle');
 }else{
 await mode('night');await capture('night-driving-fresh');await measure('night-driving-fresh');
 await ui.enter('lianhua');await orbit(-.65,.70,3200);await mode('day');await capture('day-high');await measure('day-high');
 await mode('night');await capture('night-high');await measure('night-high');
 await orbit(1.4,.58,3200);await capture('night-east');await measure('night-turn',true);await capture('night-turned');
 await orbit(-.65,.35,1430);await capture('night-medium');
 await page.keyboard.press('g');await page.waitForTimeout(800);await capture('night-driving');await measure('night-driving');
 }
}catch(e){errors.push(String(e));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({url,createdAt:new Date().toISOString(),errors,shots,timings,scope:groundOnly?'1920x1080 Chrome Metal; fresh driving, returning from aerial view and light mode cycle.':'1920x1080 Chrome Metal; stationary high/medium/driving views and a 10-second aerial turn.'},null,2));await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
