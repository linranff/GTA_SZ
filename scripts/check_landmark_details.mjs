// Real Chrome smoke test + reference views for the five source-led replacements.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='output/playwright/landmark-details';await fs.mkdir(out,{recursive:true});
const manifest=JSON.parse(await fs.readFile('public/city/landmark-detail.json','utf8'));
const asset=await fs.readFile('public/city/landmark-detail.glb');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[],results=[],responses=[];page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(/landmark-detail|terrain-detail/.test(r.url()))responses.push({url:r.url(),status:r.status()});});
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:90000});
 await page.waitForTimeout(1800);
 const stats=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats);
 for(const landmark of manifest.landmarks){
  const live=stats.landmarks.find(m=>m.id===landmark.id);if(!live){errors.push('Missing live landmark '+landmark.id);continue;}
  if(Math.abs(live.x-landmark.x)>.01||Math.abs(live.z-landmark.z)>.01)errors.push('Wrong live location '+landmark.id);
  await page.keyboard.press('m');
  // The place button is identified from the currently rendered map inventory.
  const button=page.locator('#places button').filter({has:page.locator('span',{hasText:landmark.name})});
  await button.click();
  const routeStatus=await page.locator('#destination-status').textContent();
  await page.getByRole('button',{name:'快速前往周边道路'}).click();
  await page.waitForTimeout(500);
  await page.screenshot({path:`${out}/${landmark.id}-arrival.png`});
  const before=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.state);
  await page.keyboard.down('w');await page.waitForTimeout(750);await page.keyboard.up('w');
  const after=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.state);
  await page.keyboard.press('m');
  await page.locator('#places button').filter({has:page.locator('span',{hasText:landmark.name})}).click();
  await page.locator('#photo-view').click();
  await page.waitForTimeout(650);
  await page.screenshot({path:`${out}/${landmark.id}-overview.png`});
  await page.mouse.move(1100,450);await page.mouse.down();await page.mouse.move(620,450,{steps:18});await page.mouse.up();
  await page.waitForTimeout(450);await page.screenshot({path:`${out}/${landmark.id}-reverse.png`});
  await page.keyboard.press('f');
  const photoExited=!(await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.photo));
  const moved=Math.hypot(after.x-before.x,after.z-before.z);
  results.push({id:landmark.id,routeStatus,moved,photoExited});
  if(!photoExited||!routeStatus.includes('沿途导航'))errors.push('Destination flow failed '+landmark.id);
 }
 if(!responses.some(r=>r.url.includes('landmark-detail.glb')&&r.status===200))errors.push('Incremental GLB not loaded');
}catch(e){errors.push(String(e));await page.screenshot({path:`${out}/failure.png`});}
finally{await browser.close();}
const report={assetSha256:createHash('sha256').update(asset).digest('hex'),gameUrl:process.env.GAME_URL??'http://127.0.0.1:5173/',viewport:[1920,1080],errors,results,responses,
 note:'Screenshots require visual review; this short flow is not a sustained performance benchmark.'};
await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
