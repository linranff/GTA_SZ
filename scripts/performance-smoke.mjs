import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));const runs=[];const requests=[];page.on('request',r=>requests.push(r.url()));
try{
 const started=Date.now();await page.goto(process.env.GAME_URL??'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:120000});const loadSeconds=(Date.now()-started)/1000;
 for(const id of ['opening','pingan','kk100','opening-aerial']){
  if(id==='opening-aerial'){await page.keyboard.press('m');await page.locator('[data-id="baypark"]').click();await page.getByRole('button',{name:'快速前往周边道路'}).click();await page.keyboard.press('g');}
  else if(id!=='opening'){await page.keyboard.press('m');await page.locator('[data-id="'+id+'"]').click();await page.getByRole('button',{name:'快速前往周边道路'}).click();}
  await page.waitForTimeout(5000);await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(10000);
  const state=await page.evaluate(()=>({state:window.__SHENCHENGJI_CITY__.state,performance:window.__SHENCHENGJI_CITY__.performance,lighting:window.__SHENCHENGJI_CITY__.stats.lighting}));runs.push({id,...state});console.log(JSON.stringify(runs.at(-1)));await page.screenshot({path:'artifacts/city/perf-'+id+'.png'});
 }
 await page.keyboard.press('g');if(await page.evaluate(()=>window.__SHENCHENGJI_CITY__.performance.aerial))throw Error('G did not return from aerial');
 const start=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.state);await page.keyboard.down('w');await page.waitForTimeout(2500);await page.keyboard.up('w');const end=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.state);if(end.distance-start.distance<2)throw Error('Driving did not resume after G');
 const fullFacadeRequested=requests.some(u=>u.endsWith('/facades.glb'));if(fullFacadeRequested)throw Error('Full city facade GLB still loaded');
 const report={date:new Date().toISOString(),browser:await browser.version(),scope:'1920x1080 stationary 10-second windows after 5-second warmup; aerial simulation paused but rendered frame intervals recorded. Not a sustained driving benchmark.',loadSeconds,fullFacadeRequested,errors,runs};await fs.writeFile('artifacts/city/performance-smoke-v0.3.json',JSON.stringify(report,null,2));if(errors.length||runs.some(r=>r.performance.facades.failedTiles.length))process.exitCode=1;
}finally{await browser.close();}
