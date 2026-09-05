import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const duration=Number(process.env.BENCH_SECONDS??300);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
try{
await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__SHENCHENGJI__?.ready,null,{timeout:60000});
await page.getByRole('button',{name:'走进这座城市'}).click();await page.getByRole('button',{name:'去看看这份活'}).click();
await page.keyboard.press('p');await page.waitForTimeout(2500);
await page.screenshot({path:'artifacts/game/street-1080p.png'});
await page.evaluate(()=>window.__SHENCHENGJI__.resetPerformance());
const start=Date.now();let key='w',minute=0;
await page.keyboard.down(key);
while(Date.now()-start<duration*1000){
  const s=await page.evaluate(()=>window.__SHENCHENGJI__.state);
  const next=s.z>92?'s':s.z<7?'w':key;
  if(next!==key){await page.keyboard.up(key);key=next;await page.keyboard.down(key);}
  await page.waitForTimeout(250);
  if(Date.now()-start>(minute+1)*60000){minute++;console.log('Continuous 1080p street movement: '+minute+' min.');}
}
await page.keyboard.up(key);
const performance=await page.evaluate(()=>window.__SHENCHENGJI__.performance);
const loading=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('/assets/')).map(r=>({name:r.name.split('/').pop(),duration:r.duration,bytes:r.transferSize})));
const result={date:new Date().toISOString(),durationSeconds:duration,build:'Vite production build',scenario:'Continuous forward/backward street traversal, NPCs moving, local autosave active, full HUD, WebGL2, 2048 PCF shadows and half-resolution SSAO',browserMode:'Headless Chrome on local Apple M1 Max Metal GPU; not a Safari or Windows result',errors,...performance,resources:loading};
result.pass=performance.samples>=duration*50&&performance.meanFps>=59&&performance.p95<=18&&performance.p99<=25&&performance.over50ms===0&&errors.length===0;
await fs.writeFile('artifacts/game/performance-1080p.json',JSON.stringify(result,null,2));
await page.screenshot({path:'artifacts/game/benchmark-final.png'});
console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error);await fs.writeFile('artifacts/game/performance-failure.json',JSON.stringify({error:String(error),errors},null,2));process.exitCode=1;}finally{await browser.close();}
