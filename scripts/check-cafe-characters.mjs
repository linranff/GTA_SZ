import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const out=new URL('../output/playwright/cafe-characters/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto(process.env.GAME_URL??'http://127.0.0.1:5173/');
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:150000});
 await page.locator('#city-loading').waitFor({state:'detached',timeout:30000});
 await page.locator('#map-button').click();await page.locator('#map-search').fill('月白');
 await page.locator('#places [data-id="bamboo-cafe"]').click();
 await page.locator('#visit-interior').click();
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.performance.cafe?.characters.loaded,null,{timeout:60000});
 await page.waitForTimeout(2000);
 const stats=await page.evaluate(()=>({cafe:window.__SHENCHENGJI_CITY__.performance.cafe,walking:window.__SHENCHENGJI_CITY__.stats.walking}));
 assert.deepEqual(stats.cafe.characters.assignments,{zhixia:'maid',wangshu:'maid',xiaolan:'jk'});
 assert.equal(stats.cafe.characters.error,null);assert.equal(stats.walking.active,true);assert.equal(stats.cafe.staff.length,3);
 await page.screenshot({path:fileURLToPath(new URL('cafe-replacement-interior.png',out))});
 // View the receptionist through real mouse-look and retain the original E dialogue.
 const maid=stats.cafe.staff.find(s=>s.id==='zhixia').position;
 const yaw=Math.atan2(maid.x-stats.walking.x,maid.z-stats.walking.z);
 const delta=Math.atan2(Math.sin(yaw-stats.walking.yaw),Math.cos(yaw-stats.walking.yaw));
 await page.mouse.move(800,500);await page.mouse.down();await page.mouse.move(800+delta/.004,520,{steps:12});await page.mouse.up();
 await page.keyboard.down('w');await page.waitForTimeout(760);await page.keyboard.up('w');
 await page.waitForTimeout(700);
 await page.screenshot({path:fileURLToPath(new URL('cafe-replacement-maid.png',out))});
 await page.keyboard.press('e');
 stats.dialogue=await page.locator('#toast').innerText();
 assert(stats.dialogue.includes('知夏'),stats.dialogue);
 // Back into the central aisle, then approach the uniformed attendant.
 await page.keyboard.down('s');await page.waitForTimeout(760);await page.keyboard.up('s');
 async function face(point){
  const w=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.walking);
  const angle=Math.atan2(point.x-w.x,point.z-w.z),turn=Math.atan2(Math.sin(angle-w.yaw),Math.cos(angle-w.yaw));
  await page.mouse.move(800,500);await page.mouse.down();await page.mouse.move(800+turn/.004,500,{steps:12});await page.mouse.up();
 }
 const site=stats.cafe.site;
 await face({x:site.x-2.5*Math.sin(site.heading),z:site.z-2.5*Math.cos(site.heading)});
 await page.keyboard.down('w');await page.waitForTimeout(920);await page.keyboard.up('w');
 const jk=stats.cafe.staff.find(s=>s.id==='xiaolan').position;await face(jk);
 await page.keyboard.down('w');await page.waitForTimeout(1150);await page.keyboard.up('w');
 await page.waitForTimeout(700);
 await page.screenshot({path:fileURLToPath(new URL('cafe-replacement-jk.png',out))});
 stats.finalWalking=await page.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.walking);
 stats.jkReview={view:'full figure in the cafe, with the second maid behind the counter',distance:Math.hypot(stats.finalWalking.x-jk.x,stats.finalWalking.z-jk.z)};
 stats.errors=errors;
 await fs.writeFile(new URL('runtime-review.json',out),JSON.stringify(stats,null,2)+'\n');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(JSON.stringify(stats,null,2));
}finally{await browser.close();}
