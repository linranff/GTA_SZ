import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.argv[2]??'output/playwright/night-correction');
await fs.mkdir(out,{recursive:true});
const errors=[],shots=[],timings=[];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,2000));});
const read=()=>page.evaluate(()=>({state:window.__SHENCHENGJI_CITY__.state,stats:window.__SHENCHENGJI_CITY__.stats,performance:window.__SHENCHENGJI_CITY__.performance}));
async function shot(name){const file=path.join(out,name+'.png');await page.screenshot({path:file});shots.push({name,file,state:await read()});}
async function pulse(key,ms){await page.keyboard.down(key);try{await page.waitForTimeout(ms);}finally{await page.keyboard.up(key);}}
async function lookUpTo(pitch){for(let i=0;i<16;i++){const current=(await read()).stats.observer?.pitch;if(typeof current!=='number')throw Error('Observer pitch unavailable');if(current<=pitch)return;await pulse('ArrowUp',250);}throw Error('Observer did not look upward');}
async function sample(name){const before=await read();const frames=await page.evaluate(async()=>{
 const a=[];let previous=performance.now(),start=previous;
 await new Promise(resolve=>{function frame(now){a.push(now-previous);previous=now;if(now-start>=10000)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});return a.slice(2);
});const after=await read(),sorted=[...frames].sort((a,b)=>a-b);timings.push({name,meanFps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),p95:sorted[Math.floor(sorted.length*.95)],over50ms:frames.filter(x=>x>50).length,renderFrames:after.performance.renderFrames-before.performance.renderFrames,start:before.state,end:after.state});}
try{
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});await page.waitForTimeout(1500);
 await shot('01-dusk');await page.keyboard.press('l');await page.waitForTimeout(3000);await shot('02-night-street');
 if(!(await read()).stats.cinematic?.night)throw Error('Night toggle did not reach cinematic controller');
 await page.keyboard.down('w');try{await sample('night-driving-10s');}finally{await page.keyboard.up('w');}
 await page.keyboard.press('g');await page.waitForTimeout(3000);await lookUpTo(-.25);await page.waitForTimeout(300);await shot('03-night-skyline');
 await lookUpTo(-.85);await page.waitForTimeout(300);await shot('04-night-stars');await sample('night-stars-10s');
 await page.keyboard.press('l');await page.waitForTimeout(600);await shot('05-dusk-restored');
 if((await read()).stats.cinematic?.night)throw Error('Dusk environment did not restore');
}catch(error){errors.push(String(error));}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({status:errors.length?'fail':'pass',errors,shots,timings,visualReview:'pending manual inspection',limitations:'Chrome Metal M1 Max 1920x1080, two 10-second samples; no sustained or other-browser performance claim.'},null,2));await browser.close();}
console.log(JSON.stringify({out,status:errors.length?'fail':'pass',errors,timings},null,2));process.exitCode=errors.length?1:0;
