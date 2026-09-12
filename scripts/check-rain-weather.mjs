import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {installGpuDrawDiagnostics} from './gpu-draw-diagnostics.mjs';

const out=path.resolve(process.argv[2]??'output/playwright/rain-weather');
const url=process.env.GAME_URL??'http://127.0.0.1:4173/';
await fs.mkdir(out,{recursive:true});
const errors=[],warnings=[],samples=[],shots=[];let phase='loading';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
if(process.env.GPU_DIAG==='1')await page.addInitScript(installGpuDrawDiagnostics);
page.on('pageerror',error=>errors.push(phase+': '+String(error)));
page.on('console',message=>{if(message.type()!=='error'&&!/INVALID_OPERATION|feedback loop|shader.*(?:fail|error)/i.test(message.text()))return;
 const record=phase+': '+message.text().slice(0,1800);
 // The same one-off draw warning occurs on the dry day→night baseline.
 if(/glDrawElementsInstanced: Mismatch between texture format and sampler type/.test(record))warnings.push(record);else errors.push(record);
});
const read=()=>page.evaluate(()=>{const api=window.__SHENCHENGJI_CITY__;return {state:api.state,road:api.stats.roadSurface,rain:api.stats.rainWeather,puddles:api.stats.rainPuddles,perf:api.performance};});
async function shot(name){const file=path.join(out,name+'.png');await page.screenshot({path:file});shots.push({name,file,diagnostics:await read()});}
async function sample(name,seconds=10,heldKey=null){
 await page.waitForTimeout(900);
 if(heldKey)await page.keyboard.down(heldKey);
 try{
 const frames=await page.evaluate(async seconds=>{const values=[];let previous=performance.now(),start=previous;await new Promise(resolve=>{function frame(now){values.push(now-previous);previous=now;if(now-start>=seconds*1000)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});return values.slice(3);},seconds);
 const sorted=[...frames].sort((a,b)=>a-b),sum=frames.reduce((a,b)=>a+b,0);
 samples.push({name,seconds,frames:frames.length,meanFps:frames.length*1000/sum,p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],over50ms:frames.filter(value=>value>50).length,diagnostics:await read()});
 }finally{if(heldKey)await page.keyboard.up(heldKey);}
}
try{
 phase='load';await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});
 await page.waitForTimeout(2000);
 phase='switch-to-day-dry';for(let i=0;i<3&&await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.lightMode)!=='day';i++){await page.keyboard.press('l');await page.waitForTimeout(300);}
 phase='day-dry';await page.waitForTimeout(1400);await shot('01-day-after-rain');await sample('day-after-rain',8);
 phase='enable-rain-day';if(process.env.SKIP_RAIN!=='1')await page.keyboard.press('y');await page.waitForTimeout(2500);await shot('02-day-raining');phase='day-rain';await sample('day-raining',10);
 phase='switch-to-sunset-rain';await page.keyboard.press('l');await page.waitForTimeout(700);phase='switch-to-night-rain';await page.keyboard.press('l');await page.waitForTimeout(2000);await shot('03-night-raining');phase='night-rain';await sample('night-raining',8);
 phase='switch-to-day-rain';await page.keyboard.press('l');await page.waitForTimeout(1200);
 phase='drive-in-rain';await page.keyboard.down('w');await page.waitForTimeout(1800);await page.keyboard.up('w');await shot('04-day-raining-moving');await sample('day-raining-driving',10,'w');
 phase='disable-rain-day';if(process.env.SKIP_RAIN!=='1')await page.keyboard.press('y');await page.waitForTimeout(700);await shot('05-day-after-rain');
 const state=await read();if(state.road.raining||state.rain.enabled||state.puddles.raining)errors.push('Rain mode did not switch off');
 if(state.rain.extraRenderTargets!==0||state.rain.extraLights!==0)errors.push('Rain allocated an additional render target or light');
}catch(error){errors.push(String(error));try{await page.screenshot({path:path.join(out,'failure.png')});}catch{}}
finally{const gpuDiagnostics=await page.evaluate(()=>window.__cityGpuDiagnostics??null).catch(()=>null);await fs.writeFile(path.join(out,'report.json'),JSON.stringify({url,errors,warnings,samples,shots,gpuDiagnostics,scope:'Chrome Metal 1920x1080, actual in-game day/night Y toggle; short foreground rAF sampling on this machine.'},null,2));await browser.close();}
console.log(JSON.stringify({out,errors,warnings,samples:samples.map(({name,meanFps,p95,p99,over50ms})=>({name,meanFps,p95,p99,over50ms}))},null,2));
if(errors.length)process.exitCode=1;
