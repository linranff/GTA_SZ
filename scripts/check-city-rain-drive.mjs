import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {installGpuDrawDiagnostics} from './gpu-draw-diagnostics.mjs';
const out=path.resolve(process.argv[2]??'output/playwright/rain-city-drive');await fs.mkdir(out,{recursive:true});
const duration=Number(process.env.DRIVE_SECONDS??300),lightMode=process.env.LIGHT_MODE??'night',errors=[],timeline=[],arrivals=[],resources=[];
const destinationLimit=Number(process.env.DESTINATION_LIMIT??2);
if(![1,2].includes(destinationLimit))throw Error('DESTINATION_LIMIT must be 1 or 2');
if(!['day','sunset','night'].includes(lightMode))throw Error('Invalid LIGHT_MODE');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push({time:Date.now(),text:String(e)}));page.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|feedback loop/i.test(m.text()))errors.push({time:Date.now(),text:m.text().slice(0,1400)});});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);if(r.request().resourceType()==='script')resources.push(r);});
if(process.env.GPU_DIAG==='1')await page.addInitScript(installGpuDrawDiagnostics);
const read=()=>page.evaluate(()=>{const api=window.__SHENCHENGJI_CITY__,s=api.telemetry;return {...s,nearTraffic:api.stats.traffic.filter(c=>Math.hypot(c.x-s.state.x,c.z-s.state.z)<40)};});
async function go(search,id){await page.keyboard.press('m');await page.locator('#map-search').fill(search);await page.locator(`#places [data-id="${id}"]`).click();await page.locator('#auto-drive').click();}
let final,finalStats,frames=[],start,initial,elapsed=0,hashes=[],gpuDiagnostics=null;
async function scriptHashes(){const result=[],urls=new Set();for(const response of resources){if(urls.has(response.url()))continue;urls.add(response.url());try{const bytes=await response.body();result.push({url:response.url(),sha256:createHash('sha256').update(bytes).digest('hex')});}catch{result.push({url:response.url(),bodyUnavailable:true});}}return result;}
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});await page.waitForTimeout(2200);
 for(let i=0;i<3;i++){if(await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.lightMode)===lightMode)break;await page.keyboard.press('l');await page.waitForTimeout(500);}
 await page.waitForTimeout(1000);initial=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats);if(initial.lightMode!==lightMode)throw Error('Lighting switch failed');await page.screenshot({path:path.join(out,`01-${lightMode}-start.png`)});
 await go('腾讯','tencent');await page.waitForTimeout(1500);start=await read();
 await page.evaluate(()=>{const d={frames:[],last:performance.now(),active:true};window.__rainDriveSample=d;function tick(t){if(!d.active)return;d.frames.push(t-d.last);d.last=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);});
 for(;elapsed<duration;elapsed+=5){await page.waitForTimeout(5000);const s=await read();timeline.push({elapsed:elapsed+5,...s});if(elapsed%30===0)console.log(JSON.stringify({elapsed:elapsed+5,speed:s.state.speed,phase:s.autopilot.phase,remaining:s.autopilot.remainingDistance,gpu:s.render.gpuMs,draw:s.render.drawCalls}));
  if(s.autopilot.phase==='blocked')throw Error('Autopilot blocked: '+s.autopilot.reason);
  if(s.autopilot.phase==='arrived'){arrivals.push({elapsed:elapsed+5,...s});if(arrivals.length>=destinationLimit)break;await go('深圳湾公园','baypark');}
 }
 final=await read();frames=await page.evaluate(()=>{window.__rainDriveSample.active=false;return window.__rainDriveSample.frames;});await page.screenshot({path:path.join(out,`02-${lightMode}-end.png`)});
 hashes=await scriptHashes();
}catch(e){errors.push(String(e));try{await page.screenshot({path:path.join(out,'failure.png')});}catch{}}
finally{try{final=await read();finalStats=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats);frames=await page.evaluate(()=>{const d=window.__rainDriveSample;if(d)d.active=false;return d?.frames??[];});gpuDiagnostics=await page.evaluate(()=>window.__cityGpuDiagnostics??null);}catch{} hashes=await scriptHashes(); const sorted=frames.slice(120).sort((a,b)=>a-b),sum=sorted.reduce((a,b)=>a+b,0),metrics={seconds:sum/1000,frames:sorted.length,meanFps:sorted.length*1000/sum,p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],over50ms:sorted.filter(x=>x>50).length,peakSpeedKph:Math.max(0,...timeline.map(s=>s.state.speed*3.6)),distance:final&&start?final.state.distance-start.state.distance:0};await fs.writeFile(path.join(out,'report.json'),JSON.stringify({errors,metrics,arrivals,start,final,finalStats,initial,timeline,hashes,gpuDiagnostics,diagnosticMode:process.env.GPU_DIAG==='1',pass:!errors.length,scope:'Actual in-game automatic driving, 1080p Chrome Metal. Lightweight telemetry every 5s. Route-change map pause remains in frame sample; no screenshots or devtools during sampling. Browser and system load can affect results.'},null,2));await browser.close();console.log(JSON.stringify({out,errors,metrics,arrivals:arrivals.length}));}if(errors.length)process.exitCode=1;
