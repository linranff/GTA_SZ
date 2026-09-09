import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='output/playwright/five-ring-badges';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const errors=[],samples=[],checks=[];
const check=(name,pass,details)=>{checks.push({name,pass,details});if(!pass)throw Error(name);};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'||/INVALID_OPERATION|Error compiling/i.test(m.text()))errors.push(m.text());});
await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/world\s*=\s*new DrivingWorld\(canvas\);/,m=>m+' window.__CAR_REVIEW__=world;')});});
try{
 await page.goto('http://127.0.0.1:4179/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:240000});
 await page.locator('#city-loading').waitFor({state:'detached'});
 await page.addStyleTag({content:'#ui,#career-invitation,.city-quicktips,#career-root{visibility:hidden!important}'});
 for(const face of ['front','rear']){
 await page.evaluate(face=>{const w=window.__CAR_REVIEW__;w.setLightMode('day');w.enterPhoto({id:'car',name:'车标检查',x:w.state.x,z:w.state.z,height:1.45,area:'车辆',excludeRadius:0,arrival:[w.state.x,w.state.z],photoDistance:4.8,photoElevation:.10,photoAngle:w.state.yaw+(face==='rear'?Math.PI:0)+.12,photoTargetHeight:w.groundHeight(w.state.x,w.state.z)+.78});},face);
 await page.waitForTimeout(2200);await page.screenshot({path:`${out}/${face}.png`});
 }
 const stats=await page.evaluate(()=>window.__CAR_REVIEW__.sportDetails.stats);
 if(stats.badges.length!==2||stats.badges.some(b=>b.rings!==5))throw Error('Both five-ring badges must attach');
 await fs.writeFile(`${out}/report.json`,JSON.stringify({stats,errors},null,2));console.log(JSON.stringify({stats,errors},null,2));
}finally{await browser.close();}
if(errors.length)process.exitCode=1;
