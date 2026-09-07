/** Same-camera sea reflection review, using ordinary map/camera controls.
 * GAME_URL=http://127.0.0.1:4173 node scripts/check-sea-reflection-continuity.mjs before|after
 * Inspect the PNGs: shader compilation or a short FPS sample cannot establish visual continuity.
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {observerUI} from './grassland-observer-ui.mjs';
const label=process.argv[2]??'after',out=`output/playwright/sea-reflection-continuity/${label}`;
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const ui=observerUI(page),errors=[],shots=[],resources=[],samples=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|feedback loop|Error compiling/i.test(m.text()))errors.push(m.text().slice(0,2000));});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);if(r.request().resourceType()==='script')resources.push(r);});
const read=()=>page.evaluate(()=>{const a=window.__SHENCHENGJI_CITY__;return {stats:a.stats,performance:a.performance};});
async function mode(target){for(let i=0;i<3;i++){if((await read()).stats.lightMode===target)return;await page.keyboard.press('l');await page.waitForTimeout(650);}throw Error('Cannot enter '+target);}
async function aim(yaw,pitch,distance){
 for(let i=0;i<12;i++){const o=await ui.read(),a=Math.atan2(Math.sin(yaw-o.yaw),Math.cos(yaw-o.yaw)),b=pitch-o.pitch;if(Math.abs(a)+Math.abs(b)<.001)break;await page.mouse.move(960,540);await page.mouse.down({button:'right'});await page.mouse.move(960+Math.max(-280,Math.min(280,-a/.0045)),540+Math.max(-180,Math.min(180,b/.0035)),{steps:6});await page.mouse.up({button:'right'});}
 for(let i=0;i<4;i++){const o=await ui.read();if(Math.abs(o.distance-distance)<.05)break;await page.mouse.wheel(0,Math.log(distance/o.distance)/.0012);await page.waitForTimeout(150);}
}
async function coastPose(height){
 const focus={x:-1500,y:1.5,z:-795},position={x:-784,y:height,z:-795},distance=Math.hypot(716,height-1.5);
 // Translation speed scales with orbit distance. Align the focus at 30 m so a
 // single browser frame does not overshoot the sub-metre camera tolerance.
 await ui.pose(focus,{x:focus.x+716/distance*30,y:focus.y+(height-1.5)/distance*30,z:focus.z});
 await aim(-Math.PI/2,Math.asin((height-1.5)/distance),distance);
 const actual=await ui.read(),error=Math.hypot(actual.position.x-position.x,actual.position.y-position.y,actual.position.z-position.z);
 if(error>.45)throw Error('Sea camera positioning failed: '+error);
}
async function shot(name){await page.waitForTimeout(2200);const hidden=await page.addStyleTag({content:'#ui,#ui *,#toast{visibility:hidden!important}'});await page.screenshot({path:`${out}/${name}.png`});await hidden.evaluate(e=>e.remove());shots.push({name,...await read()});console.log('CAPTURE '+name);}
async function sample(name){
 await page.waitForTimeout(1500);
 const frameTimes=await page.evaluate(()=>new Promise(resolve=>{const times=[];let previous=0,start=0;function tick(t){if(!start)start=t;if(previous)times.push(t-previous);previous=t;if(t-start<15000)requestAnimationFrame(tick);else resolve(times);}requestAnimationFrame(tick);}));
 const sorted=frameTimes.slice().sort((a,b)=>a-b),mean=frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length;
 samples.push({name,frames:frameTimes.length,meanFps:1000/mean,p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)],over50ms:sorted.filter(t=>t>50).length,...await read()});
 console.log('PERFORMANCE '+JSON.stringify({name,meanFps:1000/mean,p95Ms:samples.at(-1).p95Ms,p99Ms:samples.at(-1).p99Ms}));
}
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});
 await ui.enter('bamboo');await aim(-2.2,.35,3200);
 for(const m of ['sunset','day','night']){await mode(m);await shot(`${m}-high-west`);await sample(`${m}-high-west`);}
 await aim(Math.PI,.45,3200);
 for(const m of ['sunset','day','night']){await mode(m);await shot(`${m}-high-south`);}
 await ui.enter('baypark');await coastPose(25);
 for(const m of ['sunset','day','night']){await mode(m);await shot(`${m}-coast-25m`);}
 await coastPose(2);await mode('day');await shot('day-coast-eye-height');
 await page.keyboard.press('g');await mode('day');await shot('day-return-road');await sample('day-return-road');
}catch(e){errors.push(String(e));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{
 const hashes=[],seen=new Set();for(const r of resources){if(seen.has(r.url()))continue;seen.add(r.url());try{hashes.push({url:r.url(),sha256:createHash('sha256').update(await r.body()).digest('hex')});}catch{}}
 await fs.writeFile(`${out}/report.json`,JSON.stringify({label,date:new Date().toISOString(),errors,hashes,shots,samples,scope:'1920×1080 DPR1, Chrome Metal. Three lighting modes, two aerial directions, actual coast 25m/2m, return to driving. Fifteen-second rAF samples are stationary, not a sustained driving benchmark.'},null,2));await browser.close();
}
if(errors.length)throw Error(errors.join('\n'));
