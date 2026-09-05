import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.argv[2]??'output/playwright/rain-sunset/landscape-review');
await fs.mkdir(out,{recursive:true});
const errors=[],shots=[],timings=[];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error'||(/warning/.test(m.type())&&/INVALID_|shader.*(?:fail|error)|feedback loop/i.test(m.text())))errors.push(m.text().slice(0,2000));});
const read=()=>page.evaluate(()=>({state:window.__SHENCHENGJI_CITY__.state,stats:window.__SHENCHENGJI_CITY__.stats,performance:window.__SHENCHENGJI_CITY__.performance}));
async function screenshot(name){const f=path.join(out,name+'.png');await page.screenshot({path:f});shots.push({name,path:f,state:await read()});}
async function pulse(key,ms){await page.keyboard.down(key);try{await page.waitForTimeout(ms);}finally{await page.keyboard.up(key);}}
async function drag(dx,dy){await page.mouse.move(960,500);await page.mouse.down();await page.mouse.move(960+dx,500+dy,{steps:12});await page.mouse.up();}
async function photo(id){await page.keyboard.press('m');await page.locator(`[data-id="${id}"]`).click();await page.locator('#photo-view').click();await page.waitForTimeout(1800);}
async function sample(name,seconds){const before=await read();const dt=await page.evaluate(async(seconds)=>{
 const a=[];let prev=performance.now();const start=prev;await new Promise(resolve=>{function frame(now){a.push(now-prev);prev=now;if(now-start>=seconds*1000)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});return a.slice(2);
},seconds);const after=await read();const sorted=[...dt].sort((a,b)=>a-b);timings.push({name,seconds,meanFps:1000/(dt.reduce((a,b)=>a+b,0)/dt.length),p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],over50ms:dt.filter(x=>x>50).length,renderFrameDelta:after.performance.renderFrames-before.performance.renderFrames,before,after});}
try{
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});
 await page.waitForTimeout(1800);
 await page.keyboard.press('g');await drag(0,160);await page.mouse.wheel(0,-1500);await pulse('q',650);await page.waitForTimeout(600);
 await screenshot('opening-puddles-overhead');
 await page.keyboard.press('l');await page.waitForTimeout(500);await screenshot('opening-puddles-night');await page.keyboard.press('l');
 for(const id of ['baypark','talent','xiangmi']){await photo(id);await drag(0,110);await page.mouse.wheel(0,320);await page.waitForTimeout(1200);await screenshot(id+'-relief-overview');if(id==='baypark'){await sample('baypark-overview',12);await page.keyboard.down('w');try{await sample('baypark-drone-moving',12);}finally{await page.keyboard.up('w');}}}
}catch(e){errors.push(String(e));}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({status:errors.length?'fail':'pass',errors,shots,timings,limitations:'UI inputs and public read-only stats; rAF intervals are not GPU presentation timestamps; this is a short visual/drone check, not a 300s sustained driving acceptance.'},null,2));await browser.close();}
console.log(JSON.stringify({out,status:errors.length?'fail':'pass',errors:errors.length,timings:timings.map(({name,meanFps,p95,p99,over50ms})=>({name,meanFps,p95,p99,over50ms}))},null,2));
process.exitCode=errors.length?1:0;
