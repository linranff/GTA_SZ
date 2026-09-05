import {chromium} from 'playwright';import fs from 'node:fs/promises';import path from 'node:path';
const out=path.resolve(process.argv[2]??'output/playwright/building-signs-view');await fs.mkdir(out,{recursive:true});const errors=[],shots=[];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,1800));});
const obs=()=>page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.observer);
async function pulse(k,ms,fast=false){if(fast)await page.keyboard.down('Shift');await page.keyboard.down(k);await page.waitForTimeout(ms);await page.keyboard.up(k);if(fast)await page.keyboard.up('Shift');await page.waitForTimeout(70);}
async function drag(dx,dy){await page.mouse.move(960,540);await page.mouse.down({button:'right'});await page.mouse.move(960+dx,540+dy,{steps:10});await page.mouse.up({button:'right'});await page.waitForTimeout(100);}
async function aim(focus,position){const dx=focus[0]-position[0],dy=position[1]-focus[1],dz=focus[2]-position[2],dist=Math.hypot(dx,dy,dz),yaw=Math.atan2(dx,dz),pitch=Math.asin(dy/dist);
 for(let i=0;i<12;i++){const o=await obs(),yd=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),pd=pitch-o.pitch;if(Math.abs(yd)+Math.abs(pd)<.002)break;await drag(Math.max(-280,Math.min(280,-yd/.0045)),Math.max(-180,Math.min(180,pd/.0035)));}
 await page.mouse.wheel(0,Math.log(dist/(await obs()).distance)/.0012);await page.waitForTimeout(300);
 for(let i=0;i<100;i++){const o=await obs(),ex=focus[0]-o.focus.x,ey=focus[1]-o.focus.y,ez=focus[2]-o.focus.z;if(Math.hypot(ex,ey,ez)<.5)return;const forward=ex*Math.sin(o.yaw)+ez*Math.cos(o.yaw),right=ex*Math.cos(o.yaw)-ez*Math.sin(o.yaw),a=[{e:forward,p:'w',n:'s'},{e:right,p:'d',n:'a'},{e:ey,p:'e',n:'q'}].sort((a,b)=>Math.abs(b.e)-Math.abs(a.e))[0],fast=Math.abs(a.e)>8,speed=Math.max(4,Math.min(90,o.distance*.13))*(fast?3:1);await pulse(a.e>0?a.p:a.n,Math.max(16,Math.min(900,Math.abs(a.e)/speed*780)),fast);}
 throw Error('Failed to reach sign camera using UI');}
async function shot(name){const file=path.join(out,name+'.png');await page.screenshot({path:file});shots.push({name,file,observer:await obs(),signs:await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.buildingSigns)});}
try{
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});await page.waitForTimeout(1200);await page.keyboard.press('g');
 const manifest=JSON.parse(await fs.readFile('public/city/building-signs.json','utf8'));const sign=manifest.signs.find(s=>s.text==='明日发薪'&&Math.abs(s.position[0]+2685)<3);if(!sign)throw Error('Reference sign missing');
 const focus=sign.position,eye=[focus[0]+sign.normal[0]*32,focus[1]+2,focus[2]+sign.normal[2]*32];await aim(focus,eye);await page.waitForTimeout(900);await shot('01-sign-day-readable');await page.keyboard.press('l');await page.waitForTimeout(1000);await shot('02-sign-night-neon');
 await page.mouse.wheel(0,Math.log(4)/.0012);await page.waitForTimeout(1000);await shot('03-neighborhood-signs');
}catch(e){errors.push(String(e));}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({errors,shots,pass:!errors.length},null,2));await browser.close();}console.log(JSON.stringify({out,errors,shots:shots.map(s=>s.name)}));if(errors.length)process.exitCode=1;
