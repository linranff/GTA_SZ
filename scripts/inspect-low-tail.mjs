import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const phase=process.env.PHASE??'after',out=`output/playwright/low-tail/${phase}`;
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|Error compiling/i.test(m.text()))errors.push(m.text());});
await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/world\s*=\s*new DrivingWorld\(canvas\);/,m=>m+' window.__CAR_REVIEW__=world;')});});
try{
 await page.goto('http://127.0.0.1:4179/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});
 await page.locator('#city-loading').waitFor({state:'detached'});
 await page.addStyleTag({content:'#ui,#career-invitation,.city-quicktips,#career-root{visibility:hidden!important}'});
 for(const face of ['rear','rear-quarter','side','front']){
 await page.evaluate(face=>{const w=window.__CAR_REVIEW__;w.setLightMode('day');w.enterPhoto({id:'car',name:'车标检查',x:w.state.x,z:w.state.z,height:1.45,area:'车辆',excludeRadius:0,arrival:[w.state.x,w.state.z],photoDistance:7.5,photoElevation:.12,photoAngle:w.state.yaw+(face==='rear'?Math.PI+.12:face==='rear-quarter'?Math.PI+.7:face==='side'?Math.PI/2:.55),photoTargetHeight:w.groundHeight(w.state.x,w.state.z)+.78});},face);
 await page.waitForTimeout(2200);await page.screenshot({path:`${out}/${face}.png`});
 }
 if(phase==='after'){
  await page.evaluate(()=>{const w=window.__CAR_REVIEW__;w.setLightMode('night');w.observer.begin({x:w.state.x,y:w.groundHeight(w.state.x,w.state.z)+.70,z:w.state.z},5.2,w.state.yaw+Math.PI+.30,.12);w.cull();});
  await page.waitForTimeout(2000);await page.screenshot({path:`${out}/night-rear.png`});
  await page.evaluate(()=>window.__CAR_REVIEW__.setLightMode('day'));
 }
 const stats=await page.evaluate(()=>window.__CAR_REVIEW__.sportDetails.stats);
 const plate=await page.evaluate(()=>window.__CAR_REVIEW__.vehicleFinish.stats);if(!plate.applied)throw Error(plate.skippedReason);
 await page.evaluate(()=>window.__CAR_REVIEW__.samples=[]);await page.waitForTimeout(3500);
 const performance=await page.evaluate(()=>window.__CAR_REVIEW__.performance());
 if(stats.badges.length!==2||stats.badges.some(b=>b.rings!==5))throw Error('Both five-ring badges must attach');
 await fs.writeFile(`${out}/report.json`,JSON.stringify({stats,plate,performance,errors},null,2));console.log(JSON.stringify({stats,plate,performance,errors},null,2));
}finally{await browser.close();}
if(errors.length)process.exitCode=1;
