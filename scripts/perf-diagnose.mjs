import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));const runs=[];
try{
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:4173/')+'?profile=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:180000});await page.waitForTimeout(5000);
 for(const step of ['baseline','facades','shadows','reflections','ssao','simulation']){
  if(step!=='baseline')await page.locator(`[data-profile="${step}"]`).uncheck();
  await page.waitForTimeout(1000);await page.evaluate(()=>window.__SHENCHENGJI_CITY__.resetPerformance());await page.waitForTimeout(8000);const perf=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.performance);runs.push({step,perf});console.log(JSON.stringify(runs.at(-1)));
 }
 await fs.writeFile('artifacts/city/perf-diagnosis.json',JSON.stringify({date:new Date().toISOString(),scope:'Sequential cumulative feature removal, 8 seconds per step, same stationary spawn and browser',runs,errors},null,2));
}finally{await browser.close();}
